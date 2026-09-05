// Package config loads Workbench API settings from the process environment.
package config

import (
	"bufio"
	"os"
	"strings"
)

// Env holds runtime configuration for workbench-api.
type Env struct {
	Port                   string
	SupabaseURL            string
	SupabasePublicURL      string
	SupabaseAnonKey        string
	SupabaseServiceRoleKey string

	EncryptionKey            string
	AppPublicOrigin          string
	AppPublicOriginAllowlist string

	GoogleClientID     string
	GoogleClientSecret string
	GoogleRedirectURI  string

	JWTSecret            string
	OAVerifyURL          string
	MCPOAuthClientID     string
	MCPOAuthClientSecret string

	OnlyOfficeDSURL         string
	OnlyOfficeDSInternalURL string
	OnlyOfficeJWTSecret     string
}

// Load reads Workbench API settings from environment variables.
func Load() Env {
	anon := firstNonEmpty(os.Getenv("SUPABASE_ANON_KEY"), os.Getenv("SUPABASE_PUBLISHABLE_KEY"))
	service := firstNonEmpty(os.Getenv("SUPABASE_SERVICE_ROLE_KEY"), os.Getenv("SUPABASE_SECRET_KEY"))
	return Env{
		Port:                   firstNonEmpty(os.Getenv("PORT"), "3001"),
		SupabaseURL:            strings.TrimRight(strings.TrimSpace(os.Getenv("SUPABASE_URL")), "/"),
		SupabasePublicURL:      strings.TrimRight(strings.TrimSpace(os.Getenv("SUPABASE_PUBLIC_URL")), "/"),
		SupabaseAnonKey:        strings.TrimSpace(anon),
		SupabaseServiceRoleKey: strings.TrimSpace(service),

		EncryptionKey:            strings.TrimSpace(os.Getenv("ENCRYPTION_KEY")),
		AppPublicOrigin:          strings.TrimRight(strings.TrimSpace(os.Getenv("APP_PUBLIC_ORIGIN")), "/"),
		AppPublicOriginAllowlist: strings.TrimSpace(os.Getenv("APP_PUBLIC_ORIGIN_ALLOWLIST")),

		GoogleClientID:     strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_ID")),
		GoogleClientSecret: strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_SECRET")),
		GoogleRedirectURI:  strings.TrimSpace(os.Getenv("GOOGLE_REDIRECT_URI")),

		JWTSecret:            strings.TrimSpace(os.Getenv("JWT_SECRET")),
		OAVerifyURL:          strings.TrimSpace(os.Getenv("OA_VERIFY_URL")),
		MCPOAuthClientID:     strings.TrimSpace(os.Getenv("MCP_OAUTH_CLIENT_ID")),
		MCPOAuthClientSecret: strings.TrimSpace(os.Getenv("MCP_OAUTH_CLIENT_SECRET")),

		OnlyOfficeDSURL:         strings.TrimRight(strings.TrimSpace(os.Getenv("ONLYOFFICE_DS_URL")), "/"),
		OnlyOfficeDSInternalURL: strings.TrimRight(strings.TrimSpace(os.Getenv("ONLYOFFICE_DS_INTERNAL_URL")), "/"),
		OnlyOfficeJWTSecret:     strings.TrimSpace(os.Getenv("ONLYOFFICE_JWT_SECRET")),
	}
}

// ResolvedSupabasePublicURL returns the browser-facing Supabase origin.
func (e Env) ResolvedSupabasePublicURL() string {
	if u := strings.TrimSpace(e.SupabasePublicURL); u != "" {
		return strings.TrimRight(u, "/")
	}
	return strings.TrimRight(strings.TrimSpace(e.SupabaseURL), "/")
}

// ResolvedOnlyOfficeDSInternalURL returns the Docker-network Document Server origin.
func (e Env) ResolvedOnlyOfficeDSInternalURL() string {
	if u := strings.TrimSpace(e.OnlyOfficeDSInternalURL); u != "" {
		return strings.TrimRight(u, "/")
	}
	return "http://onlyoffice-ds"
}

// LoadDotEnv loads KEY=value pairs from path without overwriting existing env vars.
func LoadDotEnv(path string) {
	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer func() { _ = file.Close() }()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		if key == "" {
			continue
		}
		if _, exists := os.LookupEnv(key); !exists {
			_ = os.Setenv(key, value)
		}
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
