package harness

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/fuyediao/powersource-workbench/backend/internal/mail"
	"github.com/fuyediao/powersource-workbench/backend/internal/mcp"
	"github.com/fuyediao/powersource-workbench/backend/internal/office"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/authmw"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
)

// toolRequest carries the arguments for one first-party tool call.
type toolRequest struct {
	Arguments json.RawMessage `json:"arguments"`
}

// harnessProfileTool reports whether a tool reads Harness-owned profile data.
func harnessProfileTool(tool string) bool {
	return tool == "read_harness_resource" || tool == "search_harness_sessions"
}

// harnessOfficeTool reports whether a tool reads the ACL-filtered Office library.
func harnessOfficeTool(tool string) bool {
	return tool == "list_office_files" || tool == "open_office_file"
}

// harnessWebTool reports whether a tool uses a server-side search backend.
func harnessWebTool(tool string) bool {
	return tool == "web_search"
}

// harnessMailTool reports whether a tool uses the signed-in user's mailbox.
func harnessMailTool(tool string) bool {
	return tool == "send_mail" || tool == "save_mail_draft"
}

// callHarnessOwnedTool runs profile, Office, web, and mail tools that are not public MCP tools.
func (h *Handler) callHarnessOwnedTool(
	ctx context.Context,
	profile string,
	userID string,
	tool string,
	raw json.RawMessage,
) (any, error) {
	switch tool {
	case "web_search":
		return h.runWebSearch(ctx, userID, raw)
	case "send_mail":
		allowed, err := h.hasDesktopModule(ctx, userID, "desktop_mail")
		if err != nil {
			return nil, err
		}
		if !allowed {
			return nil, errors.New("Mail is not enabled for this account")
		}
		var args mail.SendRequest
		if err := json.Unmarshal(raw, &args); err != nil {
			return nil, err
		}
		return mail.New(h.env, h.sb).SendForUser(ctx, userID, args)
	case "save_mail_draft":
		allowed, err := h.hasDesktopModule(ctx, userID, "desktop_mail")
		if err != nil {
			return nil, err
		}
		if !allowed {
			return nil, errors.New("Mail is not enabled for this account")
		}
		var args mail.DraftRequest
		if err := json.Unmarshal(raw, &args); err != nil {
			return nil, err
		}
		draftID, err := mail.New(h.env, h.sb).SaveDraftForUser(ctx, userID, args)
		if err != nil {
			return nil, err
		}
		return map[string]any{"draftId": draftID}, nil
	case "read_harness_resource":
		return h.readHarnessResource(profile, raw)
	case "search_harness_sessions":
		return h.searchHarnessSessions(ctx, userID, raw)
	case "list_office_files":
		var args struct {
			Kind  string `json:"kind"`
			Query string `json:"query"`
			Limit int    `json:"limit"`
		}
		if len(raw) > 0 {
			if err := json.Unmarshal(raw, &args); err != nil {
				return nil, err
			}
		}
		files, err := office.New(h.env, h.sb).ListAccessibleFiles(ctx, userID, args.Kind, args.Query, args.Limit)
		if err != nil {
			return nil, err
		}
		return map[string]any{"files": files}, nil
	case "open_office_file":
		var args struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(raw, &args); err != nil {
			return nil, err
		}
		return office.New(h.env, h.sb).OpenAccessibleFile(ctx, userID, args.ID)
	default:
		return nil, os.ErrNotExist
	}
}

// readHarnessResource returns one saved skill, rule, command, hook, subagent,
// plugin, or memory file from the caller's own profile.
func (h *Handler) readHarnessResource(profile string, raw json.RawMessage) (any, error) {
	var args struct {
		Kind string `json:"kind"`
		Name string `json:"name"`
	}
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, err
	}
	kind := strings.ToLower(strings.TrimSpace(args.Kind))
	name := strings.TrimSpace(args.Name)
	if kind == "memory" {
		fileName := map[string]string{"memory": memoryFileName, "user": userFileName}[strings.ToLower(name)]
		if fileName == "" {
			return nil, os.ErrNotExist
		}
		body, err := os.ReadFile(filepath.Join(profile, memoriesDirName, fileName))
		return map[string]any{"kind": kind, "name": name, "body": string(body)}, err
	}
	if !isSafeSkillName(name) {
		return nil, os.ErrNotExist
	}
	if kind == "skills" {
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
			if err == nil {
				return Skill{Name: name, Summary: skillSummary(string(body)), Scope: root.scope, Body: string(body)}, nil
			}
		}
		return nil, os.ErrNotExist
	}
	kinds := map[string]libraryKind{
		"rules": libraryRules, "commands": libraryCommands, "hooks": libraryHooks,
		"subagents": librarySubagents, "plugins": libraryPlugins,
	}
	library, ok := kinds[kind]
	if !ok {
		return nil, os.ErrNotExist
	}
	body, err := os.ReadFile(filepath.Join(library.dir(profile), name, library.fileName()))
	if err != nil {
		return nil, err
	}
	return LibraryEntry{Name: name, Summary: skillSummary(string(body)), Scope: "personal", Body: string(body)}, nil
}

