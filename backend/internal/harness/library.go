package harness

import (
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
)

// libraryKind is a personal markdown folder on the slim VPS profile.
type libraryKind string

const (
	libraryRules     libraryKind = "rules"
	libraryCommands  libraryKind = "commands"
	libraryHooks     libraryKind = "hooks"
	librarySubagents libraryKind = "subagents"
	libraryPlugins   libraryKind = "plugins"
)

// LibraryEntry is one rule or command as the Library view sees it.
type LibraryEntry struct {
	Name    string `json:"name"`
	Summary string `json:"summary"`
	Scope   string `json:"scope"`
	Body    string `json:"body,omitempty"`
}

type libraryRequest struct {
	Name string `json:"name"`
	Body string `json:"body"`
}

// fileName returns the canonical markdown file name for one library kind.
func (k libraryKind) fileName() string {
	switch k {
	case libraryRules:
		return "RULE.md"
	case libraryCommands:
		return "COMMAND.md"
	case libraryHooks:
		return "HOOK.md"
	case librarySubagents:
		return "SUBAGENT.md"
	case libraryPlugins:
		return "PLUGIN.md"
	default:
		return "NOTE.md"
	}
}

// dir returns the personal profile directory for one library kind.
func (k libraryKind) dir(profile string) string {
	return filepath.Join(profile, string(k))
}

// label returns the singular human-readable label used in API errors.
func (k libraryKind) label() string {
	switch k {
	case libraryRules:
		return "rule"
	case libraryCommands:
		return "command"
	case libraryHooks:
		return "hook"
	case librarySubagents:
		return "subagent"
	case libraryPlugins:
		return "plugin"
	default:
		return "entry"
	}
}

// listLibraryEntries lists markdown folders under one personal library root.
func listLibraryEntries(root string, kind libraryKind, includeBody bool) ([]LibraryEntry, error) {
	entries, err := os.ReadDir(root)
	if err != nil {
		if os.IsNotExist(err) {
			return []LibraryEntry{}, nil
		}
		return nil, err
	}
	out := make([]LibraryEntry, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() || !isSafeSkillName(entry.Name()) {
			continue
		}
		body, err := os.ReadFile(filepath.Join(root, entry.Name(), kind.fileName()))
		if err != nil {
			continue
		}
		item := LibraryEntry{
			Name:    entry.Name(),
			Summary: skillSummary(string(body)),
			Scope:   "personal",
		}
		if includeBody {
			item.Body = string(body)
		}
		out = append(out, item)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

// listLibrary writes the personal index for one library kind.
func (h *Handler) listLibrary(w http.ResponseWriter, r *http.Request, kind libraryKind) {
	_, profile, ok := h.withProfile(w, r)
	if !ok {
		return
	}
	items, err := listLibraryEntries(kind.dir(profile), kind, false)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to read the library.")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"personal": items})
}

// readLibrary writes one personal library entry including its markdown body.
func (h *Handler) readLibrary(w http.ResponseWriter, r *http.Request, kind libraryKind) {
	_, profile, ok := h.withProfile(w, r)
	if !ok {
		return
	}
	name := chi.URLParam(r, "name")
	if !isSafeSkillName(name) {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid "+kind.label()+" name.")
		return
	}
	body, err := os.ReadFile(filepath.Join(kind.dir(profile), name, kind.fileName()))
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, strings.ToUpper(kind.label()[:1])+kind.label()[1:]+" not found.")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, LibraryEntry{
		Name:    name,
		Summary: skillSummary(string(body)),
		Scope:   "personal",
		Body:    string(body),
	})
}

// writeLibrary creates or replaces one personal library entry.
func (h *Handler) writeLibrary(w http.ResponseWriter, r *http.Request, kind libraryKind) {
	_, profile, ok := h.withProfile(w, r)
	if !ok {
		return
	}
	var body libraryRequest
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid "+kind.label()+" payload.")
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = chi.URLParam(r, "name")
	}
	if !isSafeSkillName(name) {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid "+kind.label()+" name.")
		return
	}
	if strings.TrimSpace(body.Body) == "" {
		httpx.WriteError(w, http.StatusBadRequest, "The "+kind.label()+" body is empty.")
		return
	}
	dir := filepath.Join(kind.dir(profile), name)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to save the "+kind.label()+".")
		return
	}
	if err := os.WriteFile(filepath.Join(dir, kind.fileName()), []byte(body.Body), 0o600); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to save the "+kind.label()+".")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, LibraryEntry{
		Name:    name,
		Summary: skillSummary(body.Body),
		Scope:   "personal",
	})
}

