package harness

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/fuyediao/powersource-workbench/backend/internal/config"
	"github.com/fuyediao/powersource-workbench/backend/internal/mcp"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/authmw"
)

func TestRequireDesktopAgentForbidden(t *testing.T) {
	h := &Handler{
		env: config.Env{HermesProfilesRoot: t.TempDir()},
		hasModuleFn: func(context.Context, string, string) (bool, error) {
			return false, nil
		},
	}
	req := httptest.NewRequest(http.MethodGet, "/memory", nil)
	req = req.WithContext(authmw.WithUserID(req.Context(), testUserID))
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", rec.Code)
	}
}

func TestRequireDesktopAgentAllowsCallerProfileOnly(t *testing.T) {
	root := t.TempDir()
	h := &Handler{
		env: config.Env{HermesProfilesRoot: root},
		hasModuleFn: func(_ context.Context, userID, key string) (bool, error) {
			if key != mcp.DesktopAgentModule || userID != testUserID {
				t.Fatalf("unexpected ACL probe user=%s key=%s", userID, key)
			}
			return true, nil
		},
	}
	req := httptest.NewRequest(http.MethodGet, "/memory", nil)
	req = req.WithContext(authmw.WithUserID(req.Context(), testUserID))
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", rec.Code, rec.Body.String())
	}
}

func TestTickAllProfilesSkipsWithoutDesktopAgent(t *testing.T) {
	root := t.TempDir()
	var called int
	h := &Handler{
		env: config.Env{HermesProfilesRoot: root},
		hasModuleFn: func(context.Context, string, string) (bool, error) {
			return false, nil
		},
		callToolFn: func(context.Context, string, string, json.RawMessage) (mcp.FirstPartyResult, error) {
			called++
			return mcp.FirstPartyResult{Text: `{"ok":true}`}, nil
		},
	}
	profile, err := h.ensureProfile(testUserID)
	if err != nil {
		t.Fatal(err)
	}
	due := time.Date(2026, time.August, 25, 8, 0, 0, 0, time.Local)
	now := time.Date(2026, time.August, 25, 9, 0, 0, 0, time.Local)
	ms := due.UnixMilli()
	if err := saveJobs(profile, []Job{{
		ID:          "vps-skip",
		Name:        "Should not fire",
		Prompt:      "Unread mail digest",
		Schedule:    Schedule{Kind: "daily", Time: "08:00"},
		Target:      targetVPS,
		NextRunAtMs: &ms,
	}}); err != nil {
		t.Fatal(err)
	}

	h.tickAllProfiles(context.Background(), now)
	if called != 0 {
		t.Fatalf("revoked Harness access still ran tools %d times", called)
	}
}

func TestTickAllProfilesFiresWithDesktopAgent(t *testing.T) {
	root := t.TempDir()
	var actor string
	h := &Handler{
		env: config.Env{HermesProfilesRoot: root},
		hasModuleFn: func(_ context.Context, userID, _ string) (bool, error) {
			return userID == testUserID, nil
		},
		callToolFn: func(_ context.Context, userID, _ string, _ json.RawMessage) (mcp.FirstPartyResult, error) {
			actor = userID
			return mcp.FirstPartyResult{Text: `{"ok":true}`}, nil
		},
	}
	profile, err := h.ensureProfile(testUserID)
	if err != nil {
		t.Fatal(err)
	}
	due := time.Date(2026, time.August, 25, 8, 0, 0, 0, time.Local)
	now := time.Date(2026, time.August, 25, 9, 0, 0, 0, time.Local)
	ms := due.UnixMilli()
	if err := saveJobs(profile, []Job{{
		ID:          "vps-ok",
		Name:        "Daily brief",
		Prompt:      "Unread mail digest",
		Schedule:    Schedule{Kind: "daily", Time: "08:00"},
		Target:      targetVPS,
		NextRunAtMs: &ms,
	}}); err != nil {
		t.Fatal(err)
	}

	h.tickAllProfiles(context.Background(), now)
	if actor != testUserID {
		t.Fatalf("cron actor = %q, want the profile user", actor)
	}
}
