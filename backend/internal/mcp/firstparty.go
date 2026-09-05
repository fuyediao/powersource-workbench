package mcp

import (
	"context"
	"encoding/json"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

// FirstPartyResult is one tool outcome for in-process callers.
type FirstPartyResult struct {
	// Text is the tool payload, JSON-encoded, exactly as MCP clients see it.
	Text string
	// IsError reports a tool-level failure (forbidden, not found, …).
	IsError bool
}

// FirstPartyTools lists the tool names in-process callers may use.
//
// Writes are included so the same Desktop Writes grants decide them; a user
// without an insert grant is refused here just as over MCP.
func FirstPartyTools() []string {
	return []string{
		toolListMyAccess,
		toolListEntities,
		toolSearchRecords,
		toolGetRecord,
		toolCountRecords,
		toolSummarizeRecords,
		toolCreateRecord,
		toolUpdateRecord,
		toolDeleteRecord,
		toolListUploadKinds,
		toolUploadFile,
		toolPrepareUpload,
		toolFinalizeUpload,
		toolDeleteFile,
	}
}

// IsFirstPartyTool reports whether a tool name may be called in-process.
func IsFirstPartyTool(name string) bool {
	for _, tool := range FirstPartyTools() {
		if tool == name {
			return true
		}
	}
	return false
}

// HasDesktopModule reports whether userID may reach a desktop entry key.
// An empty user id, empty key, or nil client fails closed (no grant).
func HasDesktopModule(ctx context.Context, sb *supabase.Client, userID, key string) (bool, error) {
	if sb == nil || userID == "" || key == "" {
		return false, nil
	}
	if workbenchModuleGranted(ctx, sb, userID, key) {
		return true, nil
	}
	acc, err := resolveAccess(ctx, sb, userID)
	if err != nil {
		return false, err
	}
	return acc.hasModule(key), nil
}

// workbenchModuleGranted is the Workbench ACL adapter used until GeoCRM group
// grants exist. Active work_profiles always receive the three Home tiles.
// Super/system admins also receive leftover CRM admin gates.
func workbenchModuleGranted(ctx context.Context, sb *supabase.Client, userID, key string) bool {
	var row struct {
		Role   string `json:"role"`
		Status string `json:"status"`
	}
	found, err := sb.From("work_profiles").
		Select("role,status").
		Eq("id", userID).
		MaybeSingle(ctx, &row)
	if err != nil || !found || row.Status != "active" {
		return false
	}
	switch key {
	case "desktop_chat", "desktop_mail", "desktop_calendar":
		return true
	default:
		return row.Role == "super_admin" || row.Role == "system_admin"
	}
}

// CallForUser runs one CRM tool as the given GeoCRM user.
//
// It resolves the same desktop ACL as the public /mcp transport
// (group membership plus group_desktop_module_access and
// group_desktop_writes_*), so an in-process caller can never see another
// group's rows or write without the matching grant.
func CallForUser(
	ctx context.Context,
	sb *supabase.Client,
	userID string,
	tool string,
	args json.RawMessage,
) (FirstPartyResult, error) {
	acc, err := resolveAccess(ctx, sb, userID)
	if err != nil {
		return FirstPartyResult{}, err
	}
	result := callTool(ctx, sb, acc, tool, args)
	text := ""
	if len(result.Content) > 0 {
		text = result.Content[0].Text
	}
	return FirstPartyResult{Text: text, IsError: result.IsError}, nil
}
