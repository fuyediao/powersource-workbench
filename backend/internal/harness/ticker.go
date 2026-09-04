package harness

import (
	"context"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// cronTick is how often workbench-api scans jobs.json (one replica).
const cronTick = 30 * time.Second

// runCronTicker fires due jobs until ctx is cancelled.
func (h *Handler) runCronTicker(ctx context.Context) {
	ticker := time.NewTicker(cronTick)
	defer ticker.Stop()
	h.tickAllProfiles(ctx, time.Now())
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			h.tickAllProfiles(ctx, time.Now())
		}
	}
}

// tickAllProfiles walks every user directory under the profile volume.
func (h *Handler) tickAllProfiles(ctx context.Context, now time.Time) {
	root := strings.TrimSpace(h.env.HermesProfilesRoot)
	if root == "" {
		return
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		log.Printf("harness: cron ticker cannot read profiles: %v", err)
		return
	}
	for _, entry := range entries {
		if ctx.Err() != nil {
			return
		}
		if !entry.IsDir() || !isSafeProfileName(entry.Name()) {
			continue
		}
		userID := entry.Name()
		allowed, err := h.hasDesktopAgent(ctx, userID)
		if err != nil {
			log.Printf("harness: cron ACL lookup failed user_id=%s: %v", userID, err)
			continue
		}
		if !allowed {
			continue
		}
		h.tickProfile(ctx, userID, filepath.Join(root, userID), now)
	}
}

type dueVPSJob struct {
	id     string
	prompt string
}

// tickProfile applies due jobs for one user. target=thisPc only enqueues a
// wake; target=vps runs an mcp.CallForUser digest. Last-run is persisted
// before the digest so a restart does not replay the same slot.
func (h *Handler) tickProfile(ctx context.Context, userID, profile string, now time.Time) {
	storeMutex.Lock()
	jobs, err := loadJobs(profile)
	if err != nil {
		storeMutex.Unlock()
		log.Printf("harness: cron load failed user_id=%s: %v", userID, err)
		return
	}

	nowMs := now.UnixMilli()
	changed := false
	var due []dueVPSJob

	for i := range jobs {
		job := &jobs[i]
		if job.Paused {
			continue
		}
		if job.NextRunAtMs == nil {
			refreshNextRun(job, now)
			changed = true
		}
		if job.Target == targetThisPC && job.WakePendingAtMs != nil {
			continue
		}
		if job.NextRunAtMs == nil || *job.NextRunAtMs > nowMs {
			continue
		}
		if job.Target == targetThisPC {
			markWakePending(job)
			refreshNextRun(job, now)
			changed = true
			continue
		}
		stampLastRun(job, now)
		due = append(due, dueVPSJob{id: job.ID, prompt: job.Prompt})
		changed = true
	}

	if changed {
		if err := saveJobs(profile, jobs); err != nil {
			storeMutex.Unlock()
			log.Printf("harness: cron save failed user_id=%s: %v", userID, err)
			return
		}
	}
	storeMutex.Unlock()

	for _, item := range due {
		if ctx.Err() != nil {
			return
		}
		h.finishVPSJob(ctx, userID, profile, item)
	}
}

// finishVPSJob runs the office digest and stores last-run status.
func (h *Handler) finishVPSJob(ctx context.Context, userID, profile string, item dueVPSJob) {
	log.Printf("harness: cron fire actor=cron user_id=%s job=%s", userID, item.id)
	digest, err := h.runOfficeDigest(ctx, userID, item.prompt)

	storeMutex.Lock()
	defer storeMutex.Unlock()

	jobs, loadErr := loadJobs(profile)
	if loadErr != nil {
		log.Printf("harness: cron status load failed user_id=%s: %v", userID, loadErr)
		return
	}
	for i := range jobs {
		if jobs[i].ID != item.id {
			continue
		}
		if err != nil {
			jobs[i].LastStatus = "failed"
			jobs[i].LastDigest = clampRunes(err.Error(), lastDigestCap)
		} else {
			jobs[i].LastStatus = "ok"
			jobs[i].LastDigest = digest
		}
		break
	}
	if err := saveJobs(profile, jobs); err != nil {
		log.Printf("harness: cron status save failed user_id=%s: %v", userID, err)
	}
}
