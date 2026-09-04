package mail

import "testing"

func TestParseMailSearchTokens(t *testing.T) {
	got := parseMailSearch(`from:ada@example.com subject:"launch plan" is:unread has:attachment after:2026-01-01 hello`)
	if got.From != "ada@example.com" {
		t.Fatalf("From = %q", got.From)
	}
	if got.Subject != "launch plan" {
		t.Fatalf("Subject = %q", got.Subject)
	}
	if got.IsUnread == nil || !*got.IsUnread {
		t.Fatalf("IsUnread = %v", got.IsUnread)
	}
	if got.HasAttach == nil || !*got.HasAttach {
		t.Fatalf("HasAttach = %v", got.HasAttach)
	}
	if got.After == nil {
		t.Fatal("After missing")
	}
	if got.FreeText != "hello" {
		t.Fatalf("FreeText = %q", got.FreeText)
	}
}

func TestInTokenToLabel(t *testing.T) {
	if inTokenToLabel("inbox") != "INBOX" {
		t.Fatal("inbox")
	}
	if inTokenToLabel("all") != "ALL" {
		t.Fatal("all")
	}
}
