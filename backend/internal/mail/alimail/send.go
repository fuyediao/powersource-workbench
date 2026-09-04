package alimail

// SendOptions carries the fields needed to send an outgoing SMTP message.
type SendOptions struct {
	From        string
	To          []Addr
	Cc          []Addr
	Bcc         []Addr
	ReplyTo     string
	Subject     string
	BodyHTML    string
	BodyText    string
	InReplyTo   string
	Attachments []Attachment
}

// Send builds an RFC 2822 message and sends it via SMTP using cfg.
func Send(cfg Config, opts SendOptions) error {
	raw := buildRFC2822Raw(rfc2822Opts{
		From:        opts.From,
		To:          opts.To,
		Cc:          opts.Cc,
		Bcc:         opts.Bcc,
		ReplyTo:     opts.ReplyTo,
		Subject:     opts.Subject,
		BodyHTML:    opts.BodyHTML,
		BodyText:    opts.BodyText,
		InReplyTo:   opts.InReplyTo,
		Attachments: opts.Attachments,
	})
	to := recipientEmails(opts)
	return sendSMTPMessage(cfg, raw, opts.From, to)
}

func recipientEmails(opts SendOptions) []string {
	var out []string
	for _, group := range [][]Addr{opts.To, opts.Cc, opts.Bcc} {
		for _, a := range group {
			if a.Email != "" {
				out = append(out, a.Email)
			}
		}
	}
	return out
}
