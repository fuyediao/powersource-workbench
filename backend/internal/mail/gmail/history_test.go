package gmail

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/fuyediao/powersource-workbench/backend/internal/config"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

// withGmailAPIBase points the package-level Gmail API base at server for the
// duration of one test, restoring it afterward.
func withGmailAPIBase(t *testing.T, server *httptest.Server) {
	t.Helper()
	prev := gmailAPIBase
	gmailAPIBase = server.URL
	t.Cleanup(func() { gmailAPIBase = prev })
}

func TestListHistorySincePaginates(t *testing.T) {
	pages := []string{
		`{"history":[{"id":"100","messagesAdded":[{"message":{"id":"m1","labelIds":["INBOX","UNREAD"]}}]}],"nextPageToken":"p2"}`,
		`{"history":[{"id":"101","messagesDeleted":[{"message":{"id":"m2"}}]}],"historyId":"101"}`,
	}
	call := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/users/me/history" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if call == 0 && r.URL.Query().Get("pageToken") != "" {
			t.Fatalf("first page should not send pageToken")
		}
		if call == 1 && r.URL.Query().Get("pageToken") != "p2" {
			t.Fatalf("second page should send pageToken=p2, got %q", r.URL.Query().Get("pageToken"))
		}
		_, _ = w.Write([]byte(pages[call]))
		call++
	}))
	defer server.Close()
	withGmailAPIBase(t, server)

	records, newID, invalid, err := listHistorySince(context.Background(), "tok", "99")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if invalid {
		t.Fatal("expected valid history")
	}
	if len(records) != 2 {
		t.Fatalf("expected 2 records, got %d", len(records))
	}
	if newID != "101" {
		t.Fatalf("newHistoryID = %q, want 101", newID)
	}
	if call != 2 {
		t.Fatalf("expected 2 requests, got %d", call)
	}
}

func TestListHistorySinceInvalidHistoryID(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, `{"error":{"code":404,"message":"Requested entity was not found."}}`, http.StatusNotFound)
	}))
	defer server.Close()
	withGmailAPIBase(t, server)

	_, _, invalid, err := listHistorySince(context.Background(), "tok", "1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !invalid {
		t.Fatal("expected invalidHistory=true on 404")
	}
}

// fakeMailMessagesServer answers the mail_messages lookups/updates that
// patchLocalLabels and deleteLocalByProviderID issue against Supabase.
func fakeMailMessagesServer(t *testing.T, existing map[string][]string, patched map[string]map[string]any, deleted map[string]bool) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/rest/v1/mail_messages":
			providerID := r.URL.Query().Get("provider_message_id")
			// providerID looks like "eq.m1"
			id := providerID[len("eq."):]
			labels, ok := existing[id]
			if !ok {
				_, _ = w.Write([]byte(`[]`))
				return
			}
			row := map[string]any{"id": "row-" + id, "labels": labels}
			payload, _ := json.Marshal([]any{row})
			_, _ = w.Write(payload)
		case r.Method == http.MethodPatch && r.URL.Path == "/rest/v1/mail_messages":
			rowID := r.URL.Query().Get("id")[len("eq."):]
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			if patched != nil {
				patched[rowID] = body
			}
			if deleted != nil {
				// Delete requests use method DELETE, not PATCH; nothing to record here.
			}
			_, _ = w.Write([]byte(`[]`))
		case r.Method == http.MethodDelete && r.URL.Path == "/rest/v1/mail_messages":
			rowID := r.URL.Query().Get("id")[len("eq."):]
			if deleted != nil {
				deleted[rowID] = true
			}
			_, _ = w.Write([]byte(`[]`))
		case r.Method == http.MethodGet && r.URL.Path == "/rest/v1/mail_attachments":
			_, _ = w.Write([]byte(`[]`))
		default:
			http.NotFound(w, r)
		}
	}))
}

func TestPatchLocalLabelsAddAndRemove(t *testing.T) {
	patched := map[string]map[string]any{}
	server := fakeMailMessagesServer(t, map[string][]string{"m1": {"INBOX", "UNREAD"}}, patched, nil)
	defer server.Close()

	c := &Client{sb: supabase.NewService(server.URL, server.URL, "service", "anon"), env: config.Env{}}
	c.patchLocalLabels(context.Background(), "acct-1", "m1", []string{"STARRED"}, []string{"UNREAD"})

	got, ok := patched["row-m1"]
	if !ok {
		t.Fatal("expected a PATCH against row-m1")
	}
	labels, _ := got["labels"].([]any)
	labelSet := map[string]bool{}
	for _, l := range labels {
		labelSet[l.(string)] = true
	}
	if !labelSet["INBOX"] || !labelSet["STARRED"] || labelSet["UNREAD"] {
		t.Fatalf("unexpected labels after patch: %v", labels)
	}
	if got["is_read"] != true {
		t.Fatalf("removing UNREAD should set is_read=true, got %v", got["is_read"])
	}
	if got["is_starred"] != true {
		t.Fatalf("adding STARRED should set is_starred=true, got %v", got["is_starred"])
	}
}

func TestPatchLocalLabelsMissingRowIsNoOp(t *testing.T) {
	patched := map[string]map[string]any{}
	server := fakeMailMessagesServer(t, map[string][]string{}, patched, nil)
	defer server.Close()

	c := &Client{sb: supabase.NewService(server.URL, server.URL, "service", "anon"), env: config.Env{}}
	c.patchLocalLabels(context.Background(), "acct-1", "missing", []string{"STARRED"}, nil)

	if len(patched) != 0 {
		t.Fatalf("expected no PATCH for an unknown provider id, got %v", patched)
	}
}

func TestDeleteLocalByProviderIDDeletesMatchingRow(t *testing.T) {
	deleted := map[string]bool{}
	server := fakeMailMessagesServer(t, map[string][]string{"m2": {"TRASH"}}, nil, deleted)
	defer server.Close()

	c := &Client{sb: supabase.NewService(server.URL, server.URL, "service", "anon"), env: config.Env{}}
	c.deleteLocalByProviderID(context.Background(), "acct-1", "m2")

	if !deleted["row-m2"] {
		t.Fatalf("expected row-m2 to be deleted, got %v", deleted)
	}
}
