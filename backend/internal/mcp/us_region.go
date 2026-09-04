package mcp

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

// Virtual filter key for GeoCRM US East / West sales territories.
// Matches the Electron customers list (company_state IN abbr + English name).
const filterUsRegion = "us_region"

// unitedStatesCountry is the canonical customers.company_country label used with
// the US region filter (same as the Electron customers pane).
const unitedStatesCountry = "United States"

// maxUsRegionCustomerIDs caps how many customer ids a via-customer_id region
// lookup may load. Beyond this the agent should narrow with extra filters.
const maxUsRegionCustomerIDs = 5000

// usRegionCustomerPage is the PostgREST page size when resolving region → ids.
const usRegionCustomerPage = 1000

// errNoMatchingRows signals that a filter resolved to an empty set (for example
// no customers in the requested US region). Callers should return empty results.
var errNoMatchingRows = errors.New("no matching rows")

// Custom US West territory postal codes (19 states). Same order as the Electron
// us-east-west-regions constants; lists do not overlap with East.
var usWestStateCodes = []string{
	"WA", "AK", "HI", "AZ", "CO", "UT", "ID", "MT", "WY", "ND",
	"SD", "TX", "OK", "NM", "AL", "LA", "CA", "NV", "OR",
}

// Custom US East territory postal codes (31 states + DC).
var usEastStateCodes = []string{
	"NC", "SC", "GA", "FL", "MS", "TN", "VA", "WV", "MD", "DC",
	"NY", "NJ", "CT", "ME", "PA", "NH", "MA", "RI", "DE", "MO",
	"IA", "NE", "KS", "MI", "OH", "IN", "IL", "KY", "MN", "WI",
	"AR", "VT",
}

// English full names keyed by postal code (including DC).
var usStateCodeToName = map[string]string{
	"AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
	"CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
	"DC": "District of Columbia", "FL": "Florida", "GA": "Georgia", "HI": "Hawaii",
	"ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa",
	"KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine",
	"MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota",
	"MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska",
	"NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico",
	"NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio",
	"OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island",
	"SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas",
	"UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
	"WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
}

// normalizeUsRegion maps agent-facing values to east|west.
// Accepts English and common Chinese aliases used in CRM UI copy.
//
// Parameters:
//   - raw: filter value from search_records / count_records / summarize_records
//
// Returns:
//   - "east" or "west", or an error when the value is not recognized
func normalizeUsRegion(raw string) (string, error) {
	v := strings.ToLower(strings.TrimSpace(raw))
	v = strings.ReplaceAll(v, "_", " ")
	v = strings.ReplaceAll(v, "-", " ")
	v = strings.Join(strings.Fields(v), " ")
	switch v {
	case "west", "western", "us west", "usa west", "united states west", "america west":
		return "west", nil
	case "east", "eastern", "us east", "usa east", "united states east", "america east":
		return "east", nil
	case "西部", "美西", "美国西部", "美國西部":
		return "west", nil
	case "东部", "東部", "美东", "美東", "美国东部", "美國東部":
		return "east", nil
	default:
		return "", fmt.Errorf(
			`us_region must be "east" or "west" (also accepted: eastern/western and common locale aliases); got %q`,
			raw,
		)
	}
}

