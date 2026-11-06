package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// The card-click endpoint rejects anything that isn't a POST of a known card kind with a
// card name, before it touches S3, DynamoDB or SES.
func TestCardClickRejectsBadRequests(t *testing.T) {
	cases := []struct {
		method, body string
		want         int
	}{
		{http.MethodGet, "", http.StatusMethodNotAllowed},
		{http.MethodPost, "not json", http.StatusBadRequest},
		{http.MethodPost, `{"kind":"resume","card":"thesis"}`, http.StatusBadRequest},
		{http.MethodPost, `{"kind":"project","card":"  "}`, http.StatusBadRequest},
		{http.MethodPost, `{"kind":"project"}`, http.StatusBadRequest},
	}
	for _, c := range cases {
		rec := httptest.NewRecorder()
		cardClickHandler(rec, httptest.NewRequest(c.method, "/api/card-click", strings.NewReader(c.body)))
		if rec.Code != c.want {
			t.Errorf("%s %q: got %d, want %d", c.method, c.body, rec.Code, c.want)
		}
	}
}