// searchHarnessSessions finds the caller's own recent Agent histories and
// filters them in memory so search text cannot alter the PostgREST expression.
func (h *Handler) searchHarnessSessions(ctx context.Context, userID string, raw json.RawMessage) (any, error) {
	var args struct {
		Query string `json:"query"`
		Limit int    `json:"limit"`
	}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &args)
	}
	if args.Limit < 1 || args.Limit > 20 {
		args.Limit = 10
	}
	var rows []struct {
		ID           string          `json:"id"`
		Query        string          `json:"query"`
		Response     string          `json:"response"`
		CreatedAt    string          `json:"created_at"`
		HarnessItems json.RawMessage `json:"harness_items"`
	}
	err := h.sb.From("history").
		Select("id,query,response,created_at,harness_items").
		Eq("user_id", userID).
		Eq("created_by_user_id", userID).
		Eq("assistant_kind", "agent").
		Order("created_at", false).
		Limit(100).
		Exec(ctx, &rows)
	if err != nil {
		return nil, err
	}
	term := strings.ToLower(strings.TrimSpace(args.Query))
	out := make([]any, 0, args.Limit)
	for _, row := range rows {
		if term != "" && !strings.Contains(strings.ToLower(row.Query+"\n"+row.Response+"\n"+string(row.HarnessItems)), term) {
			continue
		}
		out = append(out, row)
		if len(out) == args.Limit {
			break
		}
	}
	return map[string]any{"sessions": out}, nil
}

// callTool runs one GeoCRM tool for the signed-in user.
//
// This is the Harness door: ordinary JSON over the user's session, sharing the
// exact CRM implementation and desktop ACL behind the public /mcp transport.
// Harness never mints or sends a `gcrm_mcp_` key, and it never speaks MCP to
// reach GeoCRM.
func (h *Handler) callTool(w http.ResponseWriter, r *http.Request) {
	tool := chi.URLParam(r, "tool")
	if !mcp.IsFirstPartyTool(tool) && !harnessProfileTool(tool) && !harnessOfficeTool(tool) && !harnessWebTool(tool) && !harnessMailTool(tool) {
		httpx.WriteJSON(w, http.StatusNotFound, map[string]any{
			"error": "Unknown tool.",
			"code":  "unknown_tool",
		})
		return
	}
	var body toolRequest
	if r.ContentLength > 0 {
		if err := httpx.DecodeJSON(r, &body); err != nil {
			httpx.WriteError(w, http.StatusBadRequest, "Invalid tool arguments.")
			return
		}
	}
	if harnessProfileTool(tool) || harnessOfficeTool(tool) || harnessWebTool(tool) || harnessMailTool(tool) {
		userID := authmw.UserIDFrom(r)
		profile := ""
		if harnessProfileTool(tool) {
			var err error
			profile, err = h.ensureProfile(userID)
			if err != nil {
				httpx.WriteError(w, http.StatusServiceUnavailable, "Harness profile is unavailable.")
				return
			}
		}
		result, err := h.callHarnessOwnedTool(r.Context(), profile, userID, tool, body.Arguments)
		if err != nil {
			httpx.WriteJSON(w, http.StatusOK, map[string]any{
				"tool": tool, "result": map[string]any{"error": err.Error()}, "isError": true,
			})
			return
		}
		if result == nil {
			httpx.WriteJSON(w, http.StatusOK, map[string]any{
				"tool": tool, "result": map[string]any{"error": "Office file not found or forbidden."}, "isError": true,
			})
			return
		}
		encoded, _ := json.Marshal(result)
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"tool": tool, "result": string(encoded), "isError": false,
		})
		return
	}

	result, err := mcp.CallForUser(r.Context(), h.sb, authmw.UserIDFrom(r), tool, body.Arguments)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "The tool call failed.")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"tool":    tool,
		"result":  result.Text,
		"isError": result.IsError,
	})
}
