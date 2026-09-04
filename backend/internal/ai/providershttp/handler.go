// Package providershttp serves GET /ai/providers (cloud BYOK catalog).
package providershttp

import (
	"net/http"

	"github.com/fuyediao/powersource-workbench/backend/internal/ai/providers"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
)

// Handler serves GET /ai/providers.
type Handler struct{}

// New builds the providers catalog handler.
func New() *Handler {
	return &Handler{}
}

type listResponse struct {
	Providers []providers.Provider `json:"providers"`
}

// ServeHTTP returns the cloud AI vendor registry for Electron AI Settings.
func (h *Handler) ServeHTTP(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteJSON(w, http.StatusOK, listResponse{Providers: providers.List()})
}
