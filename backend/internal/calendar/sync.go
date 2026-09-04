package calendar

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// localGoogleEvent is a calendar_events row used for LWW sync / push.
type localGoogleEvent struct {
	ID               string   `json:"id"`
	Title            string   `json:"title"`
	Description      *string  `json:"description"`
	StartAt          string   `json:"start_at"`
	EndAt            string   `json:"end_at"`
	AllDay           bool     `json:"all_day"`
	UpdatedAt        string   `json:"updated_at"`
	Source           string   `json:"source"`
	GoogleEventID    *string  `json:"google_event_id"`
	GoogleCalendarID *string  `json:"google_calendar_id"`
	GoogleEtag       *string  `json:"google_etag"`
	GoogleUpdatedAt  *string  `json:"google_updated_at"`
	CalendarID       *string  `json:"calendar_id"`
	Rrule            *string  `json:"rrule"`
	Exdate           []string `json:"exdate"`
}

func derefStr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func googleUpdatedTime(ev googleEvent) (time.Time, bool) {
	return parseISOTimestamp(ev.Updated)
}

func localUpdatedTime(row localGoogleEvent) (time.Time, bool) {
	return parseISOTimestamp(row.UpdatedAt)
}

func localGoogleUpdatedTime(row localGoogleEvent) (time.Time, bool) {
	return parseISOTimestamp(derefStr(row.GoogleUpdatedAt))
}

// ensureMirrorCalendar creates or updates a personal named calendar that mirrors a Google calendar.
func (h *Handler) ensureMirrorCalendar(
	ctx context.Context,
	userID, googleCalID, name, color string,
) (string, error) {
	if googleCalID == "" {
		return "", fmt.Errorf("empty google calendar id")
	}
	if strings.TrimSpace(name) == "" {
		name = googleCalID
	}
	if strings.TrimSpace(color) == "" {
		color = "#2563eb"
	}
	var existing struct {
		ID string `json:"id"`
	}
	found, err := h.sb.From("calendars").
		Select("id").
		Eq("owner_user_id", userID).
		Eq("google_calendar_id", googleCalID).
		MaybeSingle(ctx, &existing)
	if err != nil {
		return "", err
	}
	if found && existing.ID != "" {
		_ = h.sb.From("calendars").Update(map[string]any{
			"name":  name,
			"color": color,
		}).Eq("id", existing.ID).Exec(ctx, nil)
		return existing.ID, nil
	}
	var created struct {
		ID string `json:"id"`
	}
	if err := h.sb.From("calendars").Insert(map[string]any{
		"owner_user_id":      userID,
		"group_id":           nil,
		"name":               name,
		"color":              color,
		"is_default":         false,
		"google_calendar_id": googleCalID,
	}).Returning().Select("id").Single(ctx, &created); err != nil {
		return "", err
	}
	return created.ID, nil
}

// loadLocalGoogleEventByGoogleID loads one local row by Google event id for the owner.
func (h *Handler) loadLocalGoogleEventByGoogleID(
	ctx context.Context,
	userID, googleEventID string,
) (*localGoogleEvent, error) {
	var row localGoogleEvent
	found, err := h.sb.From("calendar_events").
		Select("id,title,description,start_at,end_at,all_day,updated_at,source,google_event_id,google_calendar_id,google_etag,google_updated_at,calendar_id,rrule,exdate").
		Eq("owner_user_id", userID).
		Eq("google_event_id", googleEventID).
		MaybeSingle(ctx, &row)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, nil
	}
	return &row, nil
}

// loadLocalGoogleEventByID loads one local row by uuid for the owner.
func (h *Handler) loadLocalGoogleEventByID(
	ctx context.Context,
	userID, eventID string,
) (*localGoogleEvent, error) {
	var row localGoogleEvent
	found, err := h.sb.From("calendar_events").
		Select("id,title,description,start_at,end_at,all_day,updated_at,source,google_event_id,google_calendar_id,google_etag,google_updated_at,calendar_id,rrule,exdate").
		Eq("owner_user_id", userID).
		Eq("id", eventID).
		MaybeSingle(ctx, &row)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, nil
	}
	return &row, nil
}

