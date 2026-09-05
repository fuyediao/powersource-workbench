// Package download serves public Workbench desktop installer feeds.
package download

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/fuyediao/powersource-workbench/backend/internal/config"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

// Handler serves installer manifests and streams under /download and at the API root.
type Handler struct {
	env             config.Env
	sb              *supabase.Client
	downloadLimiter *sharedBandwidthLimiter
}

// New builds a desktop-download handler.
func New(env config.Env, sb *supabase.Client) *Handler {
	return &Handler{
		env:             env,
		sb:              sb,
		downloadLimiter: newSharedBandwidthLimiter(250_000), // 2 Mbit/s aggregate.
	}
}

// sharedBandwidthLimiter serializes byte reservations across all active
// installer responses. One response can use the full rate; concurrent
// responses naturally share the same global schedule.
type sharedBandwidthLimiter struct {
	mu        sync.Mutex
	bytesPerS int64
	next      time.Time
}

func newSharedBandwidthLimiter(bytesPerSecond int64) *sharedBandwidthLimiter {
	return &sharedBandwidthLimiter{bytesPerS: bytesPerSecond}
}

func (l *sharedBandwidthLimiter) wait(ctxDone <-chan struct{}, bytes int) error {
	if bytes <= 0 || l == nil || l.bytesPerS <= 0 {
		return nil
	}
	l.mu.Lock()
	now := time.Now()
	start := l.next
	if start.Before(now) {
		start = now
	}
	l.next = start.Add(time.Duration(int64(bytes) * int64(time.Second) / l.bytesPerS))
	l.mu.Unlock()

	delay := time.Until(start)
	if delay <= 0 {
		return nil
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctxDone:
		return context.Canceled
	case <-timer.C:
		return nil
	}
}

// Routes returns the /download router.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.NotFound(notFound)
	r.MethodNotAllowed(methodNotAllowed)
	h.MountReleaseRoutes(r)
	return r
}

func notFound(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "Not found"})
}

func methodNotAllowed(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteText(w, http.StatusMethodNotAllowed, "Method not allowed")
}
