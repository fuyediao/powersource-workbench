package aichat

import (
	"strings"

	"github.com/fuyediao/powersource-workbench/backend/internal/ai/location"
)

// SystemThink is the Ask "Think" mode system instruction (English).
const SystemThink = `You are a helpful, thoughtful assistant. Answer the user's questions in depth: explain reasoning where useful, give context and examples when appropriate, and structure longer answers clearly (e.g. with bullet points or short sections).`

// SystemQuick is the Ask "Quick" mode system instruction (English).
const SystemQuick = `You are a helpful assistant. Give short, direct answers. Be concise and to the point.`

// MapSearchSuffix is the restored Search Map skill overlay when the Ask Map toggle is on.
const MapSearchSuffix = `MAP SEARCH IS ACTIVE — use the location search contract below.

` + location.MapSearchInstructions

// ScreenshotUserPrefix is prepended when the client sends a window screenshot.
// Instruction text is English; the model may still reply in the user's language.
const ScreenshotUserPrefix = `A screenshot of the user's GeoCRM window is attached. It shows the main application content to the left of the Ask AI sidebar; the Ask AI sidebar itself is not in the image. Use the screenshot as visual context when answering.

`

// WebSearchSuffix is appended when Home / Spotlight AI search requests live web results.
const WebSearchSuffix = `WEB SEARCH IS ACTIVE. You have live internet search. Search the open web for current facts, then answer using those results. Prefer recent sources. Cite titles and URLs when you rely on them. Do not invent URLs. If search returns nothing useful, say so clearly.

`

// SystemPromptForMode returns the system prompt for think or quick.
func SystemPromptForMode(mode string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "think", "":
		return SystemThink, true
	case "quick":
		return SystemQuick, true
	default:
		return "", false
	}
}

// SystemPromptForAsk returns think/quick, plus map-pin or web-search instructions.
func SystemPromptForAsk(mode string, mapSearch, webSearch bool) (string, bool) {
	systemPrompt, ok := SystemPromptForMode(mode)
	if !ok {
		return "", false
	}
	if mapSearch {
		return systemPrompt + "\n\n" + MapSearchSuffix, true
	}
	if webSearch {
		return systemPrompt + "\n\n" + WebSearchSuffix, true
	}
	return systemPrompt, true
}

// BuildUserPrompt concatenates optional history and the latest user prompt.
func BuildUserPrompt(history []historyMessage, prompt string) string {
	var b strings.Builder
	for _, msg := range history {
		content := strings.TrimSpace(msg.Content)
		if content == "" {
			continue
		}
		role := strings.ToLower(strings.TrimSpace(msg.Role))
		speaker := "User"
		if role == "model" || role == "assistant" {
			speaker = "Assistant"
		}
		if b.Len() > 0 {
			b.WriteString("\n\n")
		}
		b.WriteString(speaker)
		b.WriteString(": ")
		b.WriteString(content)
	}
	if b.Len() > 0 {
		b.WriteString("\n\nUser: ")
	}
	b.WriteString(strings.TrimSpace(prompt))
	return b.String()
}
