package download

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/fuyediao/powersource-workbench/backend/internal/config"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

func TestVersionFromRelease(t *testing.T) {
	if got := versionFromRelease("beta0.1.0"); got != "0.1.0" {
		t.Fatalf("versionFromRelease(beta0.1.0) = %q, want 0.1.0", got)
	}
	if got := versionFromRelease("0.2.1"); got != "0.2.1" {
		t.Fatalf("versionFromRelease(0.2.1) = %q, want 0.2.1", got)
	}
}

func TestPickLatestFolderBeta(t *testing.T) {
	objects := []supabase.StorageObject{
		{Name: "beta0.1.0"},
		{Name: "beta0.2.0"},
		{Name: "stable1.0.0"},
	}
	got := pickLatestFolder(objects, "beta")
	if got != "beta0.2.0" {
		t.Fatalf("pickLatestFolder beta = %q, want beta0.2.0", got)
	}
	got = pickLatestFolder(objects, "latest")
	if got != "stable1.0.0" {
		t.Fatalf("pickLatestFolder latest = %q, want stable1.0.0", got)
	}
}

func TestOfficialOutranksHigherBeta(t *testing.T) {
	if compareReleaseIDs("v0.1.0", "beta1.0.0") <= 0 {
		t.Fatal("v0.1.0 must outrank beta1.0.0")
	}
	if compareReleaseIDs("0.1.0", "beta1.0.0") <= 0 {
		t.Fatal("0.1.0 must outrank beta1.0.0")
	}
	if compareReleaseIDs("beta1.0.0", "beta0.1.0") <= 0 {
		t.Fatal("beta1.0.0 must outrank beta0.1.0")
	}
	if compareReleaseIDs("v1.0.0", "v0.1.0") <= 0 {
		t.Fatal("v1.0.0 must outrank v0.1.0")
	}
	objects := []supabase.StorageObject{
		{Name: "beta1.0.0"},
		{Name: "v0.1.0"},
	}
	got := pickLatestFolder(objects, "latest")
	if got != "v0.1.0" {
		t.Fatalf("latest = %q, want v0.1.0 (official over higher beta)", got)
	}
}

func TestPickInstallerPrefersPlatformArch(t *testing.T) {
	id := "file"
	objects := []supabase.StorageObject{
		{Name: "PowerSource-Workbench-0.1.0-x64.dmg", ID: &id},
		{Name: "PowerSource-Workbench-0.1.0-arm64.dmg", ID: &id},
	}
	got := pickInstaller("macos-m", objects)
	if got == nil || got.Name != "PowerSource-Workbench-0.1.0-arm64.dmg" {
		t.Fatalf("macos-m installer = %+v, want arm64 dmg", got)
	}
	got = pickInstaller("macos-i", objects)
	if got == nil || got.Name != "PowerSource-Workbench-0.1.0-x64.dmg" {
		t.Fatalf("macos-i installer = %+v, want x64 dmg", got)
	}
}

func TestServeReleaseInvalidID(t *testing.T) {
	h := New(config.Env{}, nil)
	req := httptest.NewRequest(http.MethodGet, "/macos-m/../secret", nil)
	rec := httptest.NewRecorder()
	h.serveRelease(rec, req, "macos-m", "../secret")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestInstallerRequestURLUsesForwardedOrigin(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/macos-m/beta0.1.0?format=json", nil)
	req.Host = "127.0.0.1:3001"
	req.Header.Set("X-Forwarded-Proto", "https")
	req.Header.Set("X-Forwarded-Host", "download.powersource.work")
	got := installerRequestURL(req)
	want := "https://download.powersource.work/macos-m/beta0.1.0"
	if got != want {
		t.Fatalf("installerRequestURL = %q, want %q", got, want)
	}
}

func TestServeReleaseNoStorage(t *testing.T) {
	h := New(config.Env{}, nil)
	req := httptest.NewRequest(http.MethodGet, "/windows/beta0.1.0", nil)
	rec := httptest.NewRecorder()
	h.serveRelease(rec, req, "windows", "beta0.1.0")
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
}
