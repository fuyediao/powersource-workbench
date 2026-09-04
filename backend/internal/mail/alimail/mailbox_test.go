package alimail

import "testing"

func TestResolveMailboxRole(t *testing.T) {
	cases := []struct {
		attributes string
		name       string
		want       string
	}{
		{`\Junk`, "Spam", roleSpam},
		{`\Sent`, "Sent", roleSent},
		{`\Trash`, "Trash", roleTrash},
		{`\Drafts`, "Draft", roleDraft},
		{``, "Inbox", roleInbox},
		{``, "Sent Messages", roleSent},
		{`\HasNoChildren`, "Project X", ""},
	}
	for _, tc := range cases {
		if got := resolveMailboxRole(tc.attributes, tc.name); got != tc.want {
			t.Errorf("resolveMailboxRole(%q, %q) = %q, want %q", tc.attributes, tc.name, got, tc.want)
		}
	}
}

func TestProviderMessageIDRoundTrip(t *testing.T) {
	inbox := providerMessageID("Inbox", roleInbox, "24")
	if inbox != "imap:uid:24" {
		t.Fatalf("inbox id = %q, want imap:uid:24", inbox)
	}
	spam := providerMessageID("Spam", roleSpam, "1")
	if spam != "imap:box:Spam:uid:1" {
		t.Fatalf("spam id = %q, want imap:box:Spam:uid:1", spam)
	}

	cases := map[string][2]string{
		"imap:uid:24":          {"INBOX", "24"},
		"imap:uidv:2:uid:20":   {"INBOX", "20"},
		"imap:box:Spam:uid:1":  {"Spam", "1"},
		"imap:box:Sent:uid:12": {"Sent", "12"},
		"gmail:abc":            {"", ""},
	}
	for providerID, want := range cases {
		mailboxName, uid := extractImapRef(providerID)
		if mailboxName != want[0] || uid != want[1] {
			t.Errorf("extractImapRef(%q) = (%q, %q), want (%q, %q)", providerID, mailboxName, uid, want[0], want[1])
		}
	}
}

func TestMailboxRoleForProviderRef(t *testing.T) {
	cases := map[string]string{
		"imap:uid:24":           roleInbox,
		"imap:uidv:2:uid:20":    roleInbox,
		"imap:box:Spam:uid:1":   roleSpam,
		"imap:box:Sent:uid:8":   roleSent,
		"imap:box:Draft:uid:2":  roleDraft,
		"imap:box:Trash:uid:3":  roleTrash,
		"imap:box:Custom:uid:4": "",
	}
	for providerID, want := range cases {
		mailboxName, _ := extractImapRef(providerID)
		if got := mailboxRoleForProviderRef(mailboxName, providerID); got != want {
			t.Errorf("mailboxRoleForProviderRef(%q) = %q, want %q", providerID, got, want)
		}
	}
}
