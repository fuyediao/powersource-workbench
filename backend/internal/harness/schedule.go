package harness

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Schedule is the recurrence the desktop Scheduled view offers. It is kept
// structured so the next-run time (and the five-field expression used in
// tests) are derived from one source.
type Schedule struct {
	// Kind is "daily", "weekdays", or "weekly".
	Kind string `json:"kind"`
	// Time is 24h "HH:MM" in the server's local zone.
	Time string `json:"time"`
	// Days applies to "weekly" only: mon..sun.
	Days []string `json:"days"`
	// TimeZone is an IANA zone supplied by the desktop, for example Asia/Shanghai.
	TimeZone string `json:"timeZone,omitempty"`
}

// cronDay maps a weekday key to its cron day-of-week number (Sunday is 0).
var cronDay = map[string]int{
	"sun": 0,
	"mon": 1,
	"tue": 2,
	"wed": 3,
	"thu": 4,
	"fri": 5,
	"sat": 6,
}

// parseTime splits "HH:MM", falling back to 09:00 for malformed input.
func (s Schedule) parseTime() (int, int) {
	hour, minute, ok := strings.Cut(strings.TrimSpace(s.Time), ":")
	if !ok {
		return 9, 0
	}
	h, errH := strconv.Atoi(hour)
	m, errM := strconv.Atoi(minute)
	if errH != nil || errM != nil || h < 0 || h > 23 || m < 0 || m > 59 {
		return 9, 0
	}
	return h, m
}

// normalizedDays returns the weekly day list, defaulting to Monday.
func (s Schedule) normalizedDays() []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(s.Days))
	for _, day := range s.Days {
		key := strings.ToLower(strings.TrimSpace(day))
		if _, ok := cronDay[key]; ok && !seen[key] {
			seen[key] = true
			out = append(out, key)
		}
	}
	if len(out) == 0 {
		return []string{"mon"}
	}
	return out
}

// Valid reports whether the schedule can be scheduled.
func (s Schedule) Valid() bool {
	switch s.Kind {
	case "daily", "weekdays", "weekly":
	default:
		return false
	}
	hour, minute, ok := strings.Cut(strings.TrimSpace(s.Time), ":")
	if !ok {
		return false
	}
	h, errH := strconv.Atoi(hour)
	m, errM := strconv.Atoi(minute)
	if errH != nil || errM != nil || h < 0 || h > 23 || m < 0 || m > 59 {
		return false
	}
	if strings.TrimSpace(s.TimeZone) != "" {
		_, err := time.LoadLocation(strings.TrimSpace(s.TimeZone))
		return err == nil
	}
	return true
}

// CronExpression renders the five-field expression for the structured schedule.
func (s Schedule) CronExpression() string {
	h, m := s.parseTime()
	switch s.Kind {
	case "daily":
		return fmt.Sprintf("%d %d * * *", m, h)
	case "weekdays":
		return fmt.Sprintf("%d %d * * 1-5", m, h)
	default:
		days := s.normalizedDays()
		numbers := make([]int, 0, len(days))
		for _, day := range days {
			numbers = append(numbers, cronDay[day])
		}
		sort.Ints(numbers)
		parts := make([]string, 0, len(numbers))
		for _, n := range numbers {
			parts = append(parts, strconv.Itoa(n))
		}
		return fmt.Sprintf("%d %d * * %s", m, h, strings.Join(parts, ","))
	}
}

// firesOn reports whether the schedule runs on the given weekday.
func (s Schedule) firesOn(weekday time.Weekday) bool {
	switch s.Kind {
	case "daily":
		return true
	case "weekdays":
		return weekday >= time.Monday && weekday <= time.Friday
	default:
		for _, day := range s.normalizedDays() {
			if cronDay[day] == int(weekday) {
				return true
			}
		}
		return false
	}
}

// NextRunAfter returns the next local fire time strictly after `from`.
func (s Schedule) NextRunAfter(from time.Time) (time.Time, bool) {
	h, m := s.parseTime()
	location := from.Location()
	if zone := strings.TrimSpace(s.TimeZone); zone != "" {
		loaded, err := time.LoadLocation(zone)
		if err != nil {
			return time.Time{}, false
		}
		location = loaded
	}
	localFrom := from.In(location)
	for offset := range 8 {
		day := localFrom.AddDate(0, 0, offset)
		candidate := time.Date(day.Year(), day.Month(), day.Day(), h, m, 0, 0, location)
		if candidate.After(from) && s.firesOn(candidate.Weekday()) {
			return candidate, true
		}
	}
	return time.Time{}, false
}