// applyGoogleEventToLocal inserts or overwrites a local row from Google (Google wins).
func (h *Handler) applyGoogleEventToLocal(
	ctx context.Context,
	userID, googleCalID, namedCalendarID string,
	ev googleEvent,
	rruleBody string,
	exdates []string,
) error {
	startAt, endAt, allDay, ok := mapGoogleTimes(ev)
	if !ok {
		return nil
	}
	title := strings.TrimSpace(ev.Summary)
	if title == "" {
		title = "(No title)"
	}
	gUpdated := any(nil)
	if t, ok := googleUpdatedTime(ev); ok {
		gUpdated = t.UTC().Format(time.RFC3339Nano)
	}
	row := map[string]any{
		"title":              title,
		"description":        nilIfEmpty(ev.Description),
		"start_at":           startAt,
		"end_at":             endAt,
		"all_day":            allDay,
		"owner_user_id":      userID,
		"group_id":           nil,
		"created_by":         userID,
		"source":             "google",
		"google_event_id":    ev.ID,
		"google_calendar_id": googleCalID,
		"google_etag":        nilIfEmpty(ev.ETag),
		"google_updated_at":  gUpdated,
		"rrule":              nilIfEmpty(rruleBody),
		"exdate":             exdates,
	}
	if namedCalendarID != "" {
		row["calendar_id"] = namedCalendarID
	}
	return h.sb.From("calendar_events").
		Upsert(row, "owner_user_id,google_event_id").
		Exec(ctx, nil)
}

// pushLocalEventToGoogle inserts or patches Google from a local row; updates local etag/ids.
func (h *Handler) pushLocalEventToGoogle(
	ctx context.Context,
	accessToken, userID string,
	row localGoogleEvent,
) error {
	googleCalID := derefStr(row.GoogleCalendarID)
	if googleCalID == "" && row.CalendarID != nil {
		var cal struct {
			GoogleCalendarID *string `json:"google_calendar_id"`
		}
		found, _ := h.sb.From("calendars").
			Select("google_calendar_id").
			Eq("id", *row.CalendarID).
			MaybeSingle(ctx, &cal)
		if found {
			googleCalID = derefStr(cal.GoogleCalendarID)
		}
	}
	if googleCalID == "" {
		return fmt.Errorf("event is not mapped to a Google calendar")
	}

	desc := ""
	if row.Description != nil {
		desc = *row.Description
	}
	rruleBody := derefStr(row.Rrule)
	exdates := row.Exdate
	if exdates == nil {
		exdates = []string{}
	}
	body := buildGoogleEventWrite(row.Title, desc, row.StartAt, row.EndAt, row.AllDay, rruleBody, exdates)

	var remote *googleEvent
	var err error
	googleEventID := derefStr(row.GoogleEventID)
	if googleEventID == "" {
		remote, err = h.InsertCalendarEvent(ctx, accessToken, googleCalID, body)
	} else {
		remote, err = h.PatchCalendarEvent(ctx, accessToken, googleCalID, googleEventID, derefStr(row.GoogleEtag), body)
		if err != nil && strings.Contains(err.Error(), "HTTP 412") {
			// Conflict: pull Google and let caller decide; still try without If-Match as LWW local-newer.
			remote, err = h.PatchCalendarEvent(ctx, accessToken, googleCalID, googleEventID, "", body)
		}
	}
	if err != nil {
		return err
	}
	if remote == nil || remote.ID == "" {
		return fmt.Errorf("empty Google event response")
	}

	gUpdated := any(nil)
	if t, ok := googleUpdatedTime(*remote); ok {
		gUpdated = t.UTC().Format(time.RFC3339Nano)
	}
	return h.sb.From("calendar_events").Update(map[string]any{
		"source":             "google",
		"google_event_id":    remote.ID,
		"google_calendar_id": googleCalID,
		"google_etag":        nilIfEmpty(remote.ETag),
		"google_updated_at":  gUpdated,
	}).Eq("id", row.ID).Eq("owner_user_id", userID).Exec(ctx, nil)
}

