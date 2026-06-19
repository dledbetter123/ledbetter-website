package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net/mail"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/sesv2"
	sestypes "github.com/aws/aws-sdk-go-v2/service/sesv2/types"
)

// Inbound email path: a visitor replies to David's reply → their message goes to
// me+<contactID>@davidamosledbetter.com → SES inbound receipt rule drops the raw MIME in
// S3 (inbound/ prefix) → S3 event invokes this Lambda → we parse it, append it to the
// contact's thread, and forward a copy to David's Gmail for a phone notification.
const inboundPrefix = "inbound/"

// me+<digits>@domain — the plus tag is the contact id. Also match our own reply Message-ID
// pattern (reply-<id>-...) as a fallback when the To header was rewritten.
var (
	plusTagRe   = regexp.MustCompile(`me\+(\d+)@davidamosledbetter\.com`)
	replyRefRe  = regexp.MustCompile(`reply-(\d+)-\d+@davidamosledbetter\.com`)
	onWroteRe   = regexp.MustCompile(`(?im)^On .+wrote:\s*$`)
	dashSignRe  = regexp.MustCompile(`(?m)^-- ?$`)
	manyNewline = regexp.MustCompile(`\n{3,}`)
)

func handleS3(ctx context.Context, e events.S3Event) error {
	for _, r := range e.Records {
		key := r.S3.Object.Key
		if dec, err := url.QueryUnescape(key); err == nil {
			key = dec
		}
		if !strings.HasPrefix(key, inboundPrefix) {
			continue
		}
		fmt.Printf("inbound: received s3://%s/%s\n", r.S3.Bucket.Name, key)
		if err := processInboundEmail(ctx, r.S3.Bucket.Name, key); err != nil {
			fmt.Printf("inbound process error (%s): %v\n", key, err)
		}
	}
	return nil
}

func processInboundEmail(ctx context.Context, bucket, key string) error {
	if s3c == nil {
		return fmt.Errorf("s3 client unavailable")
	}
	out, err := s3c.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(bucket), Key: aws.String(key)})
	if err != nil {
		return err
	}
	defer out.Body.Close()
	rawBytes, err := io.ReadAll(out.Body)
	if err != nil {
		return err
	}
	msg, err := mail.ReadMessage(bytes.NewReader(rawBytes))
	if err != nil {
		return err
	}

	from := decodeHeader(msg.Header.Get("From"))
	msgID := strings.TrimSpace(msg.Header.Get("Message-Id"))
	recipients := msg.Header.Get("To") + " " + msg.Header.Get("Cc") + " " +
		msg.Header.Get("Delivered-To") + " " + msg.Header.Get("X-Original-To")
	refs := msg.Header.Get("In-Reply-To") + " " + msg.Header.Get("References")

	id := firstSubmatch(plusTagRe, recipients)
	if id == "" {
		id = firstSubmatch(replyRefRe, refs)
	}

	body := strings.TrimSpace(stripQuoted(extractText(
		msg.Header.Get("Content-Type"), msg.Header.Get("Content-Transfer-Encoding"), msg.Body)))
	if body == "" {
		body = "(no readable text in this message)"
	}
	now := time.Now().UTC().Format(time.RFC3339)

	var rec contactRecord
	matched := false
	if id != "" {
		if r, gerr := getContact(ctx, contactPrefix+id+".json"); gerr == nil {
			rec = r
			rec.Thread = append(rec.Thread, threadMsg{Dir: "in", From: from, Body: body, Ts: now, MsgID: msgID})
			rec.Replied = false // a fresh inbound is unanswered
			saveContact(rec)
			matched = true
			fmt.Printf("inbound matched thread %s (from=%q, %d chars)\n", id, from, len(body))
		} else {
			fmt.Printf("inbound id %q parsed but getContact failed: %v\n", id, gerr)
		}
	}
	if !matched {
		fmt.Printf("inbound unmatched (id=%q from=%q recipients=%q) — forwarding only\n", id, from, recipients)
	}
	forwardInbound(rec, from, body, matched)
	return nil
}

// forwardInbound sends a copy of the visitor's reply to David's Gmail so he still gets a
// phone notification. Reply-To is the visitor so David can answer from Gmail too.
func forwardInbound(rec contactRecord, from, body string, matched bool) {
	if ses == nil || contactEmailTo == "" {
		return
	}
	who := from
	if matched && rec.Name != "" {
		who = rec.Name + " <" + rec.Email + ">"
	}
	now := time.Now().UTC()
	var raw bytes.Buffer
	fmt.Fprintf(&raw, "From: %s\r\n", replyFromDisplay)
	fmt.Fprintf(&raw, "To: %s\r\n", contactEmailTo)
	if addr := firstEmail(from); addr != "" {
		fmt.Fprintf(&raw, "Reply-To: %s\r\n", addr)
	}
	fmt.Fprintf(&raw, "Subject: New reply from %s\r\n", stripHeader(who))
	fmt.Fprintf(&raw, "Date: %s\r\n", now.Format(time.RFC1123Z))
	raw.WriteString("MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n")
	fmt.Fprintf(&raw, "%s replied to your contact-form thread:\r\n\r\n%s\r\n\r\n", who, body)
	if matched {
		raw.WriteString("Open the inbox to reply: https://davidamosledbetter.com/inbox\r\n")
	} else {
		raw.WriteString("(Couldn't match this to a thread — replying from here goes straight to them.)\r\n")
	}
	sctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	if _, err := ses.SendEmail(sctx, &sesv2.SendEmailInput{
		Content: &sestypes.EmailContent{Raw: &sestypes.RawMessage{Data: raw.Bytes()}},
	}); err != nil {
		fmt.Printf("inbound forward error: %v\n", err)
	}
}

