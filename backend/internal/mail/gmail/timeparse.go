package gmail

import (
	"encoding/json"
	"strconv"
	"strings"
	"time"
)

// parseISOTimestamp parses Supabase / mail timestamps written as RFC3339Nano or RFC3339.
func parseISOTimestamp(s string) (time.Time, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, false
	}
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC(), true
		}
	}
	return time.Time{}, false
}

// internalDateRFC3339 converts Gmail internalDate (string or JSON number) to RFC3339Nano UTC.
func internalDateRFC3339(v any) string {
	ms, ok := int64FromAny(v)
	if !ok || ms <= 0 {
		return ""
	}
	return time.UnixMilli(ms).UTC().Format(time.RFC3339Nano)
}

// int64FromAny coerces JSON-decoded numeric values (string, float64, json.Number).
func int64FromAny(v any) (int64, bool) {
	switch n := v.(type) {
	case string:
		if n == "" {
			return 0, false
		}
		i, err := strconv.ParseInt(n, 10, 64)
		return i, err == nil
	case float64:
		return int64(n), true
	case json.Number:
		i, err := n.Int64()
		return i, err == nil
	case int64:
		return n, true
	case int:
		return int64(n), true
	default:
		return 0, false
	}
}

// incrementalSince picks the earliest incremental cursor between account
// last_sync_at and the newest message already stored, so a last_sync_at that
// ran ahead of persisted mail does not skip a gap.
func incrementalSince(lastSyncAt *string, dbLatest *time.Time) (time.Time, bool) {
	var since time.Time
	has := false
	if lastSyncAt != nil {
		if t, ok := parseISOTimestamp(*lastSyncAt); ok {
			since = t
			has = true
		}
	}
	if dbLatest != nil {
		if !has || dbLatest.Before(since) {
			since = *dbLatest
			has = true
		}
	}
	return since, has
}

// afterEpochSeconds returns a Gmail `after:` epoch with a small overlap so messages
// received during the previous sync window are not skipped when last_sync_at advances.
func afterEpochSeconds(t time.Time) int64 {
	const overlapSeconds = int64(120)
	epoch := t.Unix()
	if epoch > overlapSeconds {
		return epoch - overlapSeconds
	}
	return 0
}
