package main

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	ddbtypes "github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// ---- guarded topics ----
//
// David keeps the deeper details of a few projects private (2026-11-26). For each, a
// classifier call rates how deep a question goes (0 what it is, 1 the main idea, 2
// specifics, 3 code or internals) and the policy sets the deepest level answered. A
// question past that line gets a fixed reply (the topic's public summary and a pointer to the
// résumé) and costs (its level minus the line) points on that topic. At the topic's limit, answers
// about it are its fixed summary until the window runs out (each new point restarts it).
// Strictness is per topic.
//
// The policy (topics, levels, limits, summaries, the classifier prompt and the answer rules)
// is not in this repo: the operator pushes it as one item (policyID, attribute data = JSON).
// With no policy, no topic is guarded.
//
// Visitor keys arrive opaque in X-Visitor, set at the edge (CloudFront replaces any value a
// client sends; the API only accepts CloudFront traffic). The chat session is one more key.
// What visitors are told never says how they are recognized.

const policyID = "config#guarded-topics"

type guardedTopic struct {
	ID         string `json:"id"`
	Name       string `json:"name"`         // as visitors read it, e.g. "the Example Project"
	AnswerUpTo int64  `json:"answer_up_to"` // deepest level answered in full (0-3)
	Limit      int64  `json:"limit"`        // points at which answers become the summary
	Summary    string `json:"summary"`      // the whole answer once the limit is reached
}

type topicPolicy struct {
	ResumeURL        string         `json:"resume_url"`
	WindowDays       int64          `json:"window_days"`
	ClassifierPrompt string         `json:"classifier_prompt"` // answers "<topic id> <level>" or "none 0"
	AnswerRules      string         `json:"answer_rules"`      // added to every turn's instructions
	Topics           []guardedTopic `json:"topics"`
}

const defaultResumeLink = "https://davidamosledbetter.com/api/resume?from=chat"

var (
	policyMu    sync.Mutex
	policyCache *topicPolicy
	policyAt    time.Time
)

// loadPolicy returns the guarded-topic policy, re-read at most once a minute. A failed read
// keeps the last good copy.
func loadPolicy(ctx context.Context) *topicPolicy {
	policyMu.Lock()
	defer policyMu.Unlock()
	if policyCache != nil && time.Since(policyAt) < time.Minute {
		return policyCache
	}
	var p topicPolicy
	if s := getData(ctx, policyID); s == "" || json.Unmarshal([]byte(s), &p) != nil {
		if policyCache != nil {
			policyAt = time.Now()
			return policyCache
		}
		p = topicPolicy{}
	}
	normalizePolicy(&p)
	policyCache, policyAt = &p, time.Now()
	return policyCache
}

func normalizePolicy(p *topicPolicy) {
	if p.WindowDays <= 0 {
		p.WindowDays = 30
	}
	if p.ResumeURL == "" {
		p.ResumeURL = defaultResumeLink
	}
	var ok []guardedTopic
	for _, t := range p.Topics {
		if t.ID == "" || t.Name == "" || t.Limit <= 0 || t.AnswerUpTo < 0 || t.AnswerUpTo > 3 {
			continue
		}
		if t.Summary == "" {
			t.Summary = "That's as far as I go on " + t.Name + " here."
		}
		ok = append(ok, t)
	}
	p.Topics = ok
}

func (p *topicPolicy) topic(id string) *guardedTopic {
	for i := range p.Topics {
		if p.Topics[i].ID == id {
			return &p.Topics[i]
		}
	}
	return nil
}

var topicLevelRe = regexp.MustCompile(`[0-3]`)

// parseTopic reads the classifier's "<topic id> <level>" answer; nil when it names no topic.
func parseTopic(p *topicPolicy, out string) (*guardedTopic, int64) {
	low := strings.ToLower(out)
	var best *guardedTopic
	at := -1
	for i := range p.Topics {
		if j := strings.Index(low, strings.ToLower(p.Topics[i].ID)); j >= 0 && (at < 0 || j < at) {
			best, at = &p.Topics[i], j
		}
	}
	if best == nil {
		return nil, 0
	}
	lv := topicLevelRe.FindString(low[at+len(best.ID):])
	if lv == "" {
		return best, 0
	}
	n, _ := strconv.ParseInt(lv, 10, 64)
	return best, n
}

