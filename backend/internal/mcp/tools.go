package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

// Tool names exposed over MCP.
const (
	toolListMyAccess     = "list_my_access"
	toolListEntities     = "list_entities"
	toolSearchRecords    = "search_records"
	toolGetRecord        = "get_record"
	toolCountRecords     = "count_records"
	toolSummarizeRecords = "summarize_records"
	toolCreateRecord     = "create_record"
	toolUpdateRecord     = "update_record"
	toolDeleteRecord     = "delete_record"
	toolListUploadKinds  = "list_upload_kinds"
	toolUploadFile       = "upload_file"
	toolPrepareUpload    = "prepare_upload"
	toolFinalizeUpload   = "finalize_upload"
	toolDeleteFile       = "delete_file"
)

var (
	readOnlyToolAnnotations = &toolAnnotations{
		ReadOnlyHint:    true,
		DestructiveHint: false,
		IdempotentHint:  true,
		OpenWorldHint:   false,
	}
	createToolAnnotations = &toolAnnotations{
		ReadOnlyHint:    false,
		DestructiveHint: false,
		IdempotentHint:  false,
		OpenWorldHint:   false,
	}
	updateToolAnnotations = &toolAnnotations{
		ReadOnlyHint:    false,
		DestructiveHint: true,
		IdempotentHint:  true,
		OpenWorldHint:   false,
	}
	deleteToolAnnotations = &toolAnnotations{
		ReadOnlyHint:    false,
		DestructiveHint: true,
		IdempotentHint:  true,
		OpenWorldHint:   false,
	}
)

