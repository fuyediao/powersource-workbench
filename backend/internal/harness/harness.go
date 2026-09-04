// Package harness serves the desktop Harness surface: slim VPS profiles
// (MEMORY.md, skills, rules, commands, jobs.json), an in-process cron ticker,
// and first-party GeoCRM tools.
//
// Every HTTP route requires the caller's Supabase session and the
// desktop_agent entry key (same whitelist as the Electron Harness tile). Harness never
// reaches GeoCRM through the public /mcp transport, and it never stores a
// user JWT on the server. Scheduled runs act as the job's user id and reuse
// the same desktop ACL as public MCP (mcp.CallForUser / mcp.resolveAccess).
// Memory review runs on the desktop with the user's Settings API key; this
// package only clamps and writes MEMORY.md / USER.md.
package harness

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/fuyediao/powersource-workbench/backend/internal/config"
	"github.com/fuyediao/powersource-workbench/backend/internal/mcp"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/authmw"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

// toolCaller runs one first-party tool as a GeoCRM user. Production uses
// mcp.CallForUser; tests inject a fake.
type toolCaller func(ctx context.Context, userID, tool string, args json.RawMessage) (mcp.FirstPartyResult, error)

// Handler owns shared dependencies for /ai/harness routes and the cron ticker.
type Handler struct {
	env                 config.Env
	sb                  *supabase.Client
	callToolFn          toolCaller
	modelHTTP           *http.Client
	loadProviderKeysFn  providerKeysLoader
	perplexitySearchURL string
	geminiSearchBaseURL string
	modelMu             sync.Mutex
	modelTurns          map[string]*geminiTurnState
	// hasModuleFn overrides mcp.HasDesktopModule in tests.
	hasModuleFn func(ctx context.Context, userID, key string) (bool, error)
}

// New builds the Harness router owner.
func New(env config.Env, sb *supabase.Client) *Handler {
	return &Handler{
		env:                 env,
		sb:                  sb,
		modelHTTP:           &http.Client{Timeout: 5 * time.Minute},
		perplexitySearchURL: "https://api.perplexity.ai/v1/sonar",
		geminiSearchBaseURL: "https://generativelanguage.googleapis.com",
		modelTurns:          make(map[string]*geminiTurnState),
	}
}

// Routes returns the /ai/harness sub-router. The parent /ai router already
// requires a Supabase user JWT, so the caller id is available in context.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Use(h.requireDesktopAgent)

	r.Get("/memory", h.getMemory)
	r.Post("/memory/review", h.postMemoryReview)

	r.Get("/cron/jobs", h.listCronJobs)
	r.Post("/cron/jobs", h.createCronJob)
	r.Post("/cron/jobs/{jobID}/pause", h.pauseCronJob)
	r.Post("/cron/jobs/{jobID}/resume", h.resumeCronJob)
	r.Post("/cron/jobs/{jobID}/trigger", h.triggerCronJob)
	r.Delete("/cron/jobs/{jobID}", h.deleteCronJob)
	r.Get("/cron/wake", h.listWakeQueue)
	r.Post("/cron/wake/{jobID}/complete", h.completeWakeItem)

	r.Get("/skills", h.listSkills)
	r.Post("/skills", h.writeSkill)
	r.Get("/skills/{name}", h.readSkill)
	r.Put("/skills/{name}", h.writeSkill)
	r.Post("/skills/{name}/publish", h.requestSkillPublish)
	r.Delete("/skills/{name}", h.deleteSkill)

	r.Get("/experts", h.listExperts)
	r.Put("/experts/{expertID}", h.writeExpert)
	r.Delete("/experts/{expertID}", h.deleteExpert)

	r.Get("/rules", h.listRules)
	r.Post("/rules", h.writeRule)
	r.Get("/rules/{name}", h.readRule)
	r.Put("/rules/{name}", h.writeRule)
	r.Delete("/rules/{name}", h.deleteRule)

	r.Get("/commands", h.listCommands)
	r.Post("/commands", h.writeCommand)
	r.Get("/commands/{name}", h.readCommand)
	r.Put("/commands/{name}", h.writeCommand)
	r.Delete("/commands/{name}", h.deleteCommand)
	for _, route := range []struct {
		path   string
		list   http.HandlerFunc
		read   http.HandlerFunc
		write  http.HandlerFunc
		remove http.HandlerFunc
	}{
		{"/hooks", h.listHooks, h.readHook, h.writeHook, h.deleteHook},
		{"/subagents", h.listSubagents, h.readSubagent, h.writeSubagent, h.deleteSubagent},
		{"/plugins", h.listPlugins, h.readPlugin, h.writePlugin, h.deletePlugin},
	} {
		r.Get(route.path, route.list)
		r.Post(route.path, route.write)
		r.Get(route.path+"/{name}", route.read)
		r.Put(route.path+"/{name}", route.write)
		r.Delete(route.path+"/{name}", route.remove)
	}

	r.Post("/tools/{tool}", h.callTool)
	r.Post("/responses", h.createModelResponse)
	r.Post("/computer-use/step", h.computerUseStep)

	return r
}

// hasDesktopAgent reports whether userID may use the Harness surface.
// Missing grants, a nil client, or a lookup error fail closed.
func (h *Handler) hasDesktopAgent(ctx context.Context, userID string) (bool, error) {
	return h.hasDesktopModule(ctx, userID, mcp.DesktopAgentModule)
}

// hasDesktopModule reports whether a user can reach one desktop module.
func (h *Handler) hasDesktopModule(ctx context.Context, userID, key string) (bool, error) {
	if h.hasModuleFn != nil {
		return h.hasModuleFn(ctx, userID, key)
	}
	return mcp.HasDesktopModule(ctx, h.sb, userID, key)
}

// requireDesktopAgent rejects callers whose group whitelist does not include
// the Harness tile. CRM tool calls still go through mcp.CallForUser afterward.
func (h *Handler) requireDesktopAgent(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ok, err := h.hasDesktopAgent(r.Context(), authmw.UserIDFrom(r))
		if err != nil {
			httpx.WriteError(w, http.StatusInternalServerError, "Failed to check Harness access.")
			return
		}
		if !ok {
			httpx.WriteJSON(w, http.StatusForbidden, map[string]any{
				"error": "Harness is not enabled for this account.",
				"code":  "harness_forbidden",
			})
			return
		}
		next.ServeHTTP(w, r)
	})
}

// StartWorkers launches the in-process cron ticker.
// No-op when HERMES_PROFILES_ROOT is unset. Assumes a single workbench-api
// replica; last-run timestamps on jobs.json make a restart catch up.
func (h *Handler) StartWorkers(ctx context.Context) {
	if strings.TrimSpace(h.env.HermesProfilesRoot) == "" {
		return
	}
	h.seedOrgSkills()
	go h.runCronTicker(ctx)
}

// writeUnavailable reports that the slim profile volume is not configured.
func writeUnavailable(w http.ResponseWriter, message string) {
	httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{
		"error": message,
		"code":  "hermes_unavailable",
	})
}
