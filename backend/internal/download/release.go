package download

import (
	"context"
	"io"
	"net/http"
	"path"
	"regexp"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

// desktopReleasesBucket is the public Storage bucket for desktop installers.
const desktopReleasesBucket = "desktop-releases"

var (
	releaseIDRe        = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$`)
	dottedVersionRe    = regexp.MustCompile(`(\d+)\.(\d+)\.(\d+)`)
	installerExt       = []string{".dmg", ".pkg", ".exe", ".msi", ".zip", ".appimage"}
	desktopPlatformSet = map[string]struct{}{
		"macos-m": {},
		"macos-i": {},
		"windows": {},
	}
	desktopPlatforms = []string{"macos-m", "macos-i", "windows"}
)

type releaseManifest struct {
	OK          bool   `json:"ok"`
	Platform    string `json:"platform"`
	Release     string `json:"release"`
	Channel     string `json:"channel"`
	Version     string `json:"version"`
	FileName    string `json:"fileName"`
	FileSize    int64  `json:"fileSize"`
	DownloadURL string `json:"downloadUrl"`
	// MinSupportedVersion is the server-side update floor (dotted version,
	// e.g. "0.1.0"). Omitted when DESKTOP_MIN_SUPPORTED_VERSION is unset.
	MinSupportedVersion string `json:"minSupportedVersion,omitempty"`
}

// parsedRelease is a folder id split into channel + dotted version.
type parsedRelease struct {
	Channel string
	Version string
	Rank    int
}

// MountReleaseRoutes registers GET/HEAD /{macos-m|macos-i|windows}/{release}
// on r. Used both under /download and at the API root so
// download.{domain}/{platform}/{release} can proxy to the same handler.
func (h *Handler) MountReleaseRoutes(r chi.Router) {
	for _, platform := range desktopPlatforms {
		p := platform
		r.Get("/"+p+"/{release}", h.releaseFor(p))
		r.Head("/"+p+"/{release}", h.releaseFor(p))
	}
}

func (h *Handler) releaseFor(platform string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		h.serveRelease(w, r, platform, strings.TrimSpace(chi.URLParam(r, "release")))
	}
}

func (h *Handler) serveRelease(w http.ResponseWriter, r *http.Request, platform, release string) {
	if _, ok := desktopPlatformSet[platform]; !ok {
		httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "Unknown platform"})
		return
	}
	if !releaseIDRe.MatchString(release) {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "Invalid release"})
		return
	}
	if h.sb == nil {
		httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"ok": false, "error": "Downloads are not configured"})
		return
	}

	folder, err := h.resolveReleaseFolder(r.Context(), platform, release)
	if err != nil {
		httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"ok": false, "error": "Failed to list desktop releases"})
		return
	}
	if folder == "" {
		httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "Release not found"})
		return
	}

	objects, err := h.sb.StorageList(r.Context(), desktopReleasesBucket, platform+"/"+folder, 100)
	if err != nil {
		httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"ok": false, "error": "Failed to list desktop releases"})
		return
	}
	file := pickInstaller(platform, objects)
	if file == nil {
		httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "Release not found"})
		return
	}

	objectPath := platform + "/" + folder + "/" + path.Base(file.Name)
	parsed := parseReleaseID(folder)
	manifest := releaseManifest{
		OK:                  true,
		Platform:            platform,
		Release:             folder,
		Channel:             parsed.Channel,
		Version:             parsed.Version,
		FileName:            path.Base(file.Name),
		FileSize:            file.SizeBytes(),
		DownloadURL:         installerRequestURL(r),
		MinSupportedVersion: h.desktopMinSupportedVersion(),
	}

	if r.Method == http.MethodHead || wantsJSON(r) {
		httpx.WriteJSON(w, http.StatusOK, manifest)
		return
	}
	h.streamInstaller(w, r, objectPath, manifest)
}

// desktopMinSupportedVersion returns the configured update floor as a plain
// dotted version, or "" when unset or malformed.
func (h *Handler) desktopMinSupportedVersion() string {
	raw := strings.TrimSpace(h.env.DesktopMinSupportedVersion)
	if raw == "" {
		return ""
	}
	if !dottedVersionRe.MatchString(raw) {
		return ""
	}
	return versionFromRelease(raw)
}

// installerRequestURL returns this release endpoint without manifest query
// parameters. A normal GET streams bytes; JSON clients still receive metadata.
func installerRequestURL(r *http.Request) string {
	scheme := strings.TrimSpace(r.Header.Get("X-Forwarded-Proto"))
	if scheme == "" {
		if r.TLS != nil {
			scheme = "https"
		} else {
			scheme = "http"
		}
	}
	host := r.Host
	if forwardedHost := strings.TrimSpace(r.Header.Get("X-Forwarded-Host")); forwardedHost != "" {
		host = forwardedHost
	}
	return scheme + "://" + host + r.URL.Path
}

// streamInstaller proxies an object through the process-wide download limiter.
func (h *Handler) streamInstaller(w http.ResponseWriter, r *http.Request, objectPath string, manifest releaseManifest) {
	resp, err := h.sb.StorageOpen(
		r.Context(), desktopReleasesBucket, objectPath,
		r.Header.Get("Range"), r.Header.Get("If-Range"),
	)
	if err != nil {
		httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"ok": false, "error": "Failed to open installer"})
		return
	}
	defer func() { _ = resp.Body.Close() }()

	for _, header := range []string{"Accept-Ranges", "Content-Length", "Content-Range", "Content-Type", "ETag", "Last-Modified"} {
		if value := resp.Header.Get(header); value != "" {
			w.Header().Set(header, value)
		}
	}
	w.Header().Set("Content-Disposition", `attachment; filename="`+strings.ReplaceAll(manifest.FileName, `"`, "")+`"`)
	w.WriteHeader(resp.StatusCode)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		_, _ = io.CopyN(w, resp.Body, 64<<10)
		return
	}

	buf := make([]byte, 32<<10)
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if err := h.downloadLimiter.wait(r.Context().Done(), n); err != nil {
				return
			}
			if _, err := w.Write(buf[:n]); err != nil {
				return
			}
			if flusher, ok := w.(http.Flusher); ok {
				flusher.Flush()
			}
		}
		if readErr != nil {
			return
		}
	}
}

