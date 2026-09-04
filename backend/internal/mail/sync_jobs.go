package mail

import (
	"context"
	"log"
	"net/http"
	"runtime/debug"
	"strings"
	"time"

	"github.com/fuyediao/powersource-workbench/backend/internal/mail/alimail"
	"github.com/fuyediao/powersource-workbench/backend/internal/mail/gmail"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/authmw"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
)

// staleIncrementalSyncJobAge is how long an incremental `running` job may sit
// before a new sync marks it failed (e.g. gateway 504 or container restart).
const staleIncrementalSyncJobAge = 15 * time.Minute

// staleHistoricalSyncJobAge allows longer backfills before expiring orphaned jobs.
const staleHistoricalSyncJobAge = 3 * time.Hour

type syncAccountRow struct {
	ID             string  `json:"id"`
	OwnerID        string  `json:"owner_user_id"`
	Provider       string  `json:"provider"`
	AuthType       string  `json:"auth_type"`
	Email          string  `json:"email"`
	LastSyncAt     *string `json:"last_sync_at"`
	GmailHistoryID *string `json:"gmail_history_id"`
}

func (h *Handler) syncAccount(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	accountID := chiID(r)
	account, ok := h.loadSyncAccount(r.Context(), accountID)
	if !ok {
		mailErr(w, http.StatusNotFound, "Account not found")
		return
	}
	if account.OwnerID != userID {
		mailErr(w, http.StatusForbidden, "Forbidden")
		return
	}

	h.expireStaleSyncJobs(r.Context(), accountID)

	var running struct {
		ID string `json:"id"`
	}
	if found, _ := h.sb.From("mail_sync_jobs").Select("id,status,kind").Eq("mail_account_id", accountID).Eq("status", "running").Order("created_at", false).Limit(1).MaybeSingle(r.Context(), &running); found {
		mailJSON(w, http.StatusConflict, map[string]any{"error": "sync_in_progress", "jobId": running.ID})
		return
	}

	jobID := h.createSyncJob(r.Context(), accountID, userID, "incremental", nil)
	if jobID == "" {
		mailErr(w, http.StatusBadRequest, "Failed to create sync job")
		return
	}

	scheduled := h.supervisor.TryRun(accountID, func() {
		bg := context.Background()
		defer h.recoverSyncJob(bg, jobID)
		h.runSync(bg, account, jobID, syncOptions{
			kind: "incremental",
			onProgress: func(synced, total int) {
				update := map[string]any{
					"status":          "running",
					"progress":        synced,
					"messages_synced": synced,
				}
				if total > 0 {
					update["total_estimated"] = total
				}
				_ = h.sb.From("mail_sync_jobs").Update(update).Eq("id", jobID).Exec(bg, nil)
			},
		})
	})
	if !scheduled {
		h.cancelUnstartedJob(r.Context(), jobID, "A background sync is already running for this account")
		mailJSON(w, http.StatusConflict, map[string]any{"error": "sync_in_progress"})
		return
	}

	mailJSON(w, http.StatusAccepted, map[string]any{"jobId": jobID, "status": "running"})
}

