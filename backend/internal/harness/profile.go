package harness

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// errProfileUnavailable is returned when HERMES_PROFILES_ROOT is unset.
var errProfileUnavailable = errors.New("hermes profiles root is not configured")

// errInvalidUserID guards path construction against traversal.
var errInvalidUserID = errors.New("user id is not a valid profile name")

const (
	memoriesDirName  = "memories"
	skillsDirName    = "skills"
	rulesDirName     = "rules"
	commandsDirName  = "commands"
	hooksDirName     = "hooks"
	subagentsDirName = "subagents"
	pluginsDirName   = "plugins"
	expertsDirName   = "experts"
	memoryFileName   = "MEMORY.md"
	userFileName     = "USER.md"
)

// isSafeProfileName reports whether a Supabase user id can be used verbatim as
// a directory name. Supabase ids are UUIDs, so anything outside that character
// set is rejected rather than sanitized.
func isSafeProfileName(userID string) bool {
	if userID == "" || len(userID) > 64 {
		return false
	}
	for _, c := range userID {
		switch {
		case c >= '0' && c <= '9':
		case c >= 'a' && c <= 'z':
		case c >= 'A' && c <= 'Z':
		case c == '-':
		default:
			return false
		}
	}
	return true
}

// profileDir resolves the slim profile directory for one GeoCRM user.
// One directory per user id keeps memory, skills, and cron jobs isolated.
func (h *Handler) profileDir(userID string) (string, error) {
	root := strings.TrimSpace(h.env.HermesProfilesRoot)
	if root == "" {
		return "", errProfileUnavailable
	}
	if !isSafeProfileName(userID) {
		return "", errInvalidUserID
	}
	return filepath.Join(root, userID), nil
}

// ensureProfile creates the slim profile layout on first use. Empty MEMORY.md
// and USER.md are created when missing; the desktop client never writes them.
func (h *Handler) ensureProfile(userID string) (string, error) {
	dir, err := h.profileDir(userID)
	if err != nil {
		return "", err
	}
	subdirs := []string{
		filepath.Join(dir, memoriesDirName),
		filepath.Join(dir, skillsDirName),
		filepath.Join(dir, rulesDirName),
		filepath.Join(dir, commandsDirName),
		filepath.Join(dir, hooksDirName),
		filepath.Join(dir, subagentsDirName),
		filepath.Join(dir, pluginsDirName),
		filepath.Join(dir, expertsDirName),
		harnessDir(dir),
	}
	for _, sub := range subdirs {
		if err := os.MkdirAll(sub, 0o750); err != nil {
			return "", err
		}
	}
	if err := touchEmptyFile(filepath.Join(dir, memoriesDirName, memoryFileName)); err != nil {
		return "", err
	}
	if err := touchEmptyFile(filepath.Join(dir, memoriesDirName, userFileName)); err != nil {
		return "", err
	}
	return dir, nil
}

// touchEmptyFile creates an empty file when it does not already exist.
func touchEmptyFile(path string) error {
	if _, err := os.Stat(path); err == nil {
		return nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return os.WriteFile(path, []byte(""), 0o600)
}

// orgSkillSeedCandidates are relative/absolute roots that may hold the
// English product SKILL.md files shipped in the workbench-api image.
func orgSkillSeedCandidates() []string {
	candidates := []string{
		filepath.Join("assets", "harness", "org-skills"),
		filepath.Join("/app", "assets", "harness", "org-skills"),
	}
	if exe, err := os.Executable(); err == nil {
		candidates = append([]string{
			filepath.Join(filepath.Dir(exe), "assets", "harness", "org-skills"),
		}, candidates...)
	}
	if wd, err := os.Getwd(); err == nil {
		candidates = append(candidates, filepath.Join(wd, "assets", "harness", "org-skills"))
	}
	return candidates
}

// findOrgSkillSeedDir returns the first existing seed directory, or empty.
func findOrgSkillSeedDir() string {
	for _, dir := range orgSkillSeedCandidates() {
		if st, err := os.Stat(dir); err == nil && st.IsDir() {
			return dir
		}
	}
	return ""
}

// seedOrgSkills copies shipped English SKILL.md folders into the org library
// when the destination skill does not already exist (admin edits are kept).
func (h *Handler) seedOrgSkills() {
	dest := strings.TrimSpace(h.env.HermesOrgSkillsRoot)
	if dest == "" {
		return
	}
	src := findOrgSkillSeedDir()
	if src == "" {
		return
	}
	srcAbs, err := filepath.Abs(src)
	if err != nil {
		return
	}
	destAbs, err := filepath.Abs(dest)
	if err != nil {
		return
	}
	if srcAbs == destAbs {
		return
	}
	if err := os.MkdirAll(dest, 0o750); err != nil {
		return
	}
	entries, err := os.ReadDir(src)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if !entry.IsDir() || !isSafeSkillName(entry.Name()) {
			continue
		}
		destFile := filepath.Join(dest, entry.Name(), "SKILL.md")
		if _, err := os.Stat(destFile); err == nil {
			continue
		}
		srcFile := filepath.Join(src, entry.Name(), "SKILL.md")
		if err := copyFile(srcFile, destFile); err != nil {
			continue
		}
	}
}

// copyFile writes src onto dest, creating the parent directory.
func copyFile(src, dest string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer func() { _ = in.Close() }()
	if err := os.MkdirAll(filepath.Dir(dest), 0o750); err != nil {
		return err
	}
	out, err := os.OpenFile(dest, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o640)
	if err != nil {
		return err
	}
	defer func() { _ = out.Close() }()
	_, err = io.Copy(out, in)
	return err
}
