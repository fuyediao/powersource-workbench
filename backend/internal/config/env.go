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
	SupabaseAnonKey        string
	SupabaseServiceRoleKey string
	SuperAdminEmail        string
	AccountEmailDomain     string
}

// Load reads Workbench API settings from environment variables.
func Load() Env {
	anon := firstNonEmpty(os.Getenv("SUPABASE_ANON_KEY"), os.Getenv("SUPABASE_PUBLISHABLE_KEY"))
	service := firstNonEmpty(os.Getenv("SUPABASE_SERVICE_ROLE_KEY"), os.Getenv("SUPABASE_SECRET_KEY"))
	return Env{
		Port:                   firstNonEmpty(os.Getenv("PORT"), "3010"),
		SupabaseURL:            strings.TrimRight(strings.TrimSpace(os.Getenv("SUPABASE_URL")), "/"),
		SupabaseAnonKey:        strings.TrimSpace(anon),
		SupabaseServiceRoleKey: strings.TrimSpace(service),
		SuperAdminEmail:        strings.ToLower(strings.TrimSpace(firstNonEmpty(os.Getenv("SUPER_ADMIN_EMAIL"), "contact@geocrm.org"))),
		AccountEmailDomain:     strings.TrimSpace(firstNonEmpty(os.Getenv("WORKBENCH_ACCOUNT_EMAIL_DOMAIN"), "accounts.powersource.work")),
	}
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
