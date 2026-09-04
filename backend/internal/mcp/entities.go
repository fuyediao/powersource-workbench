package mcp

import "sort"

// scopeKind describes how rows of an entity are restricted to the caller.
type scopeKind int

const (
	// scopeGroup keeps rows whose group_id is one of the caller's groups.
	scopeGroup scopeKind = iota
	// scopeOwnerOrGroup keeps personal rows (owner column) plus group rows.
	scopeOwnerOrGroup
	// scopeSelf keeps rows owned by the caller only.
	scopeSelf
	// scopeGlobal applies no row filter: the desktop entry key is the whole
	// gate, matching screens that show one shared dataset to everyone allowed
	// into the module (product catalog, T&E admin queues).
	scopeGlobal
	// scopeLeads mirrors the leads RLS policies: unassigned pool rows, the
	// caller's own rows, and — for group admins — rows owned by their members.
	scopeLeads
	// scopeParent restricts rows to children of an already-scoped parent entity.
	scopeParent
	// scopeMyGroups keeps the caller's own group rows (groups.id).
	scopeMyGroups
	// scopeTeamProfiles keeps profiles of users sharing a group with the caller.
	scopeTeamProfiles
)

// parentRef points an entity at the parent whose scope it inherits.
type parentRef struct {
	// Column is the foreign key on this entity's table.
	Column string
	// Entity is the parent entity key.
	Entity string
	// ParentColumn is the parent column the foreign key targets.
	ParentColumn string
}

// entity describes one queryable CRM dataset behind the MCP tools.
//
// Columns is the PostgREST projection. It is "*" only for tables with no
// sensitive column; anything holding a secret, credential, or large binary
// (API keys, password hashes, Yjs blobs) must list its safe columns
// explicitly so a future column cannot leak by default.
type entity struct {
	Key        string
	Table      string
	Desc       string
	Gate       string
	Columns    string
	Search     []string
	OrderCol   string
	Scope      scopeKind
	ScopeCol   string
	Parent     *parentRef
	Write      *writeGate
	Filterable []string
	// Rangeable lists columns that accept inequality filters (column_gte,
	// column_gt, column_lte, column_lt) for period reports and numeric bands.
	Rangeable []string
	// Related lists other entity keys an agent typically follows next.
	Related []string
	// Hint tells an agent how to query this entity (UUID vs business keys).
	Hint string
}