// buildTools returns the tool catalog for one caller. Entity enums are built
// from the caller's grants, so an agent never sees a dataset it cannot read and
// never sees a mutation it cannot perform.
func buildTools(acc *access) []toolDescriptor {
	readable := allowedEntities(acc)
	tools := []toolDescriptor{
		{
			Name:        toolListMyAccess,
			Title:       "List my access",
			Description: "Return the caller's GeoCRM role, groups, granted desktop modules, and write grants. Call this first to understand what the current key is allowed to do.",
			InputSchema: objectSchema(nil, nil),
			Annotations: readOnlyToolAnnotations,
		},
		{
			Name:        toolListEntities,
			Title:       "List entities",
			Description: "List every GeoCRM data entity the caller may read, with its description, searchable fields, filterable fields, rangeable fields (column_gte / column_lt), related entities, query_hint, and allowed write actions. Call this before search_records, summarize_records, or get_record.",
			InputSchema: objectSchema(nil, nil),
			Annotations: readOnlyToolAnnotations,
		},
	}
	if len(readable) == 0 {
		return tools
	}

	entityProp := map[string]any{
		"type":        "string",
		"description": "Entity key from list_entities. Do not invent names.",
		"enum":        readable,
	}

	tools = append(tools,
		toolDescriptor{
			Name:        toolSearchRecords,
			Title:       "Search records",
			Description: "Search or list rows of a GeoCRM entity. query only matches searchable_fields from list_entities (for orders: BillNo/external_id and product_name, not company names — look up customers first, then filters.customer_id). Prefer the default limit of 25; do not request 200 rows unless paging. Results are always restricted to the caller's groups and desktop permissions.",
			InputSchema: objectSchema(map[string]any{
				"entity": entityProp,
				"query": map[string]any{
					"type":        "string",
					"description": "Case-insensitive substring across searchable_fields. Omit to list. Business keys such as BillNo, customer_code, SKU, and email belong here or in filters, not in get_record.",
				},
				"filters": map[string]any{
					"type": "object",
					"description": "Filters keyed by column name. Exact match for filterable_fields (customer_id, external_id). " +
						"Virtual filters.us_region=east|west (eastern/western aliases accepted) matches the CRM US sales territories on customers.company_state; " +
						"on orders/opportunities and other customer_id entities it keeps rows linked to those customers. " +
						"Rangeable columns also accept column_gte, column_gt, column_lte, column_lt (for example bill_date_gte, amount_gte). Half-open date bands: bill_date_gte + bill_date_lt.",
					"additionalProperties": map[string]any{"type": "string"},
				},
				"order_by": map[string]any{
					"type":        "string",
					"description": "Column to sort by. Defaults to the entity's natural recency column.",
				},
				"ascending": map[string]any{
					"type":        "boolean",
					"description": "Sort ascending instead of descending. Defaults to false.",
				},
				"limit": map[string]any{
					"type":        "integer",
					"description": fmt.Sprintf("Rows to return, 1-%d. Defaults to %d. Keep this small; large pages waste context.", maxRows, defaultRows),
					"minimum":     1,
					"maximum":     maxRows,
				},
				"offset": map[string]any{
					"type":        "integer",
					"description": "Rows to skip, for paging.",
					"minimum":     0,
				},
			}, []string{"entity"}),
			Annotations: readOnlyToolAnnotations,
		},
		toolDescriptor{
			Name:        toolGetRecord,
			Title:       "Get record",
			Description: "Fetch a single row by its UUID primary key (id_field from list_entities). Bill numbers, customer codes, emails, and SKUs are not ids — use search_records. Returns not found when the UUID exists but lies outside the caller's permissions.",
			InputSchema: objectSchema(map[string]any{
				"entity": entityProp,
				"id":     map[string]any{"type": "string", "description": "UUID primary key. Not a BillNo, customer code, email, or SKU."},
			}, []string{"entity", "id"}),
			Annotations: readOnlyToolAnnotations,
		},
		toolDescriptor{
			Name:        toolCountRecords,
			Title:       "Count records",
			Description: "Count rows of a GeoCRM entity matching a search term and filters, without transferring the rows.",
			InputSchema: objectSchema(map[string]any{
				"entity": entityProp,
				"query":  map[string]any{"type": "string", "description": "Optional case-insensitive text match."},
				"filters": map[string]any{
					"type":                 "object",
					"description":          "Exact-match or range filters (column_gte / column_lt) keyed by column name. Includes virtual us_region=east|west on customers and customer_id entities.",
					"additionalProperties": map[string]any{"type": "string"},
				},
			}, []string{"entity"}),
			Annotations: readOnlyToolAnnotations,
		},
	)

	if reportable := rangeableEntities(acc); len(reportable) > 0 {
		tools = append(tools, toolDescriptor{
			Name:  toolSummarizeRecords,
			Title: "Summarize records",
			Description: "Period report (week, month, quarter, half_year, year, or custom date_from/date_to) without transferring every row. " +
				"Works on orders, opportunities, customers, leads, competitor shops/lines, KOLs, follow-ups, visits, T&E, mail, and other rangeable entities. " +
				"Returns counts, optional amount totals, breakdowns, ISO-week buckets, and top rows. " +
				"Dates use Asia/Taipei unless timezone is set. Extra filters and group_by still apply. " +
				"Prefer this over paging search_records for monthly/weekly/quarterly/half-year/annual reports.",
			InputSchema: objectSchema(map[string]any{
				"entity": map[string]any{
					"type":        "string",
					"description": "Entity key with rangeable date/amount fields (see list_entities rangeable_fields).",
					"enum":        reportable,
				},
				"period": map[string]any{
					"type":        "string",
					"enum":        []string{periodWeek, periodMonth, periodQuarter, periodHalfYear, periodYear},
					"description": "Preset window. Omit when using date_from and date_to.",
				},
				"year": map[string]any{
					"type":        "integer",
					"description": "Calendar year for month/quarter/half_year/year, or ISO week-year for period=week.",
					"minimum":     2000,
					"maximum":     2100,
				},
				"week":    map[string]any{"type": "integer", "description": "ISO week 1–53. Required when period=week.", "minimum": 1, "maximum": 53},
				"month":   map[string]any{"type": "integer", "description": "Month 1–12. Required when period=month.", "minimum": 1, "maximum": 12},
				"quarter": map[string]any{"type": "integer", "description": "Quarter 1–4. Required when period=quarter.", "minimum": 1, "maximum": 4},
				"half":    map[string]any{"type": "integer", "description": "1 = Jan–Jun, 2 = Jul–Dec. Required when period=half_year.", "minimum": 1, "maximum": 2},
				"date_from": map[string]any{
					"type":        "string",
					"description": "Inclusive start date YYYY-MM-DD for a custom range (with date_to).",
				},
				"date_to": map[string]any{
					"type":        "string",
					"description": "Inclusive end date YYYY-MM-DD for a custom range (with date_from).",
				},
				"timezone": map[string]any{
					"type":        "string",
					"description": "IANA timezone for calendar bounds. Defaults to Asia/Taipei.",
				},
				"date_field": map[string]any{
					"type":        "string",
					"description": "Rangeable date column. Defaults to report_date_field from list_entities (bill_date on orders, expected_close_date on opportunities, created_at on customers/leads/competitors).",
				},
				"group_by": map[string]any{
					"type":        "string",
					"description": "Extra breakdown column from filterable_fields (for example country, stage, status). Do not use id.",
				},
				"query": map[string]any{"type": "string", "description": "Optional text match, same as search_records."},
				"filters": map[string]any{
					"type": "object",
					"description": "Extra exact or range filters (source, status, customer_id, amount_gte, us_region=east|west). " +
						"Period already applies the date band. us_region uses the same US East/West customer territories as the customers pane.",
					"additionalProperties": map[string]any{"type": "string"},
				},
				"include_lines": map[string]any{
					"type":        "boolean",
					"description": "On orders, include top SKUs from line items. Defaults to true.",
				},
				"top": map[string]any{
					"type":        "integer",
					"description": "How many customers, SKUs, and large orders to return. Defaults to 10, max 25.",
					"minimum":     1,
					"maximum":     maxTopN,
				},
			}, []string{"entity"}),
			Annotations: readOnlyToolAnnotations,
		})
	}

	if creatable := writableEntities(acc, "insert"); len(creatable) > 0 {
		tools = append(tools, toolDescriptor{
			Name:        toolCreateRecord,
			Title:       "Create record",
			Description: "Insert a new row. Only entities the caller holds an insert grant for are listed. New rows are forced into one of the caller's groups.",
			InputSchema: objectSchema(map[string]any{
				"entity": map[string]any{"type": "string", "description": "Entity key to insert into.", "enum": creatable},
				"values": map[string]any{"type": "object", "description": "Column values for the new row."},
			}, []string{"entity", "values"}),
			Annotations: createToolAnnotations,
		})
	}
	if updatable := writableEntities(acc, "update"); len(updatable) > 0 {
		tools = append(tools, toolDescriptor{
			Name:        toolUpdateRecord,
			Title:       "Update record",
			Description: "Patch an existing row the caller can already read. Only entities the caller holds an update grant for are listed.",
			InputSchema: objectSchema(map[string]any{
				"entity": map[string]any{"type": "string", "description": "Entity key to update.", "enum": updatable},
				"id":     map[string]any{"type": "string", "description": "UUID primary key of the row."},
				"values": map[string]any{"type": "object", "description": "Columns to change."},
			}, []string{"entity", "id", "values"}),
			Annotations: updateToolAnnotations,
		})
	}
	if deletable := writableEntities(acc, "delete"); len(deletable) > 0 {
		tools = append(tools, toolDescriptor{
			Name:        toolDeleteRecord,
			Title:       "Delete record",
			Description: "Delete a row the caller can already read. Only entities the caller holds a delete grant for are listed.",
			InputSchema: objectSchema(map[string]any{
				"entity": map[string]any{"type": "string", "description": "Entity key to delete from.", "enum": deletable},
				"id":     map[string]any{"type": "string", "description": "UUID primary key of the row."},
			}, []string{"entity", "id"}),
			Annotations: deleteToolAnnotations,
		})
	}

	tools = append(tools, buildUploadTools(acc)...)
	return tools
}

