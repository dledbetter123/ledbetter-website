package main

// mcp.go serves LedbetterLM over the Model Context Protocol at /api/mcp, so any MCP
// client can add the site as a remote server:
//
//	claude mcp add --transport http ledbetter https://www.davidamosledbetter.com/api/mcp
//
// Transport: Streamable HTTP, stateless. Every JSON-RPC request is a POST answered with
// a single application/json body; there is no SSE stream (GET is 405) and no
// Mcp-Session-Id. Conversations live in DynamoDB under the conversation_id the tools
// hand back, so the transport itself needs no session.
//
// Every tool that reaches a model goes through chatHandler itself, so MCP traffic gets
// the same per-IP, daily and cost caps, the probe guard, the cataloguer, and the per-turn
// log and notification email as the widget.

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"time"
)

const (
	mcpLatestProtocol = "2025-11-25"
	mcpServerVersion  = "1.0.0"
	mcpMaxBody        = 64 << 10
	mcpKeepTurns      = 2 * maxHistoryTurns // chatHandler only reads the last maxHistoryTurns
	mcpPollEvery      = 1500 * time.Millisecond
	resumeURL         = "https://davidamosledbetter-portfolio.s3.amazonaws.com/resume"
)

// mcpWaitBudget is how long get_ledbetterlm_answer waits for the librarian. The delivery
// turn still has to run after it inside API Gateway's 30s, so it stays well short of that.
var mcpWaitBudget = 10 * time.Second

// mcpProtocols are the versions this server can speak. Tools-only, JSON responses: the
// subset every version shares.
var mcpProtocols = map[string]bool{"2025-11-25": true, "2025-06-18": true, "2025-03-26": true, "2024-11-05": true}

var mcpConvRe = regexp.MustCompile(`^[a-f0-9]{16}$`)

// Seams for tests: the chat pipeline and the DynamoDB data helpers.
var (
	mcpChat   = chatViaHandler
	mcpResume = resumeViaHandler
	mcpGet    = getData
	mcpPut    = putData
	mcpSleep  = func(ctx context.Context, d time.Duration) {
		select {
		case <-ctx.Done():
		case <-time.After(d):
		}
	}
)

const mcpInstructions = "LedbetterLM is David Ledbetter's AI librarian. It answers questions about David " +
	"(his work, projects, research and how things he built work), grounded on a knowledge base he " +
	"maintains and on his public GitHub repos. Start with about_david for a free overview, then use " +
	"ask_ledbetterlm for anything else. It is a shared, rate-limited resource, so please be considerate."

type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  interface{}     `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type mcpContent struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type mcpToolResult struct {
	Content []mcpContent `json:"content"`
	IsError bool         `json:"isError,omitempty"`
}

func toolText(text string) mcpToolResult {
	return mcpToolResult{Content: []mcpContent{{Type: "text", Text: text}}}
}

func toolError(text string) mcpToolResult {
	r := toolText(text)
	r.IsError = true
	return r
}

var mcpTools = []map[string]interface{}{
	{
		"name":  "about_david",
		"title": "About David",
		"description": "A short overview of David Ledbetter: who he is, what he works on, his projects " +
			"and publications with links, and where his résumé lives. Free and instant; read this first.",
		"inputSchema": map[string]interface{}{"type": "object", "properties": map[string]interface{}{}},
		"annotations": map[string]interface{}{"readOnlyHint": true, "openWorldHint": false},
	},
	{
		"name":  "ask_ledbetterlm",
		"title": "Ask LedbetterLM",
		"description": "Ask LedbetterLM, David's AI librarian, anything about David: his experience, " +
			"projects, research, or how something he built works. It speaks for David and can read his " +
			"public GitHub repos. Pass the conversation_id from an earlier answer to continue that " +
			"conversation. A code-level question may be handed to the librarian, who needs 20-90 seconds " +
			"to read the repos: the reply then says so, and get_ledbetterlm_answer collects the full answer.",
		"inputSchema": map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"question": map[string]interface{}{
					"type": "string", "maxLength": maxMessageChars,
					"description": "Your question for LedbetterLM.",
				},
				"conversation_id": map[string]interface{}{
					"type":        "string",
					"description": "Optional. The conversation_id from an earlier answer, to continue that conversation.",
				},
			},
			"required": []string{"question"},
		},
		"annotations": map[string]interface{}{"readOnlyHint": true, "openWorldHint": true},
	},
	{
		"name":  "get_ledbetterlm_answer",
		"title": "Collect LedbetterLM's answer",
		"description": "Collect the full answer to a question that ask_ledbetterlm handed to the librarian. " +
			"Waits up to 10 seconds; if the librarian is still reading, it says so and you can call again.",
		"inputSchema": map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"conversation_id": map[string]interface{}{
					"type":        "string",
					"description": "The conversation_id ask_ledbetterlm returned.",
				},
			},
			"required": []string{"conversation_id"},
		},
		"annotations": map[string]interface{}{"readOnlyHint": true, "openWorldHint": true},
	},
	{
		"name":        "get_resume",
		"title":       "Get David's résumé",
		"description": "Get the link to David Ledbetter's résumé (PDF).",
		"inputSchema": map[string]interface{}{"type": "object", "properties": map[string]interface{}{}},
		"annotations": map[string]interface{}{"readOnlyHint": true, "openWorldHint": false},
	},
}

const aboutDavid = `David Ledbetter is a machine-learning and full-stack software engineer at Apple, building agentic AI systems. BS and MS in Computer Science from UMBC; researcher at UMBC's Ebiquity Lab.