func firstSubmatch(re *regexp.Regexp, s string) string {
	if m := re.FindStringSubmatch(s); len(m) > 1 {
		return m[1]
	}
	return ""
}

// firstEmail pulls the bare address out of a "Name <addr>" header value.
func firstEmail(s string) string {
	if a, err := mail.ParseAddress(s); err == nil {
		return a.Address
	}
	if i := strings.IndexByte(s, '<'); i >= 0 {
		if j := strings.IndexByte(s[i:], '>'); j > 0 {
			return strings.TrimSpace(s[i+1 : i+j])
		}
	}
	return strings.TrimSpace(s)
}

func decodeHeader(s string) string {
	dec := new(mime.WordDecoder)
	if out, err := dec.DecodeHeader(s); err == nil {
		return out
	}
	return s
}

// extractText walks the MIME tree and returns the best text/plain body it can find,
// decoding the transfer encoding. Falls back to text/html (tags stripped) if that's all
// there is.
func extractText(contentType, cte string, body io.Reader) string {
	mediaType, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		b, _ := io.ReadAll(body)
		return string(b)
	}
	if strings.HasPrefix(mediaType, "multipart/") {
		mr := multipart.NewReader(body, params["boundary"])
		var htmlFallback string
		for {
			part, perr := mr.NextPart()
			if perr != nil {
				break
			}
			pType := part.Header.Get("Content-Type")
			pMedia, _, _ := mime.ParseMediaType(pType)
			decoded := decodeBody(part.Header.Get("Content-Transfer-Encoding"), part)
			switch {
			case strings.HasPrefix(pMedia, "multipart/"):
				if nested := extractText(pType, "", bytes.NewReader([]byte(decoded))); strings.TrimSpace(nested) != "" {
					return nested
				}
			case strings.HasPrefix(pMedia, "text/plain"):
				return decoded
			case strings.HasPrefix(pMedia, "text/html") && htmlFallback == "":
				htmlFallback = stripHTML(decoded)
			}
		}
		return htmlFallback
	}
	decoded := decodeBody(cte, body)
	if strings.HasPrefix(mediaType, "text/html") {
		return stripHTML(decoded)
	}
	return decoded
}

func decodeBody(cte string, r io.Reader) string {
	switch strings.ToLower(strings.TrimSpace(cte)) {
	case "base64":
		b, _ := io.ReadAll(base64.NewDecoder(base64.StdEncoding, newlineStripper{r}))
		return string(b)
	case "quoted-printable":
		b, _ := io.ReadAll(quotedprintable.NewReader(r))
		return string(b)
	default:
		b, _ := io.ReadAll(r)
		return string(b)
	}
}

// newlineStripper drops CR/LF so base64 chunks split across MIME lines decode cleanly.
type newlineStripper struct{ r io.Reader }

func (n newlineStripper) Read(p []byte) (int, error) {
	buf := make([]byte, len(p))
	m, err := n.r.Read(buf)
	j := 0
	for i := 0; i < m; i++ {
		if buf[i] != '\r' && buf[i] != '\n' {
			p[j] = buf[i]
			j++
		}
	}
	return j, err
}

var tagRe = regexp.MustCompile(`(?s)<[^>]*>`)

func stripHTML(s string) string {
	s = tagRe.ReplaceAllString(s, "")
	s = strings.ReplaceAll(s, "&nbsp;", " ")
	s = strings.ReplaceAll(s, "&amp;", "&")
	s = strings.ReplaceAll(s, "&lt;", "<")
	s = strings.ReplaceAll(s, "&gt;", ">")
	return strings.TrimSpace(s)
}

// stripQuoted trims the quoted original from a reply: everything from an "On … wrote:"
// attribution line, a signature delimiter, or a run of leading ">" quote lines.
func stripQuoted(s string) string {
	if loc := onWroteRe.FindStringIndex(s); loc != nil {
		s = s[:loc[0]]
	}
	if loc := dashSignRe.FindStringIndex(s); loc != nil {
		s = s[:loc[0]]
	}
	lines := strings.Split(s, "\n")
	kept := make([]string, 0, len(lines))
	for _, ln := range lines {
		if strings.HasPrefix(strings.TrimSpace(ln), ">") {
			continue
		}
		kept = append(kept, ln)
	}
	s = strings.Join(kept, "\n")
	s = manyNewline.ReplaceAllString(s, "\n\n")
	return strings.TrimSpace(s)
}