// companyStateValuesForUsRegion builds company_state.in(...) match values
// (postal codes plus English names in common letter-case variants), matching
// the Electron customers filter.
//
// Parameters:
//   - region: "east" or "west"
//
// Returns:
//   - Deduplicated abbreviations and full names (e.g. OH, oh, Ohio, OHIO, ohio)
func companyStateValuesForUsRegion(region string) []string {
	codes := usEastStateCodes
	if region == "west" {
		codes = usWestStateCodes
	}
	out := make([]string, 0, len(codes)*5)
	seen := make(map[string]struct{}, len(codes)*5)
	add := func(raw string) {
		v := strings.TrimSpace(raw)
		if v == "" {
			return
		}
		if _, ok := seen[v]; ok {
			return
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	for _, code := range codes {
		name := usStateCodeToName[code]
		add(code)
		add(strings.ToLower(code))
		add(name)
		add(strings.ToUpper(name))
		add(strings.ToLower(name))
	}
	return out
}

// supportsUsRegion reports whether an entity accepts the virtual us_region filter.
// Customers match on company_state; other entities must expose customer_id so
// rows can be narrowed to customers in that territory (orders, opportunities, …).
//
// Parameters:
//   - ent: entity descriptor
//
// Returns:
//   - true when filters.us_region is allowed
func supportsUsRegion(ent *entity) bool {
	if ent == nil {
		return false
	}
	if ent.Key == "customers" {
		return true
	}
	return contains(ent.Filterable, "customer_id")
}

// filterableFieldsForEntity returns Filterable plus virtual keys such as us_region.
//
// Parameters:
//   - ent: entity descriptor
//
// Returns:
//   - Column and virtual filter keys exposed to agents
func filterableFieldsForEntity(ent *entity) []string {
	if ent == nil {
		return nil
	}
	out := append([]string{}, ent.Filterable...)
	if supportsUsRegion(ent) && !contains(out, filterUsRegion) {
		out = append(out, filterUsRegion)
	}
	return out
}

// peelUsRegion removes us_region from filters and returns the normalized region.
//
// Parameters:
//   - filters: tool filter map (may be nil)
//
// Returns:
//   - region ("east"/"west" or ""), remaining filters, and a normalize error
func peelUsRegion(filters map[string]string) (region string, rest map[string]string, err error) {
	if len(filters) == 0 {
		return "", filters, nil
	}
	raw, ok := filters[filterUsRegion]
	if !ok {
		return "", filters, nil
	}
	region, err = normalizeUsRegion(raw)
	if err != nil {
		return "", nil, err
	}
	rest = make(map[string]string, len(filters)-1)
	for k, v := range filters {
		if k == filterUsRegion {
			continue
		}
		rest[k] = v
	}
	return region, rest, nil
}

// applyUsRegionFilter narrows q to the GeoCRM US East/West sales territory.
//
// Parameters:
//   - ctx: request context
//   - sb: Supabase client
//   - acc: caller access
//   - q: query already scoped for ent
//   - ent: target entity
//   - region: "east" or "west"
//
// Returns:
//   - errNoMatchingRows when no customers match; other errors on lookup failure
func applyUsRegionFilter(
	ctx context.Context,
	sb *supabase.Client,
	acc *access,
	q *supabase.Query,
	ent *entity,
	region string,
) error {
	if !supportsUsRegion(ent) {
		return fmt.Errorf(
			"filter %q is not supported on %s (use customers, or an entity with customer_id such as orders)",
			filterUsRegion, ent.Key,
		)
	}
	states := companyStateValuesForUsRegion(region)
	if len(states) == 0 {
		return errNoMatchingRows
	}

	if ent.Key == "customers" {
		q.Eq("company_country", unitedStatesCountry)
		q.In("company_state", states)
		return nil
	}

	ids, err := customerIDsForUsRegion(ctx, sb, acc, region)
	if err != nil {
		return err
	}
	if len(ids) == 0 {
		return errNoMatchingRows
	}
	q.In("customer_id", ids)
	return nil
}

// customerIDsForUsRegion lists in-scope US customers whose company_state is in
// the East or West territory.
//
// Parameters:
//   - ctx: request context
//   - sb: Supabase client
//   - acc: caller access
//   - region: "east" or "west"
//
// Returns:
//   - Customer UUIDs, or an error when the set exceeds the safety cap
func customerIDsForUsRegion(
	ctx context.Context,
	sb *supabase.Client,
	acc *access,
	region string,
) ([]string, error) {
	customers := lookupEntity("customers")
	if customers == nil {
		return nil, fmt.Errorf("mcp: customers entity missing")
	}
	states := companyStateValuesForUsRegion(region)
	out := make([]string, 0, 128)
	offset := 0
	for {
		q := sb.From(customers.Table).Select("id")
		ok, err := applyScope(ctx, sb, q, acc, customers)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, nil
		}
		q.Eq("company_country", unitedStatesCountry)
		q.In("company_state", states)
		q.Order("id", true)
		q.Limit(usRegionCustomerPage)
		if offset > 0 {
			q.Offset(offset)
		}
		var rows []struct {
			ID string `json:"id"`
		}
		if err := q.Exec(ctx, &rows); err != nil {
			return nil, err
		}
		for _, row := range rows {
			if row.ID == "" {
				continue
			}
			out = append(out, row.ID)
			if len(out) > maxUsRegionCustomerIDs {
				return nil, fmt.Errorf(
					"us_region=%s matched more than %d customers; narrow with extra filters (for example group_id or source) or page by bill_date",
					region, maxUsRegionCustomerIDs,
				)
			}
		}
		if len(rows) < usRegionCustomerPage {
			break
		}
		offset += usRegionCustomerPage
	}
	return out, nil
}

// describeUsSalesTerritories returns the canonical GeoCRM US East/West state
// lists for agents (same codes as the Electron customers pane).
//
// Returns:
//   - Payload with region keys, state codes, English names, and usage notes
func describeUsSalesTerritories() map[string]any {
	west := make([]map[string]string, 0, len(usWestStateCodes))
	for _, code := range usWestStateCodes {
		west = append(west, map[string]string{
			"code": code,
			"name": usStateCodeToName[code],
		})
	}
	east := make([]map[string]string, 0, len(usEastStateCodes))
	for _, code := range usEastStateCodes {
		east = append(east, map[string]string{
			"code": code,
			"name": usStateCodeToName[code],
		})
	}
	return map[string]any{
		"country": unitedStatesCountry,
		"filter":  filterUsRegion,
		"values":  []string{"east", "west"},
		"note": "Custom GeoCRM sales territories (not a simple Mississippi River split). " +
			"Lists cover all 50 US states plus DC and do not overlap. " +
			"Match customers.company_state by postal code or English full name. " +
			"On customers use filters.us_region=east|west; on orders and other customer_id entities the same filter keeps rows for those customers.",
		"west": map[string]any{
			"state_count": len(usWestStateCodes),
			"states":      west,
		},
		"east": map[string]any{
			"state_count": len(usEastStateCodes),
			"states":      east,
		},
	}
}
