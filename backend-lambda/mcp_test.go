package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type chatCall struct {
	req chatRequest
	ua  string
}

// stubMCP swaps the chat pipeline and DynamoDB for in-memory fakes. reply answers each
// chat call in order.
func stubMCP(t *testing.T, store map[string]string, reply func(n int, req chatRequest) (int, string, bool)) *[]chatCall {
	t.Helper()
	calls := &[]chatCall{}
	oldChat, oldResume, oldGet, oldPut, oldSleep, oldWait := mcpChat, mcpResume, mcpGet, mcpPut, mcpSleep, mcpWaitBudget
	t.Cleanup(func() {
		mcpChat, mcpResume, mcpGet, mcpPut, mcpSleep, mcpWaitBudget = oldChat, oldResume, oldGet, oldPut, oldSleep, oldWait
	})
	mcpChat = func(r *http.Request, req chatRequest) (int, string, bool) {
		*calls = append(*calls, chatCall{req: req, ua: mcpProxyRequest(r, "/api/chat", nil).Header.Get("User-Agent")})
		return reply(len(*calls), req)
	}
	mcpResume = func(*http.Request) {}
	mcpGet = func(_ context.Context, k string) string { return store[k] }
	mcpPut = func(_ context.Context, k, v string, _ int64) { store[k] = v }
	mcpSleep = func(context.Context, time.Duration) {}
	return calls
}

func post(t *testing.T, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/mcp", strings.NewReader(body))
	req.Header.Set("User-Agent", "claude-code/9.9")
	rec := httptest.NewRecorder()
	mcpHandler(rec, req)
	return rec
}

