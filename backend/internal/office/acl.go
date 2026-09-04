package office

import (
	"context"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/crmadmin"
)

// access describes what a caller may do with one office_files row, mirroring
// the RLS policies in supabase/sql/migrations/20260828_office_files.sql
// (personal owner, group membership/leader for reads, can_write_desktop_office
// grants for writes). Go re-checks this even though the service role bypasses
// Postgres RLS — same defense-in-depth pattern as mail attachments.
type access struct {
	CanView bool
	CanEdit bool
}

// resolveAccess computes the caller's access to row.
func (h *Handler) resolveAccess(ctx context.Context, userID string, row *fileRow) access {
	if row.OwnerUserID != nil {
		if *row.OwnerUserID == userID {
			return access{CanView: true, CanEdit: true}
		}
		return access{}
	}
	if row.GroupID == nil {
		return access{}
	}
	groupID := *row.GroupID

	if crmadmin.IsSystemAdmin(ctx, h.sb, userID) || crmadmin.IsAdminOfGroup(ctx, h.sb, userID, groupID) {
		return access{CanView: true, CanEdit: true}
	}

	member := h.isActiveGroupMember(ctx, userID, groupID)
	leader := h.isGlobalLeaderForModule(ctx, userID, "desktop_"+row.Kind)
	if !member && !leader {
		return access{}
	}

	canEdit := member && h.hasWriteGrant(ctx, userID, groupID, row.Kind, "update")
	return access{CanView: true, CanEdit: canEdit}
}

// isActiveGroupMember reports whether userID is an active member of groupID.
func (h *Handler) isActiveGroupMember(ctx context.Context, userID, groupID string) bool {
	if userID == "" || groupID == "" {
		return false
	}
	var row struct {
		UserID string `json:"user_id"`
	}
	found, err := h.sb.From("group_members").
		Select("user_id").
		Eq("group_id", groupID).
		Eq("user_id", userID).
		Eq("is_active", "true").
		MaybeSingle(ctx, &row)
	return err == nil && found && row.UserID != ""
}

// isGlobalLeaderForModule reports whether userID is a global leader with the
// given desktop module entry key granted (global_leaders +
// global_leader_desktop_module_access).
func (h *Handler) isGlobalLeaderForModule(ctx context.Context, userID, moduleKey string) bool {
	if userID == "" {
		return false
	}
	var leader struct {
		UserID string `json:"user_id"`
	}
	found, err := h.sb.From("global_leaders").
		Select("user_id").
		Eq("user_id", userID).
		MaybeSingle(ctx, &leader)
	if err != nil || !found || leader.UserID == "" {
		return false
	}
	var access struct {
		ModuleKey string `json:"module_key"`
	}
	found, err = h.sb.From("global_leader_desktop_module_access").
		Select("module_key").
		Eq("user_id", userID).
		Eq("module_key", moduleKey).
		MaybeSingle(ctx, &access)
	return err == nil && found && access.ModuleKey != ""
}

// hasWriteGrant reports whether userID holds an explicit
// group_desktop_writes_office grant for (groupID, resourceKey, action).
// Group-admin / system-admin bypasses are checked by the caller before this.
func (h *Handler) hasWriteGrant(ctx context.Context, userID, groupID, resourceKey, action string) bool {
	var row struct {
		Action string `json:"action"`
	}
	found, err := h.sb.From("group_desktop_writes_office").
		Select("action").
		Eq("group_id", groupID).
		Eq("user_id", userID).
		Eq("resource_key", resourceKey).
		Eq("action", action).
		MaybeSingle(ctx, &row)
	return err == nil && found && row.Action != ""
}
