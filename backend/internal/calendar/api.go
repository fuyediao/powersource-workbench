package calendar

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// googleEvent is a subset of the Google Calendar events resource.
type googleEvent struct {
	ID          string `json:"id"`
	Status      string `json:"status"`
	Summary     string `json:"summary"`
	Description string `json:"description"`
	ETag        string `json:"etag"`
	Updated     string `json:"updated"`
	Start       struct {
		Date     string `json:"date"`
		DateTime string `json:"dateTime"`
	} `json:"start"`
	End struct {
		Date     string `json:"date"`
		DateTime string `json:"dateTime"`
	} `json:"end"`
	// Recurrence holds iCalendar lines (RRULE / EXDATE / RDATE) on series masters.
	Recurrence []string `json:"recurrence"`
	// RecurringEventID is set on instances (exceptions) of a series master.
	RecurringEventID  string `json:"recurringEventId"`
	OriginalStartTime struct {
		Date     string `json:"date"`
		DateTime string `json:"dateTime"`
	} `json:"originalStartTime"`
}

type googleEventsList struct {
	Items         []googleEvent `json:"items"`
	NextPageToken string        `json:"nextPageToken"`
	NextSyncToken string        `json:"nextSyncToken"`
}

// googleCalendarListEntry is a subset of calendarList entries.
type googleCalendarListEntry struct {
	ID              string `json:"id"`
	Summary         string `json:"summary"`
	Primary         bool   `json:"primary"`
	BackgroundColor string `json:"backgroundColor"`
	AccessRole      string `json:"accessRole"`
}

type googleCalendarList struct {
	Items         []googleCalendarListEntry `json:"items"`
	NextPageToken string                    `json:"nextPageToken"`
}

// ListCalendarList lists calendars visible to the linked Google account.
func (h *Handler) ListCalendarList(ctx context.Context, accessToken string) ([]googleCalendarListEntry, error) {
	var all []googleCalendarListEntry
	pageToken := ""
	for {
		params := url.Values{}
		params.Set("maxResults", "250")
		params.Set("minAccessRole", "reader")
		if pageToken != "" {
			params.Set("pageToken", pageToken)
		}
		endpoint := "https://www.googleapis.com/calendar/v3/users/me/calendarList?" + params.Encode()
		var page googleCalendarList
		if err := googleGet(ctx, accessToken, endpoint, &page); err != nil {
			return nil, err
		}
		all = append(all, page.Items...)
		if page.NextPageToken == "" {
			break
		}
		pageToken = page.NextPageToken
	}
	return all, nil
}

// ListCalendarEvents lists event masters, modified exceptions, and cancelled
// exceptions for one Google calendar. Uses singleEvents=false so recurring series
// keep their RRULE instead of expanding every instance.
// The returned syncToken (when non-empty) can drive incremental sync.
func (h *Handler) ListCalendarEvents(
	ctx context.Context,
	accessToken, calendarID string,
	timeMin, timeMax time.Time,
) ([]googleEvent, string, error) {
	calPath := url.PathEscape(calendarID)
	var all []googleEvent
	pageToken := ""
	syncToken := ""
	for {
		params := url.Values{}
		params.Set("singleEvents", "false")
		params.Set("showDeleted", "true")
		params.Set("maxResults", "250")
		params.Set("timeMin", timeMin.UTC().Format(time.RFC3339))
		params.Set("timeMax", timeMax.UTC().Format(time.RFC3339))
		if pageToken != "" {
			params.Set("pageToken", pageToken)
		}
		endpoint := "https://www.googleapis.com/calendar/v3/calendars/" + calPath + "/events?" + params.Encode()
		var page googleEventsList
		if err := googleGet(ctx, accessToken, endpoint, &page); err != nil {
			return nil, "", err
		}
		all = append(all, page.Items...)
		if page.NextPageToken == "" {
			syncToken = page.NextSyncToken
			break
		}
		pageToken = page.NextPageToken
	}
	return all, syncToken, nil
}

