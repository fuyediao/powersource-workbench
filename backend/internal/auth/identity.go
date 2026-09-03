package auth

import (
	"regexp"
	"strings"
)

var usernamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{2,31}$`)

// NormalizeUsername lowercases and trims a Workbench username.
func NormalizeUsername(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

// ValidUsername reports whether username matches the account policy.
// Email addresses are rejected; Workbench identity is username-only.
func ValidUsername(username string) bool {
	return usernamePattern.MatchString(username)
}

// IsPlatformAdmin reports whether a Workbench role may create invitations.
func IsPlatformAdmin(role string) bool {
	return role == "super_admin" || role == "system_admin"
}