func (h *Handler) historicalSyncStart(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	accountID := chiID(r)
	account, ok := h.loadSyncAccount(r.Context(), accountID)
	if !ok {
		mailErr(w, http.StatusNotFound, "Account not found")
		return
	}
	if account.OwnerID != userID {
		mailErr(w, http.StatusForbidden, "Forbidden")
		return
	}

	h.expireStaleSyncJobs(r.Context(), accountID)

	var running struct {
		ID string `json:"id"`
	}
	if found, _ := h.sb.From("mail_sync_jobs").Select("id,status,kind").Eq("mail_account_id", accountID).Eq("kind", "historical").Eq("status", "running").Order("created_at", false).Limit(1).MaybeSingle(r.Context(), &running); found {
		mailJSON(w, http.StatusConflict, map[string]any{"error": "historical_sync_in_progress", "jobId": running.ID})
		return
	}

	var body struct {
		Since *string `json:"since"`
	}
	_ = httpx.DecodeJSON(r, &body)
	var since *string
	if body.Since != nil && strings.TrimSpace(*body.Since) != "" {
		t, ok := parseISOTimestamp(strings.TrimSpace(*body.Since))
		if !ok {
			mailErr(w, http.StatusBadRequest, "Invalid `since` (must be ISO timestamp or null)")
			return
		}
		formatted := t.Format(time.RFC3339Nano)
		since = &formatted
	}

	jobID := h.createSyncJob(r.Context(), accountID, userID, "historical", since)
	if jobID == "" {
		mailErr(w, http.StatusBadRequest, "Failed to create sync job")
		return
	}

	scheduled := h.supervisor.TryRun(accountID, func() {
		bg := context.Background()
		defer h.recoverSyncJob(bg, jobID)
		h.runSync(bg, account, jobID, syncOptions{
			kind:            "historical",
			historicalSince: since,
			onProgress: func(synced, total int) {
				update := map[string]any{"progress": synced, "messages_synced": synced}
				if total > 0 {
					update["total_estimated"] = total
				}
				_ = h.sb.From("mail_sync_jobs").Update(update).Eq("id", jobID).Exec(bg, nil)
			},
			checkCancel: func() bool {
				var row struct {
					Status string `json:"status"`
				}
				_, _ = h.sb.From("mail_sync_jobs").Select("status").Eq("id", jobID).MaybeSingle(bg, &row)
				return row.Status == "cancelled"
			},
		})
	})
	if !scheduled {
		h.cancelUnstartedJob(r.Context(), jobID, "A background sync is already running for this account")
		mailJSON(w, http.StatusConflict, map[string]any{"error": "historical_sync_in_progress"})
		return
	}

	mailJSON(w, http.StatusAccepted, map[string]any{"jobId": jobID, "status": "running"})
}

// cancelUnstartedJob marks a just-created job row as failed when the
// supervisor could not schedule it (another sync already owns the account
// lock), so it never lingers as "running" with no goroutine behind it.
func (h *Handler) cancelUnstartedJob(ctx context.Context, jobID, message string) {
	_ = h.sb.From("mail_sync_jobs").Update(map[string]any{
		"status":        "cancelled",
		"error_message": message,
		"finished_at":   nowISO(),
	}).Eq("id", jobID).Exec(ctx, nil)
}

func (h *Handler) syncJobStatus(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	jobID := chiID(r)
	var job struct {
		ID              string  `json:"id"`
		MailAccountID   string  `json:"mail_account_id"`
		Kind            *string `json:"kind"`
		Status          string  `json:"status"`
		Progress        *int    `json:"progress"`
		TotalEstimated  *int    `json:"total_estimated"`
		MessagesSynced  *int    `json:"messages_synced"`
		ErrorMessage    *string `json:"error_message"`
		HistoricalSince *string `json:"historical_since"`
		StartedAt       *string `json:"started_at"`
		FinishedAt      *string `json:"finished_at"`
	}
	found, _ := h.sb.From("mail_sync_jobs").Select("id,mail_account_id,kind,status,progress,total_estimated,messages_synced,error_message,historical_since,started_at,finished_at").Eq("id", jobID).MaybeSingle(r.Context(), &job)
	if !found {
		mailErr(w, http.StatusNotFound, "Job not found")
		return
	}
	if !h.ownsSyncAccount(r.Context(), job.MailAccountID, userID) {
		mailErr(w, http.StatusForbidden, "Forbidden")
		return
	}
	mailJSON(w, http.StatusOK, map[string]any{
		"jobId":           job.ID,
		"accountId":       job.MailAccountID,
		"kind":            job.Kind,
		"status":          job.Status,
		"progress":        intOrZero(job.Progress),
		"totalEstimated":  job.TotalEstimated,
		"messagesSynced":  intOrZero(job.MessagesSynced),
		"errorMessage":    job.ErrorMessage,
		"historicalSince": job.HistoricalSince,
		"startedAt":       job.StartedAt,
		"finishedAt":      job.FinishedAt,
	})
}

func (h *Handler) syncJobCancel(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	jobID := chiID(r)
	var job struct {
		ID            string `json:"id"`
		MailAccountID string `json:"mail_account_id"`
		Status        string `json:"status"`
	}
	found, _ := h.sb.From("mail_sync_jobs").Select("id,mail_account_id,status").Eq("id", jobID).MaybeSingle(r.Context(), &job)
	if !found {
		mailErr(w, http.StatusNotFound, "Job not found")
		return
	}
	if !h.ownsSyncAccount(r.Context(), job.MailAccountID, userID) {
		mailErr(w, http.StatusForbidden, "Forbidden")
		return
	}
	if job.Status != "running" && job.Status != "pending" {
		mailJSON(w, http.StatusOK, map[string]any{"jobId": job.ID, "status": job.Status, "cancelled": false})
		return
	}
	_ = h.sb.From("mail_sync_jobs").Update(map[string]any{"status": "cancelled"}).Eq("id", jobID).Exec(r.Context(), nil)
	mailJSON(w, http.StatusOK, map[string]any{"jobId": job.ID, "status": "cancelled", "cancelled": true})
}