// classifyTopic asks which guarded topic the latest message is about, and how deep it goes.
func classifyTopic(ctx context.Context, p *topicPolicy, history []chatTurn, msg string) (*guardedTopic, int64, geminiUsage) {
	if len(p.Topics) == 0 || p.ClassifierPrompt == "" {
		return nil, 0, geminiUsage{}
	}
	out, u, ok := askClassifier(ctx, p.ClassifierPrompt, history, msg, 12)
	if !ok {
		return nil, 0, u
	}
	t, lv := parseTopic(p, out)
	return t, lv, u
}

// topicTurn is this turn's standing on a guarded topic.
type topicTurn struct {
	Topic   *guardedTopic
	Level   int64 // how deep the question goes (0-3)
	Over    int64 // levels past the topic's line (0 when within it)
	Before  int64 // points before this turn
	Points  int64 // points after this turn
	Locked  bool  // the limit was already reached: the summary is the whole answer
	Reached bool  // this turn reached the limit
}

// weighTopic reads the visitor's points on the topic and adds this turn's, if it went past
// the line. A locked visitor's further questions add nothing.
func weighTopic(ctx context.Context, p *topicPolicy, t *guardedTopic, level int64, vkeys []string) topicTurn {
	tt := topicTurn{Topic: t, Level: level}
	if t == nil {
		return tt
	}
	ids := topicIDs(vkeys, t.ID)
	tt.Before = strikesFor(ctx, ids)
	tt.Points = tt.Before
	tt.Locked = tt.Before >= t.Limit
	if level > t.AnswerUpTo {
		tt.Over = level - t.AnswerUpTo
	}
	if tt.Over > 0 && !tt.Locked {
		tt.Points = addPoints(ctx, ids, tt.Over, p.WindowDays)
		tt.Reached = tt.Points >= t.Limit
	}
	return tt
}

// topicLog is the turn log's record of it (nil when the turn touched no guarded topic).
func (tt topicTurn) topicLog() map[string]interface{} {
	if tt.Topic == nil {
		return nil
	}
	return map[string]interface{}{"id": tt.Topic.ID, "level": tt.Level, "line": tt.Topic.AnswerUpTo,
		"over": tt.Over, "points": tt.Points, "limit": tt.Topic.Limit, "locked": tt.Locked, "reached": tt.Reached}
}

func topicIDs(vkeys []string, topic string) []string {
	out := make([]string, 0, len(vkeys))
	for _, k := range vkeys {
		out = append(out, k+"#"+topic)
	}
	return out
}

// ---- what visitors read ----

func resumePointer(t *guardedTopic, p *topicPolicy) string {
	return "For more on " + t.Name + ", [David's résumé](" + p.ResumeURL + ") is the best place to look."
}

func topicWarning(t *guardedTopic) string {
	return "Note: David keeps the deeper details of " + t.Name + " private. Repeated questions that push past what's shared here will limit answers about it to a short summary."
}

func topicLimitNotice(t *guardedTopic) string {
	return "Answers about " + t.Name + " are now limited to a short summary."
}

func lockedReply(t *guardedTopic, p *topicPolicy) string {
	return strings.TrimSpace(t.Summary) + "\n\n" + resumePointer(t, p)
}

// overDepthReply is the whole answer to a question past the topic's line, with no model call:
// in the live test (2026-11-26) the guard model, told to stay at the main idea, still
// explained a topic's specifics.
func overDepthReply(tt topicTurn, p *topicPolicy) string {
	notice := topicWarning(tt.Topic)
	if tt.Reached {
		notice = topicLimitNotice(tt.Topic)
	}
	return "That goes deeper than David shares publicly about " + tt.Topic.Name + ". In short: " +
		strings.TrimSpace(tt.Topic.Summary) + "\n\n" + resumePointer(tt.Topic, p) + "\n\n" + notice
}

// protectionsClassifierPrompt is a second one-word filter, run beside probeClassifierPrompt:
// questions about the site's own protections get a fixed reply, so no answer ever says how
// visitors are recognized (David, 2026-11-26). A separate prompt because adding this to the probe prompt made
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
// It costs no points: points are for guarded topics only.
const (
	protectionsFlag  = "asked about the site's protections"
	protectionsReply = "The site has standard abuse protections, and I don't go into how they work. I'm happy to talk about David's projects, though."
)

