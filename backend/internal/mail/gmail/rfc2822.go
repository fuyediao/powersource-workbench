package gmail

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

// buildRFC2822 builds a base64url-encoded message for the Gmail API `raw` field.
func buildRFC2822(opts rfc2822Opts) string { return mailcore.BuildRFC2822(opts) }

// ExportOpts is the public shape used to rebuild an RFC 2822 snapshot for .eml download.
type ExportOpts struct {
	From      string
	To        []Addr
	Cc        []Addr
	Bcc       []Addr
	Subject   string
	BodyHTML  string
	BodyText  string
	InReplyTo string
	MessageID string
}

// BuildRawRFC2822ForExport returns a CRLF RFC 2822 document for local download.
func BuildRawRFC2822ForExport(opts ExportOpts) string {
	return mailcore.BuildRFC2822Raw(mailcore.RFC2822Opts{
		From:      opts.From,
		To:        opts.To,
		Cc:        opts.Cc,
		Bcc:       opts.Bcc,
		Subject:   opts.Subject,
		BodyHTML:  opts.BodyHTML,
		BodyText:  opts.BodyText,
		InReplyTo: opts.InReplyTo,
		MessageID: opts.MessageID,
	})
}
