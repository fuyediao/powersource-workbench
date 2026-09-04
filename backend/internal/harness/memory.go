package harness

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/authmw"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
)

// memorySnapshot is the frozen prefix injected at the start of a Harness turn.
type memorySnapshot struct {
	Memory string `json:"memory"`
	User   string `json:"user"`
}

// reviewRequest is the desktop's proposed MEMORY.md / USER.md after a local
// review pass with the user's Settings API key. workbench-api clamps and writes.
type reviewRequest struct {
	Memory string `json:"memory"`
	User   string `json:"user"`
}

// readProfileFile reads one memory file, treating a missing file as empty.
func readProfileFile(dir, name string) (string, error) {
	data, err := os.ReadFile(filepath.Join(dir, memoriesDirName, name))
	if errors.Is(err, os.ErrNotExist) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// getMemory returns the caller's MEMORY.md and USER.md from the VPS profile.
// The first call creates the slim directory layout. The desktop client injects
// this snapshot as developer instructions and never writes those files.
func (h *Handler) getMemory(w http.ResponseWriter, r *http.Request) {
	dir, err := h.ensureProfile(authmw.UserIDFrom(r))
	if err != nil {
		writeUnavailable(w, "Harness profiles are not configured on this server.")
		return
	}

	memory, err := readProfileFile(dir, memoryFileName)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to read memory.")
		return
	}
	user, err := readProfileFile(dir, userFileName)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to read memory.")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, memorySnapshot{Memory: memory, User: user})
}

// postMemoryReview applies a desktop-proposed MEMORY.md / USER.md.
//
// The client runs the review model with the user's own Settings key and never
// writes those files. This handler clamps character caps and writes the
// profile so two machines cannot race over raw disk.
func (h *Handler) postMemoryReview(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	dir, err := h.ensureProfile(userID)
	if err != nil {
		writeUnavailable(w, "Harness profiles are not configured on this server.")
		return
	}

	var body reviewRequest
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid review payload.")
		return
	}
	if strings.TrimSpace(body.Memory) == "" && strings.TrimSpace(body.User) == "" {
		httpx.WriteError(w, http.StatusBadRequest, "The review payload is empty.")
		return
	}
	if err := applyProposedMemory(dir, body.Memory, body.User); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to save memory.")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}
