package mcp

import (
	"context"
	"testing"
)

func TestFirstPartyToolsIncludeCronDigestCalls(t *testing.T) {
	// VPS Harness cron runs list_my_access + summarize_records via CallForUser.
	for _, tool := range []string{toolListMyAccess, toolSummarizeRecords} {
		if !IsFirstPartyTool(tool) {
			t.Fatalf("%s must stay on the first-party door for cron digest", tool)
		}
	}
}

func TestIsFirstPartyToolAcceptsSharedCrmTools(t *testing.T) {
	for _, tool := range []string{
		toolListMyAccess,
		toolListEntities,
		toolSearchRecords,
		toolGetRecord,
		toolCreateRecord,
	} {
		if !IsFirstPartyTool(tool) {
			t.Fatalf("%s must be callable in-process", tool)
		}
	}
}

func TestHasDesktopModuleFailsClosed(t *testing.T) {
	ok, err := HasDesktopModule(context.Background(), nil, "user", DesktopAgentModule)
	if err != nil || ok {
		t.Fatalf("nil client must not grant Harness, ok=%v err=%v", ok, err)
	}
	ok, err = HasDesktopModule(context.Background(), nil, "", DesktopAgentModule)
	if err != nil || ok {
		t.Fatalf("empty user must not grant Harness, ok=%v err=%v", ok, err)
	}
}

func TestUnrestrictedAccessIncludesDesktopAgent(t *testing.T) {
	acc := &access{Unrestricted: true, modules: map[string]bool{}}
	if !acc.hasModule(DesktopAgentModule) {
		t.Fatal("system admins must reach Harness")
	}
}

func TestMemberWithoutDesktopAgentCannotOpenHarness(t *testing.T) {
	acc := &access{
		UserID:   "member",
		GroupIDs: []string{"ntna"},
		modules:  map[string]bool{"desktop_admin": true, "desktop_mail": true},
	}
	if acc.hasModule(DesktopAgentModule) {
		t.Fatal("CRM modules must not imply the Harness tile")
	}
}

func TestIsFirstPartyToolAcceptsUploadAndRejectsUnknown(t *testing.T) {
	for _, tool := range []string{
		toolListUploadKinds,
		toolUploadFile,
		toolPrepareUpload,
		toolFinalizeUpload,
		toolDeleteFile,
	} {
		if !IsFirstPartyTool(tool) {
			t.Fatalf("%q must be callable in-process", tool)
		}
	}
	for _, tool := range []string{"", "drop_table"} {
		if IsFirstPartyTool(tool) {
			t.Fatalf("%q must not be callable in-process", tool)
		}
	}
}

func TestFirstPartyToolsCoverWriteActions(t *testing.T) {
	// Writes are exposed so the same group_desktop_writes_* grants decide
	// them; a user without an insert grant is refused by authorizeWrite.
	wanted := map[string]bool{
		toolCreateRecord: false,
		toolUpdateRecord: false,
		toolDeleteRecord: false,
	}
	for _, tool := range FirstPartyTools() {
		if _, ok := wanted[tool]; ok {
			wanted[tool] = true
		}
	}
	for tool, found := range wanted {
		if !found {
			t.Fatalf("%s missing from FirstPartyTools()", tool)
		}
	}
}

func TestGlobalLeaderCannotWriteThroughFirstPartyDoor(t *testing.T) {
	acc := &access{
		UserID:       "leader",
		GlobalLeader: true,
		GroupIDs:     []string{"group-a"},
		modules:      map[string]bool{"desktop_admin": true},
		writes:       map[string]bool{},
	}
	for _, action := range writeActions {
		if len(writableEntities(acc, action)) != 0 {
			t.Fatalf("global leaders must stay read-only for %s", action)
		}
	}
}

func TestMemberWithoutInsertGrantHasNoWritableEntities(t *testing.T) {
	acc := &access{
		UserID:   "member",
		GroupIDs: []string{"ntna"},
		modules:  map[string]bool{"desktop_admin": true},
		writes:   map[string]bool{},
	}
	if got := writableEntities(acc, "insert"); len(got) != 0 {
		t.Fatalf("member without an insert grant must not create rows, got %v", got)
	}
}
