package main

// run_git: real git, read-only, over a fresh clone of one of David's public repos, so the chat
// can answer history questions (when something started, how long it took, milestones, what a
// commit changed) from the record instead of guessing or saying it can't. On 2026-11-13 a
// visitor pointed out that the repo is public and its commit log holds the timeline, and the
// bot answered that it had no tool to run git log.
//
// The clone is made with go-git (pure Go, so the Lambda carries no git network code) as a
// bare repository under /tmp, and the command runs on the git binary bundled at bin/git
// (Amazon Linux 2023's own git-core, fetched by gitbin/fetch.sh). Containment:
//   - only read-only subcommands run;
//   - arguments that make git read a file outside the clone (absolute or ../ paths,
//     --no-index, blame --contents, grep -f, -O order files, ...), run a program
//     (grep -O, --ext-diff, --exec, --upload-pack) or write a file (--output) are refused.
//     This matters: in a bare clone, `git diff /a /b` silently becomes --no-index and reads
//     the two files, and `blame --contents` reads any path;
//   - the process gets a fresh environment (no AWS credentials, no secrets), no stdin, no
//     system or global config, a timeout and an output cap;
//   - repos pass the same gate as the file tools, public only, and the description-only
//     research repos serve no history.

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	gogit "github.com/go-git/go-git/v5"
)

const (
	gitCacheTTL  = 10 * time.Minute // re-clone a repo after this long, so new commits show up
	gitTimeout   = 12 * time.Second
	gitMaxRepoKB = 100 * 1024 // GitHub's size field; a 70 MB repo peaks near 205 MB of memory to clone
	gitMaxCached = 4          // clones kept in /tmp at once
)

var (
	gitCloneRoot = filepath.Join(os.TempDir(), "run-git")
	gitMu        sync.Mutex
	gitCloned    = map[string]time.Time{}
)

// gitSubcommands are the read-only commands run_git accepts.
var gitSubcommands = map[string]bool{
	"log": true, "show": true, "diff": true, "diff-tree": true, "blame": true, "annotate": true,
	"shortlog": true, "whatchanged": true, "grep": true, "ls-tree": true, "cat-file": true,
	"rev-list": true, "rev-parse": true, "describe": true, "name-rev": true, "merge-base": true,
	"tag": true, "branch": true, "for-each-ref": true, "show-ref": true, "show-branch": true,
	"count-objects": true, "range-diff": true, "cherry": true, "version": true,
}

// gitBannedOptions are refused in any subcommand: they read a file outside the clone, run a
// program, write a file, point git somewhere else, or change branch config. Git accepts any
// unambiguous abbreviation of a long option (--cont for --contents), so an abbreviation of
// four or more characters is refused too.
var gitBannedOptions = []string{
	"--no-index", "--contents", "--output", "--orderfile", "--open-files-in-pager",
	"--ext-diff", "--exec", "--exec-path", "--upload-pack", "--receive-pack",
	"--pathspec-from-file", "--ignore-revs-file", "--file", "--git-dir", "--work-tree",
	"--namespace", "--super-prefix", "--config", "--config-env", "--edit-description",
	"--set-upstream", "--set-upstream-to", "--unset-upstream", "--track",
}

// gitBannedFamilies are refused with anything after them too (--output-directory, --config-env).
var gitBannedFamilies = []string{"--output", "--config", "--exec", "--set-upstream"}

// gitBannedShort are short options refused inside any single-dash cluster: -O (an order file
// for diffs, a pager program for grep), -f (grep's pattern file) and -S (blame's revs file).
// Log's -S pickaxe goes with it; -G<regex> still searches diffs.
const gitBannedShort = "OfS"

func gitBannedOption(arg string) bool {
	if !strings.HasPrefix(arg, "--") {
		return false
	}
	name := strings.ToLower(arg)
	if i := strings.IndexByte(name, '='); i >= 0 {
		name = name[:i]
	}
	for _, b := range gitBannedOptions {
		if name == b || (len(name) >= 4 && strings.HasPrefix(b, name)) {
			return true
		}
	}
	for _, f := range gitBannedFamilies {
		if strings.HasPrefix(name, f) {
			return true
		}
	}
	return false
}

// gitListOnly are subcommands that also create or delete things; they run only as listings.
var gitListOnly = map[string]bool{"tag": true, "branch": true}

var gitListFlags = map[string]bool{"-l": true, "--list": true}

// gitArgs splits a command line the way a shell would for plain words and quotes ('...',
// "...", backslash escapes), without any expansion, and drops a leading "git".
func gitArgs(command string) ([]string, error) {
	var args []string
	var cur strings.Builder
	inWord, quote := false, rune(0)
	runes := []rune(command)
	for i := 0; i < len(runes); i++ {
		r := runes[i]
		switch {
		case quote != 0:
			if r == quote {
				quote = 0
			} else if r == '\\' && quote == '"' && i+1 < len(runes) {
				i++
				cur.WriteRune(runes[i])
			} else {
				cur.WriteRune(r)
			}
		case r == '\'' || r == '"':
			quote, inWord = r, true
		case r == '\\' && i+1 < len(runes):
			i++
			cur.WriteRune(runes[i])
			inWord = true
		case r == ' ' || r == '\t' || r == '\n':
			if inWord {
				args = append(args, cur.String())
				cur.Reset()
				inWord = false
			}
		case strings.ContainsRune("|;&<>`$", r):
			return nil, fmt.Errorf("one git command only, no shell syntax (%q)", r)
		default:
			cur.WriteRune(r)
			inWord = true
		}
	}
	if quote != 0 {
		return nil, errors.New("unclosed quote")
	}
	if inWord {
		args = append(args, cur.String())
	}
	if len(args) > 0 && args[0] == "git" {
		args = args[1:]
	}
	return args, nil
}

