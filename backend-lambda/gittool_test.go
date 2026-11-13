package main

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"
)

func TestGitArgs(t *testing.T) {
	cases := map[string][]string{
		"log --oneline -20":                  {"log", "--oneline", "-20"},
		"git log --oneline":                  {"log", "--oneline"},
		`log --format='%ad %s' --date=short`: {"log", "--format=%ad %s", "--date=short"},
		`log --grep "fix \"quoted\""`:        {"log", "--grep", `fix "quoted"`},
		`show :/serverless`:                  {"show", ":/serverless"},
		"  shortlog   -sn  ":                 {"shortlog", "-sn"},
	}
	for in, want := range cases {
		got, err := gitArgs(in)
		if err != nil || strings.Join(got, "\x00") != strings.Join(want, "\x00") {
			t.Errorf("gitArgs(%q) = %q, %v; want %q", in, got, err, want)
		}
	}
	for _, in := range []string{"log | cat", "log; rm -rf /", "log $(id)", "log `id`", "log > out", "log 'open"} {
		if _, err := gitArgs(in); err == nil {
			t.Errorf("gitArgs(%q) should fail", in)
		}
	}
}

func TestCheckGitArgsAllows(t *testing.T) {
	for _, cmd := range []string{
		"log --oneline -20",
		"log --reverse --date=short --format='%ad %s'",
		"log --since=2026-06-01 --until=2026-07-01 --oneline",
		"log -G serverless --oneline",
		"log main..HEAD",
		"log --all --exclude=refs/remotes/* --oneline",
		"rev-list --count HEAD",
		"shortlog -sn",
		"show :/serverless --stat",
		"show HEAD~3:backend-lambda/main.go",
		"diff HEAD~5 HEAD --stat -- frontend/src",
		"blame README.md",
		"blame -L 1,20 HEAD -- README.md",
		"grep -n Lambda HEAD",
		"grep --files-with-matches Lambda HEAD",
		"ls-tree -r --name-only HEAD",
		"tag --list",
		"tag -l 'v*'",
		"branch -a",
		"describe --tags --always",
		"for-each-ref --sort=-committerdate refs/heads",
		"cat-file -p HEAD",
		"log --no-ext-diff -p -1",
	} {
		args, err := gitArgs(cmd)
		if err != nil {
			t.Fatalf("gitArgs(%q): %v", cmd, err)
		}
		if why := checkGitArgs(args); why != "" {
			t.Errorf("%q refused: %s", cmd, why)
		}
	}
}

func TestCheckGitArgsRefuses(t *testing.T) {
	for _, cmd := range []string{
		// files outside the clone
		"diff /etc/hosts /etc/shells",
		"diff --no-index a b",
		"diff --no-ind a b",
		"blame --contents /etc/hosts HEAD -- README.md",
		"blame --cont=x HEAD -- README.md",
		"blame --cont x HEAD -- README.md",
		"blame -S revs README.md",
		"grep -f patterns HEAD",
		"grep -nf patterns HEAD",
		"log -O order -p",
		"log --orderfile=x -p",
		"show HEAD:/etc/hosts",
		"log -L1,2:/etc/hosts",
		"diff HEAD -- ../../etc/passwd",
		"show HEAD:src/../../x",
		"log --grep=~root",
		"log -- ~/x",
		"log --since=/x",
		// programs and writes
		"grep -O cat foo HEAD",
		"grep --open-files-in-pager=sh foo HEAD",
		"grep --open-files=sh foo HEAD",
		"log --output=x",
		"log --ou=x",
		"diff --output-indicator-new=+",
		"log --ext-diff -p",
		"log --exec-path",
		"branch --set-upstream-to=origin/main",
		// secrets
		"show HEAD:.env",
		"log -p -- config/.env.production",
		// mutations and other commands
		"push",
		"commit -m x",
		"checkout main",
		"config --list",
		"fetch",
		"clone https://github.com/x/y",
		"tag v9",
		"branch newbranch",
		"",
	} {
		args, err := gitArgs(cmd)
		if err != nil {
			continue // refused at parse time
		}
		if why := checkGitArgs(args); why == "" {
			t.Errorf("%q was allowed", cmd)
		}
	}
}

