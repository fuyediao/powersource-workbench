package mail

import (
	"encoding/json"
	"testing"
)

func TestKeepCustomerMailBox(t *testing.T) {
	t.Parallel()
	targets := map[string]struct{}{
		"contact@mail.nextorch-te.com": {},
		"contact@geocrm.org":           {},
	}

	fromCustomer := map[string]any{
		"from_address": "NEXTORCH T&E <contact@mail.nextorch-te.com>",
		"to_addresses": []any{map[string]any{"email": "lovewxy1126@gmail.com"}},
	}
	toCustomer := map[string]any{
		"from_address": "l13421227891@gmail.com",
		"to_addresses": json.RawMessage(
			`[{"email":"lovewxy1126@gmail.com"},{"email":"contact@mail.nextorch-te.com"}]`,
		),
	}
	ccCustomer := map[string]any{
		"from_address": "l13421227891@gmail.com",
		"to_addresses": []any{map[string]any{"email": "lovewxy1126@gmail.com"}},
		"cc_addresses": []any{map[string]any{"email": "contact@geocrm.org"}},
	}
	neitherCustomer := map[string]any{
		"from_address": "l13421227891@gmail.com",
		"to_addresses": []any{map[string]any{"email": "lovewxy1126@gmail.com"}},
	}

	// From is the customer mailbox: belongs in Inbox, not Sent.
	fromHit, toHit := customerMailHits(fromCustomer, targets)
	if !fromHit || toHit {
		t.Fatalf("from customer: fromHit=%v toHit=%v", fromHit, toHit)
	}
	if !keepCustomerMailBox("inbox", fromHit, toHit) {
		t.Fatal("mail from a customer mailbox belongs in Inbox")
	}
	if keepCustomerMailBox("sent", fromHit, toHit) {
		t.Fatal("mail from a customer mailbox does not belong in Sent")
	}

	// To is the customer mailbox: belongs in Sent, not Inbox.
	fromHit, toHit = customerMailHits(toCustomer, targets)
	if fromHit || !toHit {
		t.Fatalf("to customer: fromHit=%v toHit=%v", fromHit, toHit)
	}
	if !keepCustomerMailBox("sent", fromHit, toHit) {
		t.Fatal("mail addressed to a customer mailbox belongs in Sent")
	}
	if keepCustomerMailBox("inbox", fromHit, toHit) {
		t.Fatal("mail addressed to a customer mailbox does not belong in Inbox")
	}

	// Cc is the customer mailbox: also counts as a Sent recipient.
	fromHit, toHit = customerMailHits(ccCustomer, targets)
	if fromHit || !toHit {
		t.Fatalf("cc customer: fromHit=%v toHit=%v", fromHit, toHit)
	}
	if !keepCustomerMailBox("sent", fromHit, toHit) {
		t.Fatal("mail copied to a customer mailbox belongs in Sent")
	}

	// Neither From nor To/Cc matches: belongs in neither box.
	fromHit, toHit = customerMailHits(neitherCustomer, targets)
	if fromHit || toHit {
		t.Fatalf("unrelated mail: fromHit=%v toHit=%v", fromHit, toHit)
	}
	if keepCustomerMailBox("inbox", fromHit, toHit) || keepCustomerMailBox("sent", fromHit, toHit) {
		t.Fatal("mail with no customer address should not appear in either box")
	}
}
