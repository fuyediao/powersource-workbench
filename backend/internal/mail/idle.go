package mail

import (
	"context"
	"errors"
	"log"
	"sync"
	"time"

	"github.com/fuyediao/powersource-workbench/backend/internal/mail/alimail"
)

// maxConcurrentIdle bounds how many AliMail INBOX IDLE connections stay open.
const maxConcurrentIdle = 8

// idleAccountRefresh is how often the supervisor reconciles which AliMail
// accounts should have a resident INBOX IDLE goroutine.
const idleAccountRefresh = 30 * time.Second

// idleUnsupportedSkip is how long to wait before retrying IDLE on a server
// that advertised no IDLE capability.
const idleUnsupportedSkip = time.Hour

const idleSyncTimeout = 2 * time.Minute

type idleSlot struct {
	cancel context.CancelFunc
	token  uint64
}

// runAliMailIdleSupervisor keeps one INBOX IDLE connection per active AliMail
// account (capped). A wake schedules a bounded incremental sync via
// AccountSupervisor so it never races a manual /sync or the 2-minute nudge.
func (h *Handler) runAliMailIdleSupervisor(ctx context.Context) {
	sem := make(chan struct{}, maxConcurrentIdle)
	var mu sync.Mutex
	running := make(map[string]idleSlot)
	skipUntil := make(map[string]time.Time)
	var nextToken uint64

	type startJob struct {
		account syncAccountRow
		token   uint64
		ctx     context.Context
	}

	reconcile := func() {
		var accounts []syncAccountRow
		if err := h.sb.From("mail_accounts").
			Select("id,owner_user_id,provider,auth_type,email,last_sync_at,gmail_history_id").
			Eq("status", "active").
			In("provider", alimail.IMAPProviderFilter()).
			Exec(ctx, &accounts); err != nil {
			return
		}

		seen := make(map[string]bool, len(accounts))
		now := time.Now()
		var jobs []startJob

		mu.Lock()
		for _, account := range accounts {
			account := account
			seen[account.ID] = true
			if until, ok := skipUntil[account.ID]; ok && now.Before(until) {
				continue
			}
			if _, ok := running[account.ID]; ok {
				continue
			}
			select {
			case sem <- struct{}{}:
			default:
				continue
			}
			nextToken++
			idleCtx, cancel := context.WithCancel(ctx)
			running[account.ID] = idleSlot{cancel: cancel, token: nextToken}
			jobs = append(jobs, startJob{
				account: account,
				token:   nextToken,
				ctx:     idleCtx,
			})
		}
		for id, slot := range running {
			if !seen[id] {
				slot.cancel()
				delete(running, id)
			}
		}
		mu.Unlock()

		for _, job := range jobs {
			job := job
			go func() {
				defer func() { <-sem }()
				defer func() {
					mu.Lock()
					if slot, ok := running[job.account.ID]; ok && slot.token == job.token {
						delete(running, job.account.ID)
					}
					mu.Unlock()
				}()
				h.runAliMailInboxIdle(job.ctx, ctx, job.account, func(until time.Time) {
					mu.Lock()
					skipUntil[job.account.ID] = until
					mu.Unlock()
				})
			}()
		}
	}

	reconcile()
	ticker := time.NewTicker(idleAccountRefresh)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			mu.Lock()
			for id, slot := range running {
				slot.cancel()
				delete(running, id)
			}
			mu.Unlock()
			return
		case <-ticker.C:
			reconcile()
		}
	}
}

// runAliMailInboxIdle IDLEs on one AliMail INBOX until ctx is cancelled.
func (h *Handler) runAliMailInboxIdle(
	idleCtx context.Context,
	schedCtx context.Context,
	account syncAccountRow,
	markSkip func(time.Time),
) {
	cfg, err := h.alimail.LoadConfig(idleCtx, account.ID)
	if err != nil {
		log.Printf("mail idle: load config %s: %v", account.Email, err)
		return
	}
	log.Printf("mail idle: INBOX IDLE starting for %s", account.Email)
	err = alimail.RunInboxIdle(idleCtx, *cfg, func() {
		worker := h.newSyncWorker(account)
		h.supervisor.TryRun(account.ID, func() {
			syncCtx, cancel := context.WithTimeout(schedCtx, idleSyncTimeout)
			defer cancel()
			_ = worker.SyncFolders(syncCtx)
			worker.Incremental(syncCtx, nil)
		})
	})
	if errors.Is(err, alimail.ErrIdleUnsupported) {
		log.Printf("mail idle: %s IMAP has no IDLE; skipping for 1h", account.Email)
		if markSkip != nil {
			markSkip(time.Now().Add(idleUnsupportedSkip))
		}
		return
	}
	if idleCtx.Err() == nil && err != nil {
		log.Printf("mail idle: %s stopped: %v", account.Email, err)
	}
}
