package mcp

import (
	"testing"
	"time"
)

func TestResolvePeriodMonthTaipei(t *testing.T) {
	spec, err := resolvePeriod(periodArgs{Period: periodMonth, Year: 2026, Month: 7})
	if err != nil {
		t.Fatal(err)
	}
	loc, err := time.LoadLocation(defaultReportLocation)
	if err != nil {
		t.Fatal(err)
	}
	wantFrom := time.Date(2026, 7, 1, 0, 0, 0, 0, loc)
	wantUntil := time.Date(2026, 8, 1, 0, 0, 0, 0, loc)
	if !spec.From.Equal(wantFrom) || !spec.Until.Equal(wantUntil) {
		t.Fatalf("July 2026 = [%s, %s), want [%s, %s)", spec.From, spec.Until, wantFrom, wantUntil)
	}
	if spec.Label != "2026-07" {
		t.Fatalf("label = %q", spec.Label)
	}
}

func TestResolvePeriodQuarterHalfYear(t *testing.T) {
	q3, err := resolvePeriod(periodArgs{Period: periodQuarter, Year: 2026, Quarter: 3})
	if err != nil {
		t.Fatal(err)
	}
	if q3.Label != "2026-Q3" {
		t.Fatalf("quarter label = %q", q3.Label)
	}
	h2, err := resolvePeriod(periodArgs{Period: periodHalfYear, Year: 2026, Half: 2})
	if err != nil {
		t.Fatal(err)
	}
	if h2.Label != "2026-H2" || h2.From.Month() != time.July {
		t.Fatalf("H2 = %s starting %s", h2.Label, h2.From)
	}
	year, err := resolvePeriod(periodArgs{Period: periodYear, Year: 2026})
	if err != nil {
		t.Fatal(err)
	}
	if year.Until.Year() != 2027 || year.Until.Month() != time.January {
		t.Fatalf("year until = %s", year.Until)
	}
}

func TestResolvePeriodISOWeek(t *testing.T) {
	spec, err := resolvePeriod(periodArgs{Period: periodWeek, Year: 2026, Week: 1})
	if err != nil {
		t.Fatal(err)
	}
	isoYear, isoWeek := spec.From.ISOWeek()
	if isoYear != 2026 || isoWeek != 1 {
		t.Fatalf("week start %s is ISO %d-W%d", spec.From, isoYear, isoWeek)
	}
	if spec.Until.Sub(spec.From) != 7*24*time.Hour {
		t.Fatalf("week length = %s", spec.Until.Sub(spec.From))
	}
}

func TestResolvePeriodCustomInclusive(t *testing.T) {
	spec, err := resolvePeriod(periodArgs{DateFrom: "2026-07-01", DateTo: "2026-07-31", Timezone: "UTC"})
	if err != nil {
		t.Fatal(err)
	}
	if spec.Kind != periodCustom {
		t.Fatalf("kind = %s", spec.Kind)
	}
	if spec.Until.Format("2006-01-02") != "2026-08-01" {
		t.Fatalf("exclusive until = %s", spec.Until)
	}
}

func TestResolvePeriodRejectsBadInput(t *testing.T) {
	if _, err := resolvePeriod(periodArgs{Period: periodMonth, Year: 2026, Month: 13}); err == nil {
		t.Fatal("month 13 accepted")
	}
	if _, err := resolvePeriod(periodArgs{Period: "decade", Year: 2026}); err == nil {
		t.Fatal("unknown period accepted")
	}
	if _, err := resolvePeriod(periodArgs{DateFrom: "2026-08-01", DateTo: "2026-07-01"}); err == nil {
		t.Fatal("inverted custom range accepted")
	}
}

func TestParseFilterOpPrefersLongerSuffix(t *testing.T) {
	column, op := parseFilterOp("bill_date_gte")
	if column != "bill_date" || op != filterGte {
		t.Fatalf("got %s %s", column, op)
	}
	column, op = parseFilterOp("amount_gt")
	if column != "amount" || op != filterGt {
		t.Fatalf("got %s %s", column, op)
	}
	column, op = parseFilterOp("status")
	if column != "status" || op != filterEq {
		t.Fatalf("got %s %s", column, op)
	}
}