// entities is the Workbench registry: only tables that exist after the curated
// Ask / Mail / Calendar / leftover-customer migrations. Orders, Folio,
// channels, T&E, NEXDOT, and map entities stay out so list_entities does not
// advertise missing tables.
var entities = []entity{
	{
		Key: "customers", Table: "customers", Gate: "desktop_admin",
		Desc:       "CRM customer companies with profile, address, classification, and relationship fields.",
		Columns:    "*",
		Search:     []string{"company_name", "short_name", "customer_code", "contact_name", "email", "phone", "address"},
		OrderCol:   "updated_at",
		Scope:      scopeOwnerOrGroup,
		ScopeCol:   "owner_user_id",
		Write:      &writeGate{Domain: "admin", Resource: "customers"},
		Filterable: []string{"id", "group_id", "owner_user_id", "customer_code", "category", "customer_type", "customer_level", "cooperation_status", "company_country", "company_state"},
		Rangeable:  []string{"created_at", "updated_at"},
		Related:    []string{"customer_contacts"},
		Hint:       "Search company_name, short_name, or customer_code. id is a UUID. Never pass customer_code to get_record. US East/West sales territory: filters.us_region=east|west. company_country / company_state are exact filters. New-customer reports: summarize_records period=month (or created_at_gte / created_at_lt). Logo uploads: upload_file / delete_file (kind customer_logo), not update_record.",
	},
	{
		Key: "customer_contacts", Table: "customer_contacts", Gate: "desktop_admin",
		Desc:       "Contact people attached to a customer.",
		Columns:    "*",
		Search:     []string{"name", "title", "email", "phone", "mobile", "remarks"},
		OrderCol:   "updated_at",
		Scope:      scopeParent,
		Parent:     &parentRef{Column: "customer_id", Entity: "customers", ParentColumn: "id"},
		Write:      &writeGate{Domain: "admin", Resource: "contacts"},
		Filterable: []string{"id", "customer_id", "group_id"},
		Rangeable:  []string{"created_at", "updated_at"},
		Related:    []string{"customers"},
		Hint:       "Filter by customer_id (UUID from customers). Email and name are search fields, not get_record ids. Period reports: summarize_records on created_at.",
	},
	{
		Key: "ask_history", Table: "history", Gate: "desktop_chat",
		Desc:       "Ask conversation threads with the original query and result locations.",
		Columns:    "id,user_id,query,messages,locations,search_location,group_id,assistant_kind,created_at,updated_at",
		Search:     []string{"query"},
		OrderCol:   "updated_at",
		Scope:      scopeOwnerOrGroup,
		ScopeCol:   "user_id",
		Filterable: []string{"id", "group_id", "user_id", "assistant_kind"},
		Rangeable:  []string{"created_at", "updated_at"},
		Hint:       "Ask rows use assistant_kind=ask. Period reports: summarize_records on created_at.",
	},
	{
		Key: "agent_history", Table: "history", Gate: "desktop_agent",
		Desc:       "Harness conversation threads, including resume metadata.",
		Columns:    "id,user_id,query,messages,locations,group_id,assistant_kind,harness_thread_id,created_at,updated_at",
		Search:     []string{"query", "harness_thread_id"},
		OrderCol:   "updated_at",
		Scope:      scopeOwnerOrGroup,
		ScopeCol:   "user_id",
		Filterable: []string{"id", "group_id", "user_id", "assistant_kind", "harness_thread_id"},
		Rangeable:  []string{"created_at", "updated_at"},
		Hint:       "Harness rows use assistant_kind=agent. Filter by harness_thread_id to resume a thread.",
	},
	{
		Key: "calendars", Table: "calendars", Gate: "desktop_calendar",
		Desc:       "Personal and group calendars.",
		Columns:    "*",
		Search:     []string{"name"},
		OrderCol:   "updated_at",
		Scope:      scopeOwnerOrGroup,
		ScopeCol:   "owner_user_id",
		Write:      &writeGate{Domain: "calendar", Resource: "calendars"},
		Filterable: []string{"id", "group_id", "owner_user_id", "is_default"},
		Rangeable:  []string{"created_at", "updated_at"},
	},
	{
		Key: "calendar_events", Table: "calendar_events", Gate: "desktop_calendar",
		Desc:       "Calendar events with start, end, all-day flag, and description.",
		Columns:    "*",
		Search:     []string{"title", "description"},
		OrderCol:   "start_at",
		Scope:      scopeOwnerOrGroup,
		ScopeCol:   "owner_user_id",
		Write:      &writeGate{Domain: "calendar", Resource: "events"},
		Filterable: []string{"id", "group_id", "owner_user_id", "all_day"},
		Rangeable:  []string{"start_at", "end_at", "created_at"},
		Related:    []string{"calendars"},
		Hint:       "Period reports: summarize_records on start_at, or start_at_gte / start_at_lt.",
	},
	{
		Key: "mail_accounts", Table: "mail_accounts", Gate: "desktop_mail",
		Desc:       "Connected mailboxes, owned by a single user (never shared). OAuth tokens and passwords are stored elsewhere and never returned.",
		Columns:    "id,owner_user_id,provider,email,display_name,auth_type,is_primary,status,last_sync_at,created_at,updated_at",
		Search:     []string{"email", "display_name", "provider"},
		OrderCol:   "updated_at",
		Scope:      scopeSelf,
		ScopeCol:   "owner_user_id",
		Filterable: []string{"id", "owner_user_id", "provider", "status"},
		Rangeable:  []string{"created_at", "updated_at", "last_sync_at"},
	},
	{
		Key: "mail_threads", Table: "mail_threads", Gate: "desktop_mail",
		Desc:       "Mail conversation threads with subject, snippet, and counts.",
		Columns:    "*",
		Search:     []string{"subject", "snippet"},
		OrderCol:   "last_message_at",
		Scope:      scopeParent,
		Parent:     &parentRef{Column: "mail_account_id", Entity: "mail_accounts", ParentColumn: "id"},
		Filterable: []string{"id", "mail_account_id", "is_starred", "has_attachments"},
		Rangeable:  []string{"last_message_at"},
		Hint:       "Period reports: summarize_records on last_message_at.",
	},
	{
		Key: "mail_messages", Table: "mail_messages", Gate: "desktop_mail",
		Desc:       "Mail message headers and snippets. Use mail_message_bodies for the full text.",
		Columns:    "*",
		Search:     []string{"subject", "snippet", "from_address", "from_name"},
		OrderCol:   "received_at",
		Scope:      scopeParent,
		Parent:     &parentRef{Column: "mail_account_id", Entity: "mail_accounts", ParentColumn: "id"},
		Filterable: []string{"id", "mail_account_id", "thread_id", "folder_id", "is_read", "is_sent", "is_draft"},
		Rangeable:  []string{"received_at", "created_at"},
		Related:    []string{"mail_threads", "mail_message_bodies"},
		Hint:       "Search subject or from_address. Full body is mail_message_bodies filtered by message_id. Period reports: summarize_records on received_at.",
	},
	{
		Key: "mail_message_bodies", Table: "mail_message_bodies", Gate: "desktop_mail",
		Desc:       "Plain-text and HTML bodies for a mail message. Raw MIME files are not exposed.",
		Columns:    "id,message_id,body_text,body_html,created_at",
		Search:     []string{"body_text"},
		OrderCol:   "created_at",
		Scope:      scopeParent,
		Parent:     &parentRef{Column: "message_id", Entity: "mail_messages", ParentColumn: "id"},
		Filterable: []string{"id", "message_id"},
		Rangeable:  []string{"created_at"},
		Related:    []string{"mail_messages"},
		Hint:       "Filter by message_id. Fetch one body at a time; HTML can be large.",
	},
	{
		Key: "groups", Table: "groups", Gate: "desktop_team",
		Desc:       "CRM groups the caller belongs to.",
		Columns:    "id,name,description,group_admin_id,is_temp_managed,created_at,updated_at",
		Search:     []string{"name", "description"},
		OrderCol:   "created_at",
		Scope:      scopeMyGroups,
		Filterable: []string{"id"},
		Rangeable:  []string{"created_at", "updated_at"},
	},
	{
		Key: "group_members", Table: "group_members", Gate: "desktop_team",
		Desc:       "Membership rows for the caller's groups.",
		Columns:    "*",
		OrderCol:   "added_at",
		Scope:      scopeGroup,
		Filterable: []string{"id", "group_id", "user_id", "is_active"},
		Rangeable:  []string{"added_at"},
	},
	{
		Key: "team_profiles", Table: "profiles", Gate: "desktop_team",
		Desc:       "Directory profiles of people in the caller's groups. AI provider keys are never returned.",
		Columns:    "id,full_name,display_name,email,employee_id,organization,phone_number,bio,language,avatar_url,created_at,updated_at",
		Search:     []string{"full_name", "display_name", "email", "employee_id", "organization"},
		OrderCol:   "updated_at",
		Scope:      scopeTeamProfiles,
		Filterable: []string{"id", "employee_id"},
		Rangeable:  []string{"created_at", "updated_at"},
		Hint:       "Read-only directory. Your own avatar: upload_file / delete_file (kind profile_avatar, self_only) — this cannot be used on teammates.",
	},
}

