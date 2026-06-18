package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/sesv2"
	sestypes "github.com/aws/aws-sdk-go-v2/service/sesv2/types"
)

// Contact-form submissions are stored in S3 so David can read and reply to them on the
// operator-authed inbox page (in addition to the notification email). Keyed by a sortable
// nanosecond id so a plain listing is roughly chronological.
const contactPrefix = "contacts/"

type contactRecord struct {
	ID        string `json:"id"`
	Ts        string `json:"ts"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	Message   string `json:"message"`
	IP        string `json:"ip,omitempty"`
	Loc       string `json:"loc,omitempty"`
	Replied   bool   `json:"replied"`
	ReplyBody string `json:"replyBody,omitempty"`
	ReplyTs   string `json:"replyTs,omitempty"`
}

func saveContact(rec contactRecord) {
	if s3c == nil || convBucket == "" {
		return
	}
	body, err := json.MarshalIndent(rec, "", "  ")
	if err != nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := s3c.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(convBucket),
		Key:         aws.String(contactPrefix + rec.ID + ".json"),
		Body:        bytes.NewReader(body),
		ContentType: aws.String("application/json"),
	}); err != nil {
		fmt.Printf("contact save error: %v\n", err)
	}
}

func getContact(ctx context.Context, key string) (contactRecord, error) {
	var rec contactRecord
	out, err := s3c.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(convBucket), Key: aws.String(key)})
	if err != nil {
		return rec, err
	}
	defer out.Body.Close()
	b, _ := io.ReadAll(out.Body)
	err = json.Unmarshal(b, &rec)
	return rec, err
}

func listContacts(ctx context.Context, limit int) []contactRecord {
	var recs []contactRecord
	var token *string
	for {
		out, err := s3c.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket: aws.String(convBucket), Prefix: aws.String(contactPrefix), ContinuationToken: token,
		})
		if err != nil {
			break
		}
		for _, o := range out.Contents {
			if r, err := getContact(ctx, *o.Key); err == nil {
				recs = append(recs, r)
			}
		}
		if out.IsTruncated != nil && *out.IsTruncated {
			token = out.NextContinuationToken
		} else {
			break
		}
	}
	sort.Slice(recs, func(i, j int) bool { return recs[i].Ts > recs[j].Ts }) // newest first
	if limit > 0 && len(recs) > limit {
		recs = recs[:limit]
	}
	return recs
}

// operatorTokenFrom pulls the operator-session token from the JSON body of an inbox request.
func operatorTokenFromBody(r *http.Request) (map[string]interface{}, bool) {
	var body map[string]interface{}
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		return nil, false
	}
	tok, _ := body["token"].(string)
	return body, validOperatorToken(tok)
}

// operatorMessagesHandler returns all contact-form submissions for the inbox page.
func operatorMessagesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		return
	}
	if _, ok := operatorTokenFromBody(r); !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	opWriteJSON(w, map[string]interface{}{"messages": listContacts(r.Context(), 500)})
}

// operatorReplyHandler emails David's reply to the visitor and marks the message replied.
func operatorReplyHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		return
	}
	body, ok := operatorTokenFromBody(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	id, _ := body["id"].(string)
	reply, _ := body["body"].(string)
	id = stripHeader(id)
	if id == "" || len(reply) == 0 {
		http.Error(w, "missing id or body", http.StatusBadRequest)
		return
	}
	if len(reply) > 8000 {
		reply = reply[:8000]
	}
	ctx := r.Context()
	rec, err := getContact(ctx, contactPrefix+id+".json")
	if err != nil {
		http.Error(w, "message not found", http.StatusNotFound)
		return
	}
	if ses == nil || emailFrom == "" {
		http.Error(w, "email not configured", http.StatusServiceUnavailable)
		return
	}
	if err := emailReply(rec, reply); err != nil {
		fmt.Printf("reply send error: %v\n", err)
		http.Error(w, "failed to send the reply", http.StatusBadGateway)
		return
	}
	rec.Replied = true
	rec.ReplyBody = reply
	rec.ReplyTs = time.Now().UTC().Format(time.RFC3339)
	saveContact(rec)
	opWriteJSON(w, map[string]interface{}{"ok": true})
}

// emailReply sends David's reply to the visitor who submitted the contact form. Reply-To is
// the contact recipient so the visitor's response comes back to David.
func emailReply(rec contactRecord, reply string) error {
	now := time.Now().UTC()
	subject := "Re: your message to David Ledbetter"
	var raw bytes.Buffer
	fmt.Fprintf(&raw, "From: %s\r\n", emailFrom)
	fmt.Fprintf(&raw, "To: %s\r\n", stripHeader(rec.Email))
	fmt.Fprintf(&raw, "Reply-To: %s\r\n", contactEmailTo)
	fmt.Fprintf(&raw, "Subject: %s\r\n", subject)
	fmt.Fprintf(&raw, "Date: %s\r\n", now.Format(time.RFC1123Z))
	raw.WriteString("MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n")
	if rec.Name != "" {
		fmt.Fprintf(&raw, "Hi %s,\r\n\r\n", rec.Name)
	}
	raw.WriteString(reply)
	raw.WriteString("\r\n\r\n— David Ledbetter\r\n")

	sctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	_, err := ses.SendEmail(sctx, &sesv2.SendEmailInput{
		Content: &sestypes.EmailContent{Raw: &sestypes.RawMessage{Data: raw.Bytes()}},
	})
	return err
}
