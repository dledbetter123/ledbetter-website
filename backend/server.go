package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// Enable CORS by setting headers based on allowed origins.
func enableCors(w *http.ResponseWriter, r *http.Request) {
	allowedOrigins := strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",") // Split multiple origins
	currentOrigin := r.Header.Get("Origin")

	for _, origin := range allowedOrigins {
		if origin == currentOrigin {
			(*w).Header().Set("Access-Control-Allow-Origin", origin)
			(*w).Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
			(*w).Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
			break
		}
	}
}

// Handler for the status endpoint.
func statusHandler(w http.ResponseWriter, r *http.Request) {
	enableCors(&w, r)
	if r.Method == "OPTIONS" {
		return // Preflight request thingy again
	}
	w.Header().Set("Content-Type", "text/plain")
	fmt.Fprintf(w, "backend stable")
}

// ----------------------------------------------------------------------------
// LedbetterGPT — a portfolio chat assistant backed by Gemini (gemini-flash-latest).
// The API key is injected from AWS Secrets Manager via the ECS task definition
// as the GEMINI_API_KEY environment variable; it is never stored in the repo.
// ----------------------------------------------------------------------------

const geminiModel = "gemini-flash-latest"
const geminiURL = "https://generativelanguage.googleapis.com/v1beta/models/" +
	geminiModel + ":streamGenerateContent?alt=sse"

// Factual knowledge is loaded from S3 at request time (editable without redeploy).
const knowledgeURL = "https://davidamosledbetter-portfolio.s3.amazonaws.com/ledbettergpt-knowledge.md"

// Persona + rules. The factual grounding is appended from knowledgeURL (or the
// embedded fallbackKnowledge if that fetch fails).
const baseInstruction = `You are LedbetterGPT, a friendly assistant embedded on David Ledbetter's personal portfolio site (davidamosledbetter.com). Answer questions about David — his background, experience, skills, and projects — using only the information provided below. Be concise (a few sentences), warm, and professional. If you are asked something about David that isn't covered, say you don't have that detail and suggest they reach out via the contact section. Politely decline requests unrelated to David or his work.`

const fallbackKnowledge = `ABOUT DAVID LEDBETTER
- Machine learning and full-stack software engineer at Apple (May 2024 - present), Cupertino, CA. Builds agentic AI systems - most notably a self-healing coding agent that orchestrates LLMs (Anthropic Claude for repair, local Qwen for tool-calling) to autonomously diagnose and repair code. Work spans LangGraph orchestration, RAG pipelines, async Python, distributed task queues, Kubernetes (cut resource usage of services by 50%+ and 75%), and PostgreSQL with SQLAlchemy/Pydantic. Manages a backend collecting results from 100,000+ devices.
- ML / Intelligent Distributed Systems researcher at UMBC's Ebiquity Lab (2021 - present): application-transparent eBPF kernel monitoring across distributed systems, a Graph Attention Pooling framework to extend dependency length for language models, computer-vision similarity work, distilling GPT-4V for ~96.7% latency reduction to autonomous drones, and anomaly detection with vision transformers. Has authored/co-authored publications.
- Education: BS in Computer Science (AI/ML focus, Statistics minor) and MS in Computer Science (AI/ML and Intelligent Distributed Systems), both from the University of Maryland, Baltimore County (UMBC). Meyerhoff Scholar, UMBC Cyber Scholar, GEM Fellow.
- Prior experience: Full-Stack SWE Intern at Cisco Meraki (React/Redux, Ruby on Rails, TypeScript) and Software Engineering Intern at Northrop Grumman Space (satellite OS software in C++, agile scrum).
- Notable projects (on this site): a Character-Aware Neural Language Model (CNN + transformer, ~3% perplexity reduction), a Kernel Mailbox Simulation (binary-search-tree node messaging), an Algorithmic Trading Companion (hybrid transformer + sentiment model), the NSBE chapter website, and this portfolio site itself (Go backend, React frontend, Docker, AWS ECS).
- Skills: Python, Go, C/C++, Swift, TypeScript/React, machine learning, distributed systems, DevOps/DevSecOps, Kubernetes, Docker, AWS.`

const (
	maxMessageChars   = 2000 // cap user input length
	maxHistoryTurns   = 10   // cap conversation context sent upstream
	maxOutputTokens   = 500  // cap Gemini output (bounds cost + keeps answers tight)
	dailyRequestLimit = 150  // hard global cap per day
	perIPDailyLimit   = 20   // per-IP cap per day
)

type chatTurn struct {
	Role string `json:"role"` // "user" or "model"
	Text string `json:"text"`
}

type chatRequest struct {
	Message string     `json:"message"`
	History []chatTurn `json:"history"`
}

// --- Gemini request/response shapes ---
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

// --- daily rate limiting (in-memory; resets on UTC day change or restart) ---
var (
	rlMu       sync.Mutex
	rlDay      string
	rlGlobal   int
	rlPerIP    = map[string]int{}
	httpClient = &http.Client{Timeout: 90 * time.Second}
)

// --- knowledge base: fetched from S3, cached in-memory for 5 minutes ---
var (
	kbMu      sync.Mutex
	kbText    string
	kbFetched time.Time
)

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
		return kbText // serve stale cache rather than fail
	}
	return fallbackKnowledge
}

func rateLimitAllow(ip string) (bool, string) {
	rlMu.Lock()
	defer rlMu.Unlock()
	today := time.Now().UTC().Format("2006-01-02")
	if today != rlDay {
		rlDay = today
		rlGlobal = 0
		rlPerIP = map[string]int{}
	}
	if rlGlobal >= dailyRequestLimit {
		return false, "Daily limit reached for LedbetterGPT. Please try again tomorrow."
	}
	if rlPerIP[ip] >= perIPDailyLimit {
		return false, "You've reached today's question limit. Please try again tomorrow."
	}
	rlGlobal++
	rlPerIP[ip]++
	return true, ""
}

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return strings.TrimSpace(strings.Split(xff, ",")[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func chatHandler(w http.ResponseWriter, r *http.Request) {
	enableCors(&w, r)
	if r.Method == "OPTIONS" {
		return
	}
	if r.Method != "POST" {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" || apiKey == "REPLACE_ME" {
		http.Error(w, "chat is not configured yet", http.StatusServiceUnavailable)
		return
	}

	if ok, msg := rateLimitAllow(clientIP(r)); !ok {
		http.Error(w, msg, http.StatusTooManyRequests)
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

	// Build Gemini contents from (capped) history + the new user message.
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
			"thinkingConfig":  map[string]interface{}{"thinkingBudget": 0}, // disable thinking: faster + cheaper
		},
	})

	greq, err := http.NewRequest("POST", geminiURL, bytes.NewReader(body))
	if err != nil {
		http.Error(w, "failed to build upstream request", http.StatusInternalServerError)
		return
	}
	greq.Header.Set("Content-Type", "application/json")
	greq.Header.Set("X-goog-api-key", apiKey)

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

	// Stream plaintext deltas to the client as they arrive.
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	flusher, _ := w.(http.Flusher)

	scanner := bufio.NewScanner(gresp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024) // allow long SSE lines
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
		if err := json.Unmarshal([]byte(payload), &chunk); err != nil {
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
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		enableCors(&w, r)
		if r.Method == "OPTIONS" {
			return // Handle preflight request
		}
		fmt.Fprintf(w, "Hello, this is a placeholder for the portfolio backend!")
	})

	http.HandleFunc("/api/status", statusHandler)
	http.HandleFunc("/api/chat", chatHandler)

	fmt.Println("Server is running on port 8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		fmt.Printf("Failed to start server: %v\n", err)
	}
}
