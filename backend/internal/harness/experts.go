package harness

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
)

const expertFileName = "EXPERT.json"

var expertCategories = map[string]bool{
	"productDesign": true, "technicalEngineering": true, "financialInvestment": true,
	"gameSpace": true, "dataIntelligence": true, "marketingGrowth": true,
	"contentCreation": true, "salesBusiness": true, "operationsHuman": true,
	"projectQuality": true, "legalSecurity": true, "industryAdvisory": true,
}

var expertOutputModes = map[string]bool{
	"narrative": true, "table": true, "dashboard": true, "document": true,
}

var expertToolNames = map[string]bool{
	"computer_use": true, "web_search": true, "read_harness_resource": true, "search_harness_sessions": true,
	"list_my_access": true, "list_entities": true, "search_records": true,
	"get_record": true, "count_records": true, "summarize_records": true,
	"create_record": true, "update_record": true, "delete_record": true,
	"inspect_local_office_file": true, "edit_local_office_file": true,
	"create_local_office_file": true, "list_office_files": true, "open_office_file": true,
}

// ExpertProfile is one user-created executable tool synchronized through the Harness profile.
type ExpertProfile struct {
	ID                 string   `json:"id"`
	Name               string   `json:"name"`
	Description        string   `json:"description"`
	Category           string   `json:"category"`
	CreatedAt          string   `json:"createdAt"`
	Instructions       string   `json:"instructions"`
	AllowedTools       []string `json:"allowedTools"`
	RequiredConnectors []string `json:"requiredConnectors"`
	OutputMode         string   `json:"outputMode"`
}

// validExpertProfile validates a cloud-synchronized expert before writing it.
func validExpertProfile(profile ExpertProfile) bool {
	if !isSafeSkillName(profile.ID) || strings.TrimSpace(profile.Name) == "" ||
		strings.TrimSpace(profile.Description) == "" || strings.TrimSpace(profile.Instructions) == "" ||
		!expertCategories[profile.Category] || !expertOutputModes[profile.OutputMode] {
		return false
	}
	for _, tool := range profile.AllowedTools {
		if !expertToolNames[tool] {
			return false
		}
	}
	return true
}

// listExperts returns every user-created expert from the caller's cloud profile.
func (h *Handler) listExperts(w http.ResponseWriter, r *http.Request) {
	_, profile, ok := h.withProfile(w, r)
	if !ok {
		return
	}
	entries, err := os.ReadDir(filepath.Join(profile, expertsDirName))
	if err != nil && !os.IsNotExist(err) {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to read custom tools.")
		return
	}
	items := make([]ExpertProfile, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() || !isSafeSkillName(entry.Name()) {
			continue
		}
		data, readErr := os.ReadFile(filepath.Join(profile, expertsDirName, entry.Name(), expertFileName))
		if readErr != nil {
			continue
		}
		var item ExpertProfile
		if json.Unmarshal(data, &item) == nil && validExpertProfile(item) {
			items = append(items, item)
		}
	}
	sort.Slice(items, func(i, j int) bool { return items[i].CreatedAt > items[j].CreatedAt })
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"personal": items})
}

// writeExpert creates or replaces one custom expert in the caller's cloud profile.
func (h *Handler) writeExpert(w http.ResponseWriter, r *http.Request) {
	_, profile, ok := h.withProfile(w, r)
	if !ok {
		return
	}
	var item ExpertProfile
	if err := httpx.DecodeJSON(r, &item); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid custom tool payload.")
		return
	}
	pathID := chi.URLParam(r, "expertID")
	if item.ID == "" {
		item.ID = pathID
	}
	if item.ID != pathID || !validExpertProfile(item) {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid custom tool payload.")
		return
	}
	dir := filepath.Join(profile, expertsDirName, item.ID)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to save the custom tool.")
		return
	}
	data, err := json.MarshalIndent(item, "", "  ")
	if err != nil || os.WriteFile(filepath.Join(dir, expertFileName), data, 0o600) != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to save the custom tool.")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, item)
}

// deleteExpert removes one custom expert from the caller's cloud profile.
func (h *Handler) deleteExpert(w http.ResponseWriter, r *http.Request) {
	_, profile, ok := h.withProfile(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "expertID")
	if !isSafeSkillName(id) {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid custom tool id.")
		return
	}
	if err := os.RemoveAll(filepath.Join(profile, expertsDirName, id)); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to delete the custom tool.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
