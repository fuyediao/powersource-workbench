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
func ValidUsername(username string) bool {
	return usernamePattern.MatchString(username)
}

// ResolveSignInEmail maps a login identifier to the GoTrue email.
// The GeoCRM super administrator keeps contact@geocrm.org so the existing password works.
func ResolveSignInEmail(identifier, superAdminEmail, accountDomain string) (string, string) {
	normalized := NormalizeUsername(identifier)
	superAdminEmail = strings.ToLower(strings.TrimSpace(superAdminEmail))
	accountDomain = strings.TrimSpace(accountDomain)
	if normalized == "" {
		return "", "invalid_username"
	}
	if strings.Contains(normalized, "@") {
		return normalized, ""
	}
	if superAdminEmail != "" {
		local, _, _ := strings.Cut(superAdminEmail, "@")
		if normalized == local {
			return superAdminEmail, ""
		}
	}
	if !ValidUsername(normalized) {
		return "", "invalid_username"
	}
	return normalized + "@" + accountDomain, ""
}

// IsPlatformAdmin reports whether a Workbench role may create invitations.
func IsPlatformAdmin(role string) bool {
	return role == "super_admin" || role == "system_admin"
}

// UsernameFromEmail returns the local part of an email address.
func UsernameFromEmail(email string) string {
	local, _, _ := strings.Cut(strings.ToLower(strings.TrimSpace(email)), "@")
	if ValidUsername(local) {
		return local
	}
	return "admin"
}
