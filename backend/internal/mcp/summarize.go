package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

const (
	maxSummarizeRows = 10000
	summarizePage    = 200
	defaultTopN      = 10
	maxTopN          = 25
	lineBatchSize    = 80
)

// reportProfile describes how to aggregate one entity for period reports.
type reportProfile struct {
	DateField          string
	AmountField        string
	CurrencyField      string
	Breakdowns         []string
	CustomerIDField    string
	CustomerLabelField string
	ExternalIDField    string
	LineEntity         string
	LineParent         string
	LineSKU            string
	LineName           string
	LineAmount         string
	LineQty            string
}

var reportProfiles = map[string]reportProfile{
	"orders": {
		DateField:          "bill_date",
		AmountField:        "amount",
		CurrencyField:      "currency",
		Breakdowns:         []string{"source", "status", "currency"},
		CustomerIDField:    "customer_id",
		CustomerLabelField: "customer_code_snapshot",
		ExternalIDField:    "external_id",
		LineEntity:         "erp_order_lines",
		LineParent:         "order_id",
		LineSKU:            "item_code",
		LineName:           "item_name",
		LineAmount:         "amount",
		LineQty:            "qty",
	},
	"erp_order_lines": {
		DateField:     "created_at",
		AmountField:   "amount",
		CurrencyField: "currency",
		Breakdowns:    []string{"currency"},
		LineSKU:       "item_code",
		LineName:      "item_name",
	},
	"opportunities": {
		DateField:       "expected_close_date",
		AmountField:     "amount",
		CurrencyField:   "currency_code",
		Breakdowns:      []string{"stage", "opportunity_source", "opportunity_type"},
		CustomerIDField: "customer_id",
	},
	"opportunity_products": {
		DateField: "created_at",
	},
	"customers": {
		DateField:  "created_at",
		Breakdowns: []string{"category", "customer_type", "customer_level", "cooperation_status"},
	},
	"customer_contacts": {
		DateField:       "created_at",
		CustomerIDField: "customer_id",
	},
	"customer_addresses": {
		DateField:       "created_at",
		Breakdowns:      []string{"address_type"},
		CustomerIDField: "customer_id",
	},
	"customer_visit_log": {
		DateField:       "visit_date",
		CustomerIDField: "customer_id",
	},
	"customer_activity_logs": {
		DateField:       "created_at",
		Breakdowns:      []string{"entity_type", "action"},
		CustomerIDField: "customer_id",
	},
	"customer_work_items": {
		DateField:       "due_date",
		Breakdowns:      []string{"completed", "importance"},
		CustomerIDField: "customer_id",
	},
	"customer_documents": {
		DateField:       "created_at",
		Breakdowns:      []string{"mime_type"},
		CustomerIDField: "customer_id",
	},
	"leads": {
		DateField:       "created_at",
		Breakdowns:      []string{"status"},
		CustomerIDField: "customer_id",
	},
	"lead_contacts": {
		DateField: "created_at",
	},
	"follow_ups": {
		DateField:       "scheduled_at",
		Breakdowns:      []string{"status", "type"},
		CustomerIDField: "customer_id",
	},
	"competitor_shops": {
		DateField:       "created_at",
		Breakdowns:      []string{"country", "importance_level", "city", "state_province"},
		CustomerIDField: "customer_id",
	},
	"competitor_lines": {
		DateField:   "created_at",
		AmountField: "price",
		Breakdowns:  []string{"threat_level", "competitor_company_name"},
		LineSKU:     "competitor_product_name",
		LineName:    "competitor_product_name",
	},
	"kols": {
		DateField:   "created_at",
		AmountField: "total_amount",
		Breakdowns:  []string{"tier", "cooperation_status", "current_status", "country", "vertical"},
	},
	"kol_channels": {
		DateField:  "created_at",
		Breakdowns: []string{"platform_key"},
	},
	"favorites": {
		DateField:  "created_at",
		Breakdowns: []string{"country", "priority", "city"},
	},
	"search_history": {
		DateField: "created_at",
	},
	"crm_products": {
		DateField: "created_at",
	},
	"product_catalog": {
		DateField:  "updated_at",
		Breakdowns: []string{"is_active"},
	},
	"nexdot_companies": {
		DateField: "created_at",
	},
	"nexdot_accounts": {
		DateField:  "created_at",
		Breakdowns: []string{"account_kind", "is_active"},
	},
	"nexdot_sales_reps": {
		DateField: "created_at",
	},
	"nexdot_work_items": {
		DateField:  "created_at",
		Breakdowns: []string{"status"},
	},
	"te_submissions": {
		DateField:  "created_at",
		Breakdowns: []string{"status", "country_code", "identity_type"},
	},
	"te_orders": {
		DateField:  "created_at",
		Breakdowns: []string{"status", "tracking_status", "carrier"},
	},
	"folio_pages": {
		DateField: "created_at",
	},
	"calendar_events": {
		DateField:  "start_at",
		Breakdowns: []string{"all_day"},
	},
	"mail_accounts": {
		DateField:  "created_at",
		Breakdowns: []string{"provider", "status"},
	},
	"mail_threads": {
		DateField: "last_message_at",
	},
	"mail_messages": {
		DateField:  "received_at",
		Breakdowns: []string{"is_read", "is_sent", "is_draft"},
	},
	"channel_conversations": {
		DateField:  "last_message_at",
		Breakdowns: []string{"provider"},
	},
	"channel_messages": {
		DateField:  "created_at",
		Breakdowns: []string{"direction"},
	},
	"group_members": {
		DateField:  "added_at",
		Breakdowns: []string{"is_active"},
	},
	"my_todos": {
		DateField:  "created_at",
		Breakdowns: []string{"done"},
	},
}

