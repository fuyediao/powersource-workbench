package mail

import (
	"context"
	"log"
	"runtime/debug"
	"sync"
	"time"

	"github.com/fuyediao/powersource-workbench/backend/internal/mail/alimail"
)

// maxConcurrentAccountSyncs bounds how many mail accounts sync at once across
// the whole process, keeping IMAP fan-out and Gmail API usage predictable
// under load (mirrors the T&E package's runBounded pattern).
const maxConcurrentAccountSyncs = 6

// backgroundSyncInterval is how often the supervisor nudges every active
// account with a bounded incremental sync, independent of the 30s send/
// snooze scheduler tick. AliMail INBOX also uses IMAP IDLE (see idle.go)
// so new mail does not wait for this interval.
const backgroundSyncInterval = 2 * time.Minute

// AccountSupervisor serializes sync work per mail account — mirroring
// Mailspring-Sync's one-worker-per-account model — and bounds how many
// accounts sync concurrently. A manual HTTP-triggered sync and a background
// nudge for the same account share the same per-account lock, so they never
// race against the same IMAP/Gmail cursor.
type AccountSupervisor struct {
	h     *Handler
	sem   chan struct{}
	locks sync.Map // accountID (string) -> *sync.Mutex
}

func newAccountSupervisor(h *Handler) *AccountSupervisor {
	return &AccountSupervisor{h: h, sem: make(chan struct{}, maxConcurrentAccountSyncs)}
}

func (s *AccountSupervisor) accountLock(accountID string) *sync.Mutex {
	v, _ := s.locks.LoadOrStore(accountID, &sync.Mutex{})
	return v.(*sync.Mutex)
}

// TryRun runs fn in a new goroutine for accountID unless a sync for that
// account is already running or the process-wide concurrency limit is full.
// It reports whether fn was actually scheduled.
func (s *AccountSupervisor) TryRun(accountID string, fn func()) bool {
	lock := s.accountLock(accountID)
	if !lock.TryLock() {
		return false
	}
	select {
	case s.sem <- struct{}{}:
	default:
		lock.Unlock()
		return false
	}
	go func() {
		defer func() { <-s.sem }()
		defer lock.Unlock()
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("mail supervisor: panic syncing account %s: %v\n%s", accountID, rec, debug.Stack())
			}
		}()
		fn()
	}()
	return true
}

// SyncWorker adapts one provider's sync implementation onto the shape the
// supervisor and HTTP handlers share. It is a thin wrapper around the
// existing gmail.Client / alimail.Client sync methods, not a reimplementation.
type SyncWorker interface {
	// SyncFolders refreshes the mailbox/folder list and cursor bookkeeping
	// (AliMail IMAP LIST; a no-op for Gmail, whose labels are fetched
	// on-demand by the folder-counts / labels endpoints).
	SyncFolders(ctx context.Context) error
	// Incremental performs a fast, cursor-based sync (Gmail historyId /
	// AliMail UID range) suitable for periodic background nudges.
	Incremental(ctx context.Context, progress func(synced, total int)) syncResult
	// Historical performs a deeper backfill, optionally since a cutoff.
	Historical(ctx context.Context, since *string, progress func(synced, total int)) syncResult
}

// newSyncWorker builds the SyncWorker for account's provider.
func (h *Handler) newSyncWorker(account syncAccountRow) SyncWorker {
	if alimail.IsIMAPProvider(account.Provider) {
		return &aliSyncWorker{h: h, account: account}
	}
	return &gmailSyncWorker{h: h, account: account}
}

type gmailSyncWorker struct {
	h       *Handler
	account syncAccountRow
}

func (w *gmailSyncWorker) SyncFolders(context.Context) error { return nil }

func (w *gmailSyncWorker) Incremental(ctx context.Context, progress func(synced, total int)) syncResult {
	return w.h.runProviderSync(ctx, w.account, syncOptions{kind: "incremental", onProgress: progress})
}

func (w *gmailSyncWorker) Historical(ctx context.Context, since *string, progress func(synced, total int)) syncResult {
	return w.h.runProviderSync(ctx, w.account, syncOptions{kind: "historical", historicalSince: since, onProgress: progress})
}

type aliSyncWorker struct {
	h       *Handler
	account syncAccountRow
}

// SyncFolders lists AliMail mailboxes and upserts the mail_folders cursor
// rows (Phase 3), independent of the message header fetch.
func (w *aliSyncWorker) SyncFolders(ctx context.Context) error {
	return w.h.alimail.SyncFolders(ctx, w.account.ID)
}

func (w *aliSyncWorker) Incremental(ctx context.Context, progress func(synced, total int)) syncResult {
	return w.h.runProviderSync(ctx, w.account, syncOptions{kind: "incremental", onProgress: progress})
}

func (w *aliSyncWorker) Historical(ctx context.Context, since *string, progress func(synced, total int)) syncResult {
	return w.h.runProviderSync(ctx, w.account, syncOptions{kind: "historical", historicalSince: since, onProgress: progress})
}

// nudgeActiveAccounts runs a bounded incremental sync for every active mail
// account on a timer, so the inbox stays fresh without an Electron client
// having to poll `/sync`. Accounts already syncing (manual or a previous
// nudge still running) are skipped for this tick.
func (h *Handler) nudgeActiveAccounts(ctx context.Context) {
	var accounts []syncAccountRow
	if err := h.sb.From("mail_accounts").
		Select("id,owner_user_id,provider,auth_type,email,last_sync_at,gmail_history_id").
		Eq("status", "active").
		Exec(ctx, &accounts); err != nil {
		return
	}
	for _, account := range accounts {
		account := account
		worker := h.newSyncWorker(account)
		h.supervisor.TryRun(account.ID, func() {
			_ = worker.SyncFolders(ctx)
			worker.Incremental(ctx, nil)
		})
	}
}