Projects
- Self-Healing Coding Agent (Apple): his flagship project on Release Validation, an agent that repairs code on its own. Proprietary, so there is no public repo.
- Pathion (https://pathion.dev): a learn-to-code and interview-prep platform where all code runs on-device in WebAssembly. He built the AI layer: an in-browser LLM tutor, the learning-data pipeline, and an adaptive Elo rating.
- This website and LedbetterLM (https://github.com/dledbetter123/ledbetter-website): serverless AWS, with a Go Lambda running the librarian you are talking to.
- Sparse Geometric Signal Transport (https://github.com/dledbetter123/SparseGeometricSignalTransport): attention as parallel transport on a fiber bundle.
- The Finsler Transformer (https://github.com/dledbetter123/LedbetterFinslerTransformer): attention as geodesic flow on a learned manifold.
- Character Aware Neural Language Model (https://github.com/dledbetter123/Grad-Assessment)
- Kernel Mailbox Simulation (https://github.com/dledbetter123/kernel-bst)
- Algorithmic Trading Companion (https://github.com/dledbetter123/trade-companion)
- NSBE Chapter Website (https://github.com/dledbetter123/nsbe-website)

Publications
- Impostors Among Us: An Agentic Approach to Identifying and Resolving Conflicts in Collaborative Network Environments. IEEE, 2025. https://ieeexplore.ieee.org/abstract/document/11309858
- Energy-Efficient Onboard Autonomous Drone Navigation. URCAD 2022 poster.

Links
- Site: https://www.davidamosledbetter.com
- GitHub: https://github.com/dledbetter123
- Résumé: ` + resumeURL + `

For anything deeper, use ask_ledbetterlm.`

// mcpHandler is the /api/mcp endpoint.
func mcpHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
	case http.MethodOptions:
		return
	default:
		w.Header().Set("Allow", "POST")
		http.Error(w, "this MCP server takes POST only (no SSE stream)", http.StatusMethodNotAllowed)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, mcpMaxBody))
	if err != nil {
		writeRPC(w, http.StatusBadRequest, rpcResponse{JSONRPC: "2.0", ID: json.RawMessage("null"), Error: &rpcError{Code: -32700, Message: "could not read body"}})
		return
	}
	body = bytes.TrimSpace(body)

	// A batch (allowed before 2025-06-18): answer each request, skip notifications.
	if len(body) > 0 && body[0] == '[' {
		var batch []json.RawMessage
		if err := json.Unmarshal(body, &batch); err != nil || len(batch) == 0 {
			writeRPC(w, http.StatusBadRequest, rpcResponse{JSONRPC: "2.0", ID: json.RawMessage("null"), Error: &rpcError{Code: -32700, Message: "parse error"}})
			return
		}
		var out []rpcResponse
		for _, raw := range batch {
			if resp, ok := handleRPC(r, raw); ok {
				out = append(out, resp)
			}
		}
		if len(out) == 0 {
			w.WriteHeader(http.StatusAccepted)
			return
		}
		writeRPC(w, http.StatusOK, out)
		return
	}

	resp, ok := handleRPC(r, body)
	if !ok {
		// A notification or a client response: nothing to answer.
		w.WriteHeader(http.StatusAccepted)
		return
	}
	status := http.StatusOK
	if resp.Error != nil && (resp.Error.Code == -32700 || resp.Error.Code == -32600) {
		status = http.StatusBadRequest
	}
	writeRPC(w, status, resp)
}

func writeRPC(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// handleRPC answers one JSON-RPC message. ok is false when nothing should be sent back
// (a notification, or a response from the client).
func handleRPC(r *http.Request, raw []byte) (rpcResponse, bool) {
	var req rpcRequest
	if err := json.Unmarshal(raw, &req); err != nil {
		return rpcResponse{JSONRPC: "2.0", ID: json.RawMessage("null"), Error: &rpcError{Code: -32700, Message: "parse error"}}, true
	}
	if len(req.ID) == 0 {
		return rpcResponse{}, false
	}
	if req.Method == "" {
		// A response to something we never sent, or a malformed request.
		var probe map[string]json.RawMessage
		if json.Unmarshal(raw, &probe) == nil && (probe["result"] != nil || probe["error"] != nil) {
			return rpcResponse{}, false
		}
		return rpcResponse{JSONRPC: "2.0", ID: req.ID, Error: &rpcError{Code: -32600, Message: "invalid request"}}, true
	}
	result, rerr := dispatchRPC(r, req)
	if rerr != nil {
		return rpcResponse{JSONRPC: "2.0", ID: req.ID, Error: rerr}, true
	}
	return rpcResponse{JSONRPC: "2.0", ID: req.ID, Result: result}, true
}

func dispatchRPC(r *http.Request, req rpcRequest) (interface{}, *rpcError) {
	switch req.Method {
	case "initialize":
		var p struct {
			ProtocolVersion string `json:"protocolVersion"`
		}
		json.Unmarshal(req.Params, &p)
		version := mcpLatestProtocol
		if mcpProtocols[p.ProtocolVersion] {
			version = p.ProtocolVersion
		}
		return map[string]interface{}{
			"protocolVersion": version,
			"capabilities":    map[string]interface{}{"tools": map[string]interface{}{"listChanged": false}},
			"serverInfo":      map[string]interface{}{"name": "ledbetterlm", "title": "LedbetterLM", "version": mcpServerVersion},
			"instructions":    mcpInstructions,
		}, nil
	case "ping":
		return map[string]interface{}{}, nil
	case "tools/list":
		return map[string]interface{}{"tools": mcpTools}, nil
	case "tools/call":
		var p struct {
			Name      string          `json:"name"`
			Arguments json.RawMessage `json:"arguments"`
		}
		if err := json.Unmarshal(req.Params, &p); err != nil {
			return nil, &rpcError{Code: -32602, Message: "invalid params"}
		}
		var args struct {
			Question       string `json:"question"`
			ConversationID string `json:"conversation_id"`
		}
		if len(p.Arguments) > 0 {
			if err := json.Unmarshal(p.Arguments, &args); err != nil {
				return nil, &rpcError{Code: -32602, Message: "invalid arguments"}
			}
		}
		switch p.Name {
		case "about_david":
			return toolText(aboutDavid), nil
		case "get_resume":
			mcpResume(r)
			return toolText("David Ledbetter's résumé (PDF): " + resumeURL), nil
		case "ask_ledbetterlm":
			return mcpAsk(r, args.Question, args.ConversationID), nil
		case "get_ledbetterlm_answer":
			return mcpCollect(r, args.ConversationID), nil
		}
		return nil, &rpcError{Code: -32602, Message: "unknown tool: " + p.Name}
	}
	return nil, &rpcError{Code: -32601, Message: "method not found: " + req.Method}
}

// mcpConversation is one MCP conversation, kept in DynamoDB for as long as a fact sheet.
type mcpConversation struct {
	History []chatTurn `json:"history"`
	// Pending is a question handed to the librarian whose full answer is not delivered yet.
	Pending string `json:"pending,omitempty"`
}

func convKey(id string) string     { return "mcpconv#" + id }
func convSession(id string) string { return "mcp-" + id }

func loadConv(ctx context.Context, id string) mcpConversation {
	var c mcpConversation
	if s := mcpGet(ctx, convKey(id)); s != "" {
		json.Unmarshal([]byte(s), &c)
	}
	return c
}

func saveConv(ctx context.Context, id string, c mcpConversation) {
	if len(c.History) > mcpKeepTurns {
		c.History = c.History[len(c.History)-mcpKeepTurns:]
	}
	b, _ := json.Marshal(c)
	mcpPut(ctx, convKey(id), string(b), catalogTTLSec)
}

func newConvID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func withConvID(text, id string) string {
	return text + "\n\nconversation_id: " + id
}

// chatFailure turns a non-200 from chatHandler into a tool error. Its body is already a
// visitor-facing sentence for the caps (429) and "not configured" (503).
func chatFailure(code int, body string) mcpToolResult {
	if code == http.StatusTooManyRequests || code == http.StatusServiceUnavailable {
		return toolError(body)
	}
	return toolError(fmt.Sprintf("LedbetterLM couldn't answer right now (HTTP %d). Please try again in a minute.", code))
}

func mcpAsk(r *http.Request, question, id string) mcpToolResult {
	ctx := r.Context()
	question = strings.TrimSpace(question)
	if question == "" {
		return toolError("question is required.")
	}
	if id == "" {
		id = newConvID()
	} else if !mcpConvRe.MatchString(id) {
		return toolError("That conversation_id isn't one this server issued. Leave it out to start a new conversation.")
	}
	conv := loadConv(ctx, id)
	if conv.Pending != "" {
		return toolError(withConvID("The librarian is still working on your earlier question in this conversation. "+
			"Call get_ledbetterlm_answer with this conversation_id first.", id))
	}
	code, answer, gathering := mcpChat(r, chatRequest{Message: question, History: conv.History, SessionID: convSession(id)})
	if code != http.StatusOK {
		return chatFailure(code, answer)
	}
	conv.History = append(conv.History, chatTurn{Role: "user", Text: question}, chatTurn{Role: "model", Text: answer})
	if gathering {
		conv.Pending = question
	}
	saveConv(ctx, id, conv)
	if gathering {
		answer += "\n\n(LedbetterLM's librarian is now reading David's GitHub repos for this, which usually takes " +
			"20-90 seconds. Call get_ledbetterlm_answer with this conversation_id to collect the full answer.)"
	}
	return toolText(withConvID(answer, id))
}

func mcpCollect(r *http.Request, id string) mcpToolResult {
	ctx := r.Context()
	if !mcpConvRe.MatchString(id) {
		return toolError("conversation_id is required: use the one ask_ledbetterlm returned.")
	}
	conv := loadConv(ctx, id)
	if conv.Pending == "" {
		return toolText(withConvID("Nothing is waiting in this conversation. Ask something new with ask_ledbetterlm.", id))
	}
	session := convSession(id)
	deadline := time.Now().Add(mcpWaitBudget)
	for mcpGet(ctx, "catalogstate#"+session) == "pending" {
		if time.Now().After(deadline) || ctx.Err() != nil {
			status := mcpGet(ctx, "catalogstatus#"+session)
			if status == "" {
				status = "still reading"
			}
			return toolText(withConvID("The librarian isn't done yet ("+strings.TrimSpace(status)+
				"). Call get_ledbetterlm_answer again in about 15 seconds.", id))
		}
		mcpSleep(ctx, mcpPollEvery)
	}
	// Re-ask with deliver, as the widget does once the librarian is ready.
	code, answer, gathering := mcpChat(r, chatRequest{Message: conv.Pending, History: conv.History, SessionID: session, Deliver: true})
	if code != http.StatusOK {
		return chatFailure(code, answer)
	}
	if gathering {
		// The fact sheet was gone (expired or failed) and the librarian started over.
		return toolText(withConvID("The librarian had to start over on this one. Call get_ledbetterlm_answer again in about 30 seconds.", id))
	}
	conv.History = append(conv.History, chatTurn{Role: "model", Text: answer})
	conv.Pending = ""
	saveConv(ctx, id, conv)
	return toolText(withConvID(answer, id))
}

// mcpProxyRequest builds an internal request that carries the caller's identity (the
// CloudFront viewer address the caps key on, and the User-Agent, tagged as MCP).
func mcpProxyRequest(r *http.Request, path string, body []byte) *http.Request {
	in, _ := http.NewRequestWithContext(r.Context(), http.MethodPost, path, bytes.NewReader(body))
	for _, h := range []string{"CloudFront-Viewer-Address", "X-Forwarded-For"} {
		if v := r.Header.Get(h); v != "" {
			in.Header.Set(h, v)
		}
	}
	in.RemoteAddr = r.RemoteAddr
	in.Header.Set("Content-Type", "application/json")
	in.Header.Set("User-Agent", strings.TrimSpace("MCP · "+r.Header.Get("User-Agent")))
	return in
}

// chatViaHandler runs one turn through chatHandler and reports its status, body, and
// whether it handed the question to the librarian.
func chatViaHandler(r *http.Request, req chatRequest) (int, string, bool) {
	body, _ := json.Marshal(req)
	rec := httptest.NewRecorder()
	chatHandler(rec, mcpProxyRequest(r, "/api/chat", body))
	return rec.Code, strings.TrimSpace(rec.Body.String()), rec.Header().Get("X-Catalog") == "gathering"
}

// resumeViaHandler logs the résumé request like a click on the site, notification included.
func resumeViaHandler(r *http.Request) {
	resumeClickHandler(httptest.NewRecorder(), mcpProxyRequest(r, "/api/resume-click", []byte("{}")))
}