// buildUploadTools adds the CRM image/document upload tools, scoped to the
// upload kinds the caller's desktop write grants currently allow.
func buildUploadTools(acc *access) []toolDescriptor {
	kinds := allowedUploadKinds(acc)
	if len(kinds) == 0 {
		return nil
	}
	tools := []toolDescriptor{
		{
			Name:        toolListUploadKinds,
			Title:       "List upload kinds",
			Description: "List the CRM image/document upload kinds available to the caller: bucket rules, MIME/size caps, parent entity, and whether prepare_upload/finalize_upload applies. Call this before upload_file.",
			InputSchema: objectSchema(nil, nil),
			Annotations: readOnlyToolAnnotations,
		},
		{
			Name:  toolUploadFile,
			Title: "Upload file",
			Description: "Upload a CRM image or document and patch the owning record (logo, avatar, visit photo/doc, customer document, opportunity attachment, competitor photo, catalog image, or KOL contract file). " +
				"Provide kind (from list_upload_kinds), parent_id (the kind's parent_entity UUID; omit for self_only kinds), filename, mime_type, and exactly one of data_base64 or source_url. " +
				"Images are converted to WebP server-side. For document kinds over a few MB, use prepare_upload/finalize_upload instead of a giant data_base64 payload.",
			InputSchema: objectSchema(map[string]any{
				"kind":        map[string]any{"type": "string", "description": "Upload kind key from list_upload_kinds.", "enum": kinds},
				"parent_id":   map[string]any{"type": "string", "description": "UUID of the parent record named by list_upload_kinds.parent_entity. Omit for self_only kinds (profile_avatar)."},
				"filename":    map[string]any{"type": "string", "description": "Original filename, including its extension."},
				"mime_type":   map[string]any{"type": "string", "description": "Declared MIME type of the source bytes."},
				"data_base64": map[string]any{"type": "string", "description": "Base64-encoded file bytes, or a data: URL. Use for files within the kind's max_bytes."},
				"source_url":  map[string]any{"type": "string", "description": "An http(s) URL the server should fetch instead of data_base64. Provide exactly one of data_base64 or source_url."},
			}, []string{"kind", "filename", "mime_type"}),
			Annotations: createToolAnnotations,
		},
		{
			Name:        toolDeleteFile,
			Title:       "Delete file",
			Description: "Remove a previously uploaded CRM image or document and reverse its DB patch (clear a logo/avatar, drop one photo from an array, or delete a customer_document/opportunity_attachment row). Same ACL as upload_file.",
			InputSchema: objectSchema(map[string]any{
				"kind":      map[string]any{"type": "string", "description": "Upload kind key from list_upload_kinds.", "enum": kinds},
				"parent_id": map[string]any{"type": "string", "description": "Required for single/array-column kinds: the parent record UUID. Omit for self_only kinds and for kinds that insert a row (use record_id instead)."},
				"url":       map[string]any{"type": "string", "description": "Required for array-column kinds: the exact URL (or, for visit_log_document, the storage_path) to remove."},
				"record_id": map[string]any{"type": "string", "description": "Required for kinds that inserted a row (customer_document, opportunity_attachment): the row's UUID."},
			}, []string{"kind"}),
			Annotations: deleteToolAnnotations,
		},
	}

	if docKinds := allowedDocumentUploadKinds(acc); len(docKinds) > 0 {
		tools = append(tools,
			toolDescriptor{
				Name:  toolPrepareUpload,
				Title: "Prepare upload",
				Description: "Mint a one-time signed PUT URL for a document upload larger than a data_base64 payload should be. A local agent PUTs the raw bytes to upload_url, then calls finalize_upload with the returned object_path. " +
					"Chat clients that cannot perform an HTTP PUT should use upload_file with data_base64 instead.",
				InputSchema: objectSchema(map[string]any{
					"kind":      map[string]any{"type": "string", "description": "Document upload kind key from list_upload_kinds.", "enum": docKinds},
					"parent_id": map[string]any{"type": "string", "description": "UUID of the parent record named by list_upload_kinds.parent_entity."},
					"filename":  map[string]any{"type": "string", "description": "Original filename, including its extension."},
					"mime_type": map[string]any{"type": "string", "description": "Declared MIME type of the file to be uploaded."},
				}, []string{"kind", "parent_id", "filename", "mime_type"}),
				Annotations: createToolAnnotations,
			},
			toolDescriptor{
				Name:        toolFinalizeUpload,
				Title:       "Finalize upload",
				Description: "Complete a prepare_upload flow: verifies the PUT landed at object_path, then patches the owning record exactly like upload_file would.",
				InputSchema: objectSchema(map[string]any{
					"kind":        map[string]any{"type": "string", "description": "Same document upload kind passed to prepare_upload.", "enum": docKinds},
					"parent_id":   map[string]any{"type": "string", "description": "Same parent_id passed to prepare_upload."},
					"object_path": map[string]any{"type": "string", "description": "The object_path returned by prepare_upload."},
					"filename":    map[string]any{"type": "string", "description": "Original filename, including its extension."},
					"mime_type":   map[string]any{"type": "string", "description": "Declared MIME type of the uploaded file."},
					"byte_size":   map[string]any{"type": "integer", "description": "Size of the uploaded file in bytes.", "minimum": 1},
				}, []string{"kind", "parent_id", "object_path", "filename", "mime_type", "byte_size"}),
				Annotations: createToolAnnotations,
			},
		)
	}
	return tools
}

