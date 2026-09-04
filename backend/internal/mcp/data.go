package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

// maxRows caps how many rows a single tool call may return.
const maxRows = 200

// defaultRows is the page size when a caller omits limit.
const defaultRows = 25

// maxParentIDs caps the parent-id set used to scope child entities.
const maxParentIDs = 1000

// errForbidden is returned when the desktop ACL denies a tool call.
var errForbidden = errors.New("forbidden")

// errNotFound is returned when an id does not resolve inside the caller's scope.
var errNotFound = errors.New("not found")

// readQuery builds a scoped SELECT for an entity. ok is false when the caller
// provably has no rows, letting callers skip the round trip.
func readQuery(ctx context.Context, sb *supabase.Client, acc *access, ent *entity) (q *supabase.Query, ok bool, err error) {
	q = sb.From(ent.Table).Select(ent.Columns)
	ok, err = applyScope(ctx, sb, q, acc, ent)
	return q, ok, err
}

// applyScope narrows a query to the rows the caller is allowed to see.
func applyScope(ctx context.Context, sb *supabase.Client, q *supabase.Query, acc *access, ent *entity) (bool, error) {
	switch ent.Scope {
	case scopeSelf:
		if !isUUID(acc.UserID) {
			return false, nil
		}
		q.Eq(ent.ScopeCol, acc.UserID)
		return true, nil

	case scopeGlobal:
		return true, nil

	case scopeGroup:
		if acc.Unrestricted {
			return true, nil
		}
		if len(acc.GroupIDs) == 0 {
			return false, nil
		}
		q.In("group_id", acc.GroupIDs)
		return true, nil

	case scopeOwnerOrGroup:
		if acc.Unrestricted {
			return true, nil
		}
		clauses := []string{ent.ScopeCol + ".eq." + acc.UserID}
		if len(acc.GroupIDs) > 0 {
			clauses = append(clauses, "group_id.in.("+strings.Join(acc.GroupIDs, ",")+")")
		}
		q.Or(strings.Join(clauses, ","))
		return true, nil

	case scopeLeads:
		if acc.Unrestricted {
			return true, nil
		}
		clauses := []string{"owner_id.is.null", "owner_id.eq." + acc.UserID}
		if members := groupMemberIDs(ctx, sb, acc); len(members) > 0 {
			clauses = append(clauses, "owner_id.in.("+strings.Join(members, ",")+")")
		}
		q.Or(strings.Join(clauses, ","))
		return true, nil

	case scopeMyGroups:
		if acc.Unrestricted {
			return true, nil
		}
		if len(acc.GroupIDs) == 0 {
			return false, nil
		}
		q.In("id", acc.GroupIDs)
		return true, nil

	case scopeTeamProfiles:
		if acc.Unrestricted {
			return true, nil
		}
		ids := teammateIDs(ctx, sb, acc)
		if len(ids) == 0 {
			return false, nil
		}
		q.In("id", ids)
		return true, nil

	case scopeParent:
		if acc.Unrestricted {
			return true, nil
		}
		ids, err := parentIDs(ctx, sb, acc, ent)
		if err != nil {
			return false, err
		}
		if len(ids) == 0 {
			return false, nil
		}
		q.In(ent.Parent.Column, ids)
		return true, nil
	}
	return false, nil
}

// teammateIDs lists the caller plus every active member of their groups.
func teammateIDs(ctx context.Context, sb *supabase.Client, acc *access) []string {
	out := []string{acc.UserID}
	if len(acc.GroupIDs) == 0 {
		return out
	}
	var rows []struct {
		UserID string `json:"user_id"`
	}
	if err := sb.From("group_members").
		Select("user_id").
		In("group_id", acc.GroupIDs).
		Eq("is_active", "true").
		Limit(maxParentIDs).
		Exec(ctx, &rows); err != nil {
		return out
	}
	for _, row := range rows {
		if row.UserID != "" && !contains(out, row.UserID) {
			out = append(out, row.UserID)
		}
	}
	return out
}

// parentIDs resolves the in-scope ids of an entity's parent so child rows can
// inherit the parent's authorization.
func parentIDs(ctx context.Context, sb *supabase.Client, acc *access, ent *entity) ([]string, error) {
	parent := lookupEntity(ent.Parent.Entity)
	if parent == nil {
		return nil, fmt.Errorf("mcp: unknown parent entity %q", ent.Parent.Entity)
	}
	q := sb.From(parent.Table).Select(ent.Parent.ParentColumn).Limit(maxParentIDs)
	ok, err := applyScope(ctx, sb, q, acc, parent)
	if err != nil || !ok {
		return nil, err
	}
	var rows []map[string]json.RawMessage
	if err := q.Exec(ctx, &rows); err != nil {
		return nil, err
	}
	out := make([]string, 0, len(rows))
	for _, row := range rows {
		raw, present := row[ent.Parent.ParentColumn]
		if !present {
			continue
		}
		var id string
		if json.Unmarshal(raw, &id) == nil && id != "" {
			out = append(out, id)
		}
	}
	return out, nil
}

