// Package mail implements the /mail/* routes: AliMail IMAP/SMTP account
// management, message sync, and the mailbox read/list/send surface.
// Provider-specific protocol code lives in the gmail and alimail subpackages;
// this package owns generic mailbox CRUD (accounts, messages, drafts, folders)
// and dispatches sync/send/test/hydrate/labels to the matching provider client.
// Gmail OAuth linking is not offered; leftover Gmail rows still sync if present.
package mail

import (
	"log"
	"net/http"
	"runtime/debug"

	"github.com/go-chi/chi/v5"

	"github.com/fuyediao/powersource-workbench/backend/internal/config"
	"github.com/fuyediao/powersource-workbench/backend/internal/mail/alimail"
	"github.com/fuyediao/powersource-workbench/backend/internal/mail/gmail"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/authmw"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

// Handler serves the /mail sub-app.
type Handler struct {
	env        config.Env
	sb         *supabase.Client
	gmail      *gmail.Client
	alimail    *alimail.Client
	supervisor *AccountSupervisor
}

// New builds a mail handler.
func New(env config.Env, sb *supabase.Client) *Handler {
	h := &Handler{env: env, sb: sb, gmail: gmail.New(sb, env), alimail: alimail.New(sb, env)}
	h.supervisor = newAccountSupervisor(h)
	return h
}

// Routes returns the /mail router.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Use(h.recoverJSON)
	r.NotFound(func(w http.ResponseWriter, _ *http.Request) { mailErr(w, http.StatusNotFound, "Not found") })
	r.MethodNotAllowed(func(w http.ResponseWriter, _ *http.Request) { mailErr(w, http.StatusNotFound, "Not found") })

	r.Get("/provider-presets", func(w http.ResponseWriter, _ *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, alimail.Presets())
	})

	r.Group(func(pr chi.Router) {
		pr.Use(authmw.RequireUser(h.sb, authmw.DefaultUnauthorized))
		pr.Post("/accounts/imap", h.addImap)
		pr.Get("/accounts", h.listAccounts)
		pr.Post("/send", h.send)
		pr.Post("/drafts", h.saveDraft)
		pr.Get("/messages/by-customer", h.listMessagesByCustomer)
		pr.Patch("/messages/bulk", h.bulkMessages)
		pr.Get("/messages", h.listMessages)
		pr.Get("/folders", h.listFolders)
		pr.Post("/folders/empty", h.emptyFolder)
		pr.Get("/folder-counts", h.folderCounts)
		pr.Get("/labels", h.listLabels)
		pr.Post("/labels", h.createLabel)
		pr.Patch("/labels/{id}", h.updateLabel)
		pr.Delete("/labels/{id}", h.deleteLabel)
		pr.Get("/unread-summary", h.unreadSummary)

		pr.Delete("/accounts/{id}", h.deleteAccount)
		pr.Patch("/accounts/{id}", h.updateAccount)
		pr.Post("/accounts/{id}/disconnect", h.disconnectAccount)
		pr.Post("/accounts/{id}/test", h.testAccount)
		pr.Post("/accounts/{id}/sync", h.syncAccount)
		pr.Post("/accounts/{id}/sync/historical", h.historicalSyncStart)

		pr.Get("/sync-jobs/{id}", h.syncJobStatus)
		pr.Post("/sync-jobs/{id}/cancel", h.syncJobCancel)
		pr.Get("/sync-tasks", h.listSyncTasks)

		pr.Get("/messages/{id}", h.messageDetail)
		pr.Get("/messages/{id}/eml", h.downloadMessageEml)
		pr.Get("/messages/{messageId}/attachments/{attachmentId}", h.downloadAttachment)
		pr.Patch("/messages/{id}/read", h.markRead)
		pr.Patch("/messages/{id}/star", h.toggleStar)

		pr.Patch("/drafts/{id}", h.updateDraft)
		pr.Delete("/drafts/{id}", h.deleteDraft)
	})

	return r
}

func mailJSON(w http.ResponseWriter, status int, v any) { httpx.WriteJSON(w, status, v) }

func mailErr(w http.ResponseWriter, status int, message string) {
	httpx.WriteJSON(w, status, map[string]any{"error": message})
}

func (h *Handler) recoverJSON(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				// Log the panic and stack so 500s are diagnosable instead of
				// being silently swallowed.
				log.Printf("mail: panic on %s %s: %v\n%s", r.Method, r.URL.Path, rec, debug.Stack())
				httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "Internal server error"})
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func chiID(r *http.Request) string { return chi.URLParam(r, "id") }
