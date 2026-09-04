package mcp

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
)

// customerLogoAccess grants the write needed for the customer_logo kind.
func customerLogoAccess() *access {
	acc := memberAccess("desktop_admin")
	acc.writes[writeKey("admin", "customers", "update")] = true
	return acc
}

func TestResolveUploadKindRejectsUnknownKind(t *testing.T) {
	acc := memberAccess("desktop_admin")
	if _, err := resolveUploadKind(acc, "not_a_real_kind"); err == nil {
		t.Fatal("unknown kind key was accepted")
	}
}

func TestResolveUploadKindDeniesWithoutWriteGrant(t *testing.T) {
	acc := memberAccess("desktop_admin")
	if _, err := resolveUploadKind(acc, "customer_logo"); err == nil {
		t.Fatal("customer_logo resolved without an update grant on customers")
	}
	acc.writes[writeKey("admin", "customers", "update")] = true
	if _, err := resolveUploadKind(acc, "customer_logo"); err != nil {
		t.Fatalf("customer_logo denied despite a matching grant: %v", err)
	}
}

func TestResolveUploadKindAllowsSelfOnlyWithoutAnyGrant(t *testing.T) {
	acc := memberAccess()
	if _, err := resolveUploadKind(acc, "profile_avatar"); err != nil {
		t.Fatalf("profile_avatar (self_only) should not require any desktop write grant: %v", err)
	}
}

func TestValidateMIMERejectsDisallowedType(t *testing.T) {
	kind := lookupUploadKind("customer_logo")
	if err := validateMIME(kind, "image/gif"); err == nil {
		t.Fatal("image/gif accepted for an image kind that only allows jpeg/png/webp")
	}
	if err := validateMIME(kind, "image/png"); err != nil {
		t.Fatalf("image/png rejected: %v", err)
	}
	// Parameters after ';' (e.g. a charset) must not defeat the allowlist.
	if err := validateMIME(kind, "image/jpeg; charset=binary"); err != nil {
		t.Fatalf("image/jpeg with parameters rejected: %v", err)
	}
}

