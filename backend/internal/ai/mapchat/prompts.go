package mapchat

import "github.com/fuyediao/powersource-workbench/backend/internal/ai/location"

// SystemPrompt is the restored Search Map skill prompt for map floating chat.
// The fenced mjson block (when present) is parsed and stripped server-side.
const SystemPrompt = location.MapSearchInstructions
