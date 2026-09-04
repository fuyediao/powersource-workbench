package harness

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// jobsFileName is the Harness-owned job store inside a slim profile.
const jobsFileName = "jobs.json"

// lastDigestCap bounds the optional digest text stored on a VPS job.
const lastDigestCap = 8000

// storeMutex serializes read-modify-write cycles across requests and the ticker.
var storeMutex sync.Mutex

// Job is one scheduled task as the desktop Scheduled view sees it.
type Job struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Prompt   string   `json:"prompt"`
	Schedule Schedule `json:"schedule"`
	// Target is "vps" (runs on the server with the laptop closed) or
	// "thisPc" (queued until the user's Electron client comes online).
	Target string `json:"target"`
	Paused bool   `json:"paused"`
	// HermesJobID is retained for jobs.json written by an older build; the
	// live path no longer talks to a Hermes dashboard.
	HermesJobID string `json:"hermesJobId,omitempty"`
	NextRunAtMs *int64 `json:"nextRunAtMs"`
	LastRunAtMs *int64 `json:"lastRunAtMs"`
	// LastStatus is "ok", "failed", or "waitingForThisPc".
	LastStatus string `json:"lastStatus,omitempty"`
	// LastDigest is a truncated office digest for target=vps jobs.
	LastDigest string `json:"lastDigest,omitempty"`
	// WakePendingAtMs is set on "thisPc" jobs that are due but have not been
	// picked up by the user's Electron client yet.
	WakePendingAtMs *int64 `json:"wakePendingAtMs,omitempty"`
}

// markWakePending flags a local job as waiting for the user's machine.
// LastRunAtMs is left unchanged until Electron completes the turn.
func markWakePending(job *Job) {
	now := time.Now().UnixMilli()
	job.WakePendingAtMs = &now
	job.LastStatus = "waitingForThisPc"
}

// harnessDir returns the Harness state directory inside a profile.
func harnessDir(profile string) string {
	return filepath.Join(profile, "harness")
}

// newJobID returns a short random identifier for a scheduled job.
func newJobID() (string, error) {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

// loadJobs reads the Harness job store, treating a missing file as empty.
func loadJobs(profile string) ([]Job, error) {
	data, err := os.ReadFile(filepath.Join(harnessDir(profile), jobsFileName))
	if errors.Is(err, os.ErrNotExist) {
		return []Job{}, nil
	}
	if err != nil {
		return nil, err
	}
	var jobs []Job
	if err := json.Unmarshal(data, &jobs); err != nil {
		return nil, err
	}
	if jobs == nil {
		jobs = []Job{}
	}
	return jobs, nil
}

// saveJobs writes the Harness job store atomically.
func saveJobs(profile string, jobs []Job) error {
	dir := harnessDir(profile)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return err
	}
	data, err := json.MarshalIndent(jobs, "", "  ")
	if err != nil {
		return err
	}
	target := filepath.Join(dir, jobsFileName)
	tmp := target + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, target)
}

// refreshNextRun recomputes the next fire time for an active job.
func refreshNextRun(job *Job, now time.Time) {
	if job.Paused {
		job.NextRunAtMs = nil
		return
	}
	next, ok := job.Schedule.NextRunAfter(now)
	if !ok {
		job.NextRunAtMs = nil
		return
	}
	ms := next.UnixMilli()
	job.NextRunAtMs = &ms
}

// stampLastRun records that a VPS job consumed this fire slot so a replica
// restart will not replay it. Status is filled in after the digest returns.
func stampLastRun(job *Job, now time.Time) {
	ms := now.UnixMilli()
	job.LastRunAtMs = &ms
	refreshNextRun(job, now)
}
