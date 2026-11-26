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
	if got := visitorKeys(httptest.NewRequest("POST", "/api/chat", nil), "anon"); len(got) != 0 {
		t.Fatalf("no header, anon session: got %v", got)
	}
}

func TestStrikeNotice(t *testing.T) {
	strikeLimit = 3
	cases := []struct {
		flagged       bool
		before, after int64
		want          string
	}{
		{false, 0, 0, ""},
		{true, 0, 1, strikeWarning},
		{true, 1, 2, strikeWarning},
		{true, 2, 3, limitedNotice},
		{true, 3, 4, ""},            // already limited: the decline is enough
		{false, 5, 5, ""},           // limited, ordinary question: no repeated notice
		{true, 0, 0, strikeWarning}, // counter write failed: still warn
	}
	for _, c := range cases {
		if got := strikeNotice(c.flagged, c.before, c.after); got != c.want {
			t.Errorf("strikeNotice(%v, %d, %d) = %q, want %q", c.flagged, c.before, c.after, got, c.want)
		}
	}
}

// What visitors see must not say how they are recognized.
func TestVisitorFacingTextHidesTheMethod(t *testing.T) {
	for _, s := range []string{strikeWarning, limitedNotice, limitedExtra, protectedPathReply, guardDecline} {
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
