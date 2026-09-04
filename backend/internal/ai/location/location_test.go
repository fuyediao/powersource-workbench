package location

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
	"unicode"
)

func TestParseAndStripFencedMJSON(t *testing.T) {
	text := "Here are some great spots to check out.\n\n```mjson\n" +
		`[{"name":"Cafe One","latitude":37.5,"longitude":-121.9,"openSunday":true}]` +
		"\n```"
	locations, prose := ParseAndStrip(text)
	if len(locations) != 1 {
		t.Fatalf("expected 1 location, got %d", len(locations))
	}
	if locations[0].Name != "Cafe One" || locations[0].Latitude != 37.5 || locations[0].Longitude != -121.9 {
		t.Fatalf("unexpected location: %+v", locations[0])
	}
	if !locations[0].OpenSunday {
		t.Fatalf("expected OpenSunday true")
	}
	if strings.Contains(prose, "```") || strings.Contains(prose, "Cafe One") {
		t.Fatalf("expected prose to have the mjson block stripped, got %q", prose)
	}
	if !strings.Contains(prose, "great spots") {
		t.Fatalf("expected prose to keep the summary text, got %q", prose)
	}
}

func TestParseAndStripKeepsJSONFence(t *testing.T) {
	text := "Example payload:\n\n```json\n" +
		`[{"name":"Shown","latitude":1,"longitude":2}]` +
		"\n```"
	locations, prose := ParseAndStrip(text)
	if len(locations) != 0 {
		t.Fatalf("expected json fences not to become pins, got %+v", locations)
	}
	if !strings.Contains(prose, "```json") || !strings.Contains(prose, "Shown") {
		t.Fatalf("expected ordinary json fence to stay visible, got %q", prose)
	}
}

func TestParseAndStripMJSONBeatsGeoData(t *testing.T) {
	text := "Summary text.\n```mjson\n[{\"name\":\"Mjson Spot\",\"latitude\":9,\"longitude\":8}]\n```\n<geo_data>[{\"name\":\"Geo Spot\",\"latitude\":\"1.5\",\"longitude\":\"2.5\"}]</geo_data>"
	locations, prose := ParseAndStrip(text)
	if len(locations) != 1 || locations[0].Name != "Mjson Spot" {
		t.Fatalf("expected mjson block to take priority, got %+v", locations)
	}
	if strings.Contains(prose, "geo_data") || strings.Contains(prose, "```") {
		t.Fatalf("expected both machine blocks stripped from prose, got %q", prose)
	}
}

func TestParseAndStripGeoDataFallback(t *testing.T) {
	text := "Summary text.\n<geo_data>[{\"name\":\"Geo Spot\",\"latitude\":\"1.5\",\"longitude\":\"2.5\"}]</geo_data>"
	locations, prose := ParseAndStrip(text)
	if len(locations) != 1 || locations[0].Name != "Geo Spot" {
		t.Fatalf("expected geo_data fallback, got %+v", locations)
	}
	if locations[0].Latitude != 1.5 || locations[0].Longitude != 2.5 {
		t.Fatalf("expected string coordinates to be tolerated, got %+v", locations[0])
	}
	if strings.Contains(prose, "geo_data") {
		t.Fatalf("expected geo_data stripped from prose, got %q", prose)
	}
}

func TestParseAndStripNoLocations(t *testing.T) {
	locations, prose := ParseAndStrip("Just a plain answer, no map data here.")
	if len(locations) != 0 {
		t.Fatalf("expected no locations, got %d", len(locations))
	}
	if prose != "Just a plain answer, no map data here." {
		t.Fatalf("expected prose unchanged, got %q", prose)
	}
}

func TestParseAndStripDropsInvalidRows(t *testing.T) {
	text := "```mjson\n[{\"name\":\"\",\"latitude\":1,\"longitude\":2},{\"name\":\"Valid\",\"latitude\":\"not-a-number\",\"longitude\":2},{\"name\":\"Kept\",\"latitude\":3,\"longitude\":4}]\n```"
	locations, _ := ParseAndStrip(text)
	if len(locations) != 1 || locations[0].Name != "Kept" {
		t.Fatalf("expected only the valid row to survive, got %+v", locations)
	}
}

