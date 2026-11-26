package main

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestVisitorKeys(t *testing.T) {
	r := httptest.NewRequest("POST", "/api/chat", nil)
	a, b := strings.Repeat("a", 32), strings.Repeat("0b", 16)
	r.Header.Set("X-Visitor", a+", "+b+",nothex,"+a+","+strings.Repeat("c", 31))
	got := visitorKeys(r, "sess-1")
	want := []string{"strike#v#" + a, "strike#v#" + b, "strike#s#sess-1"}
	if strings.Join(got, "|") != strings.Join(want, "|") {
		t.Fatalf("visitorKeys = %v, want %v", got, want)
	}
	if e := edgeKeys(got); len(e) != 2 || e[0] != a || e[1] != b {
		t.Fatalf("edgeKeys = %v", e)
	}
	split := httptest.NewRequest("POST", "/api/chat", nil) // as the API Gateway adapter delivers "a,b"
	split.Header.Add("X-Visitor", a)
	split.Header.Add("X-Visitor", b)
	if got := visitorKeys(split, "anon"); len(got) != 2 {
		t.Fatalf("split header values: got %v", got)
	}
	if got := visitorKeys(httptest.NewRequest("POST", "/api/chat", nil), "anon"); len(got) != 0 {
		t.Fatalf("no header, anon session: got %v", got)
	}
}

func samplePolicy() *topicPolicy {
	p := &topicPolicy{ClassifierPrompt: "x", Topics: []guardedTopic{
		{ID: "proj_a", Name: "the Example Project", AnswerUpTo: 1, Limit: 4, Summary: "A short public summary."},
		{ID: "proj_b", Name: "Example's model", AnswerUpTo: 1, Limit: 3},
		{ID: "broken", Name: "", Limit: 2},                  // dropped: no name
		{ID: "deep", Name: "x", AnswerUpTo: 4, Limit: 2},    // dropped: level out of range
		{ID: "nolimit", Name: "y", AnswerUpTo: 1, Limit: 0}, // dropped: no limit
	}}
	normalizePolicy(p)
	return p
}

func TestNormalizePolicy(t *testing.T) {
	p := samplePolicy()
	if len(p.Topics) != 2 || p.WindowDays != 30 || p.ResumeURL != defaultResumeLink {
		t.Fatalf("normalizePolicy: %d topics, window %d, resume %q", len(p.Topics), p.WindowDays, p.ResumeURL)
	}
	if p.topic("proj_b").Summary == "" {
		t.Fatal("a topic without a summary gets a default one")
	}
}

func TestParseTopic(t *testing.T) {
	p := samplePolicy()
	cases := []struct {
		out   string
		topic string
		level int64
	}{
		{"proj_a 2", "proj_a", 2},
		{"Proj_A, 3", "proj_a", 3},
		{"proj_b 1", "proj_b", 1},
		{"Topic: proj_b Level: 2", "proj_b", 2},
		{"none 0", "", 0},
		{"NONE", "", 0},
		{"proj_a", "proj_a", 0},
		{"2 proj_a", "proj_a", 0}, // the level must follow the id
	}
	for _, c := range cases {
		got, lv := parseTopic(p, c.out)
		id := ""
		if got != nil {
			id = got.ID
		}
		if id != c.topic || lv != c.level {
			t.Errorf("parseTopic(%q) = %q %d, want %q %d", c.out, id, lv, c.topic, c.level)
		}
	}
}

func TestTopicText(t *testing.T) {
	p := samplePolicy()
	f := p.topic("proj_a")
	if got := resumePointer(f, p); !strings.Contains(got, "[David's résumé]("+defaultResumeLink+")") {
		t.Errorf("résumé pointer is not a markdown link: %q", got)
	}
	if got := lockedReply(f, p); !strings.HasPrefix(got, "A short public summary.\n\n") {
		t.Errorf("lockedReply = %q", got)
	}
	tt := topicTurn{Topic: f, Level: 3, Over: 2, Points: 2}
	if got := overDepthReply(tt, p); !strings.Contains(got, "In short: A short public summary.") ||
		!strings.HasSuffix(got, topicWarning(f)) || !strings.Contains(got, resumePointer(f, p)) {
		t.Errorf("overDepthReply = %q", got)
	}
	tt.Reached = true
	if got := overDepthReply(tt, p); !strings.HasSuffix(got, topicLimitNotice(f)) {
		t.Errorf("overDepthReply at the limit = %q", got)
	}
}

