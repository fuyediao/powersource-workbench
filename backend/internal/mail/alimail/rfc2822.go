package alimail

import "github.com/fuyediao/powersource-workbench/backend/internal/mail/mailcore"

// Addr is a parsed email address with an optional display name.
type Addr = mailcore.Addr

// Attachment is one MIME file part on an outgoing message.
type Attachment = mailcore.Attachment

// rfc2822Opts carries the fields needed to build an outgoing message. MIME
// building itself lives in mailcore so Gmail and AliMail share one path.
type rfc2822Opts = mailcore.RFC2822Opts

// decodeRFC2047 decodes encoded-word header values, returning the input on error.
func decodeRFC2047(s string) string { return mailcore.DecodeRFC2047(s) }

// buildRFC2822Raw builds a CRLF-delimited RFC 2822 message for SMTP DATA.
func buildRFC2822Raw(opts rfc2822Opts) string { return mailcore.BuildRFC2822Raw(opts) }