func TestPersistNoLocationsIsNoop(t *testing.T) {
	id, err := Persist(nil, nil, "user-1", "aichat", "map", nil)
	if err != nil || id != "" {
		t.Fatalf("expected no-op for empty locations, got id=%q err=%v", id, err)
	}
}

func TestMapSearchInstructionsEnglish(t *testing.T) {
	for _, anchor := range []string{
		"untrusted data",
		"WGS84 (EPSG:4326)",
		"exactly one mjson block",
		"strict JSON array",
	} {
		if !strings.Contains(MapSearchInstructions, anchor) {
			t.Errorf("MapSearchInstructions missing policy anchor %q", anchor)
		}
	}
	for _, forbidden := range []string{
		"```json",
		"<geo_data>",
		"Approximate coordinates are acceptable",
		"Aim for 10-15 relevant locations",
		"Include both open and closed places",
	} {
		if strings.Contains(MapSearchInstructions, forbidden) {
			t.Errorf("MapSearchInstructions contains obsolete or unsafe text %q", forbidden)
		}
	}
	for _, r := range MapSearchInstructions {
		if unicode.In(r, unicode.Han, unicode.Hangul, unicode.Hiragana, unicode.Katakana) {
			t.Fatalf("MapSearchInstructions contains CJK rune %q", r)
		}
	}
}

func TestMapSearchInstructionsMJSONExampleMatchesLocationContract(t *testing.T) {
	matches := mjsonBlockRe.FindAllStringSubmatch(MapSearchInstructions, -1)
	if len(matches) != 1 {
		t.Fatalf("MapSearchInstructions has %d mjson fences, want exactly 1", len(matches))
	}
	if got := strings.Count(MapSearchInstructions, "```"); got != 2 {
		t.Fatalf("MapSearchInstructions has %d code-fence markers, want exactly 2", got)
	}

	var rows []map[string]any
	if err := json.Unmarshal([]byte(matches[0][1]), &rows); err != nil {
		t.Fatalf("mjson example is not strict JSON: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("mjson example has %d rows, want 1", len(rows))
	}

	wantFields := make(map[string]struct{})
	locationType := reflect.TypeOf(Location{})
	for i := 0; i < locationType.NumField(); i++ {
		tag := strings.Split(locationType.Field(i).Tag.Get("json"), ",")[0]
		if tag != "" && tag != "-" {
			wantFields[tag] = struct{}{}
		}
	}
	if len(rows[0]) != len(wantFields) {
		t.Fatalf("mjson example has %d fields, Location has %d", len(rows[0]), len(wantFields))
	}
	for field := range wantFields {
		if _, ok := rows[0][field]; !ok {
			t.Errorf("mjson example is missing Location field %q", field)
		}
	}
	for field := range rows[0] {
		if _, ok := wantFields[field]; !ok {
			t.Errorf("mjson example has unsupported field %q", field)
		}
	}

	latitude, latitudeOK := rows[0]["latitude"].(float64)
	longitude, longitudeOK := rows[0]["longitude"].(float64)
	_, sundayOK := rows[0]["openSunday"].(bool)
	if !latitudeOK || latitude < -90 || latitude > 90 {
		t.Errorf("mjson example latitude = %#v, want a number in range", rows[0]["latitude"])
	}
	if !longitudeOK || longitude < -180 || longitude > 180 {
		t.Errorf("mjson example longitude = %#v, want a number in range", rows[0]["longitude"])
	}
	if !sundayOK {
		t.Errorf("mjson example openSunday = %#v, want a boolean", rows[0]["openSunday"])
	}

	locations, prose := ParseAndStrip(MapSearchInstructions)
	if len(locations) != 1 {
		t.Fatalf("production parser extracted %d locations from prompt example, want 1", len(locations))
	}
	if strings.Contains(prose, "```mjson") {
		t.Fatal("production parser did not strip the prompt's mjson example")
	}
}
