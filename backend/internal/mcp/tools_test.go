package mcp

import (
	"encoding/json"
	"strings"
	"testing"
	"unicode"
)

func TestToolAnnotationsDescribeSideEffects(t *testing.T) {
	acc := memberAccess("desktop_admin")
	acc.writes[writeKey("admin", "customers", "insert")] = true
	acc.writes[writeKey("admin", "customers", "update")] = true
	acc.writes[writeKey("admin", "customers", "delete")] = true

	tools := buildTools(acc)
	byName := make(map[string]toolDescriptor, len(tools))
	for _, tool := range tools {
		byName[tool.Name] = tool
	}

	for _, name := range []string{toolListMyAccess, toolListEntities, toolSearchRecords, toolGetRecord, toolCountRecords, toolSummarizeRecords} {
		annotations := byName[name].Annotations
		if annotations == nil || !annotations.ReadOnlyHint || annotations.DestructiveHint || !annotations.IdempotentHint || annotations.OpenWorldHint {
			t.Fatalf("read tool %s has unsafe or incomplete annotations: %#v", name, annotations)
		}
	}

	if annotations := byName[toolCreateRecord].Annotations; annotations == nil || annotations.ReadOnlyHint || annotations.DestructiveHint || annotations.IdempotentHint {
		t.Fatalf("create_record annotations are incorrect: %#v", annotations)
	}
	for _, name := range []string{toolUpdateRecord, toolDeleteRecord} {
		annotations := byName[name].Annotations
		if annotations == nil || annotations.ReadOnlyHint || !annotations.DestructiveHint || !annotations.IdempotentHint {
			t.Fatalf("mutation tool %s annotations are incorrect: %#v", name, annotations)
		}
	}

	encoded, err := json.Marshal(byName[toolSearchRecords])
	if err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{`"readOnlyHint":true`, `"destructiveHint":false`, `"idempotentHint":true`, `"openWorldHint":false`} {
		if !strings.Contains(string(encoded), field) {
			t.Fatalf("serialized search_records descriptor is missing %s: %s", field, encoded)
		}
	}
}

// memberAccess builds a plain group member with the given entry keys.
func memberAccess(modules ...string) *access {
	acc := &access{
		UserID:   "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
		GroupIDs: []string{"11111111-2222-3333-4444-555555555555"},
		modules:  map[string]bool{},
		writes:   map[string]bool{},
	}
	for _, key := range modules {
		acc.modules[key] = true
	}
	return acc
}

func TestAllowedEntitiesHidesUngatedModules(t *testing.T) {
	acc := memberAccess("desktop_admin")
	allowed := allowedEntities(acc)

	if !contains(allowed, "customers") {
		t.Fatal("desktop_admin should expose customers")
	}
	if contains(allowed, "te_submissions") {
		t.Fatal("te_submissions leaked without the desktop_te_admin entry key")
	}
}

func TestSystemAdminSeesEveryEntity(t *testing.T) {
	acc := &access{UserID: "3f2504e0-4f89-11d3-9a0c-0305e82c3301", Unrestricted: true, modules: map[string]bool{}, writes: map[string]bool{}}
	if got, want := len(allowedEntities(acc)), len(entityList()); got != want {
		t.Fatalf("system admin sees %d entities, want all %d", got, want)
	}
}

func TestAuthorizeWriteDeniesWithoutGrant(t *testing.T) {
	acc := memberAccess("desktop_admin")
	customers := lookupEntity("customers")

	if err := authorizeWrite(acc, customers, "update"); err == nil {
		t.Fatal("update allowed without a desktop write grant")
	}

	acc.writes[writeKey("admin", "customers", "update")] = true
	if err := authorizeWrite(acc, customers, "update"); err != nil {
		t.Fatalf("update denied despite a matching grant: %v", err)
	}
	if err := authorizeWrite(acc, customers, "delete"); err == nil {
		t.Fatal("an update grant must not imply a delete grant")
	}
}

