// Package alimail implements the AliMail (Alibaba/AliYun Qiye) mail provider:
// IMAP/SMTP account credentials, connection testing, inbox sync, message
// upsert, on-demand body hydration, and sending. It owns its own duplicated
// RFC 2822 helpers and does not share implementation code with the gmail
// package. The DB/API provider string stays "alibaba" for compatibility.
package alimail

import (
	"github.com/fuyediao/powersource-workbench/backend/internal/config"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

// Client is the AliMail provider client. It talks to Supabase for account/
// message persistence and speaks IMAP/SMTP directly over crypto/tls.
type Client struct {
	sb  *supabase.Client
	env config.Env
}

// New builds an AliMail provider client.
func New(sb *supabase.Client, env config.Env) *Client {
	return &Client{sb: sb, env: env}
}