// revealsMethod is the backstop for probe-flagged turns: a model answer that names a way of
// recognizing visitors is replaced with protectionsReply.
var methodWordsRe = regexp.MustCompile(`(?i)\bcookies?\b|\bip[- ]address(es)?\b|\bip[- ]based\b|fingerprint|x-visitor|lb_sid|\bstrikes?\b|rate[- ]?limit|\btrack(s|ed|ing)? (you|visitors|users)\b`)

func revealsMethod(s string) bool { return methodWordsRe.MatchString(s) }

var visitorKeyRe = regexp.MustCompile(`^[0-9a-f]{32}$`)

// visitorKeys returns the strike-counter ids for this request.
func visitorKeys(r *http.Request, session string) []string {
	var ids []string
	seen := map[string]bool{}
	// The API Gateway adapter splits a comma-joined header into several values, so read them all.
	for _, v := range r.Header.Values("X-Visitor") {
		for _, k := range strings.Split(v, ",") {
			k = strings.TrimSpace(k)
			if visitorKeyRe.MatchString(k) && !seen[k] && len(ids) < 4 {
				seen[k] = true
				ids = append(ids, "strike#v#"+k)
			}
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

// strikesFor is the highest point count across ids (0 when none, expired, or on error).
// DynamoDB deletes expired items up to two days late, so the ttl is checked here too.
func strikesFor(ctx context.Context, ids []string) int64 {
	var max int64
	now := time.Now().Unix()
	for _, id := range ids {
		out, err := ddb.GetItem(ctx, &dynamodb.GetItemInput{
			TableName: aws.String(rateTable),
			Key:       map[string]ddbtypes.AttributeValue{"id": &ddbtypes.AttributeValueMemberS{Value: id}},
		})
		if err != nil {
			continue
		}
		if t, ok := out.Item["ttl"].(*ddbtypes.AttributeValueMemberN); ok {
			if exp, _ := strconv.ParseInt(t.Value, 10, 64); exp > 0 && exp < now {
				continue
			}
		}
		if v, ok := out.Item["count"].(*ddbtypes.AttributeValueMemberN); ok {
			if n, _ := strconv.ParseInt(v.Value, 10, 64); n > max {
				max = n
			}
		}
	}
	return max
}

// addPoints adds n points to every id, restarts its window, and returns the new highest count.
// An id whose window already ran out starts again from n.
func addPoints(ctx context.Context, ids []string, n, windowDays int64) int64 {
	now := time.Now().Unix()
	ttl := now + windowDays*24*3600
	var max int64
	for _, id := range ids {
		if strikesFor(ctx, []string{id}) == 0 {
			ddb.DeleteItem(ctx, &dynamodb.DeleteItemInput{ // a lapsed counter DynamoDB hasn't removed yet
				TableName: aws.String(rateTable),
				Key:       map[string]ddbtypes.AttributeValue{"id": &ddbtypes.AttributeValueMemberS{Value: id}},
			})
		}
		out, err := ddb.UpdateItem(ctx, &dynamodb.UpdateItemInput{
			TableName:                aws.String(rateTable),
			Key:                      map[string]ddbtypes.AttributeValue{"id": &ddbtypes.AttributeValueMemberS{Value: id}},
			UpdateExpression:         aws.String("ADD #c :n SET #t = :ttl"),
			ExpressionAttributeNames: map[string]string{"#c": "count", "#t": "ttl"},
			ExpressionAttributeValues: map[string]ddbtypes.AttributeValue{
				":n":   &ddbtypes.AttributeValueMemberN{Value: strconv.FormatInt(n, 10)},
				":ttl": &ddbtypes.AttributeValueMemberN{Value: strconv.FormatInt(ttl, 10)},
			},
			ReturnValues: ddbtypes.ReturnValueUpdatedNew,
		})
		if err != nil {
			continue
		}
		if v, ok := out.Attributes["count"].(*ddbtypes.AttributeValueMemberN); ok {
			if c, _ := strconv.ParseInt(v.Value, 10, 64); c > max {
				max = c
			}
		}
	}
	return max
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