// resolveReleaseFolder maps latest/beta aliases to a concrete folder name.
func (h *Handler) resolveReleaseFolder(ctx context.Context, platform, release string) (string, error) {
	if release != "latest" && release != "beta" {
		return release, nil
	}
	objects, err := h.sb.StorageList(ctx, desktopReleasesBucket, platform, 200)
	if err != nil {
		return "", err
	}
	return pickLatestFolder(objects, release), nil
}

// wantsJSON reports whether the client asked for a JSON manifest.
func wantsJSON(r *http.Request) bool {
	accept := strings.ToLower(r.Header.Get("Accept"))
	if strings.Contains(accept, "application/json") {
		return true
	}
	return strings.EqualFold(r.URL.Query().Get("format"), "json")
}

// versionFromRelease extracts a dotted version from a release id such as beta0.1.0.
func versionFromRelease(release string) string {
	m := dottedVersionRe.FindStringSubmatch(release)
	if m == nil {
		return release
	}
	return m[1] + "." + m[2] + "." + m[3]
}

// parseReleaseID splits a folder id into channel and dotted version.
// Official/stable ids (v0.1.0, 0.1.0, stable0.1.0) outrank any beta id,
// including a higher numeric beta such as beta1.0.0.
func parseReleaseID(id string) parsedRelease {
	ver := versionFromRelease(id)
	lower := strings.ToLower(strings.TrimSpace(id))
	if strings.HasPrefix(lower, "beta") || strings.Contains(lower, "-beta") {
		return parsedRelease{Channel: "beta", Version: ver, Rank: 0}
	}
	return parsedRelease{Channel: "stable", Version: ver, Rank: 1}
}

