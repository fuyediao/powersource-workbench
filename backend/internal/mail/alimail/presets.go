package alimail

// ProviderName is the DB/API `provider` string for AliMail accounts. It is
// kept as "alibaba" (not renamed to "alimail") to avoid a SQL CHECK
// constraint change and a frontend rename.
const ProviderName = "alibaba"

// GenericIMAPProviderName is the DB/API `provider` string for arbitrary
// IMAP/SMTP mailboxes (same sync path as AliMail).
const GenericIMAPProviderName = "imap"

// Preset is a well-known IMAP/SMTP host/port combination for a provider.
type Preset struct {
	ImapHost string `json:"imapHost"`
	ImapPort int    `json:"imapPort"`
	SMTPHost string `json:"smtpHost"`
	SMTPPort int    `json:"smtpPort"`
	SMTPSSL  bool   `json:"smtpSsl"`
}

// Presets returns known IMAP/SMTP presets keyed by provider id.
func Presets() map[string]Preset {
	return map[string]Preset{
		ProviderName: {ImapHost: "imap.qiye.aliyun.com", ImapPort: 993, SMTPHost: "smtp.qiye.aliyun.com", SMTPPort: 465, SMTPSSL: true},
	}
}

// IsValidProvider reports whether provider may be created via the IMAP add path.
func IsValidProvider(provider string) bool {
	return IsIMAPProvider(provider)
}

// IsIMAPProvider reports whether the account uses the IMAP/SMTP sync path
// (AliMail package), including generic IMAP.
func IsIMAPProvider(provider string) bool {
	return provider == ProviderName || provider == GenericIMAPProviderName
}

// IMAPProviderFilter returns provider ids for PostgREST `in` filters.
func IMAPProviderFilter() []string {
	return []string{ProviderName, GenericIMAPProviderName}
}