// checkGitArgs returns why a command is refused, or "" when it may run.
func checkGitArgs(args []string) string {
	if len(args) == 0 {
		return "Give a git command, e.g. \"log --oneline -20\"."
	}
	sub := args[0]
	if !gitSubcommands[sub] {
		names := make([]string, 0, len(gitSubcommands))
		for n := range gitSubcommands {
			names = append(names, n)
		}
		sort.Strings(names)
		return fmt.Sprintf("run_git runs read-only commands only. '%s' isn't one of them: %s.", sub, strings.Join(names, ", "))
	}
	positional, listing := false, false
	for _, a := range args[1:] {
		if gitBannedOption(a) {
			return fmt.Sprintf("'%s' isn't allowed: it reads or writes outside the repo or runs a program.", a)
		}
		if strings.HasPrefix(a, "-") && !strings.HasPrefix(a, "--") && len(a) > 1 {
			if strings.ContainsAny(a[1:], gitBannedShort) {
				return fmt.Sprintf("'%s' isn't allowed (-O, -f and -S read files or run programs here).", a)
			}
		}
		// Paths stay inside the clone: no absolute paths, no climbing out, no home dirs.
		// ":/<text>" (find a commit by its message) is the one leading ":/" git means.
		if strings.HasPrefix(a, "/") || strings.HasPrefix(a, "~") || a == ".." ||
			strings.HasPrefix(a, "../") || strings.Contains(a, "/../") || strings.HasSuffix(a, "/..") ||
			strings.Contains(a, "=/") || strings.Contains(a, "=~") || strings.Contains(a, "=../") ||
			(strings.Index(a, ":/") > 0) {
			return fmt.Sprintf("'%s' points outside the repo. Use paths relative to the repo root.", a)
		}
		if secretPath(strings.TrimPrefix(a[strings.LastIndex(a, ":")+1:], "/")) {
			return "That file holds configuration/credentials, not code — I don't read those."
		}
		if gitListFlags[a] {
			listing = true
		} else if !strings.HasPrefix(a, "-") {
			positional = true
		}
	}
	if gitListOnly[sub] && positional && !listing {
		return fmt.Sprintf("'%s' runs only as a listing here: add --list (or -l) to filter by pattern.", sub)
	}
	return ""
}

// gitBinary is the bundled git on Lambda, or git on PATH elsewhere (local tests).
func gitBinary() (bin, libDir string) {
	if root := os.Getenv("LAMBDA_TASK_ROOT"); root != "" {
		return filepath.Join(root, "bin", "git"), filepath.Join(root, "lib")
	}
	if p, err := exec.LookPath("git"); err == nil {
		return p, ""
	}
	return "git", ""
}

type gitMeta struct {
	Private bool `json:"private"`
	Size    int  `json:"size"` // KB
}

// gitRepoMeta asks GitHub whether the repo is private and how big it is, before cloning.
func gitRepoMeta(ctx context.Context, repo string) (gitMeta, error) {
	var meta gitMeta
	resp, err := githubGet(ctx, "https://api.github.com/repos/"+githubOwner+"/"+repo)
	if err != nil {
		return meta, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return meta, fmt.Errorf("GitHub %d", resp.StatusCode)
	}
	err = json.NewDecoder(resp.Body).Decode(&meta)
	return meta, err
}

// gitClone returns a fresh-enough bare clone of a public repo, cloning it if needed.
func gitClone(ctx context.Context, repo string) (string, error) {
	gitMu.Lock()
	defer gitMu.Unlock()
	dir := filepath.Join(gitCloneRoot, repo+".git")
	if t, ok := gitCloned[repo]; ok && time.Since(t) < gitCacheTTL {
		if _, err := os.Stat(filepath.Join(dir, "HEAD")); err == nil {
			return dir, nil
		}
	}
	// Make room: drop the oldest clones beyond the cap.
	if len(gitCloned) >= gitMaxCached {
		names := make([]string, 0, len(gitCloned))
		for n := range gitCloned {
			names = append(names, n)
		}
		sort.Slice(names, func(i, j int) bool { return gitCloned[names[i]].Before(gitCloned[names[j]]) })
		for _, n := range names[:len(names)-gitMaxCached+1] {
			os.RemoveAll(filepath.Join(gitCloneRoot, n+".git"))
			delete(gitCloned, n)
		}
	}
	os.RemoveAll(dir)
	if err := os.MkdirAll(gitCloneRoot, 0o755); err != nil {
		return "", err
	}
	_, err := gogit.PlainCloneContext(ctx, dir, true, &gogit.CloneOptions{
		URL:  "https://github.com/" + githubOwner + "/" + repo + ".git",
		Tags: gogit.AllTags,
	})
	if err != nil {
		os.RemoveAll(dir)
		return "", err
	}
	gitCloned[repo] = time.Now()
	return dir, nil
}