// objectSchema builds a JSON Schema object node for a tool input.
func objectSchema(properties map[string]any, required []string) map[string]any {
	if properties == nil {
		properties = map[string]any{}
	}
	schema := map[string]any{
		"type":       "object",
		"properties": properties,
	}
	if len(required) > 0 {
		schema["required"] = required
	}
	return schema
}

// callArgs is the decoded tools/call params payload.
type callArgs struct {
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
}

// recordArgs covers the argument shape of every data tool.
type recordArgs struct {
	Entity       string                     `json:"entity"`
	ID           string                     `json:"id"`
	Query        string                     `json:"query"`
	Filters      map[string]string          `json:"filters"`
	OrderBy      string                     `json:"order_by"`
	Ascending    bool                       `json:"ascending"`
	Limit        int                        `json:"limit"`
	Offset       int                        `json:"offset"`
	Values       map[string]json.RawMessage `json:"values"`
	Period       string                     `json:"period"`
	Year         int                        `json:"year"`
	Week         int                        `json:"week"`
	Month        int                        `json:"month"`
	Quarter      int                        `json:"quarter"`
	Half         int                        `json:"half"`
	DateFrom     string                     `json:"date_from"`
	DateTo       string                     `json:"date_to"`
	DateField    string                     `json:"date_field"`
	GroupBy      string                     `json:"group_by"`
	Timezone     string                     `json:"timezone"`
	IncludeLines *bool                      `json:"include_lines"`
	Top          int                        `json:"top"`
}

