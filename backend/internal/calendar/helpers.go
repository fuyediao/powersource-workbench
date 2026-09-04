package calendar

import (
	"strings"
	"time"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/origin"
)

func (h *Handler) originCfg() origin.Config {
	return origin.Config{
		AppPublicOriginAllowlist: h.env.AppPublicOriginAllowlist,
		PublicOrigin:             h.env.AppPublicOrigin,
		RedirectURIFallback:      h.calendarRedirectURI(),
	}
}

func (h *Handler) allowedPublicOrigins() []string {
	return h.originCfg().AllowedPublicOrigins()
}

func (h *Handler) appPublicOrigin() string {
	return h.originCfg().AppPublicOrigin()
}

func (h *Handler) pickValidatedReturnOrigin(clientReturnOrigin string) string {
	return h.originCfg().PickValidatedReturnOrigin(clientReturnOrigin)
}

func containsStr(list []string, value string) bool {
	return origin.Contains(list, value)
}

func nowISO() string { return time.Now().UTC().Format(time.RFC3339Nano) }

func nilIfEmpty(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}