// toolRunGit runs one read-only git command in a clone of one of David's public repos.
func toolRunGit(ctx context.Context, repo, command string) (out string) {
	defer func() {
		if r := recover(); r != nil {
			out = "git failed unexpectedly."
		}
	}()
	repo = strings.TrimSuffix(strings.TrimSpace(repo), ".git")
	if !safeRepoRe.MatchString(repo) {
		return "Invalid repo name."
	}
	args, err := gitArgs(command)
	if err != nil {
		return "Couldn't read that command: " + err.Error() + "."
	}
	if why := checkGitArgs(args); why != "" {
		return why
	}
	// The file tools' gate (gateRepo), narrowed to public repos: a private repo's rules file
	// governs what may be quoted from it, which a raw git command can't honor.
	if isNeverRepo(repo) {
		return "That repo isn't something I share through here."
	}
	meta, err := gitRepoMeta(ctx, repo)
	if err != nil {
		return fmt.Sprintf("I couldn't find a repo named '%s' I can access.", repo)
	}
	if meta.Private {
		return fmt.Sprintf("run_git works on David's public repos only; '%s' isn't one.", repo)
	}
	rules, _ := fetchRulesRaw(ctx, repo)
	if isDescriptionOnly(repo) {
		return withRules(rules, descriptionOnlyNotice(repo))
	}
	if meta.Size > gitMaxRepoKB {
		return fmt.Sprintf("'%s' is too large to clone here (%d MB).", repo, meta.Size/1024)
	}
	dir, err := gitClone(ctx, repo)
	if err != nil {
		return "Could not clone that repo from GitHub right now."
	}

	bin, libDir := gitBinary()
	runCtx, cancel := context.WithTimeout(ctx, gitTimeout)
	defer cancel()
	cmd := exec.CommandContext(runCtx, bin, append([]string{"--git-dir=" + dir, "--no-pager"}, args...)...)
	// Run from an empty directory: from inside the bare repo, its HEAD file makes "HEAD"
	// ambiguous, and a relative path could only ever resolve to nothing here.
	cmd.Dir = filepath.Join(gitCloneRoot, "cwd")
	if err := os.MkdirAll(cmd.Dir, 0o755); err != nil {
		return "Could not prepare the clone."
	}
	cmd.Env = []string{
		"PATH=/usr/bin:/bin",
		"HOME=" + gitCloneRoot,
		"LD_LIBRARY_PATH=" + libDir,
		"GIT_CONFIG_NOSYSTEM=1",
		"GIT_CONFIG_GLOBAL=/dev/null",
		"GIT_ATTR_NOSYSTEM=1",
		"GIT_TERMINAL_PROMPT=0",
		"GIT_OPTIONAL_LOCKS=0",
		"GIT_PAGER=cat",
		"PAGER=cat",
		"LANG=C.UTF-8",
		"TZ=UTC",
	}
	var buf bytes.Buffer
	cmd.Stdout = &limitWriter{w: &buf, n: maxFileBytes + 1}
	cmd.Stderr = cmd.Stdout
	runErr := cmd.Run()

	text := buf.String()
	if len(text) > maxFileBytes {
		text = text[:maxFileBytes] + "\n\n…[output truncated; narrow the command, e.g. -n, --since, a path]"
	}
	if strings.Contains(text, "must be run in a work tree") || strings.Contains(text, "Cannot lstat") {
		text += "\n(The clone is bare: name a revision, e.g. `grep -n foo HEAD`, `blame HEAD -- README.md`, `ls-tree -r --name-only HEAD`.)"
	}
	if runCtx.Err() == context.DeadlineExceeded {
		text += "\n…[timed out; narrow the command]"
	} else if runErr != nil && strings.TrimSpace(text) == "" {
		var exit *exec.ExitError
		if errors.As(runErr, &exit) && exit.ExitCode() == 1 {
			text = "(no output; for grep, no matches)"
			if args[0] == "grep" {
				text += ". The clone is bare, so grep searches only the revisions named: `grep -n foo HEAD`."
			}
		} else {
			text = "git exited with an error: " + runErr.Error()
		}
	}
	if strings.TrimSpace(text) == "" {
		text = "(no output)"
	}
	return withRules(rules, "$ git "+strings.Join(args, " ")+"\n"+text)
}

// limitWriter keeps the first n bytes and discards the rest, so a huge log can't fill memory.
type limitWriter struct {
	w *bytes.Buffer
	n int
}

func (l *limitWriter) Write(p []byte) (int, error) {
	if room := l.n - l.w.Len(); room > 0 {
		if len(p) > room {
			l.w.Write(p[:room])
		} else {
			l.w.Write(p)
		}
	}
	return len(p), nil
}
