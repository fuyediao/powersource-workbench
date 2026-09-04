package harness

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"unicode"
)

// shippedOrgSkillsDir is the repo copy of the org skill seeds relative to this package.
const shippedOrgSkillsDir = "../../assets/harness/org-skills"

// maxSkillSummaryBytes mirrors the cut applied by skillSummary.
const maxSkillSummaryBytes = 160

// TestShippedOrgSkillsAreWellFormed keeps every seeded SKILL.md loadable by
// seedOrgSkills and readable by the desktop index: a safe folder name, a
// first-line heading, a summary that survives the 160-byte cut, and English
// prompt text (no CJK runes, which the agent rules forbid in prompt files).
func TestShippedOrgSkillsAreWellFormed(t *testing.T) {
	entries, err := os.ReadDir(shippedOrgSkillsDir)
	if err != nil {
		t.Fatalf("read %s: %v", shippedOrgSkillsDir, err)
	}
	seen := 0
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		seen++
		name := entry.Name()
		if !isSafeSkillName(name) {
			t.Errorf("%s: folder name is not a safe skill name", name)
		}
		raw, err := os.ReadFile(filepath.Join(shippedOrgSkillsDir, name, "SKILL.md"))
		if err != nil {
			t.Errorf("%s: missing SKILL.md: %v", name, err)
			continue
		}
		body := string(raw)
		firstLine, _, _ := strings.Cut(body, "\n")
		if !strings.HasPrefix(firstLine, "# ") {
			t.Errorf("%s: first line must be a level-one heading, got %q", name, firstLine)
		}
		summary := skillSummary(body)
		if summary == "" {
			t.Errorf("%s: skillSummary is empty", name)
		}
		if len(summary) >= maxSkillSummaryBytes {
			t.Errorf("%s: summary line is %d bytes; keep it under %d so the index is not cut mid-word", name, len(summary), maxSkillSummaryBytes)
		}
		for i, r := range body {
			if unicode.Is(unicode.Han, r) || unicode.Is(unicode.Hangul, r) || unicode.Is(unicode.Hiragana, r) || unicode.Is(unicode.Katakana, r) {
				t.Errorf("%s: non-English rune %q at byte %d; prompt files must stay English", name, r, i)
				break
			}
		}
	}
	if seen < 3 {
		t.Fatalf("expected the shipped org skill library, found %d folders", seen)
	}
}