// applyFilters adds equality and inequality filters. Exact keys must be in
// Filterable (or the virtual us_region key). Keys ending in _gte, _gt, _lte,
// or _lt must have a Rangeable base column. Unknown columns are rejected so
// agents cannot probe hidden fields.
//
// Parameters:
//   - ctx: request context (needed when us_region resolves via customers)
//   - sb: Supabase client
//   - acc: caller access
//   - q: scoped query for ent
//   - ent: target entity
//   - filters: tool filter map
//
// Returns:
//   - errNoMatchingRows when us_region matches no customers; other filter errors
func applyFilters(
	ctx context.Context,
	sb *supabase.Client,
	acc *access,
	q *supabase.Query,
	ent *entity,
	filters map[string]string,
) error {
	region, rest, err := peelUsRegion(filters)
	if err != nil {
		return err
	}
	if region != "" {
		if err := applyUsRegionFilter(ctx, sb, acc, q, ent, region); err != nil {
			return err
		}
	}
	allowed := filterableFieldsForEntity(ent)
	for key, value := range rest {
		column, op := parseFilterOp(key)
		switch op {
		case filterEq:
			if !contains(allowed, column) {
				return fmt.Errorf("filter %q is not supported on %s (allowed: %s)",
					column, ent.Key, strings.Join(allowed, ", "))
			}
			q.Eq(column, value)
		default:
			if !contains(ent.Rangeable, column) {
				rangeAllowed := strings.Join(ent.Rangeable, ", ")
				if rangeAllowed == "" {
					rangeAllowed = "(none)"
				}
				return fmt.Errorf("range filter %q is not supported on %s (rangeable: %s; use column_gte, column_gt, column_lte, column_lt)",
					key, ent.Key, rangeAllowed)
			}
			if strings.TrimSpace(value) == "" {
				return fmt.Errorf("range filter %q needs a value", key)
			}
			switch op {
			case filterGte:
				q.Gte(column, value)
			case filterGt:
				q.Gt(column, value)
			case filterLte:
				q.Lte(column, value)
			case filterLt:
				q.Lt(column, value)
			}
		}
	}
	return nil
}

type filterOp string

const (
	filterEq  filterOp = "eq"
	filterGte filterOp = "gte"
	filterGt  filterOp = "gt"
	filterLte filterOp = "lte"
	filterLt  filterOp = "lt"
)

// parseFilterOp splits a filter key into a column and operator. Longer
// suffixes are matched first so `_gte` is not parsed as `_gt`.
func parseFilterOp(key string) (column string, op filterOp) {
	for _, spec := range []struct {
		suffix string
		op     filterOp
	}{
		{"_gte", filterGte},
		{"_lte", filterLte},
		{"_gt", filterGt},
		{"_lt", filterLt},
	} {
		if strings.HasSuffix(key, spec.suffix) && len(key) > len(spec.suffix) {
			return strings.TrimSuffix(key, spec.suffix), spec.op
		}
	}
	return key, filterEq
}

// applySearch adds a case-insensitive OR match across the entity's text
// columns. PostgREST `or=` groups are comma separated, so the term is stripped
// of characters that would break out of the group.
func applySearch(q *supabase.Query, ent *entity, term string) error {
	term = strings.TrimSpace(term)
	if term == "" {
		return nil
	}
	if len(ent.Search) == 0 {
		return fmt.Errorf("entity %s does not support free-text search; use filters instead", ent.Key)
	}
	safe := strings.Map(func(r rune) rune {
		if strings.ContainsRune(`,()"*`, r) {
			return -1
		}
		return r
	}, term)
	if safe == "" {
		return nil
	}
	clauses := make([]string, 0, len(ent.Search))
	for _, column := range ent.Search {
		clauses = append(clauses, column+".ilike.*"+safe+"*")
	}
	q.Or(strings.Join(clauses, ","))
	return nil
}

// clampLimit keeps page sizes inside the tool contract.
func clampLimit(limit int) int {
	if limit <= 0 {
		return defaultRows
	}
	if limit > maxRows {
		return maxRows
	}
	return limit
}

