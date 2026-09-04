package mcp

import (
	"fmt"
	"strings"
)

// keyPlaceholder stands in for the secret when the plaintext key is not being
// revealed, so the copied prompt is still complete and safe to paste.
const keyPlaceholder = "<YOUR_GEOCRM_MCP_KEY>"

// buildSetupPrompt returns the English one-shot instruction a user pastes into
// Codex, Cursor, or Claude to register this server in a single step. Gemini
// is not covered by this prompt: it only supports OAuth, configured from the
// separate Gemini panel in GeoCRM Settings.
//
// The body is always English regardless of the app UI language: it is an agent
// instruction, not user-facing copy. plaintextKey is embedded only right after
// a key is minted, when the secret is being shown once; otherwise the caller
// passes an empty string and the prompt tells the user to substitute one of
// their saved keys.
func buildSetupPrompt(endpoint, plaintextKey string, acc *access) string {
	key := plaintextKey
	keyNote := "This key was just generated and is shown only once. Store it in a password manager."
	if key == "" {
		key = keyPlaceholder
		keyNote = "Replace the placeholder with one of your GeoCRM MCP keys from GeoCRM Settings. If you no longer have any saved, create a new key there."
	}

	var b strings.Builder
	b.WriteString("Add a Model Context Protocol (MCP) server named \"geocrm\" to my configuration, then verify it connects.\n\n")
	b.WriteString("Connection details:\n")
	b.WriteString("- Transport: Streamable HTTP\n")
	b.WriteString(fmt.Sprintf("- URL: %s\n", endpoint))
	b.WriteString("- Authentication: send the HTTP header `Authorization: Bearer <key>`\n")
	b.WriteString(fmt.Sprintf("- Key: %s\n", key))
	b.WriteString(fmt.Sprintf("- Note: %s\n\n", keyNote))

	b.WriteString("For Codex CLI, add this to ~/.codex/config.toml and export the key as GEOCRM_MCP_KEY:\n\n")
	b.WriteString("```toml\n")
	b.WriteString("[mcp_servers.geocrm]\n")
	b.WriteString(fmt.Sprintf("url = %q\n", endpoint))
	b.WriteString("bearer_token_env_var = \"GEOCRM_MCP_KEY\"\n")
	b.WriteString("```\n\n")

	b.WriteString("For Cursor (~/.cursor/mcp.json), Claude Desktop, or any client using the mcpServers object, add:\n\n")
	b.WriteString("```json\n")
	b.WriteString("{\n  \"mcpServers\": {\n    \"geocrm\": {\n")
	b.WriteString(fmt.Sprintf("      \"url\": %q,\n", endpoint))
	b.WriteString(fmt.Sprintf("      \"headers\": { \"Authorization\": \"Bearer %s\" }\n", key))
	b.WriteString("    }\n  }\n}\n")
	b.WriteString("```\n\n")

	b.WriteString("For clients that take a top-level server object (no mcpServers wrapper), add:\n\n")
	b.WriteString("```json\n")
	b.WriteString("{\n  \"geocrm\": {\n")
	b.WriteString(fmt.Sprintf("    \"url\": %q,\n", endpoint))
	b.WriteString("    \"headers\": {\n")
	b.WriteString(fmt.Sprintf("      \"Authorization\": \"Bearer %s\"\n", key))
	b.WriteString("    }\n  }\n}\n")
	b.WriteString("```\n\n")

	b.WriteString("How to use the server once it is connected:\n")
	b.WriteString("1. Call `list_my_access` first to see my role, groups, and permissions.\n")
	b.WriteString("2. Call `list_entities` to see which GeoCRM datasets I may read, their searchable/filterable fields, related_entities, and query_hint.\n")
	b.WriteString("3. Use `search_records` to find rows (query, exact filters, or range filters such as bill_date_gte / bill_date_lt). Use `summarize_records` for week, month, quarter, half-year, and year reports (period + year, or date_from/date_to). Use `get_record` only with the UUID `id_field` from list_entities. Use `count_records` for totals. Use `create_record`, `update_record`, or `delete_record` only when `list_entities` reports the matching write action.\n")
	b.WriteString("4. To upload a logo, avatar, visit photo/document, customer document, opportunity attachment, competitor photo, catalog image, or KOL contract file, call `list_upload_kinds` first, then `upload_file` (or `prepare_upload`/`finalize_upload` for a large document). Never write logo_url, avatar_url, image URL arrays, or document arrays through `create_record`/`update_record`; those columns are rejected.\n")
	if acc != nil {
		if readable := allowedEntities(acc); len(readable) > 0 {
			b.WriteString(fmt.Sprintf("   Entities available to me right now include: %s.\n", summariseEntityKeys(readable, 12)))
		}
	}
	b.WriteString("\nImportant rules:\n")
	b.WriteString("- Every result is already restricted to the data my GeoCRM account is allowed to see. Never try to work around a permission error; report it to me instead.\n")
	b.WriteString("- get_record requires a UUID. Bill numbers (external_id), customer codes, SKUs, and emails are not ids; search them with search_records query or filters.\n")
	b.WriteString("- On orders, query matches BillNo and product names, not customer company names. Look up customers first, then filter orders by customer_id — or use filters.us_region=east|west (US sales territories) with optional source=erp. Prefer summarize_records for monthly/weekly/quarterly/half-year/annual sales reports. Prefer the default limit of 25 when listing rows.\n")
	b.WriteString("- US East/West questions (customers, ERP orders, opportunities, visits, and other customer-linked rows) use filters.us_region on customers or any entity with customer_id. When asked how East/West is divided, call list_entities and quote us_sales_territories in full; do not invent or truncate state lists.\n")
	b.WriteString("- Treat the key as a secret. Never commit it, print it in shared logs, or paste it into a public issue.\n")
	b.WriteString("- If the key is ever exposed, tell me to delete it in GeoCRM Settings under Model Context Protocol and create a new one; deleting immediately invalidates that key.\n")
	return b.String()
}
