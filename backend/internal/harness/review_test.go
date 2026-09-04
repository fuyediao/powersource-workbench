package harness

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestParseReviewOutputClampsCaps(t *testing.T) {
	memory := strings.Repeat("m", memoryCharCap+50)
	user := strings.Repeat("u", userCharCap+20)
	raw := `{"memory":"` + memory + `","user":"` + user + `"}`
	out, err := parseReviewOutput(raw)
	if err != nil {
		t.Fatalf("parseReviewOutput: %v", err)
	}
	if utf8.RuneCountInString(out.Memory) != memoryCharCap {
		t.Fatalf("memory runes = %d, want %d", utf8.RuneCountInString(out.Memory), memoryCharCap)
	}
	if utf8.RuneCountInString(out.User) != userCharCap {
		t.Fatalf("user runes = %d, want %d", utf8.RuneCountInString(out.User), userCharCap)
	}
}

func TestParseReviewOutputStripsFence(t *testing.T) {
	raw := "```json\n{\"memory\":\"office note\",\"user\":\"prefers brief\"}\n```"
	out, err := parseReviewOutput(raw)
	if err != nil {
		t.Fatalf("parseReviewOutput: %v", err)
	}
	if out.Memory != "office note" || out.User != "prefers brief" {
		t.Fatalf("parsed %+v", out)
	}
}

func TestApplyProposedMemoryWritesBoundedFiles(t *testing.T) {
	profile := t.TempDir()
	if err := os.MkdirAll(filepath.Join(profile, "memories"), 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(profile, "memories", "MEMORY.md"), []byte("old memory"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(profile, "memories", "USER.md"), []byte("old user"), 0o600); err != nil {
		t.Fatal(err)
	}
	long := strings.Repeat("m", memoryCharCap+10)
	if err := applyProposedMemory(profile, long, "likes short answers"); err != nil {
		t.Fatalf("applyProposedMemory: %v", err)
	}
	memory, err := os.ReadFile(filepath.Join(profile, "memories", "MEMORY.md"))
	if err != nil {
		t.Fatal(err)
	}
	if utf8.RuneCountInString(string(memory)) != memoryCharCap {
		t.Fatalf("MEMORY.md runes = %d", utf8.RuneCountInString(string(memory)))
	}
	user, err := os.ReadFile(filepath.Join(profile, "memories", "USER.md"))
	if err != nil {
		t.Fatal(err)
	}
	if string(user) != "likes short answers" {
		t.Fatalf("USER.md = %q", user)
	}
}

func TestApplyProposedMemoryKeepsExistingWhenEmpty(t *testing.T) {
	profile := t.TempDir()
	if err := os.MkdirAll(filepath.Join(profile, "memories"), 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(profile, "memories", "MEMORY.md"), []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(profile, "memories", "USER.md"), []byte("me"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := applyProposedMemory(profile, "", ""); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(filepath.Join(profile, "memories", "MEMORY.md"))
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "keep" {
		t.Fatalf("MEMORY.md = %q", got)
	}
}

func TestClampRunes(t *testing.T) {
	if got := clampRunes("abc", 10); got != "abc" {
		t.Fatalf("short string mutated: %q", got)
	}
	if got := clampRunes("abcdef", 3); got != "abc" {
		t.Fatalf("clampRunes = %q", got)
	}
}
