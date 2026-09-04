package harness

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
)

// wakeItem is one due task that needs the user's own machine.
type wakeItem struct {
	JobID  string `json:"jobId"`
	Name   string `json:"name"`
	Prompt string `json:"prompt"`
	DueAt  int64  `json:"dueAtMs"`
}

// listWakeQueue returns tasks that are due but need this user's computer.
//
// Server-side jobs never appear here: they already ran on the VPS. A due local
// job stays queued until the Electron client acknowledges it, so closing the
// laptop delays the run instead of silently dropping it.
func (h *Handler) listWakeQueue(w http.ResponseWriter, r *http.Request) {
	_, profile, ok := h.withProfile(w, r)
	if !ok {
		return
	}

	storeMutex.Lock()
	defer storeMutex.Unlock()

	jobs, err := loadJobs(profile)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to read scheduled tasks.")
		return
	}

	now := time.Now()
	nowMs := now.UnixMilli()
	changed := false
	// The in-process ticker also marks due thisPc jobs. This poll is the
	// fallback when Electron is online before the next tick.
	pending := make([]wakeItem, 0, len(jobs))

	for i := range jobs {
		job := &jobs[i]
		if job.Target != targetThisPC || job.Paused {
			continue
		}
		if job.WakePendingAtMs == nil && job.NextRunAtMs != nil && *job.NextRunAtMs <= nowMs {
			markWakePending(job)
			refreshNextRun(job, now)
			changed = true
		}
		if job.WakePendingAtMs != nil {
			pending = append(pending, wakeItem{
				JobID:  job.ID,
				Name:   job.Name,
				Prompt: job.Prompt,
				DueAt:  *job.WakePendingAtMs,
			})
		}
	}

	if changed {
		if err := saveJobs(profile, jobs); err != nil {
			httpx.WriteError(w, http.StatusInternalServerError, "Failed to save scheduled tasks.")
			return
		}
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{"jobs": pending})
}

// completeWakeItem clears one queued local task after the desktop client ran it.
func (h *Handler) completeWakeItem(w http.ResponseWriter, r *http.Request) {
	_, profile, ok := h.withProfile(w, r)
	if !ok {
		return
	}
	jobID := chi.URLParam(r, "jobID")

	var body struct {
		Failed bool `json:"failed"`
	}
	_ = httpx.DecodeJSON(r, &body)

	storeMutex.Lock()
	defer storeMutex.Unlock()

	jobs, err := loadJobs(profile)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to read scheduled tasks.")
		return
	}
	for i := range jobs {
		if jobs[i].ID != jobID {
			continue
		}
		now := time.Now()
		nowMs := now.UnixMilli()
		jobs[i].WakePendingAtMs = nil
		jobs[i].LastRunAtMs = &nowMs
		jobs[i].LastStatus = "ok"
		if body.Failed {
			jobs[i].LastStatus = "failed"
		}
		refreshNextRun(&jobs[i], now)
		break
	}
	if err := saveJobs(profile, jobs); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to save scheduled tasks.")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}
