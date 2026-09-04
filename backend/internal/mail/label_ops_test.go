package mail

import (
	"slices"
	"testing"
)

func TestApplyArchiveLabels(t *testing.T) {
	got := applyArchiveLabels([]string{"INBOX", "UNREAD"})
	want := []string{"UNREAD", "ARCHIVE"}
	if !slices.Equal(got, want) {
		t.Fatalf("applyArchiveLabels() = %v, want %v", got, want)
	}
}

func TestApplySpamAndNotSpam(t *testing.T) {
	spam := applySpamLabels([]string{"INBOX", "CATEGORY_UPDATES"})
	if !slices.Equal(spam, []string{"CATEGORY_UPDATES", "SPAM"}) {
		t.Fatalf("spam = %v", spam)
	}
	inbox := applyNotSpamLabels(spam)
	if !slices.Equal(inbox, []string{"CATEGORY_UPDATES", "INBOX"}) {
		t.Fatalf("not spam = %v", inbox)
	}
}

func TestApplyUnarchiveAndUntrash(t *testing.T) {
	inbox := applyUnarchiveLabels([]string{"ARCHIVE", "UNREAD"})
	if !slices.Equal(inbox, []string{"UNREAD", "INBOX"}) {
		t.Fatalf("unarchive = %v", inbox)
	}
	restored := applyUntrashLabels([]string{"TRASH", "UNREAD"})
	if !slices.Equal(restored, []string{"UNREAD", "INBOX"}) {
		t.Fatalf("untrash = %v", restored)
	}
}