// What visitors see must not say how they are recognized.
func TestVisitorFacingTextHidesTheMethod(t *testing.T) {
	p := samplePolicy()
	f := p.topic("proj_a")
	for _, s := range []string{topicWarning(f), topicLimitNotice(f), lockedReply(f, p), resumePointer(f, p),
		overDepthReply(topicTurn{Topic: f, Over: 1}, p), protectedPathReply, guardDecline, protectionsReply} {
		s = strings.ReplaceAll(s, defaultResumeLink, "")
		low := strings.ToLower(s)
		for _, w := range []string{"ip", "address", "cookie", "session", "header", "fingerprint", "strike", "track", "device", "browser"} {
			for _, f := range strings.FieldsFunc(low, func(r rune) bool { return !(r >= 'a' && r <= 'z') }) {
				if f == w {
					t.Errorf("visitor-facing text mentions %q: %q", w, s)
				}
			}
		}
	}
}

func TestProtectedSitePaths(t *testing.T) {
	for _, p := range []string{"backend-lambda/guard.go", "/backend-lambda/visitor.go", "backend-lambda/visitor_test.go",
		"backend-lambda/guard_test.go", "backend-lambda/evals/probe_classifier_eval.py", "BACKEND-LAMBDA/Guard.go"} {
		if !protectedSitePath("ledbetter-website", p) {
			t.Errorf("%s should be protected", p)
		}
	}
	for _, p := range []string{"backend-lambda/main.go", "backend-lambda/gittool.go", "frontend/src/App.js", "backend-lambda/evals/answer_eval.py"} {
		if protectedSitePath("ledbetter-website", p) {
			t.Errorf("%s should be readable", p)
		}
	}
	if protectedSitePath("trade-companion", "backend-lambda/guard.go") {
		t.Error("only this site's repo is affected")
	}
	if !protectedGitArgs("ledbetter-website", []string{"show", "HEAD:backend-lambda/visitor.go"}) ||
		!protectedGitArgs("ledbetter-website", []string{"log", "-p", "--", "backend-lambda/guard.go"}) ||
		protectedGitArgs("ledbetter-website", []string{"log", "--oneline", "-n", "5"}) {
		t.Error("protectedGitArgs")
	}
}

func TestScrubProtectedGit(t *testing.T) {
	in := strings.Join([]string{
		"commit 1111",
		"    tweak",
		"diff --git a/backend-lambda/guard.go b/backend-lambda/guard.go",
		"+secret pattern",
		"diff --git a/frontend/src/App.js b/frontend/src/App.js",
		"+visible change",
		"commit 2222",
		" backend-lambda/visitor.go | 10 +++",
		" frontend/src/App.js       |  2 +-",
		"HEAD:backend-lambda/guard.go:12:const x",
		"HEAD:backend-lambda/main.go:40:func main()",
	}, "\n")
	out := scrubProtectedGit("ledbetter-website", in)
	for _, gone := range []string{"secret pattern", "visitor.go", "guard.go"} {
		if strings.Contains(out, gone) {
			t.Errorf("scrubbed output still has %q:\n%s", gone, out)
		}
	}
	for _, kept := range []string{"commit 1111", "visible change", "commit 2222", "App.js       |", "main.go:40"} {
		if !strings.Contains(out, kept) {
			t.Errorf("scrubbed output lost %q:\n%s", kept, out)
		}
	}
	if scrubProtectedGit("other-repo", in) != in {
		t.Error("other repos are untouched")
	}
}

func TestRevealsMethod(t *testing.T) {
	leak := "The site uses standard abuse\u2011prevention measures\u2014things like rate\u2011limiting, cookies or similar signals\u2014to keep interactions safe."
	for _, s := range []string{leak, "We log your IP address.", "It tracks visitors across visits.", "After three strikes you are limited."} {
		if !revealsMethod(s) {
			t.Errorf("should catch: %q", s)
		}
	}
	for _, s := range []string{protectionsReply, guardDecline, "Pathion gives students session summaries and hints.",
		"David works under IP constraints from his employer.", "The NSBE site lets members sign in."} {
		if revealsMethod(s) {
			t.Errorf("false alarm: %q", s)
		}
	}
}