func TestIngestBytesEnforcesSizeCap(t *testing.T) {
	oversize := strings.Repeat("A", 100)
	encoded := base64.StdEncoding.EncodeToString([]byte(oversize))
	_, _, err := ingestBytes(context.Background(), uploadArgs{DataBase64: encoded, MimeType: "image/png"}, 10)
	if err == nil {
		t.Fatal("payload over the byte cap was accepted")
	}
	if !strings.Contains(err.Error(), "byte limit") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestIngestBytesRejectsBothSourcesAndNeitherSource(t *testing.T) {
	if _, _, err := ingestBytes(context.Background(), uploadArgs{DataBase64: "abc=", SourceURL: "https://example.com/a.png"}, 1<<20); err == nil {
		t.Fatal("supplying both data_base64 and source_url was accepted")
	}
	if _, _, err := ingestBytes(context.Background(), uploadArgs{}, 1<<20); err == nil {
		t.Fatal("missing data_base64 and source_url was accepted")
	}
}

func TestDecodeBase64AcceptsDataURLPrefix(t *testing.T) {
	raw := []byte("hello world")
	encoded := base64.StdEncoding.EncodeToString(raw)
	decoded, err := decodeBase64("data:image/png;base64," + encoded)
	if err != nil {
		t.Fatalf("decodeBase64: %v", err)
	}
	if string(decoded) != string(raw) {
		t.Fatalf("decoded = %q, want %q", decoded, raw)
	}
	if _, err := decodeBase64("not-base64!!!"); err == nil {
		t.Fatal("invalid base64 was accepted")
	}
}

func TestDescribeUploadKindsScopedToGrants(t *testing.T) {
	acc := memberAccess("desktop_admin")
	payload := describeUploadKinds(acc)
	kinds, _ := payload["kinds"].([]map[string]any)

	hasKind := func(key string) bool {
		for _, k := range kinds {
			if k["kind"] == key {
				return true
			}
		}
		return false
	}
	if !hasKind("profile_avatar") {
		t.Fatal("self_only kind profile_avatar should always be listed")
	}
	if hasKind("customer_logo") {
		t.Fatal("customer_logo listed without an update grant on customers")
	}

	acc.writes[writeKey("admin", "customers", "update")] = true
	payload = describeUploadKinds(acc)
	kinds, _ = payload["kinds"].([]map[string]any)
	if !hasKind("customer_logo") {
		t.Fatal("customer_logo missing despite a matching grant")
	}
}

func TestRejectBlockedColumnsPointsAtUploadFile(t *testing.T) {
	customers := lookupEntity("customers")
	err := rejectBlockedColumns(customers, map[string]json.RawMessage{"logo_url": json.RawMessage(`"https://evil.example/x.png"`)})
	if err == nil {
		t.Fatal("logo_url write through update_record was accepted")
	}
	if !strings.Contains(err.Error(), "upload_file") {
		t.Fatalf("error should point at upload_file: %v", err)
	}
	if err := rejectBlockedColumns(customers, map[string]json.RawMessage{"company_name": json.RawMessage(`"Acme"`)}); err != nil {
		t.Fatalf("unrelated column rejected: %v", err)
	}
}

func TestUploadFileUpsertsCustomerLogo(t *testing.T) {
	const customerID = "22222222-2222-2222-2222-222222222222"
	fake := newFakeRest(t, map[string]string{
		"customers": `[{"id":"` + customerID + `","group_id":"11111111-2222-3333-4444-555555555555"}]`,
	})
	acc := customerLogoAccess()

	result, err := uploadFile(context.Background(), fake.client(), acc, uploadArgs{
		Kind:       "customer_logo",
		ParentID:   customerID,
		Filename:   "logo.png",
		MimeType:   "image/png",
		DataBase64: base64.StdEncoding.EncodeToString([]byte("fake-image-bytes")),
	})
	if err != nil {
		t.Fatalf("uploadFile: %v", err)
	}
	wantPath := acc.UserID + "/" + customerID + "/logo.webp"
	if result["object_path"] != wantPath {
		t.Fatalf("object_path = %v, want %s (upsert must reuse a stable path)", result["object_path"], wantPath)
	}
	url, _ := result["url"].(string)
	if !strings.Contains(url, "customer-logos") {
		t.Fatalf("url %q missing the customer-logos bucket", url)
	}
}

func TestUploadFileDeniesUnauthorizedParentScope(t *testing.T) {
	// No fake rows configured for "customers": PostgREST-equivalent lookup
	// returns an empty array, so the parent id is outside the caller's scope.
	fake := newFakeRest(t, nil)
	acc := customerLogoAccess()

	_, err := uploadFile(context.Background(), fake.client(), acc, uploadArgs{
		Kind:       "customer_logo",
		ParentID:   "22222222-2222-2222-2222-222222222222",
		Filename:   "logo.png",
		MimeType:   "image/png",
		DataBase64: base64.StdEncoding.EncodeToString([]byte("fake-image-bytes")),
	})
	if err == nil {
		t.Fatal("upload succeeded for a customer outside the caller's scope")
	}
}

func TestUploadKindsRegistryIsConsistent(t *testing.T) {
	seen := map[string]bool{}
	for _, kind := range uploadKinds {
		if seen[kind.Key] {
			t.Fatalf("duplicate upload kind key %s", kind.Key)
		}
		seen[kind.Key] = true
		if kind.Bucket == "" || kind.Desc == "" || kind.MaxBytes <= 0 {
			t.Fatalf("upload kind %s is missing bucket, description, or max_bytes", kind.Key)
		}
		if kind.SelfOnly {
			continue
		}
		if kind.ParentEntity == "" || lookupEntity(kind.ParentEntity) == nil {
			t.Fatalf("upload kind %s has an unresolvable parent entity %q", kind.Key, kind.ParentEntity)
		}
		if kind.TargetEntity == "" || lookupEntity(kind.TargetEntity) == nil {
			t.Fatalf("upload kind %s has an unresolvable target entity %q", kind.Key, kind.TargetEntity)
		}
		if lookupEntity(kind.TargetEntity).Write == nil {
			t.Fatalf("upload kind %s targets %s, which has no Write gate", kind.Key, kind.TargetEntity)
		}
	}
}