// callTool dispatches a tools/call request against the caller's grants.
func callTool(ctx context.Context, sb *supabase.Client, acc *access, name string, rawArgs json.RawMessage) *toolResult {
	switch name {
	case toolListMyAccess:
		return textResult(describeAccess(acc))
	case toolListEntities:
		return textResult(describeEntities(acc))
	case toolListUploadKinds:
		return textResult(describeUploadKinds(acc))
	case toolUploadFile, toolPrepareUpload, toolFinalizeUpload, toolDeleteFile:
		return callUploadTool(ctx, sb, acc, name, rawArgs)
	}

	var args recordArgs
	if len(rawArgs) > 0 {
		if err := json.Unmarshal(rawArgs, &args); err != nil {
			return errorResult("invalid arguments: " + err.Error())
		}
	}
	ent := lookupEntity(args.Entity)
	if ent == nil {
		return errorResult(fmt.Sprintf("unknown entity %q; call list_entities for the allowed set", args.Entity))
	}
	if ent.Gate != "" && !acc.hasModule(ent.Gate) {
		return errorResult(fmt.Sprintf("forbidden: %s requires the %s desktop module", ent.Key, ent.Gate))
	}

	switch name {
	case toolSearchRecords:
		rows, err := searchRecords(ctx, sb, acc, ent, args.Query, args.Filters, args.OrderBy, args.Ascending, args.Limit, args.Offset)
		if err != nil {
			return toolError(err)
		}
		return textResult(map[string]any{
			"entity":    ent.Key,
			"returned":  len(rows),
			"limit":     clampLimit(args.Limit),
			"offset":    args.Offset,
			"records":   rows,
			"truncated": len(rows) == clampLimit(args.Limit),
		})

	case toolGetRecord:
		row, err := getRecord(ctx, sb, acc, ent, args.ID)
		if err != nil {
			return toolError(err)
		}
		return textResult(map[string]any{"entity": ent.Key, "record": row})

	case toolCountRecords:
		total, err := countRecords(ctx, sb, acc, ent, args.Query, args.Filters)
		if err != nil {
			return toolError(err)
		}
		return textResult(map[string]any{"entity": ent.Key, "count": total})

	case toolSummarizeRecords:
		payload, err := summarizeRecords(ctx, sb, acc, ent, summarizeArgs{
			Entity:       args.Entity,
			Query:        args.Query,
			Filters:      args.Filters,
			DateField:    args.DateField,
			GroupBy:      args.GroupBy,
			IncludeLines: args.IncludeLines,
			Top:          args.Top,
			Period: periodArgs{
				Period:   args.Period,
				Year:     args.Year,
				Week:     args.Week,
				Month:    args.Month,
				Quarter:  args.Quarter,
				Half:     args.Half,
				DateFrom: args.DateFrom,
				DateTo:   args.DateTo,
				Timezone: args.Timezone,
			},
		})
		if err != nil {
			return toolError(err)
		}
		return textResult(payload)

	case toolCreateRecord:
		row, err := createRecord(ctx, sb, acc, ent, args.Values)
		if err != nil {
			return toolError(err)
		}
		return textResult(map[string]any{"entity": ent.Key, "created": row})

	case toolUpdateRecord:
		row, err := updateRecord(ctx, sb, acc, ent, args.ID, args.Values)
		if err != nil {
			return toolError(err)
		}
		return textResult(map[string]any{"entity": ent.Key, "updated": row})

	case toolDeleteRecord:
		if err := deleteRecord(ctx, sb, acc, ent, args.ID); err != nil {
			return toolError(err)
		}
		return textResult(map[string]any{"entity": ent.Key, "deleted": args.ID})
	}
	return errorResult("unknown tool " + name)
}

