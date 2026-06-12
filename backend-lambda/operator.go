// Operator (catalog) mode auth: passkey/WebAuthn login for David only. Endpoints live
// under /api/operator/* and are origin-locked like the rest of /api/*. Registration is
// gated by OPERATOR_REG_OPEN (a one-time bootstrap window); after David enrolls his
// devices it is closed. A successful login issues a short-lived HMAC operator-session
// token used by the catalog chat (step 2). Nothing here touches the public chat surface.
package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	ddbtypes "github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
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
		RPDisplayName: "LedbetterGPT Operator",
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