// TestRunGitLive clones the public site repo and runs real git on it. It needs the network and
// git (the bundled one when LAMBDA_TASK_ROOT is set, as in the Lambda image).
func TestRunGitLive(t *testing.T) {
	if testing.Short() || os.Getenv("RUN_GIT_LIVE") == "" {
		t.Skip("set RUN_GIT_LIVE=1 to clone from GitHub")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	start := time.Now()
	out := toolRunGit(ctx, "ledbetter-website", "log --reverse --date=short --format='%ad %s'")
	t.Logf("first call (clone + log) %v:\n%.300s", time.Since(start), out)
	if !strings.Contains(out, "2024-02-07") {
		t.Fatalf("expected the first commit date, got:\n%s", out)
	}
	start = time.Now()
	out = toolRunGit(ctx, "ledbetter-website", "rev-list --count HEAD")
	t.Logf("cached call %v: %s", time.Since(start), out)
	for _, cmd := range []string{"shortlog -sn HEAD", "grep -c Lambda HEAD -- README.md", "show --stat :/serverless", "blame -L 1,2 HEAD -- README.md", "grep -n foo"} {
		out = toolRunGit(ctx, "ledbetter-website", cmd)
		t.Logf("%s:\n%.400s", cmd, out)
		if strings.Contains(out, "git exited with an error") {
			t.Errorf("%s failed: %s", cmd, out)
		}
	}
	if out := toolRunGit(ctx, "ledbetter-website", "diff /etc/hosts /etc/passwd"); !strings.Contains(out, "outside the repo") {
		t.Errorf("absolute paths should be refused, got: %s", out)
	}
	if out := toolRunGit(ctx, "LedbetterFinslerTransformer", "log --oneline -3"); strings.Contains(out, "$ git") {
		t.Errorf("a description-only repo served history: %s", out)
	}
}

// TestRunGitLiveRepo times a clone of any public repo (RUN_GIT_REPO=name), e.g. the largest,
// to check it fits the turn budget and the Lambda's memory.
func TestRunGitLiveRepo(t *testing.T) {
	repo := os.Getenv("RUN_GIT_REPO")
	if repo == "" {
		t.Skip("set RUN_GIT_REPO=<public repo> to time a clone")
	}
	start := time.Now()
	out := toolRunGit(context.Background(), repo, "rev-list --count HEAD")
	t.Logf("%s: %v\n%s", repo, time.Since(start), out)
	if !strings.HasPrefix(out, "$ git") {
		t.Fatal(out)
	}
}

func TestHistoryQuestionsGoToTheLibrarian(t *testing.T) {
	for _, q := range []string{
		"when was this website made and how long did it take to build?",
		"you have the github repo access and its public, you can easily look at the commit history to see major milestones",
		"What were the major milestones?",
		"Can you show the timeline of this project?",
	} {
		if !catalogLikely(q) {
			t.Errorf("%q should send the librarian", q)
		}
	}
	if !asksForCode("what do the commits say about when this started?") {
		t.Error("a commit question on a portfolio page should send the librarian")
	}
	if catalogLikely("When did David join Apple?") {
		t.Error("a plain career date isn't a repo-history question")
	}
}

func TestSignForGemini(t *testing.T) {
	in := []geminiContent{
		{Role: "model", Parts: []geminiPart{{FunctionCall: &fnCall{Name: "run_git"}}}},
		{Role: "model", Parts: []geminiPart{{FunctionCall: &fnCall{Name: "run_git"}, ThoughtSignature: "real"}}},
	}
	out := signForGemini(in)
	if out[0].Parts[0].ThoughtSignature != "skip_thought_signature_validator" || out[1].Parts[0].ThoughtSignature != "real" {
		t.Fatalf("signatures: %q, %q", out[0].Parts[0].ThoughtSignature, out[1].Parts[0].ThoughtSignature)
	}
	if in[0].Parts[0].ThoughtSignature != "" {
		t.Fatal("signForGemini changed the caller's history")
	}
}