type bucket struct {
	key    string
	label  string
	count  int
	amount float64
}

type orderHit struct {
	id         string
	externalID string
	customerID string
	label      string
	source     string
	amount     float64
	currency   string
	billDate   string
}

// summarizeArgs is the summarize_records payload after JSON decode.
type summarizeArgs struct {
	Entity       string
	Query        string
	Filters      map[string]string
	DateField    string
	GroupBy      string
	IncludeLines *bool
	Top          int
	Period       periodArgs
}

// summarizeRecords aggregates matching rows for a week, month, quarter,
// half-year, year, or custom date range without returning every row.
func summarizeRecords(ctx context.Context, sb *supabase.Client, acc *access, ent *entity, args summarizeArgs) (map[string]any, error) {
	if len(ent.Rangeable) == 0 {
		return nil, fmt.Errorf("entity %s does not support period reports", ent.Key)
	}
	spec, err := resolvePeriod(args.Period)
	if err != nil {
		return nil, err
	}
	dateField := strings.TrimSpace(args.DateField)
	if dateField == "" {
		dateField = defaultReportDateField(ent)
	}
	if !contains(ent.Rangeable, dateField) {
		return nil, fmt.Errorf("date_field %q is not rangeable on %s (rangeable: %s)",
			dateField, ent.Key, strings.Join(ent.Rangeable, ", "))
	}

	profile := reportProfiles[ent.Key]
	if err := applyExtraGroupBy(ent, &profile, args.GroupBy); err != nil {
		return nil, err
	}
	filters := mergePeriodFilters(args.Filters, dateField, spec)
	topN := args.Top
	if topN <= 0 {
		topN = defaultTopN
	}
	if topN > maxTopN {
		topN = maxTopN
	}

	columns := summarizeColumns(ent, dateField, profile)
	rows, truncated, err := scanSummarizeRows(ctx, sb, acc, ent, args.Query, filters, dateField, columns)
	if err != nil {
		return nil, err
	}

	loc := loadReportLocation(spec.Timezone)
	totals := map[string]*bucket{}
	byWeek := map[string]*bucket{}
	breakdowns := map[string]map[string]*bucket{}
	for _, col := range profile.Breakdowns {
		breakdowns[col] = map[string]*bucket{}
	}
	customers := map[string]*bucket{}
	skus := map[string]*bucket{}
	var hits []orderHit
	var amountSum float64
	var amountRows int
	orderIDs := make([]string, 0, len(rows))

	for _, row := range rows {
		id := jsonString(row["id"])
		if id != "" {
			orderIDs = append(orderIDs, id)
		}
		amount, hasAmount := jsonFloat(row[profile.AmountField])
		if hasAmount {
			amountSum += amount
			amountRows++
		}
		if profile.CurrencyField != "" {
			currency := jsonString(row[profile.CurrencyField])
			if currency == "" {
				currency = "(none)"
			}
			addBucket(totals, currency, currency, hasAmount, amount)
		}

		when := jsonTime(row[dateField])
		if !when.IsZero() {
			isoYear, isoWeek := when.In(loc).ISOWeek()
			weekKey := fmt.Sprintf("%d-W%02d", isoYear, isoWeek)
			addBucket(byWeek, weekKey, weekKey, hasAmount, amount)
		}

		for _, col := range profile.Breakdowns {
			val := jsonString(row[col])
			if val == "" {
				val = "(blank)"
			}
			addBucket(breakdowns[col], val, val, hasAmount, amount)
		}

		if profile.CustomerIDField != "" {
			cid := jsonString(row[profile.CustomerIDField])
			if cid == "" {
				cid = "(none)"
			}
			label := jsonString(row[profile.CustomerLabelField])
			if label == "" {
				label = cid
			}
			addBucket(customers, cid, label, hasAmount, amount)
		}

		if profile.LineSKU != "" && profile.LineEntity == "" {
			sku := jsonString(row[profile.LineSKU])
			if sku == "" {
				sku = jsonString(row[profile.LineName])
			}
			if sku == "" {
				sku = "(blank)"
			}
			name := jsonString(row[profile.LineName])
			addBucket(skus, sku, firstNonEmpty(name, sku), hasAmount, amount)
		}

		if profile.ExternalIDField != "" || profile.AmountField != "" {
			hits = append(hits, orderHit{
				id:         id,
				externalID: jsonString(row[profile.ExternalIDField]),
				customerID: jsonString(row[profile.CustomerIDField]),
				label:      jsonString(row[profile.CustomerLabelField]),
				source:     jsonString(row["source"]),
				amount:     amount,
				currency:   jsonString(row[profile.CurrencyField]),
				billDate:   jsonString(row[dateField]),
			})
		}
	}

	includeLines := profile.LineEntity != ""
	if args.IncludeLines != nil {
		includeLines = *args.IncludeLines
	}
	if includeLines && profile.LineEntity != "" && lookupEntity(profile.LineEntity) != nil {
		if acc.hasModule(lookupEntity(profile.LineEntity).Gate) || lookupEntity(profile.LineEntity).Gate == "" {
			if err := accumulateLineSKUs(ctx, sb, acc, profile, orderIDs, skus); err != nil {
				return nil, err
			}
		}
	}

	if names := lookupCustomerNames(ctx, sb, acc, keysOf(customers)); len(names) > 0 {
		for id, b := range customers {
			if name := names[id]; name != "" {
				b.label = name
			}
		}
	}

	avg := 0.0
	if amountRows > 0 {
		avg = amountSum / float64(amountRows)
	}

	out := map[string]any{
		"entity": ent.Key,
		"period": map[string]any{
			"kind":       spec.Kind,
			"label":      spec.Label,
			"timezone":   spec.Timezone,
			"from":       spec.From.Format(time.RFC3339),
			"until":      spec.Until.Format(time.RFC3339),
			"date_field": dateField,
		},
		"totals": map[string]any{
			"count":       len(rows),
			"amount_sum":  round2(amountSum),
			"amount_avg":  round2(avg),
			"amount_rows": amountRows,
		},
		"by_week":    bucketsJSON(byWeek, 0),
		"scanned":    len(rows),
		"truncated":  truncated,
		"scan_limit": maxSummarizeRows,
	}
	if profile.CurrencyField != "" {
		totalsMap := out["totals"].(map[string]any)
		totalsMap["by_currency"] = bucketsJSON(totals, 0)
	}
	if spec.Year != 0 {
		period := out["period"].(map[string]any)
		period["year"] = spec.Year
		if spec.Week != 0 {
			period["week"] = spec.Week
		}
		if spec.Month != 0 {
			period["month"] = spec.Month
		}
		if spec.Quarter != 0 {
			period["quarter"] = spec.Quarter
		}
		if spec.Half != 0 {
			period["half"] = spec.Half
		}
	}
	for _, col := range profile.Breakdowns {
		out["by_"+col] = bucketsJSON(breakdowns[col], 0)
	}
	if len(customers) > 0 {
		out["by_customer"] = bucketsJSON(customers, topN)
	}
	if len(skus) > 0 {
		out["top_skus"] = bucketsJSON(skus, topN)
	}
	if len(hits) > 0 && profile.AmountField != "" {
		out["top_orders"] = topOrdersJSON(hits, topN)
	}
	return out, nil
}

