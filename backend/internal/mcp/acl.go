package mcp

import (
	"context"
	"sort"
	"strings"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/crmadmin"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

// DesktopAgentModule is the Electron Harness entry key
// (group_desktop_module_access.module_key).
const DesktopAgentModule = "desktop_agent"

// desktopModuleKeys is the full Electron entry whitelist, matching the CHECK
// constraint on group_desktop_module_access.module_key.
var desktopModuleKeys = []string{
	"desktop_chat",
	DesktopAgentModule,
	"desktop_messages",
	"desktop_mail",
	"desktop_calendar",
	"desktop_kanban",
	"desktop_map",
	"desktop_admin",
	"desktop_orders",
	"desktop_products",
	"desktop_nexdot",
	"desktop_te_admin",
	"desktop_team",
	"desktop_aura",
	"desktop_folio",
	"desktop_docs",
	"desktop_sheets",
	"desktop_slides",
	"desktop_map_favorites",
	"desktop_map_customers",
	"desktop_map_leads",
	"desktop_map_competitors",
}

// writeDomainTables maps a desktop write domain to its grant table.
var writeDomainTables = map[string]string{
	"admin":    "group_desktop_writes_admin",
	"calendar": "group_desktop_writes_calendar",
}

// writeGate names the desktop write grant an entity mutation requires.
type writeGate struct {
	Domain   string
	Resource string
}

// access is the resolved authorization snapshot for one MCP caller. It mirrors
// what the Electron shell computes in use-desktop-module-access plus the
// group_desktop_writes_* grants consulted before any mutation.
type access struct {
	UserID string
	// Unrestricted marks system_admin / super_admin: every entry key and every
	// write action is allowed, and reads are not scoped to a group.
	Unrestricted bool
	// GlobalLeader marks a cross-group reader. Leaders gain entry keys but stay
	// read-only for mutations unless they also administer the group.
	GlobalLeader bool
	// GroupIDs are the caller's active memberships; AdminGroupIDs is the subset
	// they administer (group admins bypass per-resource write grants).
	GroupIDs      []string
	AdminGroupIDs []string

	modules map[string]bool
	writes  map[string]bool
}

// hasModule reports whether the caller may reach a desktop entry key.
func (a *access) hasModule(key string) bool {
	if a.Unrestricted {
		return true
	}
	return a.modules[key]
}

// allowedModules lists the granted entry keys in a stable order.
func (a *access) allowedModules() []string {
	if a.Unrestricted {
		out := make([]string, len(desktopModuleKeys))
		copy(out, desktopModuleKeys)
		return out
	}
	out := make([]string, 0, len(a.modules))
	for key := range a.modules {
		out = append(out, key)
	}
	sort.Strings(out)
	return out
}

// canWrite reports whether the caller may perform action on a write resource.
// System admins and group admins bypass per-resource grants, matching
// can_write_desktop_* in SQL.
func (a *access) canWrite(gate writeGate, action string) bool {
	if a.Unrestricted {
		return true
	}
	if len(a.AdminGroupIDs) > 0 {
		return true
	}
	return a.writes[writeKey(gate.Domain, gate.Resource, action)]
}

// allowedWrites lists granted "domain:resource:action" triples in a stable
// order so agents can see exactly which mutations are available.
func (a *access) allowedWrites() []string {
	if a.Unrestricted || len(a.AdminGroupIDs) > 0 {
		out := make([]string, 0, 32)
		for _, ent := range entityList() {
			if ent.Write == nil {
				continue
			}
			for _, action := range writeActions {
				out = append(out, writeKey(ent.Write.Domain, ent.Write.Resource, action))
			}
		}
		sort.Strings(out)
		return dedupe(out)
	}
	out := make([]string, 0, len(a.writes))
	for key := range a.writes {
		out = append(out, key)
	}
	sort.Strings(out)
	return out
}

// writeActions are the mutation verbs the desktop ACL models.
var writeActions = []string{"insert", "update", "delete"}

// writeKey builds the map key for a write grant triple.
func writeKey(domain, resource, action string) string {
	return domain + ":" + resource + ":" + action
}

// dedupe removes adjacent duplicates from a sorted slice.
func dedupe(sorted []string) []string {
	out := sorted[:0]
	var prev string
	for i, v := range sorted {
		if i > 0 && v == prev {
			continue
		}
		out = append(out, v)
		prev = v
	}
	return out
}

// resolveAccess loads role, group membership, desktop entry keys, and write
// grants for a user. It fails closed: any lookup error yields no grants rather
// than a permissive snapshot.
func resolveAccess(ctx context.Context, sb *supabase.Client, userID string) (*access, error) {
	acc := &access{
		UserID:  userID,
		modules: map[string]bool{},
		writes:  map[string]bool{},
	}

	if crmadmin.IsSystemAdmin(ctx, sb, userID) {
		acc.Unrestricted = true
		return acc, nil
	}

	var memberships []struct {
		GroupID      string `json:"group_id"`
		IsGroupAdmin bool   `json:"is_group_admin"`
	}
	if err := sb.From("group_members").
		Select("group_id,is_group_admin").
		Eq("user_id", userID).
		Eq("is_active", "true").
		Exec(ctx, &memberships); err != nil {
		return nil, err
	}
	for _, m := range memberships {
		if m.GroupID == "" {
			continue
		}
		acc.GroupIDs = append(acc.GroupIDs, m.GroupID)
		if m.IsGroupAdmin {
			acc.AdminGroupIDs = append(acc.AdminGroupIDs, m.GroupID)
		}
	}

	// Legacy single-owner group admin column still grants admin rights.
	var owned []struct {
		ID string `json:"id"`
	}
	if err := sb.From("groups").
		Select("id").
		Eq("group_admin_id", userID).
		Exec(ctx, &owned); err == nil {
		for _, g := range owned {
			if g.ID == "" {
				continue
			}
			if !contains(acc.GroupIDs, g.ID) {
				acc.GroupIDs = append(acc.GroupIDs, g.ID)
			}
			if !contains(acc.AdminGroupIDs, g.ID) {
				acc.AdminGroupIDs = append(acc.AdminGroupIDs, g.ID)
			}
		}
	}

	if len(acc.GroupIDs) > 0 {
		var rows []struct {
			ModuleKey string `json:"module_key"`
		}
		if err := sb.From("group_desktop_module_access").
			Select("module_key").
			In("group_id", acc.GroupIDs).
			Exec(ctx, &rows); err != nil {
			return nil, err
		}
		for _, row := range rows {
			acc.modules[row.ModuleKey] = true
		}
	}

	var leader struct {
		UserID string `json:"user_id"`
	}
	if found, err := sb.From("global_leaders").
		Select("user_id").
		Eq("user_id", userID).
		MaybeSingle(ctx, &leader); err == nil && found && leader.UserID != "" {
		acc.GlobalLeader = true
		var rows []struct {
			ModuleKey string `json:"module_key"`
		}
		if err := sb.From("global_leader_desktop_module_access").
			Select("module_key").
			Eq("user_id", userID).
			Exec(ctx, &rows); err == nil {
			for _, row := range rows {
				acc.modules[row.ModuleKey] = true
			}
		}
	}

	if err := loadWriteGrants(ctx, sb, acc); err != nil {
		return nil, err
	}
	return acc, nil
}

// loadWriteGrants fills acc.writes from every group_desktop_writes_* table.
func loadWriteGrants(ctx context.Context, sb *supabase.Client, acc *access) error {
	if len(acc.GroupIDs) == 0 {
		return nil
	}
	domains := make([]string, 0, len(writeDomainTables))
	for domain := range writeDomainTables {
		domains = append(domains, domain)
	}
	sort.Strings(domains)

	for _, domain := range domains {
		var rows []struct {
			ResourceKey string `json:"resource_key"`
			Action      string `json:"action"`
		}
		if err := sb.From(writeDomainTables[domain]).
			Select("resource_key,action").
			Eq("user_id", acc.UserID).
			In("group_id", acc.GroupIDs).
			Exec(ctx, &rows); err != nil {
			return err
		}
		for _, row := range rows {
			acc.writes[writeKey(domain, row.ResourceKey, row.Action)] = true
		}
	}
	return nil
}

// groupMemberIDs returns the active member ids of every group the caller
// administers. Used to widen lead visibility the same way the leads group
// directory RLS policy does.
func groupMemberIDs(ctx context.Context, sb *supabase.Client, acc *access) []string {
	if len(acc.AdminGroupIDs) == 0 {
		return nil
	}
	var rows []struct {
		UserID string `json:"user_id"`
	}
	if err := sb.From("group_members").
		Select("user_id").
		In("group_id", acc.AdminGroupIDs).
		Eq("is_active", "true").
		Exec(ctx, &rows); err != nil {
		return nil
	}
	out := make([]string, 0, len(rows))
	for _, row := range rows {
		if row.UserID != "" && !contains(out, row.UserID) {
			out = append(out, row.UserID)
		}
	}
	return out
}

// contains reports whether values holds target.
func contains(values []string, target string) bool {
	for _, v := range values {
		if v == target {
			return true
		}
	}
	return false
}

// isUUID performs a cheap shape check before a value is interpolated into a
// PostgREST filter, so callers cannot smuggle filter syntax through an id.
func isUUID(value string) bool {
	if len(value) != 36 {
		return false
	}
	for i, c := range value {
		if i == 8 || i == 13 || i == 18 || i == 23 {
			if c != '-' {
				return false
			}
			continue
		}
		if !strings.ContainsRune("0123456789abcdefABCDEF", c) {
			return false
		}
	}
	return true
}
