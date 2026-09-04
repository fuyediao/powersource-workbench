package calendar

import (
	"strings"
	"time"
)

// parseGoogleRecurrence extracts an RRULE body (without the RRULE: prefix) and EXDATE
// instants from Google Calendar recurrence lines. RDATE and extra RRULE lines are ignored.
func parseGoogleRecurrence(lines []string) (rrule string, exdates []string) {
	for _, raw := range lines {
		line := strings.TrimSpace(raw)
		if line == "" {
			continue
		}
		upper := strings.ToUpper(line)
		if strings.HasPrefix(upper, "RRULE:") {
			if rrule == "" {
				rrule = strings.TrimSpace(line[len("RRULE:"):])
			}
			continue
		}
		if strings.HasPrefix(upper, "EXDATE") {
			exdates = append(exdates, parseExdateLine(line)...)
		}
	}
	return rrule, exdates
}

// parseExdateLine parses one EXDATE line into RFC3339 / RFC3339Nano UTC instants.
func parseExdateLine(line string) []string {
	idx := strings.LastIndex(line, ":")
	if idx < 0 || idx+1 >= len(line) {
		return nil
	}
	props := strings.ToUpper(line[:idx])
	valuePart := line[idx+1:]
	isDate := strings.Contains(props, "VALUE=DATE")
	var out []string
	for _, token := range strings.Split(valuePart, ",") {
		token = strings.TrimSpace(token)
		if token == "" {
			continue
		}
		if iso, ok := parseICalDateOrDateTime(token, isDate); ok {
			out = append(out, iso)
		}
	}
	return out
}

// originalStartISO returns the cancelled/modified instance's original start as an ISO instant.
func originalStartISO(ev googleEvent) (string, bool) {
	if ev.OriginalStartTime.Date != "" {
		return parseICalDateOrDateTime(strings.ReplaceAll(ev.OriginalStartTime.Date, "-", ""), true)
	}
	if ev.OriginalStartTime.DateTime != "" {
		if t, ok := parseISOTimestamp(ev.OriginalStartTime.DateTime); ok {
			return t.Format(time.RFC3339Nano), true
		}
	}
	return "", false
}

// parseICalDateOrDateTime parses iCalendar DATE (YYYYMMDD) or DATE-TIME tokens.
func parseICalDateOrDateTime(token string, forceDate bool) (string, bool) {
	token = strings.TrimSpace(token)
	if token == "" {
		return "", false
	}
	if forceDate || len(token) == 8 {
		day, err := time.Parse("20060102", token[:8])
		if err != nil {
			return "", false
		}
		return day.UTC().Format(time.RFC3339), true
	}
	layouts := []string{
		"20060102T150405Z",
		"20060102T150405",
		time.RFC3339Nano,
		time.RFC3339,
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, token); err == nil {
			return t.UTC().Format(time.RFC3339Nano), true
		}
	}
	return "", false
}

// mergeUniqueISO appends extras into base, skipping duplicate instants (millisecond precision).
func mergeUniqueISO(base []string, extras ...string) []string {
	seen := make(map[int64]struct{}, len(base)+len(extras))
	out := make([]string, 0, len(base)+len(extras))
	add := func(iso string) {
		iso = strings.TrimSpace(iso)
		if iso == "" {
			return
		}
		t, err := time.Parse(time.RFC3339Nano, iso)
		if err != nil {
			t, err = time.Parse(time.RFC3339, iso)
		}
		if err != nil {
			return
		}
		key := t.UTC().UnixMilli()
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}
		out = append(out, t.UTC().Format(time.RFC3339Nano))
	}
	for _, iso := range base {
		add(iso)
	}
	for _, iso := range extras {
		add(iso)
	}
	return out
}