// searchRecords runs a scoped, filtered, optionally text-matched read.
func searchRecords(
	ctx context.Context,
	sb *supabase.Client,
	acc *access,
	ent *entity,
	term string,
	filters map[string]string,
	orderBy string,
	ascending bool,
	limit, offset int,
) (rows []map[string]json.RawMessage, err error) {
	q, ok, err := readQuery(ctx, sb, acc, ent)
	if err != nil {
		return nil, err
	}
	if !ok {
		return []map[string]json.RawMessage{}, nil
	}
	if err := applyFilters(ctx, sb, acc, q, ent, filters); err != nil {
		if errors.Is(err, errNoMatchingRows) {
			return []map[string]json.RawMessage{}, nil
		}
		return nil, err
	}
	if err := applySearch(q, ent, term); err != nil {
		return nil, err
	}
	allowedOrder := filterableFieldsForEntity(ent)
	if orderBy == "" {
		orderBy = ent.OrderCol
	} else if !contains(allowedOrder, orderBy) && !contains(ent.Rangeable, orderBy) && !contains(ent.Search, orderBy) && orderBy != ent.OrderCol {
		return nil, fmt.Errorf("order_by %q is not supported on %s", orderBy, ent.Key)
	}
	if orderBy != "" {
		q.OrderNullsLast(orderBy, ascending)
	}
	q.Limit(clampLimit(limit))
	if offset > 0 {
		q.Offset(offset)
	}
	rows = []map[string]json.RawMessage{}
	if err := q.Exec(ctx, &rows); err != nil {
		return nil, err
	}
	return rows, nil
}

// countRecords returns how many rows match without transferring them.
func countRecords(
	ctx context.Context,
	sb *supabase.Client,
	acc *access,
	ent *entity,
	term string,
	filters map[string]string,
) (int, error) {
	q, ok, err := readQuery(ctx, sb, acc, ent)
	if err != nil {
		return 0, err
	}
	if !ok {
		return 0, nil
	}
	if err := applyFilters(ctx, sb, acc, q, ent, filters); err != nil {
		if errors.Is(err, errNoMatchingRows) {
			return 0, nil
		}
		return 0, err
	}
	if err := applySearch(q, ent, term); err != nil {
		return 0, err
	}
	q.Limit(1)
	return q.ExecWithCount(ctx, nil)
}

// getRecord reads one row by UUID id, returning errNotFound when the id exists
// but falls outside the caller's scope.
func getRecord(ctx context.Context, sb *supabase.Client, acc *access, ent *entity, id string) (map[string]json.RawMessage, error) {
	if err := validateRecordID(id); err != nil {
		return nil, err
	}
	idColumn := primaryKeyColumn(ent)
	q, ok, err := readQuery(ctx, sb, acc, ent)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, errNotFound
	}
	q.Eq(idColumn, id).Limit(1)

	var rows []map[string]json.RawMessage
	if err := q.Exec(ctx, &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, errNotFound
	}
	return rows[0], nil
}

// validateRecordID rejects business keys (BillNo, customer code, email) that
// agents often pass to get_record instead of the UUID primary key.
func validateRecordID(id string) error {
	trimmed := strings.TrimSpace(id)
	if isUUID(trimmed) {
		return nil
	}
	if trimmed == "" {
		return errors.New("id must be a UUID primary key; use search_records with query or filters for BillNo, customer code, SKU, or email")
	}
	return fmt.Errorf("id must be a UUID primary key; %q is not. Use search_records with query or filters for BillNo, customer code, SKU, or email", trimmed)
}

// primaryKeyColumn returns the identifier column used by get / update / delete.
func primaryKeyColumn(ent *entity) string {
	if ent.Key == "product_catalog_prices" {
		return "product_id"
	}
	return "id"
}

// authorizeWrite checks the desktop write grant for a mutation.
func authorizeWrite(acc *access, ent *entity, action string) error {
	if ent.Write == nil {
		return fmt.Errorf("%w: %s is read-only over MCP", errForbidden, ent.Key)
	}
	if ent.Gate != "" && !acc.hasModule(ent.Gate) {
		return fmt.Errorf("%w: missing desktop entry %s", errForbidden, ent.Gate)
	}
	if acc.GlobalLeader && !acc.Unrestricted && len(acc.AdminGroupIDs) == 0 {
		return fmt.Errorf("%w: global leaders have read-only access", errForbidden)
	}
	if !acc.canWrite(*ent.Write, action) {
		return fmt.Errorf("%w: missing write grant %s", errForbidden, writeKey(ent.Write.Domain, ent.Write.Resource, action))
	}
	return nil
}

