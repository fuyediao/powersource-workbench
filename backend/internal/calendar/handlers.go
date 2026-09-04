package calendar

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/authmw"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/idutil"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/origin"
)

func (h *Handler) googleLink(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	var body struct {
		LoginHint    string `json:"loginHint"`
		ReturnOrigin string `json:"returnOrigin"`
	}
	_ = httpx.DecodeJSON(r, &body)
	returnOrigin := h.pickValidatedReturnOrigin(body.ReturnOrigin)
	if returnOrigin == "" {
		calErr(w, http.StatusBadRequest, "Invalid returnOrigin. Configure APP_PUBLIC_ORIGIN or APP_PUBLIC_ORIGIN_ALLOWLIST.")
		return
	}
	if strings.TrimSpace(h.env.GoogleClientID) == "" || strings.TrimSpace(h.env.GoogleClientSecret) == "" {
		calErr(w, http.StatusServiceUnavailable, "Google OAuth is not configured")
		return
	}
	if strings.TrimSpace(h.calendarRedirectURI()) == "" {
		calErr(w, http.StatusServiceUnavailable, "GOOGLE_CALENDAR_REDIRECT_URI is not configured")
		return
	}
	state := userID + ":" + idutil.UUIDv4()
	if err := h.sb.From("calendar_google_oauth_states").Insert(map[string]any{
		"user_id": userID, "state": state, "return_origin": returnOrigin, "created_at": nowISO(),
	}).Exec(r.Context(), nil); err != nil {
		calJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	calJSON(w, http.StatusOK, map[string]any{"url": h.BuildAuthURL(state, body.LoginHint)})
}

func (h *Handler) googleCallback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")
	if code == "" || state == "" {
		calErr(w, http.StatusBadRequest, "Missing code or state")
		return
	}
	userID := strings.SplitN(state, ":", 2)[0]
	if userID == "" {
		calErr(w, http.StatusBadRequest, "Invalid state")
		return
	}
	var stateRow struct {
		State        string  `json:"state"`
		ReturnOrigin *string `json:"return_origin"`
	}
	found, _ := h.sb.From("calendar_google_oauth_states").
		Select("state,return_origin").
		Eq("user_id", userID).
		Eq("state", state).
		MaybeSingle(r.Context(), &stateRow)
	if !found {
		calErr(w, http.StatusForbidden, "State mismatch")
		return
	}
	storedReturn := ""
	if stateRow.ReturnOrigin != nil && *stateRow.ReturnOrigin != "" {
		storedReturn = origin.NormalizeBrowserOrigin(*stateRow.ReturnOrigin)
	}
	allowed := h.allowedPublicOrigins()
	if storedReturn != "" && len(allowed) > 0 && !containsStr(allowed, storedReturn) {
		_ = h.sb.From("calendar_google_oauth_states").Delete().Eq("state", state).Exec(r.Context(), nil)
		calErr(w, http.StatusForbidden, "Invalid OAuth return target")
		return
	}
	_ = h.sb.From("calendar_google_oauth_states").Delete().Eq("state", state).Exec(r.Context(), nil)

	tokens, err := h.ExchangeCode(r.Context(), code)
	if err != nil {
		calErr(w, http.StatusBadRequest, "OAuth token exchange failed: "+err.Error())
		return
	}
	if tokens.RefreshToken == "" {
		calErr(w, http.StatusBadRequest, "Google did not return a refresh token; revoke app access and try again")
		return
	}
	userInfo, err := h.GetUserInfo(r.Context(), tokens.AccessToken)
	if err != nil {
		calErr(w, http.StatusBadRequest, err.Error())
		return
	}

	avatar := any(nil)
	if v := strings.TrimSpace(userInfo.Picture); v != "" {
		avatar = v
	}
	status := "active"
	errMsg := any(nil)
	if !hasCalendarWriteScope(tokens.Scope) {
		status = "reauth_required"
		errMsg = "Google Calendar write scope is missing; reconnect to grant calendar access"
	}

	var existing struct {
		Selected []string `json:"selected_google_calendar_ids"`
	}
	_, _ = h.sb.From("calendar_google_accounts").
		Select("selected_google_calendar_ids").
		Eq("owner_user_id", userID).
		MaybeSingle(r.Context(), &existing)
	selected := existing.Selected
	if len(selected) == 0 {
		selected = []string{"primary"}
	}

	var account struct {
		ID string `json:"id"`
	}
	if err := h.sb.From("calendar_google_accounts").Upsert(map[string]any{
		"owner_user_id":                userID,
		"email":                        userInfo.Email,
		"display_name":                 userInfo.Name,
		"avatar_url":                   avatar,
		"google_calendar_id":           "primary",
		"oauth_scope":                  tokens.Scope,
		"status":                       status,
		"error_message":                errMsg,
		"selected_google_calendar_ids": selected,
	}, "owner_user_id").Returning().Select("id").Single(r.Context(), &account); err != nil || account.ID == "" {
		calJSON(w, http.StatusInternalServerError, map[string]any{"error": "Failed to save calendar Google account"})
		return
	}
	if err := h.SaveTokens(r.Context(), account.ID, tokens); err != nil {
		calJSON(w, http.StatusInternalServerError, map[string]any{"error": "Failed to store OAuth tokens"})
		return
	}
	if status == "active" {
		if err := h.ensureWatchesForAccount(r.Context(), account.ID, userID, selected); err != nil {
			log.Printf("calendar watch: oauth ensure %s: %v", account.ID, err)
		}
	}

	redirectBase := storedReturn
	if redirectBase == "" {
		redirectBase = h.appPublicOrigin()
	}
	http.Redirect(w, r, redirectBase+"/oauth/calendar-google-linked.html", http.StatusFound)
}

