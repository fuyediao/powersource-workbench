// Package webp converts arbitrary raster images to WebP via the cwebp CLI.
//
// It is a small, dependency-free helper shared by any backend package that
// needs to mirror Electron's canvas-based WebP conversion server-side (MCP
// uploads today; TE media may adopt it later instead of its own copy).
package webp

import (
	"bytes"
	"errors"
	"image"
	// Register decoders so image.DecodeConfig can read input dimensions.
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"

	_ "golang.org/x/image/webp"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/idutil"
)

// ErrUnavailable indicates the cwebp CLI is not installed on this host.
// Callers should fall back to storing the original bytes rather than
// failing the whole upload closed.
var ErrUnavailable = errors.New("webp: cwebp binary not found")

// Convert converts input image bytes to WebP via the cwebp CLI, downscaling
// so the longest edge is at most maxEdge (maxEdge <= 0 disables downscaling).
// quality is 0-100, matching cwebp's -q flag. tmpDir is created if missing.
//
// Returns ErrUnavailable when cwebp is not installed.
func Convert(input []byte, quality, maxEdge int, tmpDir string) (data []byte, width, height int, err error) {
	if _, lookErr := exec.LookPath("cwebp"); lookErr != nil {
		return nil, 0, 0, ErrUnavailable
	}
	if err := os.MkdirAll(tmpDir, 0o755); err != nil {
		return nil, 0, 0, err
	}
	id := idutil.UUIDv4()
	inPath := filepath.Join(tmpDir, id+".in")
	outPath := filepath.Join(tmpDir, id+".webp")
	defer func() { _ = os.Remove(inPath) }()
	defer func() { _ = os.Remove(outPath) }()

	if err := os.WriteFile(inPath, input, 0o600); err != nil {
		return nil, 0, 0, err
	}

	args := []string{"-quiet", "-q", strconv.Itoa(quality)}
	if maxEdge > 0 {
		if rw, rh, ok := resizeDims(input, maxEdge); ok {
			args = append(args, "-resize", strconv.Itoa(rw), strconv.Itoa(rh))
		}
	}
	args = append(args, inPath, "-o", outPath)

	if err := exec.Command("cwebp", args...).Run(); err != nil {
		return nil, 0, 0, err
	}
	out, err := os.ReadFile(outPath)
	if err != nil {
		return nil, 0, 0, err
	}
	w, h := decodeDimensions(out)
	return out, w, h, nil
}

// resizeDims computes cwebp -resize arguments to cap the longest edge at
// maxEdge while preserving aspect ratio. ok is false when no resize is
// needed (or the input dimensions cannot be read).
func resizeDims(input []byte, maxEdge int) (int, int, bool) {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(input))
	if err != nil {
		return 0, 0, false
	}
	if cfg.Width >= cfg.Height && cfg.Width > maxEdge {
		return maxEdge, 0, true
	}
	if cfg.Height > cfg.Width && cfg.Height > maxEdge {
		return 0, maxEdge, true
	}
	return 0, 0, false
}

// decodeDimensions reads width/height from encoded image bytes, returning
// zero values when the format cannot be decoded.
func decodeDimensions(data []byte) (int, int) {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return 0, 0
	}
	return cfg.Width, cfg.Height
}
