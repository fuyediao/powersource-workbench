package harness

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
)

// Skill is one on-demand `SKILL.md` folder.
type Skill struct {
	// Name is the folder name and the identifier used in the turn prompt.
	Name string `json:"name"`
	// Summary is the first non-heading line, shown in the skill index.
	Summary string `json:"summary"`
	// Scope is "org" (shared, read-only here) or "personal".
	Scope string `json:"scope"`
	// Body is the full markdown; only returned when reading one skill.
	Body string `json:"body,omitempty"`
	// PublishRequested marks a personal skill submitted for admin review.
	PublishRequested bool `json:"publishRequested,omitempty"`
}

// skillRequest is the create / update payload for a personal skill.
type skillRequest struct {
	Name string `json:"name"`
	Body string `json:"body"`
}

// isSafeSkillName keeps skill folders inside the profile.
func isSafeSkillName(name string) bool {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" || len(trimmed) > 64 {
		return false
	}
	for _, c := range trimmed {
		switch {
		case c >= '0' && c <= '9':
		case c >= 'a' && c <= 'z':
		case c >= 'A' && c <= 'Z':
		case c == '-' || c == '_':
		default:
			return false
		}
	}
	return true
}

// personalSkillsDir is the writable skills root inside one profile.
func personalSkillsDir(profile string) string {
	return filepath.Join(profile, "skills")
}

// skillSummary extracts the first meaningful line of a skill body.
func skillSummary(body string) string {
	for _, line := range strings.Split(body, "\n") {
		trimmed := strings.TrimSpace(strings.TrimLeft(line, "# "))
		if trimmed != "" && !strings.HasPrefix(trimmed, "---") {
			if len(trimmed) > 160 {
				return trimmed[:160]
			}
			return trimmed
		}
	}
	return ""
}

// readSkills lists `SKILL.md` folders under one root.
func readSkills(root, scope string, includeBody bool) ([]Skill, error) {
	entries, err := os.ReadDir(root)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	skills := make([]Skill, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() || !isSafeSkillName(entry.Name()) {
			continue
		}
		body, err := os.ReadFile(filepath.Join(root, entry.Name(), "SKILL.md"))
		if err != nil {
			continue
		}
		skill := Skill{
			Name:    entry.Name(),
			Summary: skillSummary(string(body)),
			Scope:   scope,
		}
		if includeBody {
			skill.Body = string(body)
		}
		if scope == "personal" {
			marker := filepath.Join(root, entry.Name(), ".publish-requested")
			if _, err := os.Stat(marker); err == nil {
				skill.PublishRequested = true
			}
		}
		skills = append(skills, skill)
	}
	sort.Slice(skills, func(i, j int) bool { return skills[i].Name < skills[j].Name })
	return skills, nil
}

// listSkills returns the org library plus this user's personal skills.
//
// Org skills live on HERMES_ORG_SKILLS_ROOT (read-only to users) so the
// shared library cannot fork per user; personal skills live in the caller's
// own profile and follow them between machines.
func (h *Handler) listSkills(w http.ResponseWriter, r *http.Request) {
	_, profile, ok := h.withProfile(w, r)
	if !ok {
		return
	}

	org, err := readSkills(strings.TrimSpace(h.env.HermesOrgSkillsRoot), "org", false)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to read the skill library.")
		return
	}
	personal, err := readSkills(personalSkillsDir(profile), "personal", false)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to read personal skills.")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"org":      org,
		"personal": personal,
	})
}

// readSkill returns one skill body (org or personal).
func (h *Handler) readSkill(w http.ResponseWriter, r *http.Request) {
	_, profile, ok := h.withProfile(w, r)
	if !ok {
		return
	}
	name := chi.URLParam(r, "name")
	if !isSafeSkillName(name) {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid skill name.")
		return
	}

	roots := []struct {
		dir   string
		scope string
	}{
		{personalSkillsDir(profile), "personal"},
		{strings.TrimSpace(h.env.HermesOrgSkillsRoot), "org"},
	}
	for _, root := range roots {
		if root.dir == "" {
			continue
		}
		body, err := os.ReadFile(filepath.Join(root.dir, name, "SKILL.md"))
		if err != nil {
			continue
		}
		httpx.WriteJSON(w, http.StatusOK, Skill{
			Name:    name,
			Summary: skillSummary(string(body)),
			Scope:   root.scope,
			Body:    string(body),
		})
		return
	}
	httpx.WriteError(w, http.StatusNotFound, "Skill not found.")
}

// writeSkill creates or replaces one personal skill.
func (h *Handler) writeSkill(w http.ResponseWriter, r *http.Request) {
	_, profile, ok := h.withProfile(w, r)
	if !ok {
		return
	}

	var body skillRequest
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid skill payload.")
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = chi.URLParam(r, "name")
	}
	if !isSafeSkillName(name) {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid skill name.")
		return
	}
	if strings.TrimSpace(body.Body) == "" {
		httpx.WriteError(w, http.StatusBadRequest, "The skill body is empty.")
		return
	}

	dir := filepath.Join(personalSkillsDir(profile), name)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to save the skill.")
		return
	}
	if err := os.WriteFile(filepath.Join(dir, "SKILL.md"), []byte(body.Body), 0o600); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to save the skill.")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, Skill{
		Name:    name,
		Summary: skillSummary(body.Body),
		Scope:   "personal",
	})
}

// requestSkillPublish marks a personal skill for admin review. Publishing into
// the org library stays a manual admin step so a colleague never picks up an
// unreviewed skill.
func (h *Handler) requestSkillPublish(w http.ResponseWriter, r *http.Request) {
	_, profile, ok := h.withProfile(w, r)
	if !ok {
		return
	}
	name := chi.URLParam(r, "name")
	if !isSafeSkillName(name) {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid skill name.")
		return
	}

	dir := filepath.Join(personalSkillsDir(profile), name)
	if _, err := os.Stat(filepath.Join(dir, "SKILL.md")); err != nil {
		httpx.WriteError(w, http.StatusNotFound, "Skill not found.")
		return
	}
	if err := os.WriteFile(filepath.Join(dir, ".publish-requested"), []byte(""), 0o600); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to request publishing.")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"requested": true})
}

// deleteSkill removes one personal skill. Org skills are read-only here.
func (h *Handler) deleteSkill(w http.ResponseWriter, r *http.Request) {
	_, profile, ok := h.withProfile(w, r)
	if !ok {
		return
	}
	name := chi.URLParam(r, "name")
	if !isSafeSkillName(name) {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid skill name.")
		return
	}
	if err := os.RemoveAll(filepath.Join(personalSkillsDir(profile), name)); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to delete the skill.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