// reconcileGoogleEvent applies LWW between one Google event and the local row.
// Returns whether a local upsert occurred and whether a push occurred.
// When allowPush is false (reader / freeBusy calendars), local-newer rows are not written to Google.
func (h *Handler) reconcileGoogleEvent(
	ctx context.Context,
	accessToken, userID, googleCalID, namedCalendarID string,
	ev googleEvent,
	rruleBody string,
	exdates []string,
	allowPush bool,
) (upserted, pushed bool, err error) {
	if ev.ID == "" {
		return false, false, nil
	}
	local, err := h.loadLocalGoogleEventByGoogleID(ctx, userID, ev.ID)
	if err != nil {
		return false, false, err
	}
	gTime, gOK := googleUpdatedTime(ev)
	if local == nil {
		if err := h.applyGoogleEventToLocal(ctx, userID, googleCalID, namedCalendarID, ev, rruleBody, exdates); err != nil {
			return false, false, err
		}
		return true, false, nil
	}

	lTime, lOK := localUpdatedTime(*local)
	lgTime, lgOK := localGoogleUpdatedTime(*local)

	// Local newer than Google (or pending local change past last applied Google stamp) → push.
	if allowPush && lOK && gOK && lTime.After(gTime) {
		if err := h.pushLocalEventToGoogle(ctx, accessToken, userID, *local); err != nil {
			return false, false, err
		}
		return false, true, nil
	}
	if allowPush && lOK && lgOK && lTime.After(lgTime) && (!gOK || !lTime.Equal(gTime)) {
		if err := h.pushLocalEventToGoogle(ctx, accessToken, userID, *local); err != nil {
			return false, false, err
		}
		return false, true, nil
	}

	// Google newer or first apply → overwrite local.
	if !gOK || !lOK || gTime.After(lTime) || (lgOK && gTime.After(lgTime)) {
		if err := h.applyGoogleEventToLocal(ctx, userID, googleCalID, namedCalendarID, ev, rruleBody, exdates); err != nil {
			return false, false, err
		}
		return true, false, nil
	}

	// Same generation: still refresh mirror calendar_id / metadata lightly when etag differs.
	if derefStr(local.GoogleEtag) != ev.ETag && ev.ETag != "" {
		if err := h.applyGoogleEventToLocal(ctx, userID, googleCalID, namedCalendarID, ev, rruleBody, exdates); err != nil {
			return false, false, err
		}
		return true, false, nil
	}
	return false, false, nil
}

// syncOneGoogleCalendar pulls one Google calendar and reconciles with LWW.
// When nextSyncToken is non-empty it should be stored for incremental push sync.
func (h *Handler) syncOneGoogleCalendar(
	ctx context.Context,
	accessToken, userID, googleCalID, namedCalendarID string,
	timeMin, timeMax time.Time,
	allowPush bool,
) (upserted, pushed, deleted int, seen []string, nextSyncToken string, err error) {
	events, nextSyncToken, err := h.ListCalendarEvents(ctx, accessToken, googleCalID, timeMin, timeMax)
	if err != nil {
		return 0, 0, 0, nil, "", err
	}

	exceptionExdates := make(map[string][]string)
	overrides := make([]googleEvent, 0)
	for _, ev := range events {
		if ev.ID == "" {
			continue
		}
		if ev.Status == "cancelled" {
			if ev.RecurringEventID == "" {
				continue
			}
			if iso, ok := originalStartISO(ev); ok {
				exceptionExdates[ev.RecurringEventID] = append(exceptionExdates[ev.RecurringEventID], iso)
			}
			continue
		}
		if ev.RecurringEventID == "" {
			continue
		}
		if iso, ok := originalStartISO(ev); ok {
			exceptionExdates[ev.RecurringEventID] = append(exceptionExdates[ev.RecurringEventID], iso)
		}
		overrides = append(overrides, ev)
	}

	seen = make([]string, 0, len(events))
	for _, ev := range events {
		if ev.ID == "" || ev.Status == "cancelled" || ev.RecurringEventID != "" {
			continue
		}
		rruleBody, recurrenceExdates := parseGoogleRecurrence(ev.Recurrence)
		exdates := mergeUniqueISO(recurrenceExdates, exceptionExdates[ev.ID]...)
		up, pu, rerr := h.reconcileGoogleEvent(ctx, accessToken, userID, googleCalID, namedCalendarID, ev, rruleBody, exdates, allowPush)
		if rerr != nil {
			return upserted, pushed, deleted, seen, "", rerr
		}
		if up {
			upserted++
		}
		if pu {
			pushed++
		}
		seen = append(seen, ev.ID)
	}
	for _, ev := range overrides {
		up, pu, rerr := h.reconcileGoogleEvent(ctx, accessToken, userID, googleCalID, namedCalendarID, ev, "", []string{}, allowPush)
		if rerr != nil {
			return upserted, pushed, deleted, seen, "", rerr
		}
		if up {
			upserted++
		}
		if pu {
			pushed++
		}
		seen = append(seen, ev.ID)
	}

	del, err := h.deleteMissingGoogleEventsForCalendar(ctx, userID, googleCalID, seen)
	if err != nil {
		return upserted, pushed, deleted, seen, "", err
	}
	deleted = del
	return upserted, pushed, deleted, seen, nextSyncToken, nil
}