func TestAuthorizeWriteDeniesReadOnlyEntity(t *testing.T) {
	acc := memberAccess("desktop_admin")
	acc.Unrestricted = true
	if err := authorizeWrite(acc, lookupEntity("team_profiles"), "insert"); err == nil {
		t.Fatal("read-only entity accepted a write even for a system admin")
	}
}

func TestGlobalLeaderIsReadOnly(t *testing.T) {
	acc := memberAccess("desktop_admin")
	acc.GlobalLeader = true
	acc.writes[writeKey("admin", "customers", "update")] = true

	if err := authorizeWrite(acc, lookupEntity("customers"), "update"); err == nil {
		t.Fatal("global leader was allowed to mutate")
	}
	if !contains(allowedEntities(acc), "customers") {
		t.Fatal("global leader lost read access to customers")
	}
}

func TestBuildToolsHidesWriteToolsWithoutGrants(t *testing.T) {
	acc := memberAccess("desktop_admin")
	names := toolNames(buildTools(acc))

	for _, required := range []string{toolListMyAccess, toolListEntities, toolSearchRecords, toolGetRecord, toolCountRecords, toolSummarizeRecords} {
		if !contains(names, required) {
			t.Fatalf("missing read tool %s", required)
		}
	}
	for _, forbidden := range []string{toolCreateRecord, toolUpdateRecord, toolDeleteRecord} {
		if contains(names, forbidden) {
			t.Fatalf("write tool %s exposed without any grant", forbidden)
		}
	}

	acc.writes[writeKey("admin", "customers", "insert")] = true
	if !contains(toolNames(buildTools(acc)), toolCreateRecord) {
		t.Fatal("create_record hidden despite an insert grant")
	}
}

func TestSearchToolEnumMatchesGrantedEntities(t *testing.T) {
	acc := memberAccess("desktop_admin")
	for _, tool := range buildTools(acc) {
		if tool.Name != toolSearchRecords {
			continue
		}
		properties, _ := tool.InputSchema["properties"].(map[string]any)
		entityProp, _ := properties["entity"].(map[string]any)
		enum, _ := entityProp["enum"].([]string)
		if !contains(enum, "customers") {
			t.Fatal("customers missing from the entity enum")
		}
		if contains(enum, "mail_messages") {
			t.Fatal("mail_messages leaked after local-only mail")
		}
		return
	}
	t.Fatal("search_records tool not built")
}

func TestToolAvailableGuardsHiddenTools(t *testing.T) {
	acc := memberAccess("desktop_admin")
	if toolAvailable(acc, toolDeleteRecord) {
		t.Fatal("delete_record callable without a grant")
	}
	if !toolAvailable(acc, toolSearchRecords) {
		t.Fatal("search_records should be callable")
	}
}

func TestEntityRegistryIsConsistent(t *testing.T) {
	seen := map[string]bool{}
	for _, ent := range entityList() {
		if seen[ent.Key] {
			t.Fatalf("duplicate entity key %s", ent.Key)
		}
		seen[ent.Key] = true

		if ent.Desc == "" || ent.Table == "" || ent.Columns == "" {
			t.Fatalf("entity %s is missing description, table, or column projection", ent.Key)
		}
		if ent.Gate != "" && !contains(desktopModuleKeys, ent.Gate) {
			t.Fatalf("entity %s uses unknown desktop entry key %s", ent.Key, ent.Gate)
		}
		if ent.Write != nil {
			if _, ok := writeDomainTables[ent.Write.Domain]; !ok {
				t.Fatalf("entity %s uses unknown write domain %s", ent.Key, ent.Write.Domain)
			}
		}
		switch ent.Scope {
		case scopeOwnerOrGroup, scopeSelf:
			if ent.ScopeCol == "" {
				t.Fatalf("entity %s needs an owner column for its scope", ent.Key)
			}
		case scopeParent:
			if ent.Parent == nil || lookupEntity(ent.Parent.Entity) == nil {
				t.Fatalf("entity %s has an unresolvable parent", ent.Key)
			}
		}
		for _, related := range ent.Related {
			if lookupEntity(related) == nil {
				t.Fatalf("entity %s lists unknown related entity %s", ent.Key, related)
			}
		}
		for _, column := range ent.Rangeable {
			if column == "" {
				t.Fatalf("entity %s has an empty rangeable column", ent.Key)
			}
		}
	}
}

