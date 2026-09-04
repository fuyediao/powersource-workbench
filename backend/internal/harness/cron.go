package harness

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/authmw"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
)

// targetVPS runs on the server and keeps firing with the laptop closed.
const targetVPS = "vps"

// targetThisPC needs the user's own machine, so it waits for Electron.
const targetThisPC = "thisPc"

// createJobRequest is the desktop payload for a new scheduled task.
type createJobRequest struct {
	Name     string   `json:"name"`
	Prompt   string   `json:"prompt"`
	Schedule Schedule `json:"schedule"`
	Target   string   `json:"target"`
}

// withProfile resolves the caller's profile directory or writes an error.
func (h *Handler) withProfile(w http.ResponseWriter, r *http.Request) (string, string, bool) {
	userID := authmw.UserIDFrom(r)
	dir, err := h.ensureProfile(userID)
	if err != nil {
		writeUnavailable(w, "Scheduled tasks are not configured.")
		return "", "", false
	}
	return userID, dir, true
}

// listCronJobs returns every scheduled task on the caller's profile.
func (h *Handler) listCronJobs(w http.ResponseWriter, r *http.Request) {
	_, profile, ok := h.withProfile(w, r)
	if !ok {
		return
	}

	storeMutex.Lock()
	jobs, err := loadJobs(profile)
	storeMutex.Unlock()
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to read scheduled tasks.")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{"jobs": jobs})
}

// createCronJob stores one scheduled task on the user's slim profile.
// target=vps jobs fire from the in-process ticker; target=thisPc jobs wait
// on the wake queue until Electron completes a local turn.
func (h *Handler) createCronJob(w http.ResponseWriter, r *http.Request) {
	_, profile, ok := h.withProfile(w, r)
	if !ok {
		return
	}

	var body createJobRequest
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid scheduled task payload.")
		return
	}
	name := strings.TrimSpace(body.Name)
	prompt := strings.TrimSpace(body.Prompt)
	if name == "" || prompt == "" {
		httpx.WriteError(w, http.StatusBadRequest, "Name and prompt are required.")
		return
	}
	if !body.Schedule.Valid() {
		httpx.WriteError(w, http.StatusBadRequest, "The schedule is invalid.")
		return
	}
	target := targetVPS
	if body.Target == targetThisPC {
		target = targetThisPC
	}

	id, err := newJobID()
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to create the scheduled task.")
		return
	}

	job := Job{
		ID:       id,
		Name:     name,
		Prompt:   prompt,
		Schedule: body.Schedule,
		Target:   target,
	}
	refreshNextRun(&job, time.Now())

	storeMutex.Lock()
	jobs, loadErr := loadJobs(profile)
	if loadErr == nil {
		jobs = append(jobs, job)
		loadErr = saveJobs(profile, jobs)
	}
	storeMutex.Unlock()
	if loadErr != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to save the scheduled task.")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, job)
}

// mutateJob applies a change to one stored job by id.
func (h *Handler) mutateJob(
	w http.ResponseWriter,
	r *http.Request,
	apply func(job *Job) error,
) {
	_, profile, ok := h.withProfile(w, r)
	if !ok {
		return
	}
	jobID := chi.URLParam(r, "jobID")
	if jobID == "" {
		httpx.WriteError(w, http.StatusBadRequest, "A job id is required.")
		return
	}

	storeMutex.Lock()
	defer storeMutex.Unlock()

	jobs, err := loadJobs(profile)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to read scheduled tasks.")
		return
	}
	index := -1
	for i := range jobs {
		if jobs[i].ID == jobID {
			index = i
			break
		}
	}
	if index < 0 {
		httpx.WriteError(w, http.StatusNotFound, "Scheduled task not found.")
		return
	}
	if err := apply(&jobs[index]); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "The scheduler rejected this change.")
		return
	}
	if err := saveJobs(profile, jobs); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to save scheduled tasks.")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, jobs[index])
}

// setPaused pauses or resumes one job on jobs.json.
func (h *Handler) setPaused(w http.ResponseWriter, r *http.Request, paused bool) {
	h.mutateJob(w, r, func(job *Job) error {
		job.Paused = paused
		refreshNextRun(job, time.Now())
		return nil
	})
}

// pauseCronJob stops scheduling one task.
func (h *Handler) pauseCronJob(w http.ResponseWriter, r *http.Request) {
	h.setPaused(w, r, true)
}

// resumeCronJob re-enables one task.
func (h *Handler) resumeCronJob(w http.ResponseWriter, r *http.Request) {
	h.setPaused(w, r, false)
}

// triggerCronJob runs a server digest now, or queues a local task for Electron.
// thisPc jobs stay waitingForThisPc until POST /cron/wake/{id}/complete.
func (h *Handler) triggerCronJob(w http.ResponseWriter, r *http.Request) {
	userID, profile, ok := h.withProfile(w, r)
	if !ok {
		return
	}
	jobID := chi.URLParam(r, "jobID")
	if jobID == "" {
		httpx.WriteError(w, http.StatusBadRequest, "A job id is required.")
		return
	}

	now := time.Now()
	var fired *dueVPSJob

	storeMutex.Lock()
	jobs, err := loadJobs(profile)
	if err != nil {
		storeMutex.Unlock()
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to read scheduled tasks.")
		return
	}
	index := -1
	for i := range jobs {
		if jobs[i].ID == jobID {
			index = i
			break
		}
	}
	if index < 0 {
		storeMutex.Unlock()
		httpx.WriteError(w, http.StatusNotFound, "Scheduled task not found.")
		return
	}
	if jobs[index].Target == targetThisPC {
		markWakePending(&jobs[index])
		refreshNextRun(&jobs[index], now)
	} else {
		stampLastRun(&jobs[index], now)
		fired = &dueVPSJob{id: jobs[index].ID, prompt: jobs[index].Prompt}
	}
	if err := saveJobs(profile, jobs); err != nil {
		storeMutex.Unlock()
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to save scheduled tasks.")
		return
	}
	snapshot := jobs[index]
	storeMutex.Unlock()

	if fired != nil {
		h.finishVPSJob(r.Context(), userID, profile, *fired)
		storeMutex.Lock()
		updated, loadErr := loadJobs(profile)
		storeMutex.Unlock()
		if loadErr == nil {
			for i := range updated {
				if updated[i].ID == snapshot.ID {
					snapshot = updated[i]
					break
				}
			}
		}
	}
	httpx.WriteJSON(w, http.StatusOK, snapshot)
}

// deleteCronJob removes one task from the profile store.
func (h *Handler) deleteCronJob(w http.ResponseWriter, r *http.Request) {
	_, profile, ok := h.withProfile(w, r)
	if !ok {
		return
	}
	jobID := chi.URLParam(r, "jobID")

	storeMutex.Lock()
	defer storeMutex.Unlock()

	jobs, err := loadJobs(profile)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to read scheduled tasks.")
		return
	}
	kept := jobs[:0]
	for _, job := range jobs {
		if job.ID == jobID {
			continue
		}
		kept = append(kept, job)
	}
	if err := saveJobs(profile, kept); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to save scheduled tasks.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