// syncOneGoogleCalendarIncremental applies a syncToken delta without pruning
// events that are merely absent from the page (unlike a full windowed sync).
func (h *Handler) syncOneGoogleCalendarIncremental(
	ctx context.Context,
	accessToken, userID, googleCalID, namedCalendarID, syncToken string,
	allowPush bool,
) (upserted, pushed, deleted int, nextSyncToken string, err error) {
	events, nextSyncToken, err := h.ListCalendarEventsIncremental(ctx, accessToken, googleCalID, syncToken)
	if err != nil {
		return 0, 0, 0, "", err
	}

	exceptionExdates := make(map[string][]string)
	overrides := make([]googleEvent, 0)
	cancelledMasters := make([]string, 0)
	for _, ev := range events {
		if ev.ID == "" {
			continue
		}
		if ev.Status == "cancelled" {
			if ev.RecurringEventID == "" {
				cancelledMasters = append(cancelledMasters, ev.ID)
				continue
			}
			if iso, ok := originalStartISO(ev); ok {
				exceptionExdates[ev.RecurringEventID] = append(exceptionExdates[ev.RecurringEventID], iso)
			}
			continue
		}
		if ev.RecurringEventID == "" {
			continue
		}
		if iso, ok := originalStartISO(ev); ok {
			exceptionExdates[ev.RecurringEventID] = append(exceptionExdates[ev.RecurringEventID], iso)
		}
		overrides = append(overrides, ev)
	}

	for _, ev := range events {
		if ev.ID == "" || ev.Status == "cancelled" || ev.RecurringEventID != "" {
			continue
		}
		rruleBody, recurrenceExdates := parseGoogleRecurrence(ev.Recurrence)
		exdates := mergeUniqueISO(recurrenceExdates, exceptionExdates[ev.ID]...)
		up, pu, rerr := h.reconcileGoogleEvent(ctx, accessToken, userID, googleCalID, namedCalendarID, ev, rruleBody, exdates, allowPush)
		if rerr != nil {
			return upserted, pushed, deleted, "", rerr
		}
		if up {
			upserted++
		}
		if pu {
			pushed++
		}
	}
	for _, ev := range overrides {
		up, pu, rerr := h.reconcileGoogleEvent(ctx, accessToken, userID, googleCalID, namedCalendarID, ev, "", []string{}, allowPush)
		if rerr != nil {
			return upserted, pushed, deleted, "", rerr
		}
		if up {
			upserted++
		}
		if pu {
			pushed++
		}
	}
	for _, googleEventID := range cancelledMasters {
		n, derr := h.deleteLocalGoogleEventByGoogleID(ctx, userID, googleCalID, googleEventID)
		if derr != nil {
			return upserted, pushed, deleted, "", derr
		}
		deleted += n
	}
	return upserted, pushed, deleted, nextSyncToken, nil
}

