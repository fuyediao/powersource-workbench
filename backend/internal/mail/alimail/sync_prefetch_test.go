package alimail

import (
	"testing"
	"time"
)

func TestCapabilityHasToken(t *testing.T) {
	t.Parallel()
	lines := []string{"* CAPABILITY IMAP4rev1 IDLE CONDSTORE LITERAL+"}
	if !capabilityHasToken(lines, "CONDSTORE") {
		t.Fatal("expected CONDSTORE")
	}
	if !capabilityHasToken(lines, "IDLE") {
		t.Fatal("expected IDLE")
	}
	if capabilityHasToken(lines, "QRESYNC") {
		t.Fatal("did not expect QRESYNC")
	}
}

func TestMessageWithinPrefetchWindow(t *testing.T) {
	t.Parallel()
	cutoff := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	if !messageWithinPrefetchWindow("", cutoff) {
		t.Fatal("empty receivedAt should prefetch")
	}
	if !messageWithinPrefetchWindow("2026-07-01T12:00:00Z", cutoff) {
		t.Fatal("recent message should prefetch")
	}
	if messageWithinPrefetchWindow("2026-01-01T12:00:00Z", cutoff) {
		t.Fatal("old message should not prefetch")
	}
}
