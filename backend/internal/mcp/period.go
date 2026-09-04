package mcp

import (
	"fmt"
	"strings"
	"time"
)

// Report period kinds accepted by summarize_records.
const (
	periodWeek     = "week"
	periodMonth    = "month"
	periodQuarter  = "quarter"
	periodHalfYear = "half_year"
	periodYear     = "year"
	periodCustom   = "custom"
)

// defaultReportLocation is the calendar used when timezone is omitted.
// GeoCRM order dates are interpreted in Taiwan local time for month/week
// boundaries so a 16:00 UTC bill on 30 June still counts as 1 July.
const defaultReportLocation = "Asia/Taipei"

// periodSpec is the resolved half-open interval [From, Until) for a report.
type periodSpec struct {
	Kind     string
	Label    string
	Year     int
	Week     int
	Month    int
	Quarter  int
	Half     int
	Timezone string
	From     time.Time
	Until    time.Time
}

// periodArgs is the subset of tool arguments that define a reporting window.
type periodArgs struct {
	Period   string
	Year     int
	Week     int
	Month    int
	Quarter  int
	Half     int
	DateFrom string
	DateTo   string
	Timezone string
}

// loadReportLocation resolves an IANA timezone, falling back to UTC when the
// name is unknown or tzdata is missing from the host.
func loadReportLocation(name string) *time.Location {
	name = strings.TrimSpace(name)
	if name == "" {
		name = defaultReportLocation
	}
	loc, err := time.LoadLocation(name)
	if err != nil {
		return time.UTC
	}
	return loc
}

// resolvePeriod builds a half-open [from, until) window from preset period
// fields or an inclusive custom date_from/date_to pair.
func resolvePeriod(args periodArgs) (*periodSpec, error) {
	loc := loadReportLocation(args.Timezone)
	tzName := loc.String()
	if args.Timezone != "" {
		tzName = strings.TrimSpace(args.Timezone)
	}

	period := strings.TrimSpace(args.Period)
	hasCustom := strings.TrimSpace(args.DateFrom) != "" || strings.TrimSpace(args.DateTo) != ""
	if period == "" && hasCustom {
		period = periodCustom
	}
	switch period {
	case periodWeek, periodMonth, periodQuarter, periodHalfYear, periodYear, periodCustom:
	case "":
		return nil, fmt.Errorf("period is required (week, month, quarter, half_year, year) or pass date_from and date_to")
	default:
		return nil, fmt.Errorf("unknown period %q; use week, month, quarter, half_year, year, or date_from/date_to", period)
	}

	if period == periodCustom {
		from, until, err := customDateBounds(args.DateFrom, args.DateTo, loc)
		if err != nil {
			return nil, err
		}
		return &periodSpec{
			Kind:     periodCustom,
			Label:    from.In(loc).Format("2006-01-02") + " .. " + until.In(loc).Add(-time.Nanosecond).Format("2006-01-02"),
			Timezone: tzName,
			From:     from,
			Until:    until,
		}, nil
	}

	if args.Year < 2000 || args.Year > 2100 {
		return nil, fmt.Errorf("year must be between 2000 and 2100")
	}

	var from, until time.Time
	label := ""
	switch period {
	case periodWeek:
		if args.Week < 1 || args.Week > 53 {
			return nil, fmt.Errorf("week must be 1–53 (ISO week)")
		}
		start, err := startOfISOWeek(args.Year, args.Week, loc)
		if err != nil {
			return nil, err
		}
		from = start
		until = start.AddDate(0, 0, 7)
		label = fmt.Sprintf("%d-W%02d", args.Year, args.Week)
	case periodMonth:
		if args.Month < 1 || args.Month > 12 {
			return nil, fmt.Errorf("month must be 1–12")
		}
		from = time.Date(args.Year, time.Month(args.Month), 1, 0, 0, 0, 0, loc)
		until = from.AddDate(0, 1, 0)
		label = from.Format("2006-01")
	case periodQuarter:
		if args.Quarter < 1 || args.Quarter > 4 {
			return nil, fmt.Errorf("quarter must be 1–4")
		}
		month := time.Month((args.Quarter-1)*3 + 1)
		from = time.Date(args.Year, month, 1, 0, 0, 0, 0, loc)
		until = from.AddDate(0, 3, 0)
		label = fmt.Sprintf("%d-Q%d", args.Year, args.Quarter)
	case periodHalfYear:
		if args.Half != 1 && args.Half != 2 {
			return nil, fmt.Errorf("half must be 1 (Jan–Jun) or 2 (Jul–Dec)")
		}
		month := time.January
		if args.Half == 2 {
			month = time.July
		}
		from = time.Date(args.Year, month, 1, 0, 0, 0, 0, loc)
		until = from.AddDate(0, 6, 0)
		label = fmt.Sprintf("%d-H%d", args.Year, args.Half)
	case periodYear:
		from = time.Date(args.Year, time.January, 1, 0, 0, 0, 0, loc)
		until = from.AddDate(1, 0, 0)
		label = fmt.Sprintf("%d", args.Year)
	}

	return &periodSpec{
		Kind:     period,
		Label:    label,
		Year:     args.Year,
		Week:     args.Week,
		Month:    args.Month,
		Quarter:  args.Quarter,
		Half:     args.Half,
		Timezone: tzName,
		From:     from,
		Until:    until,
	}, nil
}

// customDateBounds parses inclusive YYYY-MM-DD dates into [from, until).
func customDateBounds(fromRaw, toRaw string, loc *time.Location) (time.Time, time.Time, error) {
	fromRaw = strings.TrimSpace(fromRaw)
	toRaw = strings.TrimSpace(toRaw)
	if fromRaw == "" || toRaw == "" {
		return time.Time{}, time.Time{}, fmt.Errorf("date_from and date_to are both required for a custom range (YYYY-MM-DD)")
	}
	fromDay, err := parseReportDate(fromRaw, loc)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("date_from: %w", err)
	}
	toDay, err := parseReportDate(toRaw, loc)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("date_to: %w", err)
	}
	until := toDay.AddDate(0, 0, 1)
	if !until.After(fromDay) {
		return time.Time{}, time.Time{}, fmt.Errorf("date_to must be on or after date_from")
	}
	return fromDay, until, nil
}

// parseReportDate parses a calendar date in loc.
func parseReportDate(raw string, loc *time.Location) (time.Time, error) {
	t, err := time.ParseInLocation("2006-01-02", raw, loc)
	if err != nil {
		return time.Time{}, fmt.Errorf("use YYYY-MM-DD")
	}
	return t, nil
}

// startOfISOWeek returns Monday 00:00 of the given ISO week in loc.
func startOfISOWeek(year, week int, loc *time.Location) (time.Time, error) {
	jan4 := time.Date(year, time.January, 4, 0, 0, 0, 0, loc)
	weekday := int(jan4.Weekday())
	if weekday == 0 {
		weekday = 7
	}
	week1Monday := jan4.AddDate(0, 0, 1-weekday)
	start := week1Monday.AddDate(0, 0, (week-1)*7)
	isoYear, isoWeek := start.ISOWeek()
	if isoYear != year || isoWeek != week {
		return time.Time{}, fmt.Errorf("ISO week %d does not exist in %d", week, year)
	}
	return start, nil
}

// rfc3339UTC formats a bound for PostgREST timestamptz filters.
func rfc3339UTC(t time.Time) string {
	return t.UTC().Format(time.RFC3339)
}
