package mail

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/fuyediao/powersource-workbench/backend/internal/config"
	"github.com/fuyediao/powersource-workbench/backend/internal/mail/alimail"
	"github.com/fuyediao/powersource-workbench/backend/internal/mail/gmail"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

// newTestHandler builds a Handler wired to a fake Supabase REST server for
// task-queue tests; sync-relevant fields (env, gmail, alimail) point at the
// same fake server so provider calls that hit Supabase are also intercepted.
func newTestHandler(server *httptest.Server) *Handler {
	sb := supabase.NewService(server.URL, server.URL, "service", "anon")
	return &Handler{
		sb:      sb,
		gmail:   gmail.New(sb, config.Env{}),
		alimail: alimail.New(sb, config.Env{}),
	}
}

func TestSplitMirrorRows(t *testing.T) {
	rows := []gmail.MirrorRow{
		{ID: "1", ProviderMessageID: "17c1234abcd"},
		{ID: "2", ProviderMessageID: "imap:uid:5"},
		{ID: "3", ProviderMessageID: "imap:box:Sent:uid:9"},
	}
	gmailRows, aliRows := splitMirrorRows(rows)
	if len(gmailRows) != 1 || gmailRows[0].ID != "1" {
		t.Fatalf("expected 1 gmail row (id=1), got %+v", gmailRows)
	}
	if len(aliRows) != 2 {
		t.Fatalf("expected 2 imap rows, got %+v", aliRows)
	}
}

func TestFirstErr(t *testing.T) {
	if firstErr(map[string]error{}) != nil {
		t.Fatal("expected nil for empty error map")
	}
	err := firstErr(map[string]error{"acct-1": http.ErrBodyNotAllowed})
	if err == nil {
		t.Fatal("expected a non-nil error")
	}
}

func TestEnqueueRemoteTaskPostsExpectedRow(t *testing.T) {
	var posted map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.Path == "/rest/v1/mail_sync_tasks" {
			_ = json.NewDecoder(r.Body).Decode(&posted)
			_, _ = w.Write([]byte(`[]`))
			return
		}
		http.NotFound(w, r)
	}))
	defer server.Close()
	h := newTestHandler(server)

	h.enqueueRemoteTask(context.Background(), "acct-1", "user-1", "star", syncTaskPayload{MessageIDs: []string{"m1", "m2"}}, "provider unavailable")

	if posted["mail_account_id"] != "acct-1" {
		t.Fatalf("mail_account_id = %v", posted["mail_account_id"])
	}
	if posted["kind"] != "star" {
		t.Fatalf("kind = %v", posted["kind"])
	}
	if posted["status"] != "pending_remote" {
		t.Fatalf("status = %v", posted["status"])
	}
	if posted["error_message"] != "provider unavailable" {
		t.Fatalf("error_message = %v", posted["error_message"])
	}
	payload, ok := posted["payload"].(map[string]any)
	if !ok {
		t.Fatalf("payload = %v (want object)", posted["payload"])
	}
	ids, _ := payload["message_ids"].([]any)
	if len(ids) != 2 {
		t.Fatalf("payload.message_ids = %v", payload["message_ids"])
	}
}

func TestMirrorReadNoOpForInactiveGmailAccount(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/rest/v1/mail_accounts" {
			_, _ = w.Write([]byte(`[]`)) // account not found -> IsActiveAccount = false.
			return
		}
		http.NotFound(w, r)
	}))
	defer server.Close()
	h := newTestHandler(server)

	if err := h.mirrorRead(context.Background(), "acct-1", "17c1234abcd", true); err != nil {
		t.Fatalf("expected a no-op (nil) for an inactive/unknown Gmail account, got %v", err)
	}
}

func TestMirrorReadReturnsErrorForAliMailWithoutCredentials(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/rest/v1/mail_account_secrets" {
			_, _ = w.Write([]byte(`[]`)) // no stored secret.
			return
		}
		http.NotFound(w, r)
	}))
	defer server.Close()
	h := newTestHandler(server)

	err := h.mirrorRead(context.Background(), "acct-1", "imap:uid:5", true)
	if err == nil {
		t.Fatal("expected an error when no IMAP credentials are stored")
	}
}

func TestDrainPendingSyncTasksMarksFailedWhenAccountMissing(t *testing.T) {
	var patchedBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/rest/v1/mail_sync_tasks":
			rows := []map[string]any{{
				"id":              "task-1",
				"mail_account_id": "acct-missing",
				"kind":            "star",
				"payload":         map[string]any{"message_ids": []string{"m1"}},
				"attempts":        0,
			}}
			payload, _ := json.Marshal(rows)
			_, _ = w.Write(payload)
		case r.Method == http.MethodGet && r.URL.Path == "/rest/v1/mail_accounts":
			_, _ = w.Write([]byte(`[]`)) // account no longer exists.
		case r.Method == http.MethodPatch && r.URL.Path == "/rest/v1/mail_sync_tasks":
			_ = json.NewDecoder(r.Body).Decode(&patchedBody)
			_, _ = w.Write([]byte(`[]`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	h := newTestHandler(server)

	h.drainPendingSyncTasks(context.Background())

	if patchedBody == nil {
		t.Fatal("expected a PATCH against mail_sync_tasks")
	}
	if patchedBody["status"] != "failed" {
		t.Fatalf("status = %v, want failed", patchedBody["status"])
	}
}

func TestDrainPendingSyncTasksSkipsMirrorWhenMessagesGone(t *testing.T) {
	var patchedBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/rest/v1/mail_sync_tasks":
			rows := []map[string]any{{
				"id":              "task-1",
				"mail_account_id": "acct-1",
				"kind":            "star",
				"payload":         map[string]any{"message_ids": []string{"m1"}},
				"attempts":        0,
			}}
			payload, _ := json.Marshal(rows)
			_, _ = w.Write(payload)
		case r.Method == http.MethodGet && r.URL.Path == "/rest/v1/mail_accounts":
			row := map[string]any{"provider": "gmail"}
			payload, _ := json.Marshal([]any{row})
			_, _ = w.Write(payload)
		case r.Method == http.MethodGet && r.URL.Path == "/rest/v1/mail_messages":
			_, _ = w.Write([]byte(`[]`)) // message deleted locally since the task was queued.
		case r.Method == http.MethodPatch && r.URL.Path == "/rest/v1/mail_sync_tasks":
			_ = json.NewDecoder(r.Body).Decode(&patchedBody)
			_, _ = w.Write([]byte(`[]`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	h := newTestHandler(server)

	h.drainPendingSyncTasks(context.Background())

	if patchedBody == nil {
		t.Fatal("expected a PATCH against mail_sync_tasks")
	}
	if patchedBody["status"] != "done" {
		t.Fatalf("status = %v, want done (nothing left to mirror)", patchedBody["status"])
	}
}
