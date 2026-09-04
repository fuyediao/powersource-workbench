package mcp

import (
	_ "embed"
	"encoding/base64"
)

// Embedded 128×128 GeoCRM mark for inline MCP serverInfo.icons.
//
//go:embed icon-128.png
var icon128PNG []byte

// iconDataURI returns a data:image/png;base64,… URI for the embedded mark so
// clients that honor serverInfo.icons can render without a second HTTP fetch.
func iconDataURI() string {
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(icon128PNG)
}