// TestSensitiveColumnsAreNeverProjected keeps credentials and large binaries
// out of every tool response.
func TestSensitiveColumnsAreNeverProjected(t *testing.T) {
	forbidden := []string{
		"password_hash", "key_hash", "gemini_api_key", "openai_api_key",
		"anthropic_api_key", "grok_api_key", "yjs_state", "raw_mime_path",
		"raw_payload", "access_token", "refresh_token", "client_secret",
		"raw_header", "raw_line",
	}
	explicit := map[string]bool{
		"profiles":              true,
		"proxy_agent_accounts":  true,
		"folio_pages":           true,
		"channel_messages":      true,
		"customer_documents":    true,
		"groups":                true,
		"product_catalog_price": true,
		"orders":                true,
		"erp_order_lines":       true,
	}
	for _, ent := range entityList() {
		for _, column := range forbidden {
			if strings.Contains(ent.Columns, column) {
				t.Fatalf("entity %s projects sensitive column %s", ent.Key, column)
			}
		}
		if explicit[ent.Table] && ent.Columns == "*" {
			t.Fatalf("entity %s must list safe columns explicitly instead of *", ent.Key)
		}
	}
	if lookupEntity("mcp_api_keys") != nil {
		t.Fatal("mcp_api_keys must never be a readable entity")
	}
}

func TestBroadDomainCoverage(t *testing.T) {
	admin := &access{UserID: "3f2504e0-4f89-11d3-9a0c-0305e82c3301", Unrestricted: true, modules: map[string]bool{}, writes: map[string]bool{}}
	allowed := allowedEntities(admin)
	for _, required := range []string{
		"customers", "customer_contacts", "team_profiles",
	} {
		if !contains(allowed, required) {
			t.Fatalf("entity %s missing from the tool surface", required)
		}
	}
}

func TestSetupPromptIsEnglishAndActionable(t *testing.T) {
	const endpoint = "https://api.example.com/mcp"
	acc := memberAccess("desktop_admin")

	withoutKey := buildSetupPrompt(endpoint, "", acc)
	if !strings.Contains(withoutKey, endpoint) {
		t.Fatal("prompt does not contain the server URL")
	}
	if !strings.Contains(withoutKey, keyPlaceholder) {
		t.Fatal("prompt without a revealed key should carry the placeholder")
	}
	if !strings.Contains(withoutKey, "mcpServers") {
		t.Fatal("prompt does not include the mcpServers JSON shape")
	}
	if !strings.Contains(withoutKey, `"geocrm"`) {
		t.Fatal("prompt does not include a top-level geocrm JSON server object")
	}
	if !strings.Contains(withoutKey, "Authorization: Bearer") {
		t.Fatal("prompt does not explain bearer authentication")
	}
	if !strings.Contains(withoutKey, "delete") {
		t.Fatal("prompt does not tell the user what to do if the key leaks")
	}
	if !strings.Contains(withoutKey, "UUID") {
		t.Fatal("prompt does not tell the agent that get_record ids are UUIDs")
	}
	if !strings.Contains(withoutKey, "customer_id") {
		t.Fatal("prompt does not explain how to join customer-linked records")
	}
	if !strings.Contains(withoutKey, "summarize_records") {
		t.Fatal("prompt does not mention period reports")
	}
	for _, r := range withoutKey {
		if unicode.Is(unicode.Han, r) || unicode.Is(unicode.Hiragana, r) || unicode.Is(unicode.Hangul, r) {
			t.Fatalf("prompt must be English only, found %q", r)
		}
	}

	withKey := buildSetupPrompt(endpoint, "gcrm_mcp_secret", acc)
	if !strings.Contains(withKey, "gcrm_mcp_secret") {
		t.Fatal("prompt should embed the key right after it is revealed")
	}
	if strings.Contains(withKey, keyPlaceholder) {
		t.Fatal("prompt should not keep the placeholder once the key is embedded")
	}
}