func (h *Handler) getAccount(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	var row map[string]any
	found, err := h.sb.From("calendar_google_accounts").
		Select("id,email,display_name,avatar_url,google_calendar_id,status,error_message,last_sync_at,created_at,updated_at,oauth_scope,selected_google_calendar_ids").
		Eq("owner_user_id", userID).
		Neq("status", "disconnected").
		MaybeSingle(r.Context(), &row)
	if err != nil {
		calJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	if !found {
		calJSON(w, http.StatusOK, map[string]any{"account": nil})
		return
	}

	scope, _ := row["oauth_scope"].(string)
	status, _ := row["status"].(string)
	accountID, _ := row["id"].(string)
	if status == "active" && !hasCalendarWriteScope(scope) {
		_ = h.sb.From("calendar_google_accounts").Update(map[string]any{
			"status":        "reauth_required",
			"error_message": "Google Calendar write scope is missing; reconnect to grant calendar access",
		}).Eq("id", accountID).Exec(r.Context(), nil)
		row["status"] = "reauth_required"
		row["error_message"] = "Google Calendar write scope is missing; reconnect to grant calendar access"
	}

	calJSON(w, http.StatusOK, map[string]any{"account": mapAccount(row)})
}

func (h *Handler) deleteAccount(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	var account struct {
		ID string `json:"id"`
	}
	found, _ := h.sb.From("calendar_google_accounts").
		Select("id").
		Eq("owner_user_id", userID).
		Neq("status", "disconnected").
		MaybeSingle(r.Context(), &account)
	if found && account.ID != "" {
		h.stopAllWatchesForAccount(r.Context(), account.ID)
	}
	if err := h.sb.From("calendar_google_accounts").
		Update(map[string]any{"status": "disconnected", "error_message": nil}).
		Eq("owner_user_id", userID).
		Exec(r.Context(), nil); err != nil {
		calJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	calJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) listGoogleCalendars(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	account, ok := h.requireGoogleAccount(w, r, userID, false)
	if !ok {
		return
	}
	accessToken, err := h.GetAccessToken(r.Context(), account.ID)
	if err != nil {
		_ = h.sb.From("calendar_google_accounts").Update(map[string]any{
			"status": "reauth_required", "error_message": err.Error(),
		}).Eq("id", account.ID).Exec(r.Context(), nil)
		calErr(w, http.StatusUnauthorized, "Failed to refresh Google token: "+err.Error())
		return
	}
	items, err := h.ListCalendarList(r.Context(), accessToken)
	if err != nil {
		calErr(w, http.StatusBadGateway, "Google calendarList failed: "+err.Error())
		return
	}
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		id := item.ID
		if item.Primary {
			id = "primary"
		}
		out = append(out, map[string]any{
			"id":              id,
			"summary":         item.Summary,
			"primary":         item.Primary,
			"backgroundColor": item.BackgroundColor,
			"accessRole":      item.AccessRole,
			"selected":        containsStr(account.Selected, id) || (item.Primary && containsStr(account.Selected, item.ID)),
		})
	}
	calJSON(w, http.StatusOK, map[string]any{"calendars": out})
}

func (h *Handler) setGoogleSelection(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	account, ok := h.requireGoogleAccount(w, r, userID, false)
	if !ok {
		return
	}
	var body struct {
		CalendarIds []string `json:"calendarIds"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		calErr(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}
	selected := uniqueNonEmpty(body.CalendarIds)
	accessToken, err := h.GetAccessToken(r.Context(), account.ID)
	if err != nil {
		calErr(w, http.StatusUnauthorized, "Failed to refresh Google token: "+err.Error())
		return
	}
	list, err := h.ListCalendarList(r.Context(), accessToken)
	if err != nil {
		calErr(w, http.StatusBadGateway, "Google calendarList failed: "+err.Error())
		return
	}
	byID := map[string]googleCalendarListEntry{}
	for _, item := range list {
		byID[item.ID] = item
		if item.Primary {
			byID["primary"] = item
		}
	}
	for _, id := range selected {
		item, exists := byID[id]
		if !exists {
			calErr(w, http.StatusBadRequest, "Unknown Google calendar id: "+id)
			return
		}
		name := item.Summary
		if name == "" {
			name = id
		}
		if _, err := h.ensureMirrorCalendar(r.Context(), userID, id, name, item.BackgroundColor); err != nil {
			calJSON(w, http.StatusInternalServerError, map[string]any{
				"error": "Failed to mirror Google calendar", "detail": err.Error(),
			})
			return
		}
	}
	if err := h.sb.From("calendar_google_accounts").Update(map[string]any{
		"selected_google_calendar_ids": selected,
	}).Eq("id", account.ID).Exec(r.Context(), nil); err != nil {
		calJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	if err := h.ensureWatchesForAccount(r.Context(), account.ID, userID, selected); err != nil {
		log.Printf("calendar watch: selection ensure %s: %v", account.ID, err)
	}
	calJSON(w, http.StatusOK, map[string]any{"ok": true, "calendarIds": selected})
}

func (h *Handler) syncGoogle(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	var body struct {
		TimeMin string `json:"timeMin"`
		TimeMax string `json:"timeMax"`
	}
	_ = httpx.DecodeJSON(r, &body)

	account, ok := h.requireGoogleAccount(w, r, userID, true)
	if !ok {
		return
	}

	timeMin := time.Now().UTC().AddDate(-1, 0, 0)
	timeMax := time.Now().UTC().AddDate(0, 4, 0)
	if t, ok := parseISOTimestamp(body.TimeMin); ok {
		timeMin = t
	}
	if t, ok := parseISOTimestamp(body.TimeMax); ok {
		timeMax = t
	}

	accessToken, err := h.GetAccessToken(r.Context(), account.ID)
	if err != nil {
		_ = h.sb.From("calendar_google_accounts").Update(map[string]any{
			"status": "reauth_required", "error_message": err.Error(),
		}).Eq("id", account.ID).Exec(r.Context(), nil)
		calErr(w, http.StatusUnauthorized, "Failed to refresh Google token: "+err.Error())
		return
	}

	selected := account.Selected
	if len(selected) == 0 {
		selected = []string{"primary"}
	}

	list, err := h.ListCalendarList(r.Context(), accessToken)
	if err != nil {
		calErr(w, http.StatusBadGateway, "Google calendarList failed: "+err.Error())
		return
	}
	metaByID := map[string]googleCalendarListEntry{}
	for _, item := range list {
		metaByID[item.ID] = item
		if item.Primary {
			metaByID["primary"] = item
		}
	}

	namedByGoogle := map[string]string{}
	writableGoogleIDs := map[string]struct{}{}
	syncTokens := map[string]string{}
	totalUpserted, totalPushed, totalDeleted := 0, 0, 0
	for _, googleCalID := range selected {
		meta := metaByID[googleCalID]
		name := meta.Summary
		if name == "" {
			name = googleCalID
		}
		namedID, err := h.ensureMirrorCalendar(r.Context(), userID, googleCalID, name, meta.BackgroundColor)
		if err != nil {
			calJSON(w, http.StatusInternalServerError, map[string]any{
				"error": "Failed to mirror Google calendar", "detail": err.Error(),
			})
			return
		}
		namedByGoogle[googleCalID] = namedID
		allowPush := googleCalendarAllowsWrite(meta.AccessRole)
		if allowPush {
			writableGoogleIDs[googleCalID] = struct{}{}
			if googleCalID == "primary" || meta.Primary {
				writableGoogleIDs["primary"] = struct{}{}
				writableGoogleIDs[meta.ID] = struct{}{}
			}
		}
		up, pu, del, _, syncToken, serr := h.syncOneGoogleCalendar(
			r.Context(), accessToken, userID, googleCalID, namedID, timeMin, timeMax, allowPush,
		)
		if serr != nil {
			_ = h.sb.From("calendar_google_accounts").Update(map[string]any{
				"status": "error", "error_message": serr.Error(),
			}).Eq("id", account.ID).Exec(r.Context(), nil)
			calErr(w, http.StatusBadGateway, "Google Calendar sync failed: "+serr.Error())
			return
		}
		if syncToken != "" {
			syncTokens[googleCalID] = syncToken
		}
		totalUpserted += up
		totalPushed += pu
		totalDeleted += del
	}

	pendingPushed, err := h.pushPendingLocalGoogleCreates(
		r.Context(), accessToken, userID, selected, namedByGoogle, writableGoogleIDs,
	)
	if err != nil {
		calJSON(w, http.StatusBadGateway, map[string]any{
			"error": "Failed to push local Google events", "detail": err.Error(),
		})
		return
	}
	totalPushed += pendingPushed

	_ = h.sb.From("calendar_google_accounts").Update(map[string]any{
		"status": "active", "error_message": nil, "last_sync_at": nowISO(),
	}).Eq("id", account.ID).Exec(r.Context(), nil)

	if err := h.ensureWatchesForAccount(r.Context(), account.ID, userID, selected); err != nil {
		log.Printf("calendar watch: sync ensure %s: %v", account.ID, err)
	}
	for googleCalID, syncToken := range syncTokens {
		h.saveWatchSyncToken(r.Context(), account.ID, googleCalID, syncToken)
	}

	calJSON(w, http.StatusOK, map[string]any{
		"ok":       true,
		"upserted": totalUpserted,
		"pushed":   totalPushed,
		"deleted":  totalDeleted,
		"timeMin":  timeMin.UTC().Format(time.RFC3339),
		"timeMax":  timeMax.UTC().Format(time.RFC3339),
	})
}

func (h *Handler) pushGoogleEvent(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	eventID := chi.URLParam(r, "eventId")
	if eventID == "" {
		calErr(w, http.StatusBadRequest, "Missing eventId")
		return
	}
	account, ok := h.requireGoogleAccount(w, r, userID, true)
	if !ok {
		return
	}
	row, err := h.loadLocalGoogleEventByID(r.Context(), userID, eventID)
	if err != nil {
		calJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	if row == nil {
		calErr(w, http.StatusNotFound, "Event not found")
		return
	}
	accessToken, err := h.GetAccessToken(r.Context(), account.ID)
	if err != nil {
		calErr(w, http.StatusUnauthorized, "Failed to refresh Google token: "+err.Error())
		return
	}
	if err := h.pushLocalEventToGoogle(r.Context(), accessToken, userID, *row); err != nil {
		calJSON(w, http.StatusBadGateway, map[string]any{
			"error": "Failed to push event to Google", "detail": err.Error(),
		})
		return
	}
	calJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) deleteGoogleEvent(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	eventID := chi.URLParam(r, "eventId")
	if eventID == "" {
		calErr(w, http.StatusBadRequest, "Missing eventId")
		return
	}
	account, ok := h.requireGoogleAccount(w, r, userID, true)
	if !ok {
		return
	}
	row, err := h.loadLocalGoogleEventByID(r.Context(), userID, eventID)
	if err != nil {
		calJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	if row == nil {
		calErr(w, http.StatusNotFound, "Event not found")
		return
	}
	accessToken, err := h.GetAccessToken(r.Context(), account.ID)
	if err != nil {
		calErr(w, http.StatusUnauthorized, "Failed to refresh Google token: "+err.Error())
		return
	}
	googleCalID := derefStr(row.GoogleCalendarID)
	googleEventID := derefStr(row.GoogleEventID)
	if googleCalID != "" && googleEventID != "" {
		if err := h.DeleteCalendarEvent(r.Context(), accessToken, googleCalID, googleEventID, derefStr(row.GoogleEtag)); err != nil {
			if !strings.Contains(err.Error(), "HTTP 404") && !strings.Contains(err.Error(), "HTTP 410") {
				calJSON(w, http.StatusBadGateway, map[string]any{
					"error": "Failed to delete Google event", "detail": err.Error(),
				})
				return
			}
		}
	}
	if err := h.sb.From("calendar_events").Delete().Eq("id", eventID).Eq("owner_user_id", userID).Exec(r.Context(), nil); err != nil {
		calJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	calJSON(w, http.StatusOK, map[string]any{"ok": true})
}

type googleAccountRow struct {
	ID       string
	Status   string
	Scope    string
	Selected []string
}

func (h *Handler) requireGoogleAccount(
	w http.ResponseWriter,
	r *http.Request,
	userID string,
	requireWrite bool,
) (googleAccountRow, bool) {
	var account struct {
		ID       string          `json:"id"`
		Status   string          `json:"status"`
		Scope    *string         `json:"oauth_scope"`
		Selected json.RawMessage `json:"selected_google_calendar_ids"`
	}
	found, _ := h.sb.From("calendar_google_accounts").
		Select("id,status,oauth_scope,selected_google_calendar_ids").
		Eq("owner_user_id", userID).
		Neq("status", "disconnected").
		MaybeSingle(r.Context(), &account)
	if !found {
		calErr(w, http.StatusNotFound, "Google Calendar is not linked")
		return googleAccountRow{}, false
	}
	if account.Status == "reauth_required" {
		calErr(w, http.StatusConflict, "Google Calendar requires re-authorization")
		return googleAccountRow{}, false
	}
	scope := ""
	if account.Scope != nil {
		scope = *account.Scope
	}
	if requireWrite && !hasCalendarWriteScope(scope) {
		_ = h.sb.From("calendar_google_accounts").Update(map[string]any{
			"status":        "reauth_required",
			"error_message": "Google Calendar write scope is missing; reconnect to grant calendar access",
		}).Eq("id", account.ID).Exec(r.Context(), nil)
		calErr(w, http.StatusConflict, "Google Calendar requires re-authorization")
		return googleAccountRow{}, false
	}
	selected := decodeStringArray(account.Selected)
	return googleAccountRow{
		ID:       account.ID,
		Status:   account.Status,
		Scope:    scope,
		Selected: selected,
	}, true
}

func mapAccount(row map[string]any) map[string]any {
	selected := []string{}
	switch v := row["selected_google_calendar_ids"].(type) {
	case []any:
		for _, item := range v {
			if s, ok := item.(string); ok && s != "" {
				selected = append(selected, s)
			}
		}
	case []string:
		selected = v
	}
	scope, _ := row["oauth_scope"].(string)
	return map[string]any{
		"id":                        row["id"],
		"email":                     row["email"],
		"displayName":               row["display_name"],
		"avatarUrl":                 row["avatar_url"],
		"googleCalendarId":          row["google_calendar_id"],
		"status":                    row["status"],
		"errorMessage":              row["error_message"],
		"lastSyncAt":                row["last_sync_at"],
		"createdAt":                 row["created_at"],
		"updatedAt":                 row["updated_at"],
		"oauthScope":                scope,
		"canWrite":                  hasCalendarWriteScope(scope),
		"selectedGoogleCalendarIds": selected,
	}
}

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

func mapGoogleTimes(ev googleEvent) (startAt, endAt string, allDay bool, ok bool) {
	if ev.Start.Date != "" {
		startDay, err1 := time.Parse("2006-01-02", ev.Start.Date)
		endDay, err2 := time.Parse("2006-01-02", ev.End.Date)
		if err1 != nil || err2 != nil {
			return "", "", false, false
		}
		// Google all-day end.date is exclusive; GeoCRM + Schedule-X use inclusive
		// end dates (same calendar day for a one-day holiday).
		if !endDay.After(startDay) {
			endDay = startDay
		} else {
			endDay = endDay.AddDate(0, 0, -1)
		}
		return startDay.UTC().Format(time.RFC3339), endDay.UTC().Format(time.RFC3339), true, true
	}
	if ev.Start.DateTime == "" || ev.End.DateTime == "" {
		return "", "", false, false
	}
	st, ok1 := parseISOTimestamp(ev.Start.DateTime)
	en, ok2 := parseISOTimestamp(ev.End.DateTime)
	if !ok1 || !ok2 {
		return "", "", false, false
	}
	if en.Before(st) {
		en = st
	}
	return st.Format(time.RFC3339Nano), en.Format(time.RFC3339Nano), false, true
}

func uniqueNonEmpty(ids []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}

func decodeStringArray(raw json.RawMessage) []string {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var out []string
	if err := json.Unmarshal(raw, &out); err == nil {
		return out
	}
	return nil
}
