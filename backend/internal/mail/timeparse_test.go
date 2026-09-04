package mail

import "testing"

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