// ListCalendarEventsIncremental lists changes since syncToken (no time window).
// On HTTP 410 the caller should clear the token and run a full windowed sync.
func (h *Handler) ListCalendarEventsIncremental(
	ctx context.Context,
	accessToken, calendarID, syncToken string,
) ([]googleEvent, string, error) {
	calPath := url.PathEscape(calendarID)
	var all []googleEvent
	pageToken := ""
	nextSync := ""
	for {
		params := url.Values{}
		params.Set("singleEvents", "false")
		params.Set("showDeleted", "true")
		params.Set("maxResults", "250")
		params.Set("syncToken", syncToken)
		if pageToken != "" {
			params.Set("pageToken", pageToken)
		}
		endpoint := "https://www.googleapis.com/calendar/v3/calendars/" + calPath + "/events?" + params.Encode()
		var page googleEventsList
		if err := googleGet(ctx, accessToken, endpoint, &page); err != nil {
			return nil, "", err
		}
		all = append(all, page.Items...)
		if page.NextPageToken == "" {
			nextSync = page.NextSyncToken
			break
		}
		pageToken = page.NextPageToken
	}
	return all, nextSync, nil
}

// ListPrimaryEvents lists events on the primary calendar (compat wrapper).
func (h *Handler) ListPrimaryEvents(ctx context.Context, accessToken string, timeMin, timeMax time.Time) ([]googleEvent, error) {
	events, _, err := h.ListCalendarEvents(ctx, accessToken, "primary", timeMin, timeMax)
	return events, err
}

// googleWatchResponse is the events.watch / channels response body.
type googleWatchResponse struct {
	Kind        string `json:"kind"`
	ID          string `json:"id"`
	ResourceID  string `json:"resourceId"`
	ResourceURI string `json:"resourceUri"`
	Expiration  string `json:"expiration"`
	Token       string `json:"token"`
}

