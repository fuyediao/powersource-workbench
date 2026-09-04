// Package gmail implements the Gmail-only mail provider: OAuth linking, access
// token refresh, the Gmail REST API, inbox sync, message upsert, sending, and
// best-effort label mirroring. It owns its own duplicated RFC 2822 and time
// helpers and does not share implementation code with the alimail package.
package gmail

import (
	"github.com/fuyediao/powersource-workbench/backend/internal/config"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

// Client is the Gmail provider client. It talks to Supabase for account/
// message persistence and to the Gmail REST + OAuth APIs.
type Client struct {
	sb  *supabase.Client
	env config.Env
}

// New builds a Gmail provider client.
func New(sb *supabase.Client, env config.Env) *Client {
	return &Client{sb: sb, env: env}
}