// ── Sync engine ──────────────────────────────────────────────────────────────

type syncOptions struct {
	kind            string
	historicalSince *string
	onProgress      func(synced, total int)
	checkCancel     func() bool
}

type syncResult struct {
	status         string // done | failed | cancelled
	messagesSynced int
	messagesListed int
	fetchErrors    int
	upsertErrors   int
	errorMessage   string
	newHistoryID   string // Gmail only: historyId to persist on success
}

func (h *Handler) loadSyncAccount(ctx context.Context, accountID string) (syncAccountRow, bool) {
	var account syncAccountRow
	found, _ := h.sb.From("mail_accounts").Select("id,owner_user_id,provider,auth_type,email,last_sync_at,gmail_history_id").Eq("id", accountID).MaybeSingle(ctx, &account)
	return account, found
}

func (h *Handler) ownsSyncAccount(ctx context.Context, accountID, userID string) bool {
	var account struct {
		OwnerUserID string `json:"owner_user_id"`
	}
	found, _ := h.sb.From("mail_accounts").Select("owner_user_id").Eq("id", accountID).MaybeSingle(ctx, &account)
	return found && account.OwnerUserID == userID
}

// recoverSyncJob recovers a panic in a background sync goroutine, marks the job
// failed, and logs the stack. Without it an unrecovered panic would crash the
// whole process and surface to clients as failed sync polls.
func (h *Handler) recoverSyncJob(ctx context.Context, jobID string) {
	rec := recover()
	if rec == nil {
		return
	}
	log.Printf("mail: panic in sync job %s: %v\n%s", jobID, rec, debug.Stack())
	_ = h.sb.From("mail_sync_jobs").Update(map[string]any{
		"status":        "failed",
		"error_message": "Sync crashed (internal error)",
		"finished_at":   nowISO(),
	}).Eq("id", jobID).Exec(ctx, nil)
}

func (h *Handler) createSyncJob(ctx context.Context, accountID, userID, kind string, since *string) string {
	row := map[string]any{
		"mail_account_id": accountID, "triggered_by": userID, "status": "running",
		"started_at": nowISO(),
	}
	if kind == "historical" {
		row["kind"] = "historical"
		row["progress"] = 0
		row["historical_since"] = since
	} else if kind == "incremental" {
		row["kind"] = "incremental"
		row["progress"] = 0
	}
	var job struct {
		ID string `json:"id"`
	}
	if err := h.sb.From("mail_sync_jobs").Insert(row).Returning().Select("id").Single(ctx, &job); err != nil {
		return ""
	}
	return job.ID
}

// expireStaleSyncJobs marks long-running jobs as failed so a new sync can start
// after a gateway timeout or process restart left orphaned `running` rows.
func (h *Handler) expireStaleSyncJobs(ctx context.Context, accountID string) {
	var running []struct {
		ID        string  `json:"id"`
		Kind      *string `json:"kind"`
		StartedAt *string `json:"started_at"`
	}
	if err := h.sb.From("mail_sync_jobs").
		Select("id,kind,started_at").
		Eq("mail_account_id", accountID).
		Eq("status", "running").
		Exec(ctx, &running); err != nil {
		return
	}
	now := time.Now()
	for _, job := range running {
		if job.StartedAt == nil {
			continue
		}
		started, ok := parseISOTimestamp(*job.StartedAt)
		if !ok {
			continue
		}
		maxAge := staleIncrementalSyncJobAge
		if job.Kind != nil && *job.Kind == "historical" {
			maxAge = staleHistoricalSyncJobAge
		}
		if now.Sub(started) < maxAge {
			continue
		}
		_ = h.sb.From("mail_sync_jobs").Update(map[string]any{
			"status":        "failed",
			"error_message": "Sync timed out (stale job)",
			"finished_at":   nowISO(),
		}).Eq("id", job.ID).Exec(ctx, nil)
	}
}

