package mcp

import (
	"context"
	"time"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

// masterSettings mirrors public.mcp_user_settings: the account-wide on/off
// switch that gates every credential (key or OAuth token) for a user,
// independent of any individual key's own enabled flag.
type masterSettings struct {
	UserID  string `json:"user_id"`
	Enabled bool   `json:"enabled"`
}

// loadMaster reads the caller's master switch, defaulting to disabled when no
// row exists yet (a brand-new account that has never opened MCP settings).
func loadMaster(ctx context.Context, sb *supabase.Client, userID string) (bool, error) {
	var row masterSettings
	found, err := sb.From("mcp_user_settings").
		Select("user_id,enabled").
		Eq("user_id", userID).
		MaybeSingle(ctx, &row)
	if err != nil {
		return false, err
	}
	if !found {
		return false, nil
	}
	return row.Enabled, nil
}

// setMaster upserts the caller's master switch.
func setMaster(ctx context.Context, sb *supabase.Client, userID string, enabled bool) error {
	now := time.Now().UTC().Format(time.RFC3339)
	return sb.From("mcp_user_settings").
		Upsert([]map[string]any{{
			"user_id":    userID,
			"enabled":    enabled,
			"updated_at": now,
		}}, "user_id").
		Exec(ctx, nil)
}
