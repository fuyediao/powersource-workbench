package harness

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

// memoryCharCap is the MEMORY.md bound (~2200 characters).
const memoryCharCap = 2200

// userCharCap is the USER.md bound (~1375 characters).
const userCharCap = 1375

// reviewOutput is the JSON object the desktop review pass must return.
type reviewOutput struct {
	Memory string `json:"memory"`
	User   string `json:"user"`
}

// applyProposedMemory writes clamped MEMORY.md / USER.md. Empty fields keep
// the existing file. The desktop never writes these paths; it only proposes
// text after running the review model with the user's own Settings key.
func applyProposedMemory(profile, memory, user string) error {
	if strings.TrimSpace(memory) == "" {
		existing, err := readProfileFile(profile, memoryFileName)
		if err != nil {
			return err
		}
		memory = existing
	} else {
		memory = clampRunes(memory, memoryCharCap)
	}
	if strings.TrimSpace(user) == "" {
		existing, err := readProfileFile(profile, userFileName)
		if err != nil {
			return err
		}
		user = existing
	} else {
		user = clampRunes(user, userCharCap)
	}
	dir := filepath.Join(profile, memoriesDirName)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(dir, memoryFileName), []byte(memory), 0o600); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, userFileName), []byte(user), 0o600)
}

// parseReviewOutput reads a JSON object (optionally fenced) and clamps caps.
func parseReviewOutput(raw string) (reviewOutput, error) {
	trimmed := strings.TrimSpace(raw)
	trimmed = strings.TrimPrefix(trimmed, "```json")
	trimmed = strings.TrimPrefix(trimmed, "```JSON")
	trimmed = strings.TrimPrefix(trimmed, "```")
	trimmed = strings.TrimSuffix(trimmed, "```")
	trimmed = strings.TrimSpace(trimmed)

	var out reviewOutput
	if err := json.Unmarshal([]byte(trimmed), &out); err != nil {
		return reviewOutput{}, err
	}
	out.Memory = clampRunes(out.Memory, memoryCharCap)
	out.User = clampRunes(out.User, userCharCap)
	return out, nil
}

// clampRunes shortens s to at most max Unicode code points.
func clampRunes(s string, max int) string {
	if max <= 0 || utf8.RuneCountInString(s) <= max {
		return s
	}
	runes := []rune(s)
	return string(runes[:max])
}