// compareReleaseIDs ranks two folder ids. Official/stable always beats beta;
// the dotted version is compared only within the same channel.
func compareReleaseIDs(a, b string) int {
	pa, pb := parseReleaseID(a), parseReleaseID(b)
	if pa.Rank != pb.Rank {
		return pa.Rank - pb.Rank
	}
	if versionGreater(pa.Version, pb.Version) {
		return 1
	}
	if versionGreater(pb.Version, pa.Version) {
		return -1
	}
	return 0
}

// pickLatestFolder chooses the highest-ranked folder under a platform prefix.
// channel "beta" only considers beta folders; "latest" prefers official over beta.
func pickLatestFolder(objects []supabase.StorageObject, channel string) string {
	best := ""
	for _, obj := range objects {
		name := strings.Trim(obj.Name, "/")
		if name == "" {
			continue
		}
		folder := name
		if i := strings.IndexByte(name, '/'); i >= 0 {
			folder = name[:i]
		}
		parsed := parseReleaseID(folder)
		if !dottedVersionRe.MatchString(parsed.Version) {
			continue
		}
		if channel == "beta" && parsed.Channel != "beta" {
			continue
		}
		if best == "" || compareReleaseIDs(folder, best) > 0 {
			best = folder
		}
	}
	return best
}

// pickInstaller selects the installer object for a platform from a folder listing.
func pickInstaller(platform string, objects []supabase.StorageObject) *supabase.StorageObject {
	var candidates []*supabase.StorageObject
	for i := range objects {
		obj := &objects[i]
		if obj.IsFolder() {
			continue
		}
		lower := strings.ToLower(path.Base(obj.Name))
		if !hasInstallerExt(lower) {
			continue
		}
		candidates = append(candidates, obj)
	}
	if len(candidates) == 0 {
		return nil
	}
	best := candidates[0]
	bestScore := installerScore(platform, best.Name)
	for _, obj := range candidates[1:] {
		score := installerScore(platform, obj.Name)
		if score > bestScore {
			best = obj
			bestScore = score
		}
	}
	return best
}

func hasInstallerExt(name string) bool {
	for _, ext := range installerExt {
		if strings.HasSuffix(name, ext) {
			return true
		}
	}
	return false
}

func installerScore(platform, name string) int {
	lower := strings.ToLower(name)
	score := 1
	switch platform {
	case "macos-m":
		if strings.Contains(lower, "arm64") || strings.Contains(lower, "aarch64") || strings.Contains(lower, "apple") {
			score += 4
		}
		if strings.HasSuffix(lower, ".dmg") {
			score += 2
		}
	case "macos-i":
		if strings.Contains(lower, "x64") || strings.Contains(lower, "x86_64") || strings.Contains(lower, "intel") {
			score += 4
		}
		if strings.HasSuffix(lower, ".dmg") {
			score += 2
		}
	case "windows":
		if strings.HasSuffix(lower, ".exe") {
			score += 3
		} else if strings.HasSuffix(lower, ".msi") {
			score += 2
		}
	}
	return score
}

func versionGreater(a, b string) bool {
	am, ai, ap, aok := parseDottedVersion(a)
	bm, bi, bp, bok := parseDottedVersion(b)
	if !aok || !bok {
		return a > b
	}
	if am != bm {
		return am > bm
	}
	if ai != bi {
		return ai > bi
	}
	return ap > bp
}

func parseDottedVersion(s string) (major, minor, patch int, ok bool) {
	m := dottedVersionRe.FindStringSubmatch(s)
	if m == nil {
		return 0, 0, 0, false
	}
	major, _ = strconv.Atoi(m[1])
	minor, _ = strconv.Atoi(m[2])
	patch, _ = strconv.Atoi(m[3])
	return major, minor, patch, true
}