func TestDescribeEntitiesIncludesQueryHints(t *testing.T) {
	acc := memberAccess("desktop_admin")
	payload := describeEntities(acc)
	note, _ := payload["note"].(string)
	if !strings.Contains(note, "UUID") || !strings.Contains(note, "customer code") {
		t.Fatalf("list_entities note is missing query guidance: %s", note)
	}
	entities, _ := payload["entities"].([]map[string]any)
	var customers map[string]any
	for _, item := range entities {
		if item["entity"] == "customers" {
			customers = item
			break
		}
	}
	if customers == nil {
		t.Fatal("customers missing from list_entities")
	}
	hint, _ := customers["query_hint"].(string)
	if !strings.Contains(hint, "customer_code") || !strings.Contains(hint, "summarize_records") {
		t.Fatalf("customers query_hint is too thin: %s", hint)
	}
	rangeable, _ := customers["rangeable_fields"].([]string)
	if !contains(rangeable, "created_at") {
		t.Fatalf("customers rangeable_fields = %v", rangeable)
	}
	search, _ := customers["searchable_fields"].([]string)
	if !contains(search, "company_name") {
		t.Fatal("customers searchable_fields should include company_name")
	}
	related, _ := customers["related_entities"].([]string)
	if !contains(related, "customer_contacts") {
		t.Fatalf("customers related_entities incomplete: %v", related)
	}
	if customers["report_date_field"] != "created_at" {
		t.Fatalf("customers report_date_field = %v", customers["report_date_field"])
	}
}

func TestRangeableEntitiesCoverCRMCore(t *testing.T) {
	acc := memberAccess("desktop_admin")
	keys := rangeableEntities(acc)
	for _, required := range []string{
		"customers", "customer_contacts",
	} {
		if !contains(keys, required) {
			t.Fatalf("period reports missing entity %s", required)
		}
	}
	if defaultReportDateField(lookupEntity("customers")) != "created_at" {
		t.Fatal("customers should report on created_at")
	}
}

func TestRelatedEntitiesHidesUngrantedKeys(t *testing.T) {
	acc := memberAccess("desktop_admin")
	payload := describeEntities(acc)
	entities, _ := payload["entities"].([]map[string]any)
	for _, item := range entities {
		if item["entity"] != "customer_contacts" {
			continue
		}
		related, _ := item["related_entities"].([]string)
		if contains(related, "mail_threads") {
			t.Fatal("customer_contacts related_entities leaked mail_threads")
		}
		if !contains(related, "customers") {
			t.Fatal("customer_contacts related_entities dropped customers")
		}
		return
	}
	t.Fatal("customer_contacts missing from list_entities")
}

func TestValidateRecordIDRejectsBusinessKeys(t *testing.T) {
	if err := validateRecordID("3f2504e0-4f89-11d3-9a0c-0305e82c3301"); err != nil {
		t.Fatalf("valid UUID rejected: %v", err)
	}
	if err := validateRecordID("NTNA260602SF"); err == nil {
		t.Fatal("BillNo accepted as get_record id")
	} else if !strings.Contains(err.Error(), "search_records") {
		t.Fatalf("business-key error should point at search_records: %v", err)
	}
	if err := validateRecordID("NTSHOPIFY"); err == nil {
		t.Fatal("customer code accepted as get_record id")
	}
}

// toolNames extracts descriptor names for assertions.
func toolNames(tools []toolDescriptor) []string {
	out := make([]string, 0, len(tools))
	for _, tool := range tools {
		out = append(out, tool.Name)
	}
	return out
}
