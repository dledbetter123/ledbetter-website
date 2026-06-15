package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	lambdasvc "github.com/aws/aws-sdk-go-v2/service/lambda"
	lambdatypes "github.com/aws/aws-sdk-go-v2/service/lambda/types"
)

// The cataloguer is a Gemini-driven research agent that front-loads real code context for
// a conversation. Gemini does the agentic repo/code exploration well (Workers AI / Scout
// does not), so we run it ONCE (async, off the request path) when the first message looks
// like the chat will go into code/implementation depth, cache a compact fact sheet per
// session, and inject that into Scout's context on later turns. It runs as an async self-
// invoke of this same Lambda, so it gets the full 120s Lambda timeout with no API-Gateway
// 30s limit and can explore deeply.

const (
	catalogMaxRounds  = 8                // tool-call rounds the cataloguer may take
	catalogWallBudget = 95 * time.Second // stop exploring before the 120s Lambda timeout
	catalogTTLSec     = 3600             // session fact sheet lives 1h
	catalogMaxBytes   = 8000             // cap the fact sheet injected into Scout's context
)

const cataloguerInstruction = `You are the CATALOGUER — a research agent for David Ledbetter's portfolio chat. You are NOT talking to the visitor. Your job: given the visitor's opening message, work out which of David's GitHub projects/repos are most relevant to where this conversation is likely headed, then USE your repo tools (list_my_repos, list_repo_files, read_repo_file) to actually explore those repos and read the key files.

Then output a CONCISE FACT SHEET in plain text (no Markdown) capturing the real, specific implementation details you found: which repos are relevant and why, their structure, the key files and what each does, concrete techniques/algorithms/configs/libraries actually used, and a few short illustrative code excerpts (a handful of lines each, never whole files). Another model will be handed this fact sheet as background context so it can answer code-level questions accurately and specifically.

Rules: Explore broadly first (list_my_repos), then read the most relevant files. Prefer concrete facts over generic description. Do NOT address or answer the visitor — output only the fact sheet. Honor all privacy rules: never include anything from private or disclosure-gated repos beyond what their rules allow, never reveal the name "CurvBias" (call it a curvature-based positional encoding), and never use the name "LILO". Keep the whole sheet under ~3000 words.`

// catalogTriggers / catalogProjectNames decide (cheaply, no model call) whether the first
// message looks like it'll need real code context.
var catalogTriggers = []string{
	"code", "implement", "how did you build", "how'd you build", "how does it work",
	"how does that work", "how does this work", "how it works", "under the hood",
	"architecture", "algorithm", "walk me through", "show me", "technical detail",
	"internals", "deep dive", "deep-dive", "repo", "repository", "source code",
	"in the code", "your stack for", "data structure", "design of", "built it",
}
var catalogProjectNames = []string{
	"self-healing", "self healing", "finsler", "sgst", "sparse geometric", "trade-companion",
	"trade companion", "ebpf", "kernel probe", "graph attention", "leo", "character-aware",
}

func catalogLikely(msg string) bool {
	m := strings.ToLower(msg)
	for _, t := range catalogTriggers {
		if strings.Contains(m, t) {
			return true
		}
	}
	for _, n := range catalogProjectNames {
		if strings.Contains(m, n) {
			return true
		}
	}
	return false
}

// enqueueCatalogue fires the cataloguer as an async (Event) self-invoke so it runs in its
// own Lambda invocation, fully isolated from this request and from the SQS turn pipeline.
func enqueueCatalogue(ctx context.Context, session, message string) {
	if lambdaInvoker == nil || selfFnName == "" {
		return // not configured → degrade gracefully to KB-only
	}
	payload, _ := json.Marshal(map[string]interface{}{
		"catalogue": map[string]string{"session": session, "message": message},
	})
	cctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if _, err := lambdaInvoker.Invoke(cctx, &lambdasvc.InvokeInput{
		FunctionName:   aws.String(selfFnName),
		InvocationType: lambdatypes.InvocationTypeEvent,
		Payload:        payload,
	}); err != nil {
		fmt.Printf("catalogue invoke error: %v\n", err)
		// Couldn't kick off the background run — clear the pending flag so a later turn can retry.
		putData(ctx, "catalogstate#"+session, "", 60)
	}
}

// runCataloguer is the async worker: it runs Gemini's agentic tool loop to build the fact
// sheet, then caches it for the session. Invoked via the async self-invoke above.
func runCataloguer(ctx context.Context, session, message string) {
	sys := cataloguerInstruction + "\n\n" + currentDateLine() +
		"\n\n--- DAVID'S KNOWLEDGE BASE (for grounding and to know which projects exist) ---\n" + knowledge()
	contents := []geminiContent{{
		Role: "user",
		Parts: []geminiPart{{Text: "Visitor's opening message: " + message +
			"\n\nExplore my repos and produce the fact sheet for the code/implementation topics this conversation is likely to cover."}},
	}}

	start := time.Now()
	var sheet strings.Builder
	for round := 0; round < catalogMaxRounds; round++ {
		withTools := round < catalogMaxRounds-1
		if time.Since(start) > catalogWallBudget {
			withTools = false // out of time → force the final fact sheet
		}
		mc, _, err := geminiRaw(ctx, sys, contents, withTools)
		if err != nil {
			fmt.Printf("cataloguer gemini error (round %d): %v\n", round, err)
			break
		}
		var calls []*fnCall
		var text strings.Builder
		for _, p := range mc.Parts {
			if p.FunctionCall != nil {
				calls = append(calls, p.FunctionCall)
			}
			if p.Text != "" {
				text.WriteString(p.Text)
			}
		}
		if len(calls) == 0 {
			sheet.WriteString(text.String())
			break
		}
		if mc.Role == "" {
			mc.Role = "model"
		}
		contents = append(contents, mc)
		respParts := make([]geminiPart, 0, len(calls))
		for _, c := range calls {
			respParts = append(respParts, geminiPart{FunctionResponse: &fnResponse{
				Name: c.Name, ID: c.ID, Response: map[string]interface{}{"content": runTool(ctx, c)},
			}})
		}
		contents = append(contents, geminiContent{Role: "user", Parts: respParts})
	}

	facts := strings.TrimSpace(sheet.String())
	if len(facts) > catalogMaxBytes {
		facts = facts[:catalogMaxBytes] + "\n…(truncated)"
	}
	if facts == "" {
		facts = "(the cataloguer found no specific code context for this topic)"
	}
	putData(ctx, "catalog#"+session, facts, catalogTTLSec)
	putData(ctx, "catalogstate#"+session, "ready", catalogTTLSec)
	fmt.Printf("cataloguer done for session %s: %d bytes in %s\n", session, len(facts), time.Since(start))
}
