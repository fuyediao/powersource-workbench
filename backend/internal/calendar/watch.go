package calendar

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/idutil"
)

const (
	watchRenewAhead = 48 * time.Hour
	watchRenewTick  = 6 * time.Hour
	watchDefaultTTL = 6 * 24 * time.Hour // under Google's ~7d max
	pushSyncWorkers = 4
	pushSyncTimeout = 3 * time.Minute
)

// watchChannelRow is a persisted Google events.watch channel.
type watchChannelRow struct {
	ID               string  `json:"id"`
	AccountID        string  `json:"account_id"`
	GoogleCalendarID string  `json:"google_calendar_id"`
	ChannelID        string  `json:"channel_id"`
	ResourceID       string  `json:"resource_id"`
	ResourceURI      *string `json:"resource_uri"`
	Token            string  `json:"token"`
	Expiration       string  `json:"expiration"`
	SyncToken        *string `json:"sync_token"`
}

// googleCalendarWebhookURL returns the public HTTPS address for events.watch.
func (h *Handler) googleCalendarWebhookURL() string {
	if v := strings.TrimSpace(h.env.GoogleCalendarWebhookURL); v != "" {
		return v
	}
	redirect := strings.TrimSpace(h.calendarRedirectURI())
	if redirect == "" {
		return ""
	}
	u, err := url.Parse(redirect)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return ""
	}
	u.Path = "/calendar/webhooks/google"
	u.RawQuery = ""
	u.Fragment = ""
	return u.String()
}

// StartWatchWorkers starts renew ticker and ensures watches for active accounts.
func (h *Handler) StartWatchWorkers(ctx context.Context) {
	go h.runWatchRenewalLoop(ctx)
	go func() {
		ensureCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
		defer cancel()
		if err := h.ensureWatchesForAllActiveAccounts(ensureCtx); err != nil {
			log.Printf("calendar watch: startup ensure failed: %v", err)
		}
	}()
}

func (h *Handler) runWatchRenewalLoop(ctx context.Context) {
	ticker := time.NewTicker(watchRenewTick)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			renewCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
			if err := h.renewExpiringWatches(renewCtx); err != nil {
				log.Printf("calendar watch: renew failed: %v", err)
			}
			cancel()
		}
	}
}

// enqueuePushSync runs an incremental sync for one calendar without blocking the webhook.
func (h *Handler) enqueuePushSync(accountID, googleCalID string) {
	select {
	case h.pushSem <- struct{}{}:
	default:
		log.Printf("calendar watch: push sync queue full; dropping %s/%s", accountID, googleCalID)
		return
	}
	go func() {
		defer func() { <-h.pushSem }()
		ctx, cancel := context.WithTimeout(context.Background(), pushSyncTimeout)
		defer cancel()
		if err := h.syncFromPushNotification(ctx, accountID, googleCalID); err != nil {
			log.Printf("calendar watch: push sync %s/%s: %v", accountID, googleCalID, err)
		}
	}()
}