// deleteLibrary removes one personal library entry.
func (h *Handler) deleteLibrary(w http.ResponseWriter, r *http.Request, kind libraryKind) {
	_, profile, ok := h.withProfile(w, r)
	if !ok {
		return
	}
	name := chi.URLParam(r, "name")
	if !isSafeSkillName(name) {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid "+kind.label()+" name.")
		return
	}
	if err := os.RemoveAll(filepath.Join(kind.dir(profile), name)); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to delete the "+kind.label()+".")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// listRules lists personal rules.
func (h *Handler) listRules(w http.ResponseWriter, r *http.Request) {
	h.listLibrary(w, r, libraryRules)
}

// readRule reads one personal rule.
func (h *Handler) readRule(w http.ResponseWriter, r *http.Request) {
	h.readLibrary(w, r, libraryRules)
}

// writeRule creates or replaces one personal rule.
func (h *Handler) writeRule(w http.ResponseWriter, r *http.Request) {
	h.writeLibrary(w, r, libraryRules)
}

// deleteRule removes one personal rule.
func (h *Handler) deleteRule(w http.ResponseWriter, r *http.Request) {
	h.deleteLibrary(w, r, libraryRules)
}

// listCommands lists personal commands.
func (h *Handler) listCommands(w http.ResponseWriter, r *http.Request) {
	h.listLibrary(w, r, libraryCommands)
}

// readCommand reads one personal command.
func (h *Handler) readCommand(w http.ResponseWriter, r *http.Request) {
	h.readLibrary(w, r, libraryCommands)
}

// writeCommand creates or replaces one personal command.
func (h *Handler) writeCommand(w http.ResponseWriter, r *http.Request) {
	h.writeLibrary(w, r, libraryCommands)
}

// deleteCommand removes one personal command.
func (h *Handler) deleteCommand(w http.ResponseWriter, r *http.Request) {
	h.deleteLibrary(w, r, libraryCommands)
}

// listHooks lists personal hooks.
func (h *Handler) listHooks(w http.ResponseWriter, r *http.Request) {
	h.listLibrary(w, r, libraryHooks)
}

// readHook reads one personal hook.
func (h *Handler) readHook(w http.ResponseWriter, r *http.Request) { h.readLibrary(w, r, libraryHooks) }

// writeHook creates or replaces one personal hook.
func (h *Handler) writeHook(w http.ResponseWriter, r *http.Request) {
	h.writeLibrary(w, r, libraryHooks)
}

// deleteHook removes one personal hook.
func (h *Handler) deleteHook(w http.ResponseWriter, r *http.Request) {
	h.deleteLibrary(w, r, libraryHooks)
}

// listSubagents lists personal subagent definitions.
func (h *Handler) listSubagents(w http.ResponseWriter, r *http.Request) {
	h.listLibrary(w, r, librarySubagents)
}

// readSubagent reads one personal subagent definition.
func (h *Handler) readSubagent(w http.ResponseWriter, r *http.Request) {
	h.readLibrary(w, r, librarySubagents)
}

// writeSubagent creates or replaces one personal subagent definition.
func (h *Handler) writeSubagent(w http.ResponseWriter, r *http.Request) {
	h.writeLibrary(w, r, librarySubagents)
}

// deleteSubagent removes one personal subagent definition.
func (h *Handler) deleteSubagent(w http.ResponseWriter, r *http.Request) {
	h.deleteLibrary(w, r, librarySubagents)
}

// listPlugins lists personal plugin manifests.
func (h *Handler) listPlugins(w http.ResponseWriter, r *http.Request) {
	h.listLibrary(w, r, libraryPlugins)
}

// readPlugin reads one personal plugin manifest.
func (h *Handler) readPlugin(w http.ResponseWriter, r *http.Request) {
	h.readLibrary(w, r, libraryPlugins)
}

// writePlugin creates or replaces one personal plugin manifest.
func (h *Handler) writePlugin(w http.ResponseWriter, r *http.Request) {
	h.writeLibrary(w, r, libraryPlugins)
}

// deletePlugin removes one personal plugin manifest.
func (h *Handler) deletePlugin(w http.ResponseWriter, r *http.Request) {
	h.deleteLibrary(w, r, libraryPlugins)
}
