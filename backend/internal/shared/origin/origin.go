// Package origin validates and normalizes browser origins for OAuth return URLs.
package origin

import (
	"net/url"
	"strings"
)

// Config holds the env-driven origin allow-list settings shared by mail and channels.
type Config struct {
	AppPublicOriginAllowlist string
	PublicOrigin             string
	RedirectURIFallback      string
}

// NormalizeBrowserOrigin trims input and returns scheme://host, or "" when invalid.
func NormalizeBrowserOrigin(input string) string {
	t := strings.TrimRight(strings.TrimSpace(input), "/")
	if t == "" {
		return ""
	}
	withScheme := t
	if !strings.HasPrefix(strings.ToLower(t), "http://") && !strings.HasPrefix(strings.ToLower(t), "https://") {
		withScheme = "https://" + t
	}
	u, err := url.Parse(withScheme)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return ""
	}
	return u.Scheme + "://" + u.Host
}

// AllowedPublicOrigins returns normalized origins from the allow-list env vars.
func (c Config) AllowedPublicOrigins() []string {
	if listRaw := strings.TrimSpace(c.AppPublicOriginAllowlist); listRaw != "" {
		var out []string
		for _, s := range strings.Split(listRaw, ",") {
			if o := NormalizeBrowserOrigin(s); o != "" {
				out = append(out, o)
			}
		}
		return out
	}
	if single := strings.TrimSpace(c.PublicOrigin); single != "" {
		if o := NormalizeBrowserOrigin(single); o != "" {
			return []string{o}
		}
	}
	return []string{}
}

// AppPublicOrigin returns the configured public origin, or the host of RedirectURIFallback.
func (c Config) AppPublicOrigin() string {
	if raw := strings.TrimSpace(c.PublicOrigin); raw != "" {
		if o := NormalizeBrowserOrigin(raw); o != "" {
			return o
		}
		return strings.TrimRight(raw, "/")
	}
	if u, err := url.Parse(c.RedirectURIFallback); err == nil {
		return u.Scheme + "://" + u.Host
	}
	return ""
}

// PickValidatedReturnOrigin validates a client-supplied origin against the allow-list.
func (c Config) PickValidatedReturnOrigin(clientReturnOrigin string) string {
	allowed := c.AllowedPublicOrigins()
	client := ""
	if clientReturnOrigin != "" {
		client = NormalizeBrowserOrigin(clientReturnOrigin)
	}
	if len(allowed) > 0 {
		if client != "" && Contains(allowed, client) {
			return client
		}
		if client == "" && len(allowed) == 1 {
			return allowed[0]
		}
		return ""
	}
	fallback := NormalizeBrowserOrigin(c.AppPublicOrigin())
	if fallback == "" {
		return ""
	}
	if client != "" && client != fallback {
		return ""
	}
	return fallback
}

// Contains reports whether value is present in list.
func Contains(list []string, value string) bool {
	for _, v := range list {
		if v == value {
			return true
		}
	}
	return false
}