// googleWebhook handles Google Calendar push notifications (public, no JWT).
func (h *Handler) googleWebhook(w http.ResponseWriter, r *http.Request) {
	channelID := strings.TrimSpace(r.Header.Get("X-Goog-Channel-ID"))
	token := strings.TrimSpace(r.Header.Get("X-Goog-Channel-Token"))
	resourceState := strings.TrimSpace(r.Header.Get("X-Goog-Resource-State"))
	if channelID == "" || token == "" {
		calErr(w, http.StatusBadRequest, "Missing Google channel headers")
		return
	}

	var row watchChannelRow
	found, err := h.sb.From("calendar_google_watch_channels").
		Select("id,account_id,google_calendar_id,channel_id,resource_id,token,expiration,sync_token").
		Eq("channel_id", channelID).
		MaybeSingle(r.Context(), &row)
	if err != nil {
		calJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	if !found || subtle.ConstantTimeCompare([]byte(row.Token), []byte(token)) != 1 {
		calErr(w, http.StatusNotFound, "Unknown channel")
		return
	}

	// Handshake ("sync") only needs acknowledgement.
	if !strings.EqualFold(resourceState, "sync") {
		h.enqueuePushSync(row.AccountID, row.GoogleCalendarID)
	}
	w.WriteHeader(http.StatusOK)
}

// ensureWatchesForAccount creates or refreshes watches for selected calendars
// and stops channels for calendars no longer selected.
func (h *Handler) ensureWatchesForAccount(ctx context.Context, accountID, ownerUserID string, selected []string) error {
	address := h.googleCalendarWebhookURL()
	if address == "" {
		log.Printf("calendar watch: webhook URL not configured; skipping ensure for %s", accountID)
		return nil
	}
	accessToken, err := h.GetAccessToken(ctx, accountID)
	if err != nil {
		return err
	}
	selectedSet := make(map[string]struct{}, len(selected))
	for _, id := range selected {
		if id == "" {
			continue
		}
		selectedSet[id] = struct{}{}
	}

	var existing []watchChannelRow
	if err := h.sb.From("calendar_google_watch_channels").
		Select("id,account_id,google_calendar_id,channel_id,resource_id,token,expiration,sync_token").
		Eq("account_id", accountID).
		Exec(ctx, &existing); err != nil {
		return err
	}
	byCal := map[string]watchChannelRow{}
	for _, row := range existing {
		byCal[row.GoogleCalendarID] = row
		if _, ok := selectedSet[row.GoogleCalendarID]; !ok {
			_ = h.stopAndDeleteWatch(ctx, accessToken, row)
		}
	}

	for googleCalID := range selectedSet {
		if row, ok := byCal[googleCalID]; ok {
			if exp, ok := parseISOTimestamp(row.Expiration); ok && exp.After(time.Now().UTC().Add(watchRenewAhead)) {
				continue
			}
			_ = h.stopAndDeleteWatch(ctx, accessToken, row)
		}
		if err := h.createWatchChannel(ctx, accessToken, accountID, googleCalID, address); err != nil {
			log.Printf("calendar watch: create %s/%s: %v", accountID, googleCalID, err)
		}
	}
	_ = ownerUserID
	return nil
}

func (h *Handler) createWatchChannel(
	ctx context.Context,
	accessToken, accountID, googleCalID, address string,
) error {
	channelID := idutil.UUIDv4()
	token := idutil.UUIDv4()
	expirationMS := time.Now().UTC().Add(watchDefaultTTL).UnixMilli()
	resp, err := h.WatchCalendarEvents(ctx, accessToken, googleCalID, channelID, address, token, expirationMS)
	if err != nil {
		return err
	}
	exp := time.UnixMilli(expirationMS).UTC()
	if ms, err := strconv.ParseInt(strings.TrimSpace(resp.Expiration), 10, 64); err == nil && ms > 0 {
		exp = time.UnixMilli(ms).UTC()
	}
	storedChannelID := resp.ID
	if storedChannelID == "" {
		storedChannelID = channelID
	}
	row := map[string]any{
		"account_id":         accountID,
		"google_calendar_id": googleCalID,
		"channel_id":         storedChannelID,
		"resource_id":        resp.ResourceID,
		"resource_uri":       resp.ResourceURI,
		"token":              token,
		"expiration":         exp.Format(time.RFC3339Nano),
	}
	return h.sb.From("calendar_google_watch_channels").
		Upsert(row, "account_id,google_calendar_id").
		Exec(ctx, nil)
}

func (h *Handler) stopAndDeleteWatch(ctx context.Context, accessToken string, row watchChannelRow) error {
	if row.ChannelID != "" && row.ResourceID != "" {
		if err := h.StopWatchChannel(ctx, accessToken, row.ChannelID, row.ResourceID); err != nil {
			log.Printf("calendar watch: stop %s: %v", row.ChannelID, err)
		}
	}
	return h.sb.From("calendar_google_watch_channels").Delete().Eq("id", row.ID).Exec(ctx, nil)
}

// stopAllWatchesForAccount stops Google channels and deletes DB rows for an account.
func (h *Handler) stopAllWatchesForAccount(ctx context.Context, accountID string) {
	var rows []watchChannelRow
	if err := h.sb.From("calendar_google_watch_channels").
		Select("id,account_id,google_calendar_id,channel_id,resource_id,token,expiration,sync_token").
		Eq("account_id", accountID).
		Exec(ctx, &rows); err != nil {
		log.Printf("calendar watch: list for stop %s: %v", accountID, err)
		return
	}
	accessToken, err := h.GetAccessToken(ctx, accountID)
	if err != nil {
		accessToken = ""
	}
	for _, row := range rows {
		if accessToken != "" {
			_ = h.stopAndDeleteWatch(ctx, accessToken, row)
			continue
		}
		_ = h.sb.From("calendar_google_watch_channels").Delete().Eq("id", row.ID).Exec(ctx, nil)
	}
}

func (h *Handler) saveWatchSyncToken(ctx context.Context, accountID, googleCalID, syncToken string) {
	if strings.TrimSpace(syncToken) == "" {
		return
	}
	_ = h.sb.From("calendar_google_watch_channels").Update(map[string]any{
		"sync_token": syncToken,
	}).Eq("account_id", accountID).Eq("google_calendar_id", googleCalID).Exec(ctx, nil)
}

func (h *Handler) clearWatchSyncToken(ctx context.Context, accountID, googleCalID string) {
	_ = h.sb.From("calendar_google_watch_channels").Update(map[string]any{
		"sync_token": nil,
	}).Eq("account_id", accountID).Eq("google_calendar_id", googleCalID).Exec(ctx, nil)
}

func (h *Handler) loadWatchSyncToken(ctx context.Context, accountID, googleCalID string) string {
	var row struct {
		SyncToken *string `json:"sync_token"`
	}
	found, _ := h.sb.From("calendar_google_watch_channels").
		Select("sync_token").
		Eq("account_id", accountID).
		Eq("google_calendar_id", googleCalID).
		MaybeSingle(ctx, &row)
	if !found || row.SyncToken == nil {
		return ""
	}
	return strings.TrimSpace(*row.SyncToken)
}

// syncFromPushNotification performs incremental (or fallback windowed) sync for one calendar.
func (h *Handler) syncFromPushNotification(ctx context.Context, accountID, googleCalID string) error {
	var account struct {
		ID       string          `json:"id"`
		OwnerID  string          `json:"owner_user_id"`
		Status   string          `json:"status"`
		Scope    *string         `json:"oauth_scope"`
		Selected json.RawMessage `json:"selected_google_calendar_ids"`
	}
	found, err := h.sb.From("calendar_google_accounts").
		Select("id,owner_user_id,status,oauth_scope,selected_google_calendar_ids").
		Eq("id", accountID).
		MaybeSingle(ctx, &account)
	if err != nil {
		return err
	}
	if !found || account.Status != "active" {
		return nil
	}
	selected := decodeStringArray(account.Selected)
	if len(selected) == 0 {
		selected = []string{"primary"}
	}
	if !containsStr(selected, googleCalID) {
		return nil
	}

	accessToken, err := h.GetAccessToken(ctx, accountID)
	if err != nil {
		return err
	}
	list, err := h.ListCalendarList(ctx, accessToken)
	if err != nil {
		return err
	}
	metaByID := map[string]googleCalendarListEntry{}
	for _, item := range list {
		metaByID[item.ID] = item
		if item.Primary {
			metaByID["primary"] = item
		}
	}
	meta := metaByID[googleCalID]
	name := meta.Summary
	if name == "" {
		name = googleCalID
	}
	namedID, err := h.ensureMirrorCalendar(ctx, account.OwnerID, googleCalID, name, meta.BackgroundColor)
	if err != nil {
		return err
	}
	allowPush := googleCalendarAllowsWrite(meta.AccessRole)

	syncToken := h.loadWatchSyncToken(ctx, accountID, googleCalID)
	var nextSync string
	if syncToken != "" {
		_, _, _, nextSync, err = h.syncOneGoogleCalendarIncremental(
			ctx, accessToken, account.OwnerID, googleCalID, namedID, syncToken, allowPush,
		)
		if isGoogleGone(err) {
			h.clearWatchSyncToken(ctx, accountID, googleCalID)
			err = nil
			syncToken = ""
		} else if err != nil {
			return err
		}
	}
	if syncToken == "" {
		timeMin := time.Now().UTC().AddDate(-1, 0, 0)
		timeMax := time.Now().UTC().AddDate(0, 4, 0)
		_, _, _, _, nextSync, err = h.syncOneGoogleCalendar(
			ctx, accessToken, account.OwnerID, googleCalID, namedID, timeMin, timeMax, allowPush,
		)
		if err != nil {
			return err
		}
	}
	h.saveWatchSyncToken(ctx, accountID, googleCalID, nextSync)
	_ = h.sb.From("calendar_google_accounts").Update(map[string]any{
		"last_push_at":  nowISO(),
		"last_sync_at":  nowISO(),
		"status":        "active",
		"error_message": nil,
	}).Eq("id", accountID).Exec(ctx, nil)
	return nil
}

func (h *Handler) ensureWatchesForAllActiveAccounts(ctx context.Context) error {
	if h.googleCalendarWebhookURL() == "" {
		return nil
	}
	var accounts []struct {
		ID       string          `json:"id"`
		OwnerID  string          `json:"owner_user_id"`
		Selected json.RawMessage `json:"selected_google_calendar_ids"`
	}
	if err := h.sb.From("calendar_google_accounts").
		Select("id,owner_user_id,selected_google_calendar_ids").
		Eq("status", "active").
		Exec(ctx, &accounts); err != nil {
		return err
	}
	for _, account := range accounts {
		selected := decodeStringArray(account.Selected)
		if len(selected) == 0 {
			selected = []string{"primary"}
		}
		if err := h.ensureWatchesForAccount(ctx, account.ID, account.OwnerID, selected); err != nil {
			log.Printf("calendar watch: ensure %s: %v", account.ID, err)
		}
	}
	return nil
}

func (h *Handler) renewExpiringWatches(ctx context.Context) error {
	if h.googleCalendarWebhookURL() == "" {
		return nil
	}
	cutoff := time.Now().UTC().Add(watchRenewAhead).Format(time.RFC3339Nano)
	var rows []watchChannelRow
	if err := h.sb.From("calendar_google_watch_channels").
		Select("id,account_id,google_calendar_id,channel_id,resource_id,token,expiration,sync_token").
		Lt("expiration", cutoff).
		Exec(ctx, &rows); err != nil {
		return err
	}
	seenAccounts := map[string]struct{}{}
	for _, row := range rows {
		if _, ok := seenAccounts[row.AccountID]; ok {
			continue
		}
		seenAccounts[row.AccountID] = struct{}{}
		var account struct {
			OwnerID  string          `json:"owner_user_id"`
			Status   string          `json:"status"`
			Selected json.RawMessage `json:"selected_google_calendar_ids"`
		}
		found, _ := h.sb.From("calendar_google_accounts").
			Select("owner_user_id,status,selected_google_calendar_ids").
			Eq("id", row.AccountID).
			MaybeSingle(ctx, &account)
		if !found || account.Status != "active" {
			continue
		}
		selected := decodeStringArray(account.Selected)
		if len(selected) == 0 {
			selected = []string{"primary"}
		}
		if err := h.ensureWatchesForAccount(ctx, row.AccountID, account.OwnerID, selected); err != nil {
			log.Printf("calendar watch: renew account %s: %v", row.AccountID, err)
		}
	}
	return nil
}
