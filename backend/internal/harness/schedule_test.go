package harness

import (
	"testing"
	"time"
)

func TestCronExpression(t *testing.T) {
	cases := []struct {
		name     string
		schedule Schedule
		want     string
	}{
		{"daily", Schedule{Kind: "daily", Time: "08:00"}, "0 8 * * *"},
		{"weekdays", Schedule{Kind: "weekdays", Time: "09:30"}, "30 9 * * 1-5"},
		{
			"weekly sorted",
			Schedule{Kind: "weekly", Time: "16:00", Days: []string{"fri", "mon"}},
			"0 16 * * 1,5",
		},
		{"weekly defaults to monday", Schedule{Kind: "weekly", Time: "07:05"}, "5 7 * * 1"},
		{"malformed time falls back", Schedule{Kind: "daily", Time: "not-a-time"}, "0 9 * * *"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := tc.schedule.CronExpression(); got != tc.want {
				t.Fatalf("CronExpression() = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestScheduleValid(t *testing.T) {
	if (Schedule{Kind: "monthly", Time: "08:00"}).Valid() {
		t.Fatal("monthly must not validate")
	}
	if (Schedule{Kind: "daily", Time: "24:00"}).Valid() {
		t.Fatal("hour 24 must not validate")
	}
	if !(Schedule{Kind: "daily", Time: "23:59"}).Valid() {
		t.Fatal("23:59 must validate")
	}
	if (Schedule{Kind: "daily", Time: "08:00", TimeZone: "Not/A_Zone"}).Valid() {
		t.Fatal("an unknown time zone must not validate")
	}
}

func TestNextRunAfterUsesScheduleTimeZone(t *testing.T) {
	from := time.Date(2026, time.August, 25, 23, 30, 0, 0, time.UTC)
	next, ok := Schedule{Kind: "daily", Time: "08:00", TimeZone: "Asia/Shanghai"}.NextRunAfter(from)
	if !ok {
		t.Fatal("zoned schedule must produce a next run")
	}
	if next.Location().String() != "Asia/Shanghai" || next.Day() != 26 || next.Hour() != 8 {
		t.Fatalf("next run = %v, want August 26 at 08:00 Asia/Shanghai", next)
	}
}

func TestNextRunAfterSkipsWeekend(t *testing.T) {
	// Friday 2026-08-28 at 18:00 local.
	from := time.Date(2026, time.August, 28, 18, 0, 0, 0, time.Local)
	next, ok := Schedule{Kind: "weekdays", Time: "08:00"}.NextRunAfter(from)
	if !ok {
		t.Fatal("weekday schedule must produce a next run")
	}
	if next.Weekday() != time.Monday {
		t.Fatalf("next run weekday = %v, want Monday", next.Weekday())
	}
	if next.Hour() != 8 || next.Minute() != 0 {
		t.Fatalf("next run time = %02d:%02d, want 08:00", next.Hour(), next.Minute())
	}
}

func TestNextRunAfterSameDayLaterTime(t *testing.T) {
	from := time.Date(2026, time.August, 25, 6, 0, 0, 0, time.Local)
	next, ok := Schedule{Kind: "daily", Time: "08:00"}.NextRunAfter(from)
	if !ok {
		t.Fatal("daily schedule must produce a next run")
	}
	if next.Day() != 25 || next.Hour() != 8 {
		t.Fatalf("next run = %v, want same day at 08:00", next)
	}
}

func TestIsSafeProfileName(t *testing.T) {
	if isSafeProfileName("../../etc") {
		t.Fatal("path traversal must be rejected")
	}
	if isSafeProfileName("") {
		t.Fatal("empty user id must be rejected")
	}
	if !isSafeProfileName("2f1a9c4e-1234-4bcd-9876-abcdef012345") {
		t.Fatal("a Supabase UUID must be accepted")
	}
}

func TestJobStoreRoundTrip(t *testing.T) {
	profile := t.TempDir()
	jobs, err := loadJobs(profile)
	if err != nil {
		t.Fatalf("loadJobs on empty profile: %v", err)
	}
	if len(jobs) != 0 {
		t.Fatalf("expected no jobs, got %d", len(jobs))
	}

	job := Job{
		ID:       "abc123",
		Name:     "Daily brief",
		Prompt:   "Summarize unread mail",
		Schedule: Schedule{Kind: "weekdays", Time: "08:00"},
		Target:   targetVPS,
	}
	refreshNextRun(&job, time.Date(2026, time.August, 25, 6, 0, 0, 0, time.Local))
	if job.NextRunAtMs == nil {
		t.Fatal("an active job must have a next run")
	}

	if err := saveJobs(profile, []Job{job}); err != nil {
		t.Fatalf("saveJobs: %v", err)
	}
	stored, err := loadJobs(profile)
	if err != nil {
		t.Fatalf("loadJobs: %v", err)
	}
	if len(stored) != 1 || stored[0].ID != "abc123" || stored[0].Target != targetVPS {
		t.Fatalf("unexpected stored jobs: %+v", stored)
	}
}

func TestRefreshNextRunClearsWhenPaused(t *testing.T) {
	job := Job{Schedule: Schedule{Kind: "daily", Time: "08:00"}, Paused: true}
	refreshNextRun(&job, time.Now())
	if job.NextRunAtMs != nil {
		t.Fatal("a paused job must not have a next run")
	}
}