func rpcResult(t *testing.T, rec *httptest.ResponseRecorder) map[string]interface{} {
	t.Helper()
	var resp struct {
		Result map[string]interface{} `json:"result"`
		Error  *rpcError              `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("bad JSON %q: %v", rec.Body.String(), err)
	}
	if resp.Error != nil {
		t.Fatalf("unexpected error %+v", resp.Error)
	}
	return resp.Result
}

func callTool(t *testing.T, name string, args map[string]string) (string, bool) {
	t.Helper()
	params, _ := json.Marshal(map[string]interface{}{"name": name, "arguments": args})
	res := rpcResult(t, post(t, `{"jsonrpc":"2.0","id":7,"method":"tools/call","params":`+string(params)+`}`))
	content := res["content"].([]interface{})
	isErr, _ := res["isError"].(bool)
	return content[0].(map[string]interface{})["text"].(string), isErr
}

func convIDOf(t *testing.T, text string) string {
	t.Helper()
	i := strings.LastIndex(text, "conversation_id: ")
	if i < 0 {
		t.Fatalf("no conversation_id in %q", text)
	}
	return strings.TrimSpace(text[i+len("conversation_id: "):])
}

func TestMCPInitializeNegotiatesVersion(t *testing.T) {
	res := rpcResult(t, post(t, `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}`))
	if res["protocolVersion"] != "2025-06-18" {
		t.Errorf("a known version is echoed, got %v", res["protocolVersion"])
	}
	if _, ok := res["capabilities"].(map[string]interface{})["tools"]; !ok {
		t.Error("tools capability missing")
	}
	res = rpcResult(t, post(t, `{"jsonrpc":"2.0","id":2,"method":"initialize","params":{"protocolVersion":"2099-01-01"}}`))
	if res["protocolVersion"] != mcpLatestProtocol {
		t.Errorf("an unknown version gets the latest we speak, got %v", res["protocolVersion"])
	}
}

func TestMCPTransport(t *testing.T) {
	if rec := post(t, `{"jsonrpc":"2.0","method":"notifications/initialized"}`); rec.Code != http.StatusAccepted || rec.Body.Len() != 0 {
		t.Errorf("notification: got %d %q, want 202 and no body", rec.Code, rec.Body.String())
	}
	rec := httptest.NewRecorder()
	mcpHandler(rec, httptest.NewRequest(http.MethodGet, "/api/mcp", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("GET: got %d, want 405", rec.Code)
	}
	if rec := post(t, `{not json`); rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "-32700") {
		t.Errorf("parse error: got %d %q", rec.Code, rec.Body.String())
	}
	if rec := post(t, `{"jsonrpc":"2.0","id":3,"method":"resources/list"}`); !strings.Contains(rec.Body.String(), "-32601") {
		t.Errorf("unknown method: got %q", rec.Body.String())
	}
	if rec := post(t, `{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"nope","arguments":{}}}`); !strings.Contains(rec.Body.String(), "-32602") {
		t.Errorf("unknown tool: got %q", rec.Body.String())
	}
	rec = post(t, `[{"jsonrpc":"2.0","id":5,"method":"ping"},{"jsonrpc":"2.0","method":"notifications/initialized"}]`)
	var batch []rpcResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &batch); err != nil || len(batch) != 1 || string(batch[0].ID) != "5" {
		t.Errorf("batch: got %q", rec.Body.String())
	}
}

func TestMCPToolsList(t *testing.T) {
	res := rpcResult(t, post(t, `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`))
	var names []string
	for _, tool := range res["tools"].([]interface{}) {
		m := tool.(map[string]interface{})
		names = append(names, m["name"].(string))
		if _, ok := m["inputSchema"].(map[string]interface{}); !ok {
			t.Errorf("%v has no inputSchema", m["name"])
		}
	}
	if strings.Join(names, ",") != "about_david,ask_ledbetterlm,get_ledbetterlm_answer,get_resume" {
		t.Errorf("tools: %v", names)
	}
}

func TestMCPAskKeepsTheConversation(t *testing.T) {
	store := map[string]string{}
	calls := stubMCP(t, store, func(n int, req chatRequest) (int, string, bool) {
		return http.StatusOK, "answer " + req.Message, false
	})
	text, isErr := callTool(t, "ask_ledbetterlm", map[string]string{"question": "What does David do?"})
	if isErr || !strings.HasPrefix(text, "answer What does David do?") {
		t.Fatalf("first ask: %q", text)
	}
	id := convIDOf(t, text)
	text, _ = callTool(t, "ask_ledbetterlm", map[string]string{"question": "And Pathion?", "conversation_id": id})
	if convIDOf(t, text) != id {
		t.Errorf("the conversation_id should carry over")
	}
	second := (*calls)[1].req
	if second.SessionID != "mcp-"+id || len(second.History) != 2 || second.History[1].Text != "answer What does David do?" {
		t.Errorf("second turn should carry the first as history: %+v", second)
	}
	if !strings.HasPrefix((*calls)[0].ua, "MCP · claude-code/9.9") {
		t.Errorf("turns are tagged as MCP in the log: %q", (*calls)[0].ua)
	}
	if _, isErr := callTool(t, "ask_ledbetterlm", map[string]string{"question": "x", "conversation_id": "../etc"}); !isErr {
		t.Error("a made-up conversation_id is refused")
	}
}

func TestMCPLibrarianHandoffThenCollect(t *testing.T) {
	store := map[string]string{}
	calls := stubMCP(t, store, func(n int, req chatRequest) (int, string, bool) {
		if n == 1 {
			return http.StatusOK, "Let me get my librarian on that.", true
		}
		return http.StatusOK, "Here is how the cataloguer works.", false
	})
	text, _ := callTool(t, "ask_ledbetterlm", map[string]string{"question": "How does the cataloguer work?"})
	id := convIDOf(t, text)
	if !strings.Contains(text, "get_ledbetterlm_answer") {
		t.Errorf("a handoff should point at get_ledbetterlm_answer: %q", text)
	}
	if _, isErr := callTool(t, "ask_ledbetterlm", map[string]string{"question": "Another?", "conversation_id": id}); !isErr {
		t.Error("a new question while one is pending is refused")
	}

	// Still reading: the wait runs out and says so, without a chat call.
	store["catalogstate#mcp-"+id] = "pending"
	store["catalogstatus#mcp-"+id] = "Reading cataloguer.go"
	mcpWaitBudget = 0
	text, isErr := callTool(t, "get_ledbetterlm_answer", map[string]string{"conversation_id": id})
	if isErr || !strings.Contains(text, "isn't done yet (Reading cataloguer.go)") || len(*calls) != 1 {
		t.Errorf("still pending: %q (calls %d)", text, len(*calls))
	}

	// Ready: one delivery turn re-asks the pending question.
	store["catalogstate#mcp-"+id] = "ready"
	text, _ = callTool(t, "get_ledbetterlm_answer", map[string]string{"conversation_id": id})
	if !strings.HasPrefix(text, "Here is how the cataloguer works.") {
		t.Errorf("delivery: %q", text)
	}
	deliver := (*calls)[1].req
	if !deliver.Deliver || deliver.Message != "How does the cataloguer work?" {
		t.Errorf("delivery should re-ask the pending question with deliver: %+v", deliver)
	}
	if conv := loadConv(context.Background(), id); conv.Pending != "" || len(conv.History) != 3 {
		t.Errorf("after delivery: %+v", conv)
	}
	text, _ = callTool(t, "get_ledbetterlm_answer", map[string]string{"conversation_id": id})
	if !strings.Contains(text, "Nothing is waiting") {
		t.Errorf("nothing pending: %q", text)
	}
}

func TestMCPCapsComeThroughAsToolErrors(t *testing.T) {
	stubMCP(t, map[string]string{}, func(int, chatRequest) (int, string, bool) {
		return http.StatusTooManyRequests, "You've reached today's question limit. Please try again tomorrow.", false
	})
	text, isErr := callTool(t, "ask_ledbetterlm", map[string]string{"question": "hi"})
	if !isErr || !strings.Contains(text, "today's question limit") {
		t.Errorf("got %q (isError %v)", text, isErr)
	}
}