// createRecord inserts a row after forcing it into the caller's group scope.
func createRecord(ctx context.Context, sb *supabase.Client, acc *access, ent *entity, values map[string]json.RawMessage) (map[string]json.RawMessage, error) {
	if err := authorizeWrite(acc, ent, "insert"); err != nil {
		return nil, err
	}
	if err := rejectBlockedColumns(ent, values); err != nil {
		return nil, err
	}
	payload := make(map[string]any, len(values)+1)
	for k, v := range values {
		payload[k] = v
	}
	if needsGroupColumn(ent) && !acc.Unrestricted {
		groupID, err := resolveWriteGroup(acc, values)
		if err != nil {
			return nil, err
		}
		encoded, _ := json.Marshal(groupID)
		payload["group_id"] = json.RawMessage(encoded)
	}

	var rows []map[string]json.RawMessage
	if err := sb.From(ent.Table).
		Insert([]map[string]any{payload}).
		Returning().
		Select(ent.Columns).
		Exec(ctx, &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return map[string]json.RawMessage{}, nil
	}
	return rows[0], nil
}

// updateRecord patches a row that is already inside the caller's scope.
func updateRecord(ctx context.Context, sb *supabase.Client, acc *access, ent *entity, id string, values map[string]json.RawMessage) (map[string]json.RawMessage, error) {
	if err := authorizeWrite(acc, ent, "update"); err != nil {
		return nil, err
	}
	if err := rejectBlockedColumns(ent, values); err != nil {
		return nil, err
	}
	if _, err := getRecord(ctx, sb, acc, ent, id); err != nil {
		return nil, err
	}
	payload := make(map[string]any, len(values))
	for k, v := range values {
		if k == "group_id" && !acc.Unrestricted {
			// Moving a row into another group would escape the caller's scope.
			continue
		}
		payload[k] = v
	}
	if len(payload) == 0 {
		return nil, errors.New("no updatable fields supplied")
	}

	var rows []map[string]json.RawMessage
	if err := sb.From(ent.Table).
		Eq(primaryKeyColumn(ent), id).
		Update(payload).
		Returning().
		Select(ent.Columns).
		Exec(ctx, &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, errNotFound
	}
	return rows[0], nil
}

// deleteRecord removes a row that is already inside the caller's scope.
func deleteRecord(ctx context.Context, sb *supabase.Client, acc *access, ent *entity, id string) error {
	if err := authorizeWrite(acc, ent, "delete"); err != nil {
		return err
	}
	if _, err := getRecord(ctx, sb, acc, ent, id); err != nil {
		return err
	}
	return sb.From(ent.Table).
		Eq(primaryKeyColumn(ent), id).
		Delete().
		Exec(ctx, nil)
}

// rejectBlockedColumns stops create_record/update_record from writing a
// column a dedicated upload tool owns (path convention, WebP conversion,
// array/size caps), pointing the caller at upload_file instead.
func rejectBlockedColumns(ent *entity, values map[string]json.RawMessage) error {
	for column := range values {
		if isBlockedWriteColumn(ent.Table, column) {
			return fmt.Errorf("%s.%s is managed by upload_file / prepare_upload+finalize_upload, not create_record or update_record; call list_upload_kinds to find the matching kind", ent.Table, column)
		}
	}
	return nil
}

// needsGroupColumn reports whether inserts must carry an explicit group_id.
func needsGroupColumn(ent *entity) bool {
	return ent.Scope == scopeGroup && contains(ent.Filterable, "group_id")
}

// resolveWriteGroup picks the group a new row belongs to, requiring an explicit
// choice when the caller belongs to more than one.
func resolveWriteGroup(acc *access, values map[string]json.RawMessage) (string, error) {
	if raw, present := values["group_id"]; present {
		var requested string
		if json.Unmarshal(raw, &requested) == nil && requested != "" {
			if !contains(acc.GroupIDs, requested) {
				return "", fmt.Errorf("%w: group_id %s is not one of your groups", errForbidden, requested)
			}
			return requested, nil
		}
	}
	switch len(acc.GroupIDs) {
	case 0:
		return "", fmt.Errorf("%w: you do not belong to a group", errForbidden)
	case 1:
		return acc.GroupIDs[0], nil
	default:
		return "", fmt.Errorf("group_id is required: you belong to %d groups", len(acc.GroupIDs))
	}
}