// entityIndex allows O(1) lookup by entity key.
var entityIndex = func() map[string]*entity {
	index := make(map[string]*entity, len(entities))
	for i := range entities {
		index[entities[i].Key] = &entities[i]
	}
	return index
}()

// entityList returns the registry in declaration order.
func entityList() []entity {
	return entities
}

// lookupEntity resolves an entity key, or nil when unknown.
func lookupEntity(key string) *entity {
	return entityIndex[key]
}

// allowedEntities returns the entity keys the caller may read, sorted so the
// tool schema enum is stable between calls.
func allowedEntities(acc *access) []string {
	out := make([]string, 0, len(entities))
	for i := range entities {
		if entities[i].Gate == "" || acc.hasModule(entities[i].Gate) {
			out = append(out, entities[i].Key)
		}
	}
	sort.Strings(out)
	return out
}

// rangeableEntities returns readable entity keys that accept date/numeric
// range filters and therefore period reports.
func rangeableEntities(acc *access) []string {
	out := make([]string, 0, 16)
	for _, key := range allowedEntities(acc) {
		ent := lookupEntity(key)
		if ent != nil && len(ent.Rangeable) > 0 {
			out = append(out, key)
		}
	}
	return out
}

// writableEntities returns the entity keys the caller may mutate for the given
// action.
func writableEntities(acc *access, action string) []string {
	out := make([]string, 0, len(entities))
	for i := range entities {
		ent := &entities[i]
		if ent.Write == nil {
			continue
		}
		if ent.Gate != "" && !acc.hasModule(ent.Gate) {
			continue
		}
		// Global leaders read across groups but never mutate through MCP.
		if acc.GlobalLeader && !acc.Unrestricted && len(acc.AdminGroupIDs) == 0 {
			continue
		}
		if !acc.canWrite(*ent.Write, action) {
			continue
		}
		out = append(out, ent.Key)
	}
	sort.Strings(out)
	return out
}
