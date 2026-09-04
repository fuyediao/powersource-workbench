package calendar

import (
	"strings"
	"testing"
	"time"
)

func TestParseGoogleRecurrence(t *testing.T) {
	rrule, exdates := parseGoogleRecurrence([]string{
		"RRULE:FREQ=WEEKLY;BYDAY=MO",
		"EXDATE:20240108T140000Z",
		"EXDATE;VALUE=DATE:20240201",
		"RDATE:20240301T140000Z",
	})
	if rrule != "FREQ=WEEKLY;BYDAY=MO" {
		t.Fatalf("rrule=%q", rrule)
	}
	if len(exdates) != 2 {
		t.Fatalf("exdates len=%d %#v", len(exdates), exdates)
	}
	if !strings.HasPrefix(exdates[0], "2024-01-08T14:00:00") {
		t.Fatalf("exdate0=%q", exdates[0])
	}
	day, err := time.Parse(time.RFC3339, exdates[1])
	if err != nil || day.UTC().Format("2006-01-02") != "2024-02-01" {
		t.Fatalf("exdate1=%q err=%v", exdates[1], err)
	}
}

func TestMergeUniqueISO(t *testing.T) {
	a := "2024-01-08T14:00:00.000000000Z"
	b := "2024-01-08T14:00:00Z"
	c := "2024-01-15T14:00:00Z"
	got := mergeUniqueISO([]string{a}, b, c)
	if len(got) != 2 {
		t.Fatalf("got=%#v", got)
	}
}
