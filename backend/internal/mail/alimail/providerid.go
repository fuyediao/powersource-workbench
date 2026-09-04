package alimail

import "regexp"

var (
	// boxedProviderIDRe matches mailbox-scoped ids (`imap:box:Spam:uid:12`).
	boxedProviderIDRe = regexp.MustCompile(`^imap:box:([^:]+):uid:(\d+)$`)
	// legacyProviderIDRe matches the inbox-only ids written before mailbox
	// scoping (`imap:uid:12`, `imap:uidv:2:uid:12`).
	legacyProviderIDRe = regexp.MustCompile(`^imap:(?:uidv:\d+:)?uid:(\d+)$`)
)

// providerMessageID builds the stable provider message id for an IMAP message.
//
// Inbox messages keep the historical `imap:uid:<uid>` form so previously synced
// rows are updated instead of duplicated. Other mailboxes are namespaced by
// mailbox name because IMAP UIDs are only unique within a single mailbox.
func providerMessageID(mailboxName, role, uid string) string {
	if role == roleInbox {
		return "imap:uid:" + uid
	}
	return "imap:box:" + mailboxName + ":uid:" + uid
}

// extractImapRef resolves a provider message id back to its mailbox and UID.
//
// It returns empty strings when providerID is not an IMAP id.
func extractImapRef(providerID string) (mailboxName, uid string) {
	if m := boxedProviderIDRe.FindStringSubmatch(providerID); m != nil {
		return m[1], m[2]
	}
	if m := legacyProviderIDRe.FindStringSubmatch(providerID); m != nil {
		return "INBOX", m[1]
	}
	return "", ""
}
