// Package crmadmin resolves GeoCRM staff authorization (super admin, system
// admin, group admin) used by protected backend routes. It mirrors
// geocrm-api/src/shared/crm-admin.ts.
package crmadmin

import (
	"context"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

func workbenchRole(ctx context.Context, sb *supabase.Client, userID string) string {
	if sb == nil || userID == "" {
		return ""
	}
	var row struct {
		Role   string `json:"role"`
		Status string `json:"status"`
	}
	found, err := sb.From("work_profiles").
		Select("role,status").
		Eq("id", userID).
		MaybeSingle(ctx, &row)
	if err != nil || !found || row.Status != "active" {
		return ""
	}
	return row.Role
}

// IsSuperAdmin reports whether the user has the super_admin role. There is
// exactly one super_admin account (see
// .cursor/documents/group-user-rbac-rewrite-zh-TW.md); it is the only role
// allowed to promote or demote system_admin accounts.
func IsSuperAdmin(ctx context.Context, sb *supabase.Client, userID string) bool {
	if workbenchRole(ctx, sb, userID) == "super_admin" {
		return true
	}
	var row struct {
		UserID string `json:"user_id"`
	}
	found, err := sb.From("user_roles").
		Select("user_id").
		Eq("user_id", userID).
		Eq("role", "super_admin").
		MaybeSingle(ctx, &row)
	if err != nil {
		return false
	}
	return found && row.UserID != ""
}

// IsSystemAdmin reports whether the user has the system_admin role, or the
// super_admin role (super_admin is a superset of system_admin capability).
func IsSystemAdmin(ctx context.Context, sb *supabase.Client, userID string) bool {
	switch workbenchRole(ctx, sb, userID) {
	case "super_admin", "system_admin":
		return true
	}
	var row struct {
		UserID string `json:"user_id"`
	}
	found, err := sb.From("user_roles").
		Select("user_id").
		Eq("user_id", userID).
		In("role", []string{"system_admin", "super_admin"}).
		Limit(1).
		MaybeSingle(ctx, &row)
	if err != nil {
		return false
	}
	return found && row.UserID != ""
}

// IsGroupAdmin reports whether the user administers at least one CRM group,
// either via the legacy single-owner `groups.group_admin_id` column or the
// multi-admin `group_members.is_group_admin` flag introduced by the RBAC
// rewrite.
func IsGroupAdmin(ctx context.Context, sb *supabase.Client, userID string) bool {
	var legacy struct {
		ID string `json:"id"`
	}
	if found, err := sb.From("groups").
		Select("id").
		Eq("group_admin_id", userID).
		Limit(1).
		MaybeSingle(ctx, &legacy); err == nil && found && legacy.ID != "" {
		return true
	}

	var member struct {
		UserID string `json:"user_id"`
	}
	found, err := sb.From("group_members").
		Select("user_id").
		Eq("user_id", userID).
		Eq("is_group_admin", "true").
		Eq("is_active", "true").
		Limit(1).
		MaybeSingle(ctx, &member)
	return err == nil && found && member.UserID != ""
}

// IsGroupOrSystemAdmin reports whether the user may operate protected T&E workflows.
func IsGroupOrSystemAdmin(ctx context.Context, sb *supabase.Client, userID string) bool {
	return IsSystemAdmin(ctx, sb, userID) || IsGroupAdmin(ctx, sb, userID)
}

// IsAdminOfGroup reports whether the user administers the given group,
// either via the legacy single-owner `groups.group_admin_id` column or the
// multi-admin `group_members.is_group_admin` flag. Mirrors the
// `public.is_admin_of_group` SQL helper — deliberately narrower than plain
// group membership; callers needing "any active member" should not use this.
func IsAdminOfGroup(ctx context.Context, sb *supabase.Client, userID, groupID string) bool {
	if userID == "" || groupID == "" {
		return false
	}
	var legacy struct {
		ID string `json:"id"`
	}
	if found, err := sb.From("groups").
		Select("id").
		Eq("id", groupID).
		Eq("group_admin_id", userID).
		MaybeSingle(ctx, &legacy); err == nil && found && legacy.ID != "" {
		return true
	}

	var member struct {
		UserID string `json:"user_id"`
	}
	found, err := sb.From("group_members").
		Select("user_id").
		Eq("group_id", groupID).
		Eq("user_id", userID).
		Eq("is_group_admin", "true").
		Eq("is_active", "true").
		Limit(1).
		MaybeSingle(ctx, &member)
	return err == nil && found && member.UserID != ""
}

// FindAdministeredGroupID returns the id of a group the user administers
// (legacy `group_admin_id` first, then multi-admin `group_members`), or ""
// if the user does not administer any group.
func FindAdministeredGroupID(ctx context.Context, sb *supabase.Client, userID string) string {
	if userID == "" {
		return ""
	}
	var owned struct {
		ID string `json:"id"`
	}
	if found, err := sb.From("groups").
		Select("id").
		Eq("group_admin_id", userID).
		Limit(1).
		MaybeSingle(ctx, &owned); err == nil && found && owned.ID != "" {
		return owned.ID
	}

	var member struct {
		GroupID string `json:"group_id"`
	}
	if found, err := sb.From("group_members").
		Select("group_id").
		Eq("user_id", userID).
		Eq("is_group_admin", "true").
		Eq("is_active", "true").
		Limit(1).
		MaybeSingle(ctx, &member); err == nil && found && member.GroupID != "" {
		return member.GroupID
	}
	return ""
}