// defaultReportDateField picks the natural date column for period reports.
func defaultReportDateField(ent *entity) string {
	if profile, ok := reportProfiles[ent.Key]; ok && profile.DateField != "" {
		return profile.DateField
	}
	if contains(ent.Rangeable, ent.OrderCol) {
		return ent.OrderCol
	}
	if len(ent.Rangeable) > 0 {
		return ent.Rangeable[0]
	}
	return ""
}

// applyExtraGroupBy adds an optional extra breakdown column from the caller.
func applyExtraGroupBy(ent *entity, profile *reportProfile, groupBy string) error {
	groupBy = strings.TrimSpace(groupBy)
	if groupBy == "" {
		return nil
	}
	if groupBy == "id" || groupBy == "group_id" {
		return fmt.Errorf("group_by %q is not a useful breakdown; use a status, country, or category column", groupBy)
	}
	if !contains(ent.Filterable, groupBy) && !contains(ent.Rangeable, groupBy) {
		return fmt.Errorf("group_by %q is not filterable or rangeable on %s", groupBy, ent.Key)
	}
	if !contains(profile.Breakdowns, groupBy) {
		profile.Breakdowns = append(profile.Breakdowns, groupBy)
	}
	return nil
}

// mergePeriodFilters copies caller filters and applies a half-open date band.
func mergePeriodFilters(base map[string]string, dateField string, spec *periodSpec) map[string]string {
	out := make(map[string]string, len(base)+2)
	for k, v := range base {
		out[k] = v
	}
	for _, suffix := range []string{"", "_gte", "_gt", "_lte", "_lt"} {
		delete(out, dateField+suffix)
	}
	out[dateField+"_gte"] = rfc3339UTC(spec.From)
	out[dateField+"_lt"] = rfc3339UTC(spec.Until)
	return out
}

