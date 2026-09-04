package harness

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/fuyediao/powersource-workbench/backend/internal/config"
	"github.com/fuyediao/powersource-workbench/backend/internal/mcp"
)

func TestDigestEntitiesFromPrompt(t *testing.T) {
	got := digestEntities("Summarize unread mail and today's calendar")
	if containsStr(got, "mail_messages") || containsStr(got, "calendar_events") {
		t.Fatalf("VPS digest must not query local mail/calendar, got %v", got)
	}
	if !containsStr(got, "customers") {
		t.Fatalf("mail/calendar prompts should fall back to customers, got %v", got)
	}
}

func TestDigestEntitiesDefaultOfficeSet(t *testing.T) {
	got := digestEntities("Weekly review")
	if !containsStr(got, "customers") {
		t.Fatalf("default set = %v", got)
	}
	if containsStr(got, "mail_messages") || containsStr(got, "calendar_events") {
		t.Fatalf("default set still has local-only entities: %v", got)
	}
}

func containsStr(items []string, want string) bool {
	for _, s := range items {
		if s == want {
			return true
		}
	}
	return false
}

func TestTickProfileThisPcWakesWithoutCompleting(t *testing.T) {
	root := t.TempDir()
	h := &Handler{env: config.Env{HermesProfilesRoot: root}}
	profile, err := h.ensureProfile(testUserID)
	if err != nil {
		t.Fatal(err)
	}

	due := time.Date(2026, time.August, 25, 7, 0, 0, 0, time.Local)
	now := time.Date(2026, time.August, 25, 8, 5, 0, 0, time.Local)
	ms := due.UnixMilli()
	job := Job{
		ID:          "wake1",
		Name:        "Local patch",
		Prompt:      "Edit the dashboard on this PC",
		Schedule:    Schedule{Kind: "daily", Time: "07:00"},
		Target:      targetThisPC,
		NextRunAtMs: &ms,
	}
	if err := saveJobs(profile, []Job{job}); err != nil {
		t.Fatal(err)
	}

	h.tickProfile(context.Background(), testUserID, profile, now)

	stored, err := loadJobs(profile)
	if err != nil {
		t.Fatal(err)
	}
	if len(stored) != 1 {
		t.Fatalf("jobs = %d", len(stored))
	}
	if stored[0].WakePendingAtMs == nil {
		t.Fatal("thisPc job must be wake-pending")
	}
	if stored[0].LastStatus != "waitingForThisPc" {
		t.Fatalf("status = %q", stored[0].LastStatus)
	}
	if stored[0].LastRunAtMs != nil {
		t.Fatal("thisPc job must not stamp last-run until Electron completes")
	}
}

func TestTickProfileVPSDigestAndCatchUp(t *testing.T) {
	root := t.TempDir()
	var called []string
	h := &Handler{
		env: config.Env{HermesProfilesRoot: root},
		callToolFn: func(_ context.Context, userID, tool string, _ json.RawMessage) (mcp.FirstPartyResult, error) {
			if userID != testUserID {
				t.Fatalf("userID = %s", userID)
			}
			called = append(called, tool)
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
	job := Job{
		ID:          "vps1",
		Name:        "Daily brief",
		Prompt:      "Unread mail digest",
		Schedule:    Schedule{Kind: "daily", Time: "08:00"},
		Target:      targetVPS,
		NextRunAtMs: &ms,
	}
	if err := saveJobs(profile, []Job{job}); err != nil {
		t.Fatal(err)
	}

	h.tickProfile(context.Background(), testUserID, profile, now)

	stored, err := loadJobs(profile)
	if err != nil {
		t.Fatal(err)
	}
	if len(stored) != 1 || stored[0].LastRunAtMs == nil {
		t.Fatalf("expected last-run, got %+v", stored)
	}
	if stored[0].LastStatus != "ok" {
		t.Fatalf("status = %q digest=%q", stored[0].LastStatus, stored[0].LastDigest)
	}
	if stored[0].NextRunAtMs == nil || *stored[0].NextRunAtMs <= now.UnixMilli() {
		t.Fatal("next run must move past the missed slot")
	}
	if !containsStr(called, "list_my_access") || !containsStr(called, "summarize_records") {
		t.Fatalf("tools called = %v", called)
	}

	// Restart catch-up: ticking again must not re-fire the same slot.
	called = nil
	h.tickProfile(context.Background(), testUserID, profile, now.Add(time.Minute))
	if len(called) != 0 {
		t.Fatalf("caught-up job re-fired tools %v", called)
	}
}

func TestMarkWakePendingDoesNotComplete(t *testing.T) {
	job := Job{Target: targetThisPC}
	markWakePending(&job)
	if job.LastRunAtMs != nil {
		t.Fatal("wake pending must not set last-run")
	}
	if job.LastStatus != "waitingForThisPc" || job.WakePendingAtMs == nil {
		t.Fatalf("job = %+v", job)
	}
}

func TestLibraryRulesAndCommandsCRUD(t *testing.T) {
	profile := t.TempDir()
	ruleDir := filepath.Join(profile, "rules", "brief")
	if err := os.MkdirAll(ruleDir, 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(ruleDir, "RULE.md"), []byte("# Brief\nKeep answers short."), 0o600); err != nil {
		t.Fatal(err)
	}
	cmdDir := filepath.Join(profile, "commands", "standup")
	if err := os.MkdirAll(cmdDir, 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(cmdDir, "COMMAND.md"), []byte("# Standup\nSummarize follow-ups."), 0o600); err != nil {
		t.Fatal(err)
	}

	rules, err := listLibraryEntries(filepath.Join(profile, "rules"), libraryRules, true)
	if err != nil {
		t.Fatal(err)
	}
	if len(rules) != 1 || rules[0].Name != "brief" || rules[0].Body == "" {
		t.Fatalf("rules = %+v", rules)
	}
	commands, err := listLibraryEntries(filepath.Join(profile, "commands"), libraryCommands, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(commands) != 1 || commands[0].Name != "standup" || commands[0].Body != "" {
		t.Fatalf("commands = %+v", commands)
	}
}
