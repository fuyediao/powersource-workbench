package calendar

import "testing"

func TestMapGoogleTimesAllDayExclusiveEnd(t *testing.T) {
	ev := googleEvent{}
	ev.Start.Date = "2026-08-27"
	ev.End.Date = "2026-08-28" // Google exclusive end for Ghost Festival
	startAt, endAt, allDay, ok := mapGoogleTimes(ev)
	if !ok || !allDay {
		t.Fatalf("expected all-day ok, got ok=%v allDay=%v", ok, allDay)
	}
	if !stringsHasPrefix(startAt, "2026-08-27") {
		t.Fatalf("startAt = %q, want 2026-08-27…", startAt)
	}
	if !stringsHasPrefix(endAt, "2026-08-27") {
		t.Fatalf("endAt = %q, want inclusive 2026-08-27… (not exclusive 28)", endAt)
	}
}

func TestMapGoogleTimesAllDayMultiDay(t *testing.T) {
	ev := googleEvent{}
	ev.Start.Date = "2026-08-27"
	ev.End.Date = "2026-08-30" // exclusive → inclusive through Aug 29
	_, endAt, allDay, ok := mapGoogleTimes(ev)
	if !ok || !allDay {
		t.Fatalf("expected all-day ok")
	}
	if !stringsHasPrefix(endAt, "2026-08-29") {
		t.Fatalf("endAt = %q, want 2026-08-29…", endAt)
	}
}

func TestBuildGoogleEventWriteAllDayExclusiveEnd(t *testing.T) {
	body := buildGoogleEventWrite(
		"Ghost Festival",
		"",
		"2026-08-27T00:00:00Z",
		"2026-08-27T00:00:00Z",
		true,
		"",
		nil,
	)
	start, _ := body.Start.(map[string]string)
	end, _ := body.End.(map[string]string)
	if start["date"] != "2026-08-27" {
		t.Fatalf("start date = %q", start["date"])
	}
	if end["date"] != "2026-08-28" {
		t.Fatalf("end date = %q, want exclusive 2026-08-28", end["date"])
	}
}

func stringsHasPrefix(s, prefix string) bool {
	return len(s) >= len(prefix) && s[:len(prefix)] == prefix
}