// summarizeColumns is the slim projection used while scanning a period.
func summarizeColumns(ent *entity, dateField string, profile reportProfile) string {
	seen := map[string]bool{}
	cols := make([]string, 0, 12)
	add := func(name string) {
		if name == "" || seen[name] || !entityProjects(ent, name) {
			return
		}
		seen[name] = true
		cols = append(cols, name)
	}
	add("id")
	add(dateField)
	add(profile.AmountField)
	add(profile.CurrencyField)
	add(profile.CustomerIDField)
	add(profile.CustomerLabelField)
	add(profile.ExternalIDField)
	add(profile.LineSKU)
	add(profile.LineName)
	for _, col := range profile.Breakdowns {
		add(col)
	}
	if len(cols) == 0 {
		return ent.Columns
	}
	return strings.Join(cols, ",")
}

// entityProjects reports whether column is in the entity's PostgREST projection.
func entityProjects(ent *entity, column string) bool {
	if ent.Columns == "*" {
		return true
	}
	for _, part := range strings.Split(ent.Columns, ",") {
		if strings.TrimSpace(part) == column {
			return true
		}
	}
	return false
}

// scanSummarizeRows pages through matching rows up to maxSummarizeRows.
func scanSummarizeRows(
	ctx context.Context,
	sb *supabase.Client,
	acc *access,
	ent *entity,
	term string,
	filters map[string]string,
	orderBy string,
	columns string,
) ([]map[string]json.RawMessage, bool, error) {
	out := make([]map[string]json.RawMessage, 0, 128)
	offset := 0
	for {
		q := sb.From(ent.Table).Select(columns)
		ok, err := applyScope(ctx, sb, q, acc, ent)
		if err != nil {
			return nil, false, err
		}
		if !ok {
			return out, false, nil
		}
		if err := applyFilters(ctx, sb, acc, q, ent, filters); err != nil {
			if errors.Is(err, errNoMatchingRows) {
				return out, false, nil
			}
			return nil, false, err
		}
		if err := applySearch(q, ent, term); err != nil {
			return nil, false, err
		}
		if orderBy != "" {
			q.OrderNullsLast(orderBy, true)
		}
		q.Limit(summarizePage)
		if offset > 0 {
			q.Offset(offset)
		}
		var page []map[string]json.RawMessage
		if err := q.Exec(ctx, &page); err != nil {
			return nil, false, err
		}
		out = append(out, page...)
		if len(page) < summarizePage {
			return out, false, nil
		}
		if len(out) >= maxSummarizeRows {
			return out[:maxSummarizeRows], true, nil
		}
		offset += summarizePage
	}
}

func accumulateLineSKUs(
	ctx context.Context,
	sb *supabase.Client,
	acc *access,
	profile reportProfile,
	orderIDs []string,
	skus map[string]*bucket,
) error {
	lineEnt := lookupEntity(profile.LineEntity)
	if lineEnt == nil || len(orderIDs) == 0 {
		return nil
	}
	cols := strings.Join([]string{
		profile.LineParent, profile.LineSKU, profile.LineName, profile.LineAmount, profile.LineQty,
	}, ",")
	for i := 0; i < len(orderIDs); i += lineBatchSize {
		end := i + lineBatchSize
		if end > len(orderIDs) {
			end = len(orderIDs)
		}
		batch := orderIDs[i:end]
		q := sb.From(lineEnt.Table).Select(cols)
		ok, err := applyScope(ctx, sb, q, acc, lineEnt)
		if err != nil {
			return err
		}
		if !ok {
			return nil
		}
		q.In(profile.LineParent, batch).Limit(maxRows)
		var rows []map[string]json.RawMessage
		if err := q.Exec(ctx, &rows); err != nil {
			return err
		}
		for _, row := range rows {
			sku := jsonString(row[profile.LineSKU])
			if sku == "" {
				sku = jsonString(row[profile.LineName])
			}
			if sku == "" {
				sku = "(blank)"
			}
			name := jsonString(row[profile.LineName])
			amount, hasAmount := jsonFloat(row[profile.LineAmount])
			addBucket(skus, sku, firstNonEmpty(name, sku), hasAmount, amount)
		}
	}
	return nil
}

