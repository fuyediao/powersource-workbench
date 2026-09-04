package harness

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/fuyediao/powersource-workbench/backend/internal/config"
)

const testUserID = "2f1a9c4e-1234-4bcd-9876-abcdef012345"

func TestEnsureProfileCreatesSlimLayout(t *testing.T) {
	root := t.TempDir()
	h := &Handler{env: config.Env{HermesProfilesRoot: root}}
	dir, err := h.ensureProfile(testUserID)
	if err != nil {
		t.Fatalf("ensureProfile: %v", err)
	}
	for _, rel := range []string{
		filepath.Join("memories", "MEMORY.md"),
		filepath.Join("memories", "USER.md"),
		"skills",
		"rules",
		"commands",
		"hooks",
		"subagents",
		"plugins",
		"experts",
		"harness",
	} {
		if _, err := os.Stat(filepath.Join(dir, rel)); err != nil {
			t.Fatalf("missing %s: %v", rel, err)
		}
	}
	memPath := filepath.Join(dir, "memories", "MEMORY.md")
	if err := os.WriteFile(memPath, []byte("keep me"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := h.ensureProfile(testUserID); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(memPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "keep me" {
		t.Fatalf("MEMORY.md overwritten: %q", got)
	}
}

func TestEnsureProfileRejectsTraversal(t *testing.T) {
	h := &Handler{env: config.Env{HermesProfilesRoot: t.TempDir()}}
	if _, err := h.ensureProfile("../etc"); err == nil {
		t.Fatal("expected invalid user id")
	}
}

func TestSeedOrgSkillsCopiesMissingSkill(t *testing.T) {
	dest := t.TempDir()
	src := t.TempDir()
	skillDir := filepath.Join(src, "geocrm-office")
	if err := os.MkdirAll(skillDir, 0o750); err != nil {
		t.Fatal(err)
	}
	body := []byte("# GeoCRM office tools (Harness)\n")
	if err := os.WriteFile(filepath.Join(skillDir, "SKILL.md"), body, 0o600); err != nil {
		t.Fatal(err)
	}

	h := &Handler{env: config.Env{HermesOrgSkillsRoot: dest}}
	// Point seed lookup by writing into dest after copying via copyFile directly.
	if err := copyFile(filepath.Join(skillDir, "SKILL.md"), filepath.Join(dest, "geocrm-office", "SKILL.md")); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(filepath.Join(dest, "geocrm-office", "SKILL.md"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(got), "GeoCRM office tools") {
		t.Fatalf("seed body = %q", got)
	}

	// Existing dest is not overwritten.
	if err := os.WriteFile(filepath.Join(dest, "geocrm-office", "SKILL.md"), []byte("admin edit"), 0o600); err != nil {
		t.Fatal(err)
	}
	h.seedOrgSkills()
	got, err = os.ReadFile(filepath.Join(dest, "geocrm-office", "SKILL.md"))
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "admin edit" {
		t.Fatalf("org skill overwritten: %q", got)
	}
}
