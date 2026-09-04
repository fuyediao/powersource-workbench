package gmail

import (
	"encoding/json"
	"testing"
	"time"
)

func TestParseISOTimestamp(t *testing.T) {
	tests := []struct {
		in   string
		want bool
	}{
		{"2026-06-15T01:00:00.123456789Z", true},
		{"2026-06-14T20:00:00.000Z", true},
		{"2026-06-14T20:00:00Z", true},
		{"2026-06-14T20:00:00+00:00", true},
		{"", false},
	}
	for _, tc := range tests {
		_, ok := parseISOTimestamp(tc.in)
		if ok != tc.want {
			t.Fatalf("parseISOTimestamp(%q) ok=%v want %v", tc.in, ok, tc.want)
		}
	}
}

func TestInternalDateRFC3339(t *testing.T) {
	got := internalDateRFC3339("1749949200000")
	if got == "" {
		t.Fatal("expected non-empty RFC3339 from string internalDate")
	}
	if _, err := time.Parse(time.RFC3339Nano, got); err != nil {
		t.Fatalf("invalid RFC3339Nano: %v", err)
	}

	var raw map[string]any
	if err := json.Unmarshal([]byte(`{"internalDate":1749949200000}`), &raw); err != nil {
		t.Fatal(err)
	}
	got = internalDateRFC3339(raw["internalDate"])
	if got == "" {
		t.Fatal("expected non-empty RFC3339 from numeric internalDate")
	}
}

func TestIncrementalSinceUsesEarliestCursor(t *testing.T) {
	dbLatest := time.Date(2026, 6, 14, 15, 0, 12, 0, time.UTC)
	since, ok := incrementalSince(
		new("2026-06-15T01:10:19.249495+00:00"),
		new(dbLatest),
	)
	if !ok {
		t.Fatal("expected cursor")
	}
	if !since.Equal(dbLatest) {
		t.Fatalf("since=%v want dbLatest=%v", since, dbLatest)
	}
}

func TestAfterEpochSecondsOverlap(t *testing.T) {
	t0 := time.Unix(1000, 0).UTC()
	if afterEpochSeconds(t0) != 880 {
		t.Fatalf("expected overlap subtraction, got %d", afterEpochSeconds(t0))
	}
}