func lookupCustomerNames(ctx context.Context, sb *supabase.Client, acc *access, ids []string) map[string]string {
	customers := lookupEntity("customers")
	if customers == nil || len(ids) == 0 {
		return nil
	}
	if customers.Gate != "" && !acc.hasModule(customers.Gate) {
		return nil
	}
	clean := make([]string, 0, len(ids))
	for _, id := range ids {
		if isUUID(id) {
			clean = append(clean, id)
		}
	}
	if len(clean) == 0 {
		return nil
	}
	out := map[string]string{}
	for i := 0; i < len(clean); i += lineBatchSize {
		end := i + lineBatchSize
		if end > len(clean) {
			end = len(clean)
		}
		q := sb.From(customers.Table).Select("id,company_name")
		ok, err := applyScope(ctx, sb, q, acc, customers)
		if err != nil || !ok {
			return out
		}
		q.In("id", clean[i:end]).Limit(lineBatchSize)
		var rows []map[string]json.RawMessage
		if err := q.Exec(ctx, &rows); err != nil {
			return out
		}
		for _, row := range rows {
			id := jsonString(row["id"])
			name := jsonString(row["company_name"])
			if id != "" && name != "" {
				out[id] = name
			}
		}
	}
	return out
}

func addBucket(dst map[string]*bucket, key, label string, hasAmount bool, amount float64) {
	b := dst[key]
	if b == nil {
		b = &bucket{key: key, label: label}
		dst[key] = b
	}
	b.count++
	if hasAmount {
		b.amount += amount
	}
	if b.label == "" {
		b.label = label
	}
}

func bucketsJSON(src map[string]*bucket, limit int) []map[string]any {
	list := make([]*bucket, 0, len(src))
	for _, b := range src {
		list = append(list, b)
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].amount != list[j].amount {
			return list[i].amount > list[j].amount
		}
		if list[i].count != list[j].count {
			return list[i].count > list[j].count
		}
		return list[i].key < list[j].key
	})
	if limit > 0 && len(list) > limit {
		list = list[:limit]
	}
	out := make([]map[string]any, 0, len(list))
	for _, b := range list {
		out = append(out, map[string]any{
			"key":    b.key,
			"label":  b.label,
			"count":  b.count,
			"amount": round2(b.amount),
		})
	}
	return out
}

func topOrdersJSON(hits []orderHit, limit int) []map[string]any {
	sort.Slice(hits, func(i, j int) bool {
		if hits[i].amount != hits[j].amount {
			return hits[i].amount > hits[j].amount
		}
		return hits[i].id < hits[j].id
	})
	if limit > 0 && len(hits) > limit {
		hits = hits[:limit]
	}
	out := make([]map[string]any, 0, len(hits))
	for _, h := range hits {
		out = append(out, map[string]any{
			"id":          h.id,
			"external_id": h.externalID,
			"customer_id": h.customerID,
			"label":       h.label,
			"source":      h.source,
			"amount":      round2(h.amount),
			"currency":    h.currency,
			"bill_date":   h.billDate,
		})
	}
	return out
}

func keysOf(src map[string]*bucket) []string {
	out := make([]string, 0, len(src))
	for k := range src {
		out = append(out, k)
	}
	return out
}

func jsonString(raw json.RawMessage) string {
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s
	}
	return strings.Trim(string(raw), `"`)
}

func jsonFloat(raw json.RawMessage) (float64, bool) {
	if len(raw) == 0 || string(raw) == "null" {
		return 0, false
	}
	var n float64
	if err := json.Unmarshal(raw, &n); err == nil {
		return n, true
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		n, err := strconv.ParseFloat(s, 64)
		return n, err == nil
	}
	return 0, false
}

func jsonTime(raw json.RawMessage) time.Time {
	s := jsonString(raw)
	if s == "" {
		return time.Time{}
	}
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t
		}
	}
	return time.Time{}
}

func round2(n float64) float64 {
	return math.Round(n*100) / 100
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}