// toolError converts an internal error into an agent-readable tool failure.
// Supabase transport details are deliberately not forwarded.
func toolError(err error) *toolResult {
	switch {
	case errors.Is(err, errForbidden):
		return errorResult(err.Error())
	case errors.Is(err, errNotFound):
		return errorResult("not found, or outside your permissions")
	}
	var apiErr *supabase.APIError
	if errors.As(err, &apiErr) {
		return errorResult(fmt.Sprintf("database rejected the request (status %d)", apiErr.Status))
	}
	return errorResult(err.Error())
}

// describeAccess is the list_my_access payload.
func describeAccess(acc *access) map[string]any {
	role := "member"
	switch {
	case acc.Unrestricted:
		role = "system_admin"
	case len(acc.AdminGroupIDs) > 0:
		role = "group_admin"
	case acc.GlobalLeader:
		role = "global_leader"
	}
	return map[string]any{
		"user_id":               acc.UserID,
		"role":                  role,
		"unrestricted":          acc.Unrestricted,
		"global_leader":         acc.GlobalLeader,
		"group_ids":             acc.GroupIDs,
		"admin_group_ids":       acc.AdminGroupIDs,
		"desktop_modules":       acc.allowedModules(),
		"write_grants":          acc.allowedWrites(),
		"readable_entities":     allowedEntities(acc),
		"mutable_entity_insert": writableEntities(acc, "insert"),
		"mutable_entity_update": writableEntities(acc, "update"),
		"mutable_entity_delete": writableEntities(acc, "delete"),
	}
}

