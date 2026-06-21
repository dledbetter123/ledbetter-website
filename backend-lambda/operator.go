// Operator (catalog) mode auth: passkey/WebAuthn login for David only. Endpoints live
// under /api/operator/* and are origin-locked like the rest of /api/*. Registration is
// gated by OPERATOR_REG_OPEN (a one-time bootstrap window); after David enrolls his
// devices it is closed. A successful login issues a short-lived HMAC operator-session
// token used by the catalog chat (step 2). Nothing here touches the public chat surface.
package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	ddbtypes "github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-webauthn/webauthn/webauthn"
)

var (
	webAuthn              *webauthn.WebAuthn
	operatorRegOpen       bool
	operatorSessionSecret []byte
)

const operatorUserID = "david-operator"

func initOperator() {
	rpid := os.Getenv("OPERATOR_RPID")
	if rpid == "" {
		rpid = "davidamosledbetter.com"
	}
	w, err := webauthn.New(&webauthn.Config{
		RPID:          rpid,
		RPDisplayName: "LedbetterLM Operator",
		RPOrigins:     []string{"https://" + rpid, "https://www." + rpid},
	})
	if err != nil {
		fmt.Printf("webauthn init error: %v\n", err)
		return
	}
	webAuthn = w
	operatorRegOpen = strings.EqualFold(os.Getenv("OPERATOR_REG_OPEN"), "true")
	operatorSessionSecret = []byte(os.Getenv("OPERATOR_SESSION_SECRET"))
}

// operatorUser is the single operator (David); credentials live in DynamoDB.
type operatorUser struct{ creds []webauthn.Credential }

func (u *operatorUser) WebAuthnID() []byte                         { return []byte(operatorUserID) }
func (u *operatorUser) WebAuthnName() string                       { return "david" }
func (u *operatorUser) WebAuthnDisplayName() string                { return "David Ledbetter" }
func (u *operatorUser) WebAuthnCredentials() []webauthn.Credential { return u.creds }
func (u *operatorUser) WebAuthnIcon() string                       { return "" }

// putData/getData store a JSON blob on the `data` attribute of the rate-limit table
// (separate keys from the numeric counters). Used for credentials and WebAuthn sessions.
func putData(ctx context.Context, id, data string, ttlSec int64) {
	ttl := time.Now().Add(time.Duration(ttlSec) * time.Second).Unix()
	_, err := ddb.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:                aws.String(rateTable),
		Key:                      map[string]ddbtypes.AttributeValue{"id": &ddbtypes.AttributeValueMemberS{Value: id}},
		UpdateExpression:         aws.String("SET #d = :d, #t = :ttl"),
		ExpressionAttributeNames: map[string]string{"#d": "data", "#t": "ttl"},
		ExpressionAttributeValues: map[string]ddbtypes.AttributeValue{
			":d":   &ddbtypes.AttributeValueMemberS{Value: data},
			":ttl": &ddbtypes.AttributeValueMemberN{Value: strconv.FormatInt(ttl, 10)},
		},
	})
	if err != nil {
		fmt.Printf("putData error: %v\n", err)
	}
}

func getData(ctx context.Context, id string) string {
	out, err := ddb.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(rateTable),
		Key:       map[string]ddbtypes.AttributeValue{"id": &ddbtypes.AttributeValueMemberS{Value: id}},
	})
	if err != nil {
		return ""
	}
	if v, ok := out.Item["data"].(*ddbtypes.AttributeValueMemberS); ok {
		return v.Value
	}
	return ""
}

func loadOperatorCreds(ctx context.Context) []webauthn.Credential {
	var creds []webauthn.Credential
	if s := getData(ctx, "operator#creds"); s != "" {
		_ = json.Unmarshal([]byte(s), &creds)
	}
	return creds
}

func saveOperatorCreds(ctx context.Context, creds []webauthn.Credential) {
	b, _ := json.Marshal(creds)
	putData(ctx, "operator#creds", string(b), 100*365*24*3600) // effectively permanent
}

func storeWASession(ctx context.Context, key string, sd *webauthn.SessionData) {
	b, _ := json.Marshal(sd)
	putData(ctx, key, string(b), 300) // 5-min challenge window
}

func loadWASession(ctx context.Context, key string) (*webauthn.SessionData, bool) {
	s := getData(ctx, key)
	if s == "" {
		return nil, false
	}
	var sd webauthn.SessionData
	if json.Unmarshal([]byte(s), &sd) != nil {
		return nil, false
	}
	return &sd, true
}

// issueOperatorToken returns "<exp>.<hmac>"; validOperatorToken checks it.
func issueOperatorToken(ttl time.Duration) string {
	payload := strconv.FormatInt(time.Now().Add(ttl).Unix(), 10)
	mac := hmac.New(sha256.New, operatorSessionSecret)
	mac.Write([]byte(payload))
	return payload + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func validOperatorToken(tok string) bool {
	if len(operatorSessionSecret) == 0 {
		return false
	}
	parts := strings.SplitN(tok, ".", 2)
	if len(parts) != 2 {
		return false
	}
	mac := hmac.New(sha256.New, operatorSessionSecret)
	mac.Write([]byte(parts[0]))
	want := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(want), []byte(parts[1])) {
		return false
	}
	exp, err := strconv.ParseInt(parts[0], 10, 64)
	return err == nil && time.Now().Unix() <= exp
}

func opWriteJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func operatorRegisterBegin(w http.ResponseWriter, r *http.Request) {
	if webAuthn == nil {
		http.Error(w, "operator mode unavailable", http.StatusServiceUnavailable)
		return
	}
	if !operatorRegOpen {
		http.Error(w, "registration is closed", http.StatusForbidden)
		return
	}
	ctx := r.Context()
	user := &operatorUser{creds: loadOperatorCreds(ctx)}
	options, session, err := webAuthn.BeginRegistration(user)
	if err != nil {
		http.Error(w, "register begin failed", http.StatusInternalServerError)
		return
	}
	storeWASession(ctx, "operator#regsess", session)
	opWriteJSON(w, options)
}

func operatorRegisterFinish(w http.ResponseWriter, r *http.Request) {
	if webAuthn == nil || !operatorRegOpen {
		http.Error(w, "registration is closed", http.StatusForbidden)
		return
	}
	ctx := r.Context()
	session, ok := loadWASession(ctx, "operator#regsess")
	if !ok {
		http.Error(w, "no registration in progress", http.StatusBadRequest)
		return
	}
	user := &operatorUser{creds: loadOperatorCreds(ctx)}
	cred, err := webAuthn.FinishRegistration(user, *session, r)
	if err != nil {
		http.Error(w, "registration failed", http.StatusBadRequest)
		return
	}
	saveOperatorCreds(ctx, append(user.creds, *cred))
	fmt.Fprint(w, "registered")
}

func operatorAuthBegin(w http.ResponseWriter, r *http.Request) {
	if webAuthn == nil {
		http.Error(w, "operator mode unavailable", http.StatusServiceUnavailable)
		return
	}
	ctx := r.Context()
	creds := loadOperatorCreds(ctx)
	if len(creds) == 0 {
		http.Error(w, "no operator enrolled", http.StatusForbidden)
		return
	}
	options, session, err := webAuthn.BeginLogin(&operatorUser{creds: creds})
	if err != nil {
		http.Error(w, "auth begin failed", http.StatusInternalServerError)
		return
	}
	storeWASession(ctx, "operator#authsess", session)
	opWriteJSON(w, options)
}

func operatorAuthFinish(w http.ResponseWriter, r *http.Request) {
	if webAuthn == nil {
		http.Error(w, "operator mode unavailable", http.StatusServiceUnavailable)
		return
	}
	ctx := r.Context()
	session, ok := loadWASession(ctx, "operator#authsess")
	if !ok {
		http.Error(w, "no auth in progress", http.StatusBadRequest)
		return
	}
	creds := loadOperatorCreds(ctx)
	cred, err := webAuthn.FinishLogin(&operatorUser{creds: creds}, *session, r)
	if err != nil {
		http.Error(w, "This is David's operator mode only — authentication failed.", http.StatusUnauthorized)
		return
	}
	// Persist the updated signature counter (clone-detection) for the matched credential.
	for i := range creds {
		if string(creds[i].ID) == string(cred.ID) {
			creds[i].Authenticator.SignCount = cred.Authenticator.SignCount
		}
	}
	saveOperatorCreds(ctx, creds)
	opWriteJSON(w, map[string]string{"token": issueOperatorToken(time.Hour)})
}

// ---- Catalog mode: David (authenticated) chats with his likeness and it writes to
// the knowledge base. Requires a valid operator-session token. Isolated from /api/chat.

const kbBucket = "davidamosledbetter-portfolio"
const kbKey = "ledbettergpt-knowledge.md"
const catalogSection = "## Notes added in catalog mode"

const catalogSystem = `You are LedbetterLM in OPERATOR / CATALOG mode. You are talking with David himself — the real, authenticated David — so collaborate candidly with him. Your job is to help him build out your knowledge base (the facts and rules that govern how you, his public likeness, behave).

When David tells you a fact about himself, his life, work, preferences, or how you should act with the public, call the kb_append tool to save it — pass a clean, first-person version of it (as David would say it). You may call kb_append more than once for multiple distinct facts. After saving, briefly confirm exactly what you saved, in plain language.

If he's just chatting, asking what you already know, or thinking out loud, answer normally and do NOT save anything. Only save what he clearly wants remembered. Never invent facts. The current knowledge base is included below for context.`

func catalogTools() []oaiTool {
	return []oaiTool{{
		Type: "function",
		Function: fnDecl{
			Name:        "kb_append",
			Description: "Append a new fact or behavior rule to David's knowledge base so the public likeness knows it permanently. Pass the cleaned-up text, written in the first person as David would say it.",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"content": map[string]interface{}{"type": "string", "description": "The first-person fact or rule to save."},
				},
				"required": []string{"content"},
			},
		},
	}}
}

