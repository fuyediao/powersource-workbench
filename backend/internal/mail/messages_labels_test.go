package mail

import (
	"slices"
	"testing"
)

func TestApplyTrashLabelsRemovesSpam(t *testing.T) {
	got := applyTrashLabels([]string{"SPAM", "UNREAD"})
	want := []string{"UNREAD", "TRASH"}
	if !slices.Equal(got, want) {
		t.Fatalf("applyTrashLabels() = %v, want %v", got, want)
	}
}

func TestApplyTrashLabelsFromInbox(t *testing.T) {
	got := applyTrashLabels([]string{"INBOX", "CATEGORY_PROMOTIONS"})
	want := []string{"CATEGORY_PROMOTIONS", "TRASH"}
	if !slices.Equal(got, want) {
		t.Fatalf("applyTrashLabels() = %v, want %v", got, want)
	}
}
