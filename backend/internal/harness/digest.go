package harness

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/fuyediao/powersource-workbench/backend/internal/mcp"
)

// digestEntities picks first-party datasets from a scheduled-task prompt.
// Unknown prompts fall back to a small office set (follow-ups, pipeline,
// mail, calendar).
func digestEntities(prompt string) []string {
	p := strings.ToLower(prompt)
	var out []string
	add := func(entity string) {
		for _, existing := range out {
			if existing == entity {
				return
			}
		}
		out = append(out, entity)
	}
	if strings.Contains(p, "mail") || strings.Contains(p, "inbox") || strings.Contains(p, "unread") {
		add("mail_messages")
	}
	if strings.Contains(p, "calendar") || strings.Contains(p, "agenda") || strings.Contains(p, "meeting") {
		add("calendar_events")
	}
	if strings.Contains(p, "follow") {
		add("follow_ups")
	}
	if strings.Contains(p, "work") || strings.Contains(p, "task") {
		add("customer_work_items")
	}
	if strings.Contains(p, "opportunit") || strings.Contains(p, "pipeline") {
		add("opportunities")
	}
	if strings.Contains(p, "order") || strings.Contains(p, "sales") || strings.Contains(p, "erp") {
		add("orders")
	}
	if strings.Contains(p, "customer") {
		add("customers")
	}
	if len(out) == 0 {
		return []string{"follow_ups", "opportunities", "mail_messages", "calendar_events"}
	}
	return out
}

// callUserTool runs one CRM tool as userID without storing a JWT.
func (h *Handler) callUserTool(ctx context.Context, userID, tool string, args json.RawMessage) (mcp.FirstPartyResult, error) {
	if h.callToolFn != nil {
		return h.callToolFn(ctx, userID, tool, args)
	}
	return mcp.CallForUser(ctx, h.sb, userID, tool, args)
}

// runOfficeDigest builds a VPS office digest via mcp.CallForUser. Failures on
// individual entities are included in the text; a failed list_my_access is fatal.
func (h *Handler) runOfficeDigest(ctx context.Context, userID, prompt string) (string, error) {
	access, err := h.callUserTool(ctx, userID, "list_my_access", nil)
	if err != nil {
		return "", err
	}
	if access.IsError {
		return "", fmt.Errorf("list_my_access: %s", access.Text)
	}

	var b strings.Builder
	b.WriteString(access.Text)
	year, week := time.Now().ISOWeek()
	for _, entity := range digestEntities(prompt) {
		args, err := json.Marshal(map[string]any{
			"entity": entity,
			"period": "week",
			"year":   year,
			"week":   week,
		})
		if err != nil {
			continue
		}
		result, callErr := h.callUserTool(ctx, userID, "summarize_records", args)
		b.WriteString("\n\n## ")
		b.WriteString(entity)
		b.WriteByte('\n')
		if callErr != nil {
			b.WriteString(callErr.Error())
			continue
		}
		b.WriteString(result.Text)
	}
	return clampRunes(b.String(), lastDigestCap), nil
}
