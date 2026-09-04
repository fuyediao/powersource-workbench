package alimail

import (
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// Mailbox roles map an IMAP mailbox onto the mail sidebar folders.
const (
	roleInbox   = "inbox"
	roleSent    = "sent"
	roleDraft   = "draft"
	roleTrash   = "trash"
	roleSpam    = "spam"
	roleArchive = "archive"
)

// mailbox is one IMAP mailbox that maps onto a sidebar folder.
type mailbox struct {
	Name string
	Role string
}

// mailboxOrder keeps the inbox first so that a failing secondary mailbox never
// masks an inbox error.
var mailboxOrder = map[string]int{
	roleInbox: 0, roleSent: 1, roleDraft: 2, roleSpam: 3, roleTrash: 4, roleArchive: 5,
}

// specialUseRole maps RFC 6154 mailbox attributes to a sidebar role.
var specialUseRole = map[string]string{
	`\sent`:    roleSent,
	`\drafts`:  roleDraft,
	`\draft`:   roleDraft,
	`\trash`:   roleTrash,
	`\junk`:    roleSpam,
	`\spam`:    roleSpam,
	`\inbox`:   roleInbox,
	`\archive`: roleArchive,
}

// mailboxNameRole maps common mailbox names to a sidebar role for servers that
// do not advertise special-use attributes.
var mailboxNameRole = map[string]string{
	"inbox":         roleInbox,
	"sent":          roleSent,
	"sent messages": roleSent,
	"sent items":    roleSent,
	"draft":         roleDraft,
	"drafts":        roleDraft,
	"trash":         roleTrash,
	"deleted":       roleTrash,
	"deleted items": roleTrash,
	"junk":          roleSpam,
	"spam":          roleSpam,
	"junk e-mail":   roleSpam,
	"archive":       roleArchive,
	"archives":      roleArchive,
	"all mail":      roleArchive,
}

// listLineRe captures the attribute list and mailbox name of a LIST response.
var listLineRe = regexp.MustCompile(`^\* LIST \(([^)]*)\)\s+(?:"[^"]*"|NIL)\s+(.+)$`)

// listMailboxes returns the mailboxes that map onto a sidebar folder.
//
// Mailboxes without a known role (user-created folders) are skipped because the
// mail UI has no place to show them yet.
func listMailboxes(c *imapConn) ([]mailbox, error) {
	lines, err := c.command(`LIST "" "*"`)
	if err != nil {
		return nil, err
	}
	seen := make(map[string]bool)
	out := make([]mailbox, 0, len(mailboxOrder))
	for _, line := range lines {
		m := listLineRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		name := unquoteIMAP(strings.TrimSpace(m[2]))
		role := resolveMailboxRole(m[1], name)
		if name == "" || role == "" || seen[role] {
			continue
		}
		seen[role] = true
		out = append(out, mailbox{Name: name, Role: role})
	}
	if !seen[roleInbox] {
		out = append(out, mailbox{Name: "INBOX", Role: roleInbox})
	}
	sort.SliceStable(out, func(i, j int) bool {
		return mailboxOrder[out[i].Role] < mailboxOrder[out[j].Role]
	})
	return out, nil
}

// resolveMailboxRole derives a sidebar role from LIST attributes, falling back
// to the mailbox name.
func resolveMailboxRole(attributes, name string) string {
	for _, attr := range strings.Fields(attributes) {
		if role, ok := specialUseRole[strings.ToLower(attr)]; ok {
			return role
		}
	}
	return mailboxNameRole[strings.ToLower(name)]
}

// unquoteIMAP removes the surrounding quotes of an IMAP quoted string.
func unquoteIMAP(s string) string {
	if len(s) >= 2 && strings.HasPrefix(s, `"`) && strings.HasSuffix(s, `"`) {
		return strings.NewReplacer(`\"`, `"`, `\\`, `\`).Replace(s[1 : len(s)-1])
	}
	return s
}

// selectMailbox selects a mailbox for read/write access.
func (c *imapConn) selectMailbox(name string) error {
	_, err := c.command("SELECT " + quoteIMAP(name))
	return err
}

var (
	uidValidityRe   = regexp.MustCompile(`UIDVALIDITY (\d+)`)
	uidNextRe       = regexp.MustCompile(`UIDNEXT (\d+)`)
	highestModSeqRe = regexp.MustCompile(`HIGHESTMODSEQ (\d+)`)
)

// selectMailboxStatus selects a mailbox and parses UIDVALIDITY / UIDNEXT /
// HIGHESTMODSEQ from the untagged SELECT response. HIGHESTMODSEQ is zero when
// the server does not advertise CONDSTORE.
func (c *imapConn) selectMailboxStatus(name string) (uidValidity, uidNext, highestModSeq int64, err error) {
	lines, cerr := c.command("SELECT " + quoteIMAP(name))
	if cerr != nil {
		return 0, 0, 0, cerr
	}
	for _, line := range lines {
		if m := uidValidityRe.FindStringSubmatch(line); m != nil {
			uidValidity, _ = strconv.ParseInt(m[1], 10, 64)
		}
		if m := uidNextRe.FindStringSubmatch(line); m != nil {
			uidNext, _ = strconv.ParseInt(m[1], 10, 64)
		}
		if m := highestModSeqRe.FindStringSubmatch(line); m != nil {
			highestModSeq, _ = strconv.ParseInt(m[1], 10, 64)
		}
	}
	return uidValidity, uidNext, highestModSeq, nil
}
