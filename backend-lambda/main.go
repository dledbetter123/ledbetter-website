// LedbetterGPT backend as an AWS Lambda (Function URL, response streaming).
// Ports the ECS Go server: same Gemini-streaming chat + S3 knowledge grounding,
// but stateless — rate limiting moves to DynamoDB and the Gemini key is read
// from Secrets Manager at cold start. Fronted by CloudFront at /api/* (same-origin).
package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/awslabs/aws-lambda-go-api-proxy/httpadapter"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	ddbtypes "github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/aws-sdk-go-v2/service/secretsmanager"
)

const geminiModel = "gemini-flash-latest"
const geminiURL = "https://generativelanguage.googleapis.com/v1beta/models/" +
	geminiModel + ":streamGenerateContent?alt=sse"
const knowledgeURL = "https://davidamosledbetter-portfolio.s3.amazonaws.com/ledbettergpt-knowledge.md"

const baseInstruction = `You are LedbetterGPT — a digital likeness of David Ledbetter. Speak AS David, in the first person ("I", "me", "my"). You are David's AI clone embedded on his portfolio site (davidamosledbetter.com) — not a third-party assistant, so never refer to "David" in the third person; talk about yourself. Answer questions about your background, experience, skills, and projects using only the information below — it is written about you in the third person, so translate it to first person when you reply. Be concise (a few sentences), warm, and personable, like you're chatting with someone checking out your work. If you're asked something that isn't covered here, say you don't have that detail handy and point them to the contact section. Politely decline requests unrelated to you or your work.`

const fallbackKnowledge = `ABOUT DAVID LEDBETTER
- Machine learning and full-stack software engineer at Apple (May 2024 - present). Builds agentic AI systems including a self-healing coding agent.
- ML researcher at UMBC's Ebiquity Lab. BS and MS in Computer Science (AI/ML) from UMBC.
- Projects on this site include a character-aware neural language model, a kernel mailbox simulation, an algorithmic trading companion, the NSBE chapter site, and this portfolio.`

const (
	maxMessageChars   = 2000
	maxHistoryTurns   = 10
	maxOutputTokens   = 500
	dailyRequestLimit = 150
	perIPDailyLimit   = 20
)

