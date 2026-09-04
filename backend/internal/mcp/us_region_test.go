package mcp

import (
	"strings"
	"testing"
)

func TestNormalizeUsRegion(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"west", "west"},
		{"WEST", "west"},
		{"western", "west"},
		{"us-west", "west"},
		{"US West", "west"},
		{"西部", "west"},
		{"美西", "west"},
		{"美国西部", "west"},
		{"east", "east"},
		{"eastern", "east"},
		{"us_east", "east"},
		{"东部", "east"},
		{"美东", "east"},
		{"美國東部", "east"},
	}
	for _, tc := range cases {
		got, err := normalizeUsRegion(tc.in)
		if err != nil {
			t.Fatalf("normalizeUsRegion(%q): %v", tc.in, err)
		}
		if got != tc.want {
			t.Fatalf("normalizeUsRegion(%q)=%q, want %q", tc.in, got, tc.want)
		}
	}
	if _, err := normalizeUsRegion("midwest"); err == nil {
		t.Fatal("expected error for midwest")
	}
}

func TestCompanyStateValuesForUsRegion(t *testing.T) {
	west := companyStateValuesForUsRegion("west")
	if !contains(west, "CA") || !contains(west, "California") {
		t.Fatalf("west missing CA/California: %v", west)
	}
	if !contains(west, "TX") || !contains(west, "AL") {
		t.Fatalf("west should include TX and AL per CRM territory: %v", west)
	}
	if contains(west, "NY") {
		t.Fatal("west must not include NY")
	}

	east := companyStateValuesForUsRegion("east")
	if !contains(east, "NY") || !contains(east, "New York") || !contains(east, "DC") {
		t.Fatalf("east missing NY/New York/DC: %v", east)
	}
	if contains(east, "CA") {
		t.Fatal("east must not include CA")
	}
	// Letter-case variants stored in company_state must still match.
	for _, want := range []string{"OH", "oh", "Ohio", "OHIO", "ohio"} {
		if !contains(east, want) {
			t.Fatalf("east missing case variant %q: %v", want, east)
		}
	}
}

func TestSupportsUsRegion(t *testing.T) {
	if !supportsUsRegion(lookupEntity("customers")) {
		t.Fatal("customers should support us_region")
	}
	if !supportsUsRegion(lookupEntity("customer_contacts")) {
		t.Fatal("customer_contacts should support us_region via customer_id")
	}
	if supportsUsRegion(lookupEntity("groups")) {
		t.Fatal("groups should not support us_region")
	}
	if supportsUsRegion(lookupEntity("team_profiles")) {
		t.Fatal("team_profiles should not support us_region")
	}
}

func TestFilterableFieldsExposeUsRegion(t *testing.T) {
	for _, key := range []string{"customers", "customer_contacts"} {
		fields := filterableFieldsForEntity(lookupEntity(key))
		if !contains(fields, filterUsRegion) {
			t.Fatalf("%s filterable_fields missing us_region: %v", key, fields)
		}
	}
	customers := filterableFieldsForEntity(lookupEntity("customers"))
	if !contains(customers, "company_country") || !contains(customers, "company_state") {
		t.Fatalf("customers should expose company_country/state: %v", customers)
	}
}

func TestPeelUsRegion(t *testing.T) {
	region, rest, err := peelUsRegion(map[string]string{
		"us_region": "西部",
		"source":    "erp",
	})
	if err != nil {
		t.Fatal(err)
	}
	if region != "west" {
		t.Fatalf("region=%q", region)
	}
	if rest["source"] != "erp" {
		t.Fatalf("rest=%v", rest)
	}
	if _, ok := rest["us_region"]; ok {
		t.Fatal("us_region should be peeled")
	}
}

func TestDescribeEntitiesMentionsUsRegion(t *testing.T) {
	acc := memberAccess("desktop_admin")
	payload := describeEntities(acc)
	note, _ := payload["note"].(string)
	if !strings.Contains(note, "us_region") || !strings.Contains(note, "us_sales_territories") {
		t.Fatalf("list_entities note should mention us_region and us_sales_territories: %s", note)
	}
	territories, ok := payload["us_sales_territories"].(map[string]any)
	if !ok {
		t.Fatal("list_entities must include us_sales_territories")
	}
	west, _ := territories["west"].(map[string]any)
	east, _ := territories["east"].(map[string]any)
	westStates, _ := west["states"].([]map[string]string)
	eastStates, _ := east["states"].([]map[string]string)
	if len(westStates) != len(usWestStateCodes) {
		t.Fatalf("west state_count=%d want %d", len(westStates), len(usWestStateCodes))
	}
	if len(eastStates) != len(usEastStateCodes) {
		t.Fatalf("east state_count=%d want %d", len(eastStates), len(usEastStateCodes))
	}
	if westStates[0]["code"] == "" || westStates[0]["name"] == "" {
		t.Fatalf("west states must include code and name: %#v", westStates[0])
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
		t.Fatal("customers entity missing")
	}
	fields, _ := customers["filterable_fields"].([]string)
	if !contains(fields, filterUsRegion) {
		t.Fatalf("customers filterable_fields=%v", fields)
	}
	hint, _ := customers["query_hint"].(string)
	if !strings.Contains(hint, "us_region") {
		t.Fatalf("customers hint should mention us_region: %s", hint)
	}
}
