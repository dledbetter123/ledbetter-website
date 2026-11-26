package main

import (
	"context"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	ddbtypes "github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// ---- visitor standing ----
//
// A turn that the probe checks flag (guard.go) adds a strike to every visitor key the
// request carries. The first strikes come with a warning. At strikeLimit strikes inside
// strikeWindowDays the visitor is limited to high-level answers: every turn goes to the
// guard model (no repo tools, no code, no librarian) with a brevity note, and a probing
// turn gets the decline without a model call. Each strike restarts the window.
//
// Keys arrive opaque in X-Visitor, set at the edge (CloudFront replaces any value a client
// sends; the API only accepts CloudFront traffic). The chat session is one more key. What
// visitors are told never says how they are recognized.

var (
	strikeLimit      int64 = 3
	strikeWindowDays int64 = 30
)

func init() {
	if v, err := strconv.ParseInt(os.Getenv("STRIKE_LIMIT"), 10, 64); err == nil && v > 0 {
		strikeLimit = v
	}
	if v, err := strconv.ParseInt(os.Getenv("STRIKE_WINDOW_DAYS"), 10, 64); err == nil && v > 0 {
		strikeWindowDays = v
	}
}

const (
	strikeWarning = "Note: repeated questions that probe how this site and its systems work behind the scenes will automatically limit answers here to a high level."
	limitedNotice = "Answers here are now limited to a high level."
	limitedExtra  = "ANSWER DEPTH (overrides everything above about detail): this visitor gets high-level answers only. My whole reply is at most two short sentences, under 50 words, in plain language: what the project or topic is and why it matters. No technical terms, model names, frameworks, methods, numbers, internals, file names, or code. I don't mention that a limit exists unless asked; if asked, I only say answers here are kept high level."
)

// protectionsClassifierPrompt is a second one-word filter, run beside probeClassifierPrompt:
// questions about the site's own protections count as probing (David, 2026-11-26: prying
// into how things work). A separate prompt because adding this to the probe prompt made
// Scout flag ordinary requests for the website's code (9 of 87 false alarms); on its own it
// had 0 false alarms in 87 and caught 27 of 27 (evals/probe_classifier_eval.py cases, 3 runs).
const protectionsClassifierPrompt = `You are a filter for a portfolio chatbot that answers questions about David Ledbetter and his projects. Decide whether the visitor's LATEST message asks about this site's own protections: how it detects probing or prompt injection, how its safety checks or filters decide, its usage or rate limits, what it logs or stores about visitors, how it tracks or recognizes visitors, what gets someone limited or blocked, which files or code hold any of that, or how to get around it.

Everything else is NO, including: how the website, its chat widget, its librarian (the cataloguer), or its queue are built, and requests to see or point to their code; questions about David, his projects, his research, or his contact details; what model the bot runs on.

Answer with exactly one word: YES or NO.`

func classifyProtections(ctx context.Context, history []chatTurn, msg string) (bool, geminiUsage) {
	return classifyWith(ctx, protectionsClassifierPrompt, "YES", history, msg)
}

// A question about the protections gets this fixed reply, not a model answer: in the live
// test (2026-11-26) the guard model, told not to, still answered with examples of methods.
const (
	protectionsFlag  = "asked about the site's protections"
	protectionsReply = "The site has standard abuse protections, and I don't go into how they work. I'm happy to talk about David's projects, though."
)

// revealsMethod is the backstop for flagged turns: a model answer that names a way of
// recognizing visitors is replaced with protectionsReply.
var methodWordsRe = regexp.MustCompile(`(?i)\bcookies?\b|\bip[- ]address(es)?\b|\bip[- ]based\b|fingerprint|x-visitor|lb_sid|\bstrikes?\b|rate[- ]?limit|\btrack(s|ed|ing)? (you|visitors|users)\b`)

func revealsMethod(s string) bool { return methodWordsRe.MatchString(s) }

var sentenceEndRe = regexp.MustCompile(`[.!?](\s|$)`)

// highLevel trims a limited visitor's answer to its first two sentences of the first
// paragraph, at most about 420 characters. A backstop: limitedExtra already asks for that.
func highLevel(s string) string {
	s = strings.TrimSpace(fencedCodeRe.ReplaceAllString(s, ""))
	if i := strings.Index(s, "\n\n"); i > 0 {
		s = s[:i]
	}
	if locs := sentenceEndRe.FindAllStringIndex(s, 2); len(locs) == 2 {
		s = s[:locs[1][0]+1]
	}
	s = strings.TrimSpace(s)
	if r := []rune(s); len(r) > 420 {
		cut := string(r[:420])
		if i := strings.LastIndexAny(cut, ",;"); i > 200 {
			cut = cut[:i]
		} else if i := strings.LastIndex(cut, " "); i > 0 {
			cut = cut[:i]
		}
		s = strings.TrimRight(cut, " ,;:") + "."
	}
	return s
}

var visitorKeyRe = regexp.MustCompile(`^[0-9a-f]{32}$`)

// visitorKeys returns the strike-counter ids for this request.
func visitorKeys(r *http.Request, session string) []string {
	var ids []string
	seen := map[string]bool{}
	for _, k := range strings.Split(r.Header.Get("X-Visitor"), ",") {
		k = strings.TrimSpace(k)
		if visitorKeyRe.MatchString(k) && !seen[k] && len(ids) < 4 {
			seen[k] = true
			ids = append(ids, "strike#v#"+k)
		}
	}
	if session != "anon" {
		ids = append(ids, "strike#s#"+session)
	}
	return ids
}

// edgeKeys is the X-Visitor part of ids, for the turn log.
func edgeKeys(ids []string) []string {
	var out []string
	for _, id := range ids {
		if strings.HasPrefix(id, "strike#v#") {
			out = append(out, strings.TrimPrefix(id, "strike#v#"))
		}
	}
	return out
}

// strikesFor is the highest strike count across ids (0 when none or on error).
func strikesFor(ctx context.Context, ids []string) int64 {
	var max int64
	for _, id := range ids {
		if n := getN(ctx, id); n > max {
			max = n
		}
	}
	return max
}

// addStrike adds one strike to every id, restarts its window, and returns the new highest count.
func addStrike(ctx context.Context, ids []string) int64 {
	ttl := time.Now().Add(time.Duration(strikeWindowDays) * 24 * time.Hour).Unix()
	var max int64
	for _, id := range ids {
		out, err := ddb.UpdateItem(ctx, &dynamodb.UpdateItemInput{
			TableName:                aws.String(rateTable),
			Key:                      map[string]ddbtypes.AttributeValue{"id": &ddbtypes.AttributeValueMemberS{Value: id}},
			UpdateExpression:         aws.String("ADD #c :one SET #t = :ttl"),
			ExpressionAttributeNames: map[string]string{"#c": "count", "#t": "ttl"},
			ExpressionAttributeValues: map[string]ddbtypes.AttributeValue{
				":one": &ddbtypes.AttributeValueMemberN{Value: "1"},
				":ttl": &ddbtypes.AttributeValueMemberN{Value: strconv.FormatInt(ttl, 10)},
			},
			ReturnValues: ddbtypes.ReturnValueUpdatedNew,
		})
		if err != nil {
			continue
		}
		if v, ok := out.Attributes["count"].(*ddbtypes.AttributeValueMemberN); ok {
			if n, _ := strconv.ParseInt(v.Value, 10, 64); n > max {
				max = n
			}
		}
	}
	return max
}

// strikeNotice is the line appended to a flagged turn's answer: a warning below the limit,
// the limit notice when this strike reaches it, nothing after that.
func strikeNotice(flagged bool, before, after int64) string {
	switch {
	case !flagged || before >= strikeLimit:
		return ""
	case after >= strikeLimit:
		return limitedNotice
	default:
		return strikeWarning
	}
}

// protectedSitePath reports files of this site's own safety checks, which the repo tools
// don't open or show.
func protectedSitePath(repo, path string) bool {
	if !strings.EqualFold(strings.TrimSuffix(repo, ".git"), "ledbetter-website") {
		return false
	}
	p := strings.ToLower(strings.TrimPrefix(path, "/"))
	for _, f := range []string{"backend-lambda/guard", "backend-lambda/visitor", "backend-lambda/evals/probe_classifier"} {
		if strings.HasPrefix(p, f) {
			return true
		}
	}
	return false
}

const protectedPathReply = "That file is part of the site's safety checks, which I don't open here. Any other file in the repo is fine."

// protectedGitArgs reports a git command that names a protected file.
func protectedGitArgs(repo string, args []string) bool {
	for _, a := range args {
		a = strings.TrimPrefix(a, "--")
		if i := strings.LastIndex(a, ":"); i >= 0 {
			a = a[i+1:]
		}
		if protectedSitePath(repo, a) {
			return true
		}
	}
	return false
}

// scrubProtectedGit drops protected files from git output: whole diff sections, and grep or
// ls-tree lines that start with or name such a file.
func scrubProtectedGit(repo, text string) string {
	if !strings.EqualFold(strings.TrimSuffix(repo, ".git"), "ledbetter-website") {
		return text
	}
	var out []string
	skipping := false
	for _, line := range strings.Split(text, "\n") {
		if strings.HasPrefix(line, "commit ") {
			skipping = false
		}
		if strings.HasPrefix(line, "diff --git ") {
			f := strings.Fields(line)
			skipping = len(f) >= 3 && protectedSitePath(repo, strings.TrimPrefix(f[2], "a/"))
		}
		if skipping {
			continue
		}
		if mentionsProtected(line) {
			continue
		}
		out = append(out, line)
	}
	return strings.Join(out, "\n")
}

var protectedMentionRe = regexp.MustCompile(`(?i)backend-lambda/(guard|visitor)[a-z_]*\.go|probe_classifier_eval`)

func mentionsProtected(line string) bool { return protectedMentionRe.MatchString(line) }