// describeEntities is the list_entities payload, limited to readable entities.
func describeEntities(acc *access) map[string]any {
	readable := allowedEntities(acc)
	out := make([]map[string]any, 0, len(readable))
	for _, key := range readable {
		ent := lookupEntity(key)
		if ent == nil {
			continue
		}
		actions := make([]string, 0, len(writeActions))
		if ent.Write != nil {
			for _, action := range writeActions {
				if authorizeWrite(acc, ent, action) == nil {
					actions = append(actions, action)
				}
			}
		}
		sort.Strings(actions)
		item := map[string]any{
			"entity":            ent.Key,
			"description":       ent.Desc,
			"desktop_module":    ent.Gate,
			"searchable_fields": ent.Search,
			"filterable_fields": filterableFieldsForEntity(ent),
			"rangeable_fields":  ent.Rangeable,
			"id_field":          primaryKeyColumn(ent),
			"write_actions":     actions,
		}
		if len(ent.Rangeable) > 0 {
			item["report_date_field"] = defaultReportDateField(ent)
		}
		if related := relatedEntities(ent, readable); len(related) > 0 {
			item["related_entities"] = related
		}
		if ent.Hint != "" {
			item["query_hint"] = ent.Hint
		}
		out = append(out, item)
	}
	return map[string]any{
		"count":                len(out),
		"entities":             out,
		"us_sales_territories": describeUsSalesTerritories(),
		"note":                 "id_field is a UUID (product_catalog_prices uses product_id). Never pass a BillNo, customer code, SKU, or email to get_record; use search_records with query or filters. Rangeable columns accept column_gte / column_gt / column_lte / column_lt. Virtual filters.us_region=east|west matches GeoCRM US sales territories via customers.company_state; on customer_id entities (orders, opportunities, …) it keeps rows for those customers. The full East/West state lists are in us_sales_territories — quote that object when asked how regions are divided; do not invent or truncate the lists. For week/month/quarter/half-year/year reports call summarize_records instead of paging. Prefer limit 25 when listing rows. Every result is filtered by the caller's group membership and Electron desktop permissions. Entities absent from this list are not readable with this key.",
	}
}

// relatedEntities returns Related keys the caller can already read.
func relatedEntities(ent *entity, readable []string) []string {
	if ent == nil || len(ent.Related) == 0 {
		return nil
	}
	allowed := make(map[string]bool, len(readable))
	for _, key := range readable {
		allowed[key] = true
	}
	out := make([]string, 0, len(ent.Related))
	for _, key := range ent.Related {
		if allowed[key] {
			out = append(out, key)
		}
	}
	return out
}

// summariseEntityKeys renders a short comma-separated list for prompt text.
func summariseEntityKeys(keys []string, max int) string {
	if len(keys) <= max {
		return strings.Join(keys, ", ")
	}
	return strings.Join(keys[:max], ", ") + fmt.Sprintf(", and %d more", len(keys)-max)
}
