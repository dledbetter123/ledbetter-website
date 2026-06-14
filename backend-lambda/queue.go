package main

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
)

// queuedEvent is a chat-turn side-effect handed to the SQS FIFO worker: persist the turn
// to S3 (the durable record) and send the threaded notification email — both moved off
// the visitor's request path so the reply returns the instant the event is enqueued.
type queuedEvent struct {
	Type      string                   `json:"type"` // "turn"
	Session   string                   `json:"session"`
	Seq       int64                    `json:"seq"`
	UserMsg   string                   `json:"userMsg"`
	Answer    string                   `json:"answer"`
	Tools     []map[string]interface{} `json:"tools,omitempty"`
	CostMicro int64                    `json:"costMicro"`
	IP        string                   `json:"ip"`
	UserAgent string                   `json:"userAgent"`
	Provider  string                   `json:"provider"`
	Model     string                   `json:"model"`
	CostNote  string                   `json:"costNote"`
	InTok     int                      `json:"inTok"`
	OutTok    int                      `json:"outTok"`
}

// enqueueTurn publishes a turn event to the SQS FIFO queue and returns immediately.
// MessageGroupId = session, so a conversation's turns are processed in strict order while
// different sessions process in parallel; MessageDeduplicationId = type#session#seq makes
// the enqueue itself idempotent. If the queue isn't configured or the send fails, it falls
// back to processing inline so a turn is never lost (no regression to the old behavior).
func enqueueTurn(ctx context.Context, ev queuedEvent) {
	if sqsc == nil || turnsQueueURL == "" {
		processQueuedEvent(context.Background(), ev)
		return
	}
	body, err := json.Marshal(ev)
	if err != nil {
		processQueuedEvent(context.Background(), ev)
		return
	}
	group := ev.Session
	if group == "" {
		group = "anon"
	}
	dedup := fmt.Sprintf("%s#%s#%d", ev.Type, ev.Session, ev.Seq)
	sctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if _, err := sqsc.SendMessage(sctx, &sqs.SendMessageInput{
		QueueUrl:               aws.String(turnsQueueURL),
		MessageBody:            aws.String(string(body)),
		MessageGroupId:         aws.String(group),
		MessageDeduplicationId: aws.String(dedup),
	}); err != nil {
		fmt.Printf("sqs enqueue error: %v — processing inline\n", err)
		processQueuedEvent(context.Background(), ev)
	}
}

// processQueuedEvent performs the side-effects. saveConversation is idempotent (its key is
// content-addressed), and the email is guarded by a DynamoDB marker set only AFTER a
// successful send, so an at-least-once redelivery never double-emails. Returns an error so
// the worker can surface a failure for retry / dead-lettering.
func processQueuedEvent(ctx context.Context, ev queuedEvent) error {
	switch ev.Type {
	case "turn", "":
		if err := saveConversation(ev.Session, ev.Seq, ev.UserMsg, ev.Answer, ev.Tools, ev.CostMicro, ev.IP, ev.UserAgent, ev.Provider, ev.Model, ev.InTok, ev.OutTok); err != nil {
			return err
		}
		emailKey := fmt.Sprintf("emailed#turn#%s#%d", ev.Session, ev.Seq)
		if getData(ctx, emailKey) == "" {
			if err := emailTurn(ev.Session, ev.Seq, ev.UserMsg, ev.Answer, ev.IP, ev.UserAgent, ev.Provider, ev.Model, ev.CostNote, ev.CostMicro); err != nil {
				return err
			}
			putData(ctx, emailKey, "1", 7*24*3600) // mark after success → dedup on redelivery
		}
		return nil
	default:
		fmt.Printf("worker: unknown queued event type %q — dropping\n", ev.Type)
		return nil // don't retry an unrecognized type forever
	}
}

// handleSQS is the async worker entrypoint. It processes each record and reports per-message
// failures so SQS retries only those (FIFO holds the message group until the failed message
// succeeds or, after maxReceiveCount tries, dead-letters). Requires ReportBatchItemFailures
// on the event source mapping.
func handleSQS(ctx context.Context, e events.SQSEvent) events.SQSEventResponse {
	var resp events.SQSEventResponse
	for _, rec := range e.Records {
		var ev queuedEvent
		if err := json.Unmarshal([]byte(rec.Body), &ev); err != nil {
			fmt.Printf("worker: malformed message %s: %v — dropping\n", rec.MessageId, err)
			continue // a poison message shouldn't block its group forever
		}
		if err := processQueuedEvent(ctx, ev); err != nil {
			fmt.Printf("worker: process error (msg %s): %v\n", rec.MessageId, err)
			resp.BatchItemFailures = append(resp.BatchItemFailures, events.SQSBatchItemFailure{ItemIdentifier: rec.MessageId})
		}
	}
	return resp
}