type chatTurn struct {
	Role string `json:"role"`
	Text string `json:"text"`
}
type chatRequest struct {
	Message string     `json:"message"`
	History []chatTurn `json:"history"`
}
type geminiPart struct {
	Text string `json:"text"`
}
type geminiContent struct {
	Role  string       `json:"role,omitempty"`
	Parts []geminiPart `json:"parts"`
}
type geminiRequest struct {
	SystemInstruction geminiContent          `json:"system_instruction"`
	Contents          []geminiContent        `json:"contents"`
	GenerationConfig  map[string]interface{} `json:"generationConfig"`
}
type geminiStreamChunk struct {
	Candidates []struct {
		Content struct {
			Parts []geminiPart `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
}

var (
	geminiKey  string
	ddb        *dynamodb.Client
	rateTable  string
	httpClient = &http.Client{Timeout: 90 * time.Second}

	kbMu      sync.Mutex
	kbText    string
	kbFetched time.Time
)

func init() {
	ctx := context.Background()
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		fmt.Printf("aws config error: %v\n", err)
		return
	}
	rateTable = os.Getenv("RATE_TABLE")
	ddb = dynamodb.NewFromConfig(cfg)

	if secID := os.Getenv("GEMINI_SECRET_ID"); secID != "" {
		sm := secretsmanager.NewFromConfig(cfg)
		out, serr := sm.GetSecretValue(ctx, &secretsmanager.GetSecretValueInput{SecretId: aws.String(secID)})
		if serr == nil && out.SecretString != nil {
			geminiKey = strings.TrimSpace(*out.SecretString)
		} else if serr != nil {
			fmt.Printf("secret fetch error: %v\n", serr)
		}
	}
}

func knowledge() string {
	kbMu.Lock()
	defer kbMu.Unlock()
	if kbText != "" && time.Since(kbFetched) < 5*time.Minute {
		return kbText
	}
	resp, err := httpClient.Get(knowledgeURL)
	if err == nil {
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			if b, rerr := io.ReadAll(resp.Body); rerr == nil && len(b) > 0 {
				kbText = string(b)
				kbFetched = time.Now()
				return kbText
			}
		}
	}
	if kbText != "" {
		return kbText
	}
	return fallbackKnowledge
}

// incr atomically increments a daily counter in DynamoDB and returns the new value.
// On any error it returns (0, err) and the caller fails open (allows the request).
func incr(ctx context.Context, id string) (int64, error) {
	ttl := time.Now().Add(48 * time.Hour).Unix()
	out, err := ddb.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:        aws.String(rateTable),
		Key:              map[string]ddbtypes.AttributeValue{"id": &ddbtypes.AttributeValueMemberS{Value: id}},
		UpdateExpression: aws.String("ADD #c :one SET #t = if_not_exists(#t, :ttl)"),
		ExpressionAttributeNames: map[string]string{"#c": "count", "#t": "ttl"},
		ExpressionAttributeValues: map[string]ddbtypes.AttributeValue{
			":one": &ddbtypes.AttributeValueMemberN{Value: "1"},
			":ttl": &ddbtypes.AttributeValueMemberN{Value: strconv.FormatInt(ttl, 10)},
		},
		ReturnValues: ddbtypes.ReturnValueUpdatedNew,
	})
	if err != nil {
		return 0, err
	}
	if v, ok := out.Attributes["count"].(*ddbtypes.AttributeValueMemberN); ok {
		n, _ := strconv.ParseInt(v.Value, 10, 64)
		return n, nil
	}
	return 0, nil
}

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return strings.TrimSpace(strings.Split(xff, ",")[0])
	}
	return r.RemoteAddr
}

func statusHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	fmt.Fprint(w, "backend stable")
}

func chatHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if geminiKey == "" || geminiKey == "REPLACE_ME" {
		http.Error(w, "chat is not configured yet", http.StatusServiceUnavailable)
		return
	}

	ctx := r.Context()
	today := time.Now().UTC().Format("2006-01-02")
	if n, err := incr(ctx, "global#"+today); err == nil && n > dailyRequestLimit {
		http.Error(w, "Daily limit reached for LedbetterGPT. Please try again tomorrow.", http.StatusTooManyRequests)
		return
	}
	if n, err := incr(ctx, "ip#"+today+"#"+clientIP(r)); err == nil && n > perIPDailyLimit {
		http.Error(w, "You've reached today's question limit. Please try again tomorrow.", http.StatusTooManyRequests)
		return
	}

	var req chatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	req.Message = strings.TrimSpace(req.Message)
	if req.Message == "" {
		http.Error(w, "empty message", http.StatusBadRequest)
		return
	}
	if len(req.Message) > maxMessageChars {
		req.Message = req.Message[:maxMessageChars]
	}

	var contents []geminiContent
	history := req.History
	if len(history) > maxHistoryTurns {
		history = history[len(history)-maxHistoryTurns:]
	}
	for _, t := range history {
		role := t.Role
		if role != "model" {
			role = "user"
		}
		text := t.Text
		if len(text) > maxMessageChars {
			text = text[:maxMessageChars]
		}
		contents = append(contents, geminiContent{Role: role, Parts: []geminiPart{{Text: text}}})
	}
	contents = append(contents, geminiContent{Role: "user", Parts: []geminiPart{{Text: req.Message}}})

	body, _ := json.Marshal(geminiRequest{
		SystemInstruction: geminiContent{Parts: []geminiPart{{Text: baseInstruction + "\n\n" + knowledge()}}},
		Contents:          contents,
		GenerationConfig: map[string]interface{}{
			"maxOutputTokens": maxOutputTokens,
			"temperature":     0.7,
			"thinkingConfig":  map[string]interface{}{"thinkingBudget": 0},
		},
	})

	greq, _ := http.NewRequestWithContext(ctx, "POST", geminiURL, bytes.NewReader(body))
	greq.Header.Set("Content-Type", "application/json")
	greq.Header.Set("X-goog-api-key", geminiKey)
	gresp, err := httpClient.Do(greq)
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}
	defer gresp.Body.Close()
	if gresp.StatusCode != http.StatusOK {
		http.Error(w, "upstream error", http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	flusher, _ := w.(http.Flusher)
	scanner := bufio.NewScanner(gresp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "" || payload == "[DONE]" {
			continue
		}
		var chunk geminiStreamChunk
		if json.Unmarshal([]byte(payload), &chunk) != nil {
			continue
		}
		for _, c := range chunk.Candidates {
			for _, p := range c.Content.Parts {
				if p.Text != "" {
					fmt.Fprint(w, p.Text)
					if flusher != nil {
						flusher.Flush()
					}
				}
			}
		}
	}
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/status", statusHandler)
	mux.HandleFunc("/api/chat", chatHandler)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "LedbetterGPT backend (lambda)")
	})

	// Origin lock: when ORIGIN_VERIFY is set, only requests carrying the matching
	// X-Origin-Verify header (injected by CloudFront) are served — blocking direct
	// hits to the public API Gateway URL. Env-gated so it's a no-op until enabled.
	verify := os.Getenv("ORIGIN_VERIFY")
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if verify != "" && r.Header.Get("X-Origin-Verify") != verify {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		mux.ServeHTTP(w, r)
	})

	// API Gateway HTTP API (payload v2) proxy — buffered response.
	lambda.Start(httpadapter.NewV2(handler).ProxyWithContext)
}