// runSync dispatches the sync run to the account's provider client, applies
// the account status/cursor bookkeeping, and (when jobID is non-empty) also
// finalizes the matching mail_sync_jobs row. jobID is empty for background
// supervisor nudges, which skip job bookkeeping entirely (see runProviderSync).
func (h *Handler) runSync(ctx context.Context, account syncAccountRow, jobID string, opts syncOptions) syncResult {
	result := h.runProviderSync(ctx, account, opts)
	if jobID != "" {
		h.finalizeSyncJob(ctx, jobID, opts, result)
	}
	return result
}

// runProviderSync dispatches to the account's provider client and applies the
// resulting account status/cursor bookkeeping (status, error, last_sync_at,
// Gmail historyId). It does not touch mail_sync_jobs, so both the HTTP
// sync endpoints and the AccountSupervisor's background nudge share it.
func (h *Handler) runProviderSync(ctx context.Context, account syncAccountRow, opts syncOptions) syncResult {
	var result syncResult
	switch account.Provider {
	case "gmail":
		gr := h.gmail.RunSync(ctx, account.ID, account.LastSyncAt, account.GmailHistoryID, gmail.SyncOptions{
			Kind:            opts.kind,
			HistoricalSince: opts.historicalSince,
			OnProgress:      opts.onProgress,
			CheckCancel:     opts.checkCancel,
		})
		result = syncResult{
			status: gr.Status, messagesSynced: gr.MessagesSynced, messagesListed: gr.MessagesListed,
			fetchErrors: gr.FetchErrors, upsertErrors: gr.UpsertErrors, errorMessage: gr.ErrorMessage,
			newHistoryID: gr.NewHistoryID,
		}
	case alimail.ProviderName, alimail.GenericIMAPProviderName:
		cfg, err := h.alimail.LoadConfig(ctx, account.ID)
		if err != nil {
			result = syncResult{status: "failed", errorMessage: err.Error()}
		} else {
			ar := h.alimail.RunSync(ctx, account.ID, *cfg, opts.onProgress, opts.checkCancel)
			result = syncResult{status: ar.Status, messagesSynced: ar.MessagesSynced, errorMessage: ar.ErrorMessage}
		}
	default:
		result = syncResult{status: "failed", errorMessage: "Unsupported mail provider"}
	}
	h.applySyncOutcome(ctx, account, opts, result)
	return result
}

// finalizeSyncJob updates the mail_sync_jobs row so Electron's `/sync-jobs/:id`
// poll reflects the finished run.
func (h *Handler) finalizeSyncJob(ctx context.Context, jobID string, opts syncOptions, result syncResult) {
	jobUpdate := map[string]any{
		"status":          result.status,
		"messages_synced": result.messagesSynced,
		"error_message":   nilIfEmpty(result.errorMessage),
		"finished_at":     nowISO(),
	}
	if opts.kind == "historical" || opts.kind == "incremental" {
		jobUpdate["progress"] = result.messagesSynced
		if result.messagesListed > 0 {
			jobUpdate["total_estimated"] = result.messagesListed
		}
	}
	_ = h.sb.From("mail_sync_jobs").Update(jobUpdate).Eq("id", jobID).Exec(ctx, nil)
}

// applySyncOutcome updates mail_accounts status/error/cursor fields after a
// sync run, regardless of whether it was triggered by HTTP or a background
// nudge.
func (h *Handler) applySyncOutcome(ctx context.Context, account syncAccountRow, opts syncOptions, result syncResult) {
	accountUpdate := map[string]any{}
	switch result.status {
	case "done":
		accountUpdate["status"] = "active"
		accountUpdate["error_message"] = nil
		if opts.kind == "historical" {
			accountUpdate["historical_sync_completed_at"] = nowISO()
		} else if result.fetchErrors == 0 && result.upsertErrors == 0 {
			// Do not advance the incremental cursor when message fetches or upserts
			// failed; otherwise Gmail `after:` would skip messages we never persisted.
			accountUpdate["last_sync_at"] = nowISO()
		}
		if result.newHistoryID != "" {
			accountUpdate["gmail_history_id"] = result.newHistoryID
		}
	case "failed":
		accountUpdate["status"] = "error"
		accountUpdate["error_message"] = result.errorMessage
		if strings.Contains(result.errorMessage, "refresh") || strings.Contains(result.errorMessage, "OAuth") {
			accountUpdate["status"] = "reauth_required"
		}
	}
	if len(accountUpdate) > 0 {
		_ = h.sb.From("mail_accounts").Update(accountUpdate).Eq("id", account.ID).Exec(ctx, nil)
	}
}
