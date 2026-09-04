package settings

import (
	"strings"
)

// sanitizeProviderError returns a safe diagnostic string: never includes the
// API key, truncates very long provider dumps.
func sanitizeProviderError(err error, apiKey string) string {
	if err == nil {
		return "unknown error"
	}
	msg := strings.TrimSpace(err.Error())
	if apiKey != "" {
		msg = strings.ReplaceAll(msg, apiKey, "[redacted]")
	}
	msg = strings.ReplaceAll(msg, "\r", " ")
	msg = strings.ReplaceAll(msg, "\n", " ")
	msg = strings.Join(strings.Fields(msg), " ")
	const maxLen = 400
	if len(msg) > maxLen {
		msg = msg[:maxLen] + "…"
	}
	if msg == "" {
		return "The AI provider request failed."
	}
	return msg
}
