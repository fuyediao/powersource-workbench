package alimail

import "testing"

func TestExpandSequenceSet(t *testing.T) {
	cases := []struct {
		in   string
		want []string
	}{
		{"304", []string{"304"}},
		{"304:306", []string{"304", "305", "306"}},
		{"1,3:5", []string{"1", "3", "4", "5"}},
		{"10:8", []string{"8", "9", "10"}},
		{"", nil},
	}
	for _, tc := range cases {
		got := expandSequenceSet(tc.in)
		if len(got) != len(tc.want) {
			t.Fatalf("expandSequenceSet(%q) = %v, want %v", tc.in, got, tc.want)
		}
		for i := range got {
			if got[i] != tc.want[i] {
				t.Fatalf("expandSequenceSet(%q)[%d] = %q, want %q", tc.in, i, got[i], tc.want[i])
			}
		}
	}
}

func TestParseCopyUIDMap(t *testing.T) {
	lines := []string{
		`* OK [COPYUID 3857529045 304:306 3955:3957] Moved`,
		`OK [COPYUID 3857529045 304:306 3955:3957] Completed`,
	}
	got := parseCopyUIDMap(lines, nil)
	want := map[string]string{"304": "3955", "305": "3956", "306": "3957"}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for k, v := range want {
		if got[k] != v {
			t.Fatalf("got[%q] = %q, want %q", k, got[k], v)
		}
	}
}

func TestParseCopyUIDMapMissing(t *testing.T) {
	got := parseCopyUIDMap([]string{`OK MOVE completed`}, nil)
	if len(got) != 0 {
		t.Fatalf("expected empty map without COPYUID, got %v", got)
	}
}

func TestResolveMailboxRoleArchive(t *testing.T) {
	if got := resolveMailboxRole(`\Archive`, "Archive"); got != roleArchive {
		t.Fatalf("special-use archive = %q", got)
	}
	if got := resolveMailboxRole("", "All Mail"); got != roleArchive {
		t.Fatalf("All Mail name = %q", got)
	}
	if got := resolveMailboxRole("", "archives"); got != roleArchive {
		t.Fatalf("archives name = %q", got)
	}
}

func TestMailboxNameForRole(t *testing.T) {
	boxes := []mailbox{
		{Name: "INBOX", Role: roleInbox},
		{Name: "Deleted Items", Role: roleTrash},
		{Name: "Junk", Role: roleSpam},
	}
	if got := mailboxNameForRole(boxes, roleTrash); got != "Deleted Items" {
		t.Fatalf("trash = %q", got)
	}
	if got := mailboxNameForRole(boxes, roleArchive); got != "" {
		t.Fatalf("missing archive should be empty, got %q", got)
	}
}