// WatchCalendarEvents registers a push notification channel for one calendar.
func (h *Handler) WatchCalendarEvents(
	ctx context.Context,
	accessToken, calendarID, channelID, address, token string,
	expirationMS int64,
) (*googleWatchResponse, error) {
	endpoint := fmt.Sprintf(
		"https://www.googleapis.com/calendar/v3/calendars/%s/events/watch",
		url.PathEscape(calendarID),
	)
	body := map[string]any{
		"id":      channelID,
		"type":    "web_hook",
		"address": address,
		"token":   token,
	}
	if expirationMS > 0 {
		body["expiration"] = expirationMS
	}
	var out googleWatchResponse
	if err := googleJSON(ctx, accessToken, http.MethodPost, endpoint, "", body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// StopWatchChannel stops a previously created Google push channel.
func (h *Handler) StopWatchChannel(
	ctx context.Context,
	accessToken, channelID, resourceID string,
) error {
	endpoint := "https://www.googleapis.com/calendar/v3/channels/stop"
	body := map[string]string{
		"id":         channelID,
		"resourceId": resourceID,
	}
	return googleJSON(ctx, accessToken, http.MethodPost, endpoint, "", body, nil)
}

// GetCalendarEvent fetches one Google event by id.
func (h *Handler) GetCalendarEvent(
	ctx context.Context,
	accessToken, calendarID, eventID string,
) (*googleEvent, error) {
	endpoint := fmt.Sprintf(
		"https://www.googleapis.com/calendar/v3/calendars/%s/events/%s",
		url.PathEscape(calendarID),
		url.PathEscape(eventID),
	)
	var ev googleEvent
	if err := googleGet(ctx, accessToken, endpoint, &ev); err != nil {
		return nil, err
	}
	return &ev, nil
}

// googleEventWrite is the body for insert/patch.
type googleEventWrite struct {
	Summary     string   `json:"summary"`
	Description string   `json:"description,omitempty"`
	Start       any      `json:"start"`
	End         any      `json:"end"`
	Recurrence  []string `json:"recurrence,omitempty"`
}

// InsertCalendarEvent creates a Google event; returns the created resource.
func (h *Handler) InsertCalendarEvent(
	ctx context.Context,
	accessToken, calendarID string,
	body googleEventWrite,
) (*googleEvent, error) {
	endpoint := fmt.Sprintf(
		"https://www.googleapis.com/calendar/v3/calendars/%s/events",
		url.PathEscape(calendarID),
	)
	var out googleEvent
	if err := googleJSON(ctx, accessToken, http.MethodPost, endpoint, "", body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// PatchCalendarEvent patches a Google event; optional ifMatch etag.
func (h *Handler) PatchCalendarEvent(
	ctx context.Context,
	accessToken, calendarID, eventID, ifMatch string,
	body googleEventWrite,
) (*googleEvent, error) {
	endpoint := fmt.Sprintf(
		"https://www.googleapis.com/calendar/v3/calendars/%s/events/%s",
		url.PathEscape(calendarID),
		url.PathEscape(eventID),
	)
	var out googleEvent
	if err := googleJSON(ctx, accessToken, http.MethodPatch, endpoint, ifMatch, body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// DeleteCalendarEvent deletes a Google event; optional ifMatch etag.
func (h *Handler) DeleteCalendarEvent(
	ctx context.Context,
	accessToken, calendarID, eventID, ifMatch string,
) error {
	endpoint := fmt.Sprintf(
		"https://www.googleapis.com/calendar/v3/calendars/%s/events/%s",
		url.PathEscape(calendarID),
		url.PathEscape(eventID),
	)
	return googleJSON(ctx, accessToken, http.MethodDelete, endpoint, ifMatch, nil, nil)
}

// buildGoogleEventWrite maps local fields to a Google events resource body.
func buildGoogleEventWrite(
	title, description, startAt, endAt string,
	allDay bool,
	rruleBody string,
	exdates []string,
) googleEventWrite {
	title = strings.TrimSpace(title)
	if title == "" {
		title = "(No title)"
	}
	var start any
	var end any
	if allDay {
		startDay := allDayDateFromISO(startAt)
		endInclusive := allDayDateFromISO(endAt)
		endExclusive := endInclusive
		if t, err := time.Parse("2006-01-02", endInclusive); err == nil {
			// Google all-day end.date is exclusive (day after the last occupied day).
			endExclusive = t.AddDate(0, 0, 1).Format("2006-01-02")
		}
		start = map[string]string{"date": startDay}
		end = map[string]string{"date": endExclusive}
	} else {
		start = map[string]string{"dateTime": startAt}
		end = map[string]string{"dateTime": endAt}
	}
	var recurrence []string
	if strings.TrimSpace(rruleBody) != "" {
		recurrence = append(recurrence, "RRULE:"+strings.TrimSpace(rruleBody))
	}
	for _, iso := range exdates {
		if line := exdateLineFromISO(iso, allDay); line != "" {
			recurrence = append(recurrence, line)
		}
	}
	desc := strings.TrimSpace(description)
	return googleEventWrite{
		Summary:     title,
		Description: desc,
		Start:       start,
		End:         end,
		Recurrence:  recurrence,
	}
}

func allDayDateFromISO(iso string) string {
	t, ok := parseISOTimestamp(iso)
	if !ok {
		return strings.TrimSpace(iso)
	}
	return t.UTC().Format("2006-01-02")
}

func exdateLineFromISO(iso string, allDay bool) string {
	t, ok := parseISOTimestamp(iso)
	if !ok {
		return ""
	}
	if allDay {
		return "EXDATE;VALUE=DATE:" + t.UTC().Format("20060102")
	}
	return "EXDATE:" + t.UTC().Format("20060102T150405Z")
}

// googleJSON performs a JSON Google API request with optional If-Match.
func googleJSON(
	ctx context.Context,
	accessToken, method, endpoint, ifMatch string,
	payload any,
	dest any,
) error {
	var bodyReader *bytes.Reader
	if payload != nil {
		raw, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		bodyReader = bytes.NewReader(raw)
	} else {
		bodyReader = bytes.NewReader(nil)
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, bodyReader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if strings.TrimSpace(ifMatch) != "" {
		req.Header.Set("If-Match", ifMatch)
	}
	return doJSON(req, dest)
}