// deleteLocalGoogleEventByGoogleID removes one local Google-sourced row by Google event id.
func (h *Handler) deleteLocalGoogleEventByGoogleID(
	ctx context.Context,
	userID, googleCalID, googleEventID string,
) (int, error) {
	var rows []struct {
		ID string `json:"id"`
	}
	if err := h.sb.From("calendar_events").
		Select("id").
		Eq("owner_user_id", userID).
		Eq("source", "google").
		Eq("google_calendar_id", googleCalID).
		Eq("google_event_id", googleEventID).
		Exec(ctx, &rows); err != nil {
		return 0, err
	}
	deleted := 0
	for _, row := range rows {
		if err := h.sb.From("calendar_events").Delete().Eq("id", row.ID).Exec(ctx, nil); err != nil {
			return deleted, err
		}
		deleted++
	}
	return deleted, nil
}

// deleteMissingGoogleEventsForCalendar removes local Google rows for one calendar id not in keepIDs.
func (h *Handler) deleteMissingGoogleEventsForCalendar(
	ctx context.Context,
	userID, googleCalID string,
	keepIDs []string,
) (int, error) {
	keep := make(map[string]struct{}, len(keepIDs))
	for _, id := range keepIDs {
		keep[id] = struct{}{}
	}
	var rows []struct {
		ID            string  `json:"id"`
		GoogleEventID string  `json:"google_event_id"`
		UpdatedAt     string  `json:"updated_at"`
		GoogleUpdated *string `json:"google_updated_at"`
	}
	if err := h.sb.From("calendar_events").
		Select("id,google_event_id,updated_at,google_updated_at").
		Eq("owner_user_id", userID).
		Eq("source", "google").
		Eq("google_calendar_id", googleCalID).
		Exec(ctx, &rows); err != nil {
		return 0, err
	}
	deleted := 0
	for _, row := range rows {
		if row.GoogleEventID == "" {
			continue
		}
		if _, ok := keep[row.GoogleEventID]; ok {
			continue
		}
		// Skip prune when local is newer than last Google stamp (pending push / create).
		if lTime, lok := parseISOTimestamp(row.UpdatedAt); lok {
			if gTime, gok := parseISOTimestamp(derefStr(row.GoogleUpdated)); gok && lTime.After(gTime) {
				continue
			}
		}
		if err := h.sb.From("calendar_events").Delete().Eq("id", row.ID).Exec(ctx, nil); err != nil {
			return deleted, err
		}
		deleted++
	}
	return deleted, nil
}

// pushPendingLocalGoogleCreates inserts local google-mapped events that still lack google_event_id.
// writableGoogleIDs limits pushes to calendars the user can write (owner/writer).
func (h *Handler) pushPendingLocalGoogleCreates(
	ctx context.Context,
	accessToken, userID string,
	selected []string,
	namedByGoogle map[string]string,
	writableGoogleIDs map[string]struct{},
) (pushed int, err error) {
	selectedSet := make(map[string]struct{}, len(selected))
	for _, id := range selected {
		selectedSet[id] = struct{}{}
	}
	var rows []localGoogleEvent
	if err := h.sb.From("calendar_events").
		Select("id,title,description,start_at,end_at,all_day,updated_at,source,google_event_id,google_calendar_id,google_etag,google_updated_at,calendar_id,rrule,exdate").
		Eq("owner_user_id", userID).
		Is("google_event_id", "null").
		Exec(ctx, &rows); err != nil {
		return 0, err
	}
	for _, row := range rows {
		googleCalID := derefStr(row.GoogleCalendarID)
		if googleCalID == "" && row.CalendarID != nil {
			for gID, namedID := range namedByGoogle {
				if namedID == *row.CalendarID {
					googleCalID = gID
					break
				}
			}
		}
		if googleCalID == "" {
			continue
		}
		if _, ok := selectedSet[googleCalID]; !ok {
			continue
		}
		if _, ok := writableGoogleIDs[googleCalID]; !ok {
			continue
		}
		row.GoogleCalendarID = &googleCalID
		if err := h.pushLocalEventToGoogle(ctx, accessToken, userID, row); err != nil {
			return pushed, err
		}
		pushed++
	}
	return pushed, nil
}

// googleCalendarAllowsWrite reports whether Google accessRole permits events.insert/patch/delete.
func googleCalendarAllowsWrite(accessRole string) bool {
	return accessRole == "owner" || accessRole == "writer"
}
