// Package models serves GET /ai/models (allowlisted vendor model catalog).
package models

import (
	"net/http"

	"github.com/fuyediao/powersource-workbench/backend/internal/ai/catalog"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
)

// Handler serves GET /ai/models?client=web|electron.
type Handler struct{}

// New builds the models catalog handler.
func New() *Handler {
	return &Handler{}
}

type responseBody struct {
	Models []catalog.Entry `json:"models"`
}

// ServeHTTP lists allowlisted models for the requested client.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	client := catalog.ParseClient(r.URL.Query().Get("client"))
	httpx.WriteJSON(w, http.StatusOK, responseBody{Models: catalog.List(client)})
}