// kbAppendS3 read-modify-writes the KB object (S3 versioning is on, so every change is
// rollback-able). New notes accumulate under a managed catalog section.
func kbAppendS3(ctx context.Context, text string) error {
	text = strings.TrimSpace(text)
	if text == "" {
		return fmt.Errorf("empty content")
	}
	out, err := s3c.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(kbBucket), Key: aws.String(kbKey)})
	if err != nil {
		return err
	}
	cur, _ := io.ReadAll(out.Body)
	out.Body.Close()
	body := string(cur)
	if !strings.Contains(body, catalogSection) {
		body += "\n\n" + catalogSection + "\n"
	}
	body += "\n- " + text
	_, err = s3c.PutObject(ctx, &s3.PutObjectInput{
		Bucket:       aws.String(kbBucket),
		Key:          aws.String(kbKey),
		Body:         bytes.NewReader([]byte(body)),
		ContentType:  aws.String("text/markdown; charset=utf-8"),
		CacheControl: aws.String("no-cache"),
	})
	return err
}

// catalogModelCall posts one round to Workers AI's OpenAI-compatible endpoint with the
// catalog tools. (Catalog mode runs on Cloudflare; no Gemini fallback needed here.)
func catalogModelCall(ctx context.Context, messages []oaiMessage, tools []oaiTool) (oaiMessage, error) {
	reqBody, _ := json.Marshal(oaiRequest{
		Model: workersAIModel, Messages: messages, Tools: tools,
		MaxTokens: maxOutputTokens, Temperature: 0.4,
	})
	url := "https://api.cloudflare.com/client/v4/accounts/" + cfAccountID + "/ai/v1/chat/completions"
	httpReq, _ := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(reqBody))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+cfToken)
	resp, err := httpClient.Do(httpReq)
	if err != nil {
		return oaiMessage{}, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return oaiMessage{}, fmt.Errorf("workersai status %d", resp.StatusCode)
	}
	var or oaiResponse
	if err := json.Unmarshal(body, &or); err != nil {
		return oaiMessage{}, err
	}
	if len(or.Choices) == 0 {
		return oaiMessage{}, fmt.Errorf("no choices")
	}
	return or.Choices[0].Message, nil
}

func runCatalogChat(ctx context.Context, message string, history []chatTurn) string {
	msgs := []oaiMessage{{Role: "system", Content: catalogSystem + "\n\n" + currentDateLine() + "\n\n--- CURRENT KNOWLEDGE BASE ---\n" + knowledge()}}
	for _, h := range history {
		role := "user"
		if h.Role == "model" || h.Role == "assistant" {
			role = "assistant"
		}
		msgs = append(msgs, oaiMessage{Role: role, Content: h.Text})
	}
	msgs = append(msgs, oaiMessage{Role: "user", Content: message})

	for round := 0; round < 3; round++ {
		tools := catalogTools()
		if round == 2 {
			tools = nil // final round: force a text reply
		}
		m, err := catalogModelCall(ctx, msgs, tools)
		if err != nil {
			fmt.Printf("catalog model error: %v\n", err)
			return "I hit an error reaching the model — try that again."
		}
		if len(m.ToolCalls) == 0 {
			if strings.TrimSpace(m.Content) != "" {
				return m.Content
			}
			return "Done."
		}
		msgs = append(msgs, m)
		for i, tc := range m.ToolCalls {
			result := "saved to the knowledge base"
			if tc.Function.Name == "kb_append" {
				var args struct {
					Content string `json:"content"`
				}
				_ = json.Unmarshal([]byte(tc.Function.Arguments), &args)
				if err := kbAppendS3(ctx, args.Content); err != nil {
					fmt.Printf("kbAppend error: %v\n", err)
					result = "error saving to the knowledge base"
				}
			} else {
				result = "unknown tool"
			}
			id := tc.ID
			if id == "" {
				id = fmt.Sprintf("call_%d", i)
			}
			msgs = append(msgs, oaiMessage{Role: "tool", ToolCallID: id, Name: tc.Function.Name, Content: result})
		}
	}
	return "Saved."
}

type operatorChatReq struct {
	Message string     `json:"message"`
	History []chatTurn `json:"history"`
	Token   string     `json:"token"`
}

func operatorChatHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req operatorChatReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	tok := req.Token
	if tok == "" {
		tok = strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	}
	if !validOperatorToken(tok) {
		http.Error(w, "This is David's operator mode only.", http.StatusUnauthorized)
		return
	}
	req.Message = strings.TrimSpace(req.Message)
	if req.Message == "" {
		http.Error(w, "empty message", http.StatusBadRequest)
		return
	}
	if len(req.History) > maxHistoryTurns {
		req.History = req.History[len(req.History)-maxHistoryTurns:]
	}
	answer := runCatalogChat(r.Context(), req.Message, req.History)
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	fmt.Fprint(w, answer)
}
