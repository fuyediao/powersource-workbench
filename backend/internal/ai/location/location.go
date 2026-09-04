// Package location parses machine-readable map pin blocks out of AI model
// responses (fenced ```mjson``` or <geo_data> blocks), strips them from the
// prose shown to users, and persists parsed pin sets so clients can render
// map pins from structured data instead of re-parsing model text.
package location

import (
	"context"
	"encoding/json"
	"log"
	"regexp"
	"strconv"
	"strings"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

// Location is one map pin. The JSON shape matches the frontend ShopLocation
// type (geocrm-web/src/types.ts) so clients can consume it directly.
type Location struct {
	Name          string  `json:"name"`
	Latitude      float64 `json:"latitude"`
	Longitude     float64 `json:"longitude"`
	OpenSunday    bool    `json:"openSunday"`
	Address       string  `json:"address,omitempty"`
	Country       string  `json:"country,omitempty"`
	StateProvince string  `json:"stateProvince,omitempty"`
	City          string  `json:"city,omitempty"`
	AddressLine1  string  `json:"addressLine1,omitempty"`
	AddressLine2  string  `json:"addressLine2,omitempty"`
	PostalCode    string  `json:"postalCode,omitempty"`
	Hours         string  `json:"hours,omitempty"`
	Distance      string  `json:"distance,omitempty"`
	Description   string  `json:"description,omitempty"`
	Website       string  `json:"website,omitempty"`
}

var (
	mjsonBlockRe = regexp.MustCompile("```mjson\\s*\\n?([\\s\\S]*?)\\n?```")
	geoDataRe    = regexp.MustCompile("(?is)<geo_data>\\s*([\\s\\S]*?)\\s*</geo_data>")
)

// ParseAndStrip extracts location pins from a fenced ```mjson block or a
// hidden <geo_data> block (mjson takes priority), and returns the response
// text with those blocks removed so the UI renders prose only. Ordinary
// ```json fences are left in the prose.
//
// @param text - Raw model response text.
// @returns Parsed pins (never nil) and the stripped prose.
func ParseAndStrip(text string) (locations []Location, prose string) {
	locations = []Location{}
	if m := mjsonBlockRe.FindStringSubmatch(text); len(m) > 1 {
		if locs, ok := parseJSONArray(m[1]); ok {
			locations = locs
		}
	}
	if len(locations) == 0 {
		if m := geoDataRe.FindStringSubmatch(text); len(m) > 1 {
			if locs, ok := parseJSONArray(m[1]); ok {
				locations = locs
			}
		}
	}
	prose = strings.TrimSpace(mjsonBlockRe.ReplaceAllString(geoDataRe.ReplaceAllString(text, ""), ""))
	return locations, prose
}

func parseJSONArray(raw string) ([]Location, bool) {
	var items []map[string]any
	if err := json.Unmarshal([]byte(raw), &items); err != nil {
		return nil, false
	}
	out := make([]Location, 0, len(items))
	for _, o := range items {
		name := optStr(o["name"])
		if name == "" {
			continue
		}
		lat, latOK := toFloat(o["latitude"])
		lng, lngOK := toFloat(o["longitude"])
		if !latOK || !lngOK {
			continue
		}
		out = append(out, Location{
			Name:          name,
			Latitude:      lat,
			Longitude:     lng,
			OpenSunday:    asBool(o["openSunday"]),
			Address:       optStr(o["address"]),
			Country:       optStr(o["country"]),
			StateProvince: optStr(o["stateProvince"]),
			City:          optStr(o["city"]),
			AddressLine1:  optStr(o["addressLine1"]),
			AddressLine2:  optStr(o["addressLine2"]),
			PostalCode:    optStr(o["postalCode"]),
			Hours:         optStr(o["hours"]),
			Distance:      optStr(o["distance"]),
			Description:   optStr(o["description"]),
			Website:       optStr(o["website"]),
		})
	}
	return out, true
}

func toFloat(v any) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, true
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(t), 64)
		if err != nil {
			return 0, false
		}
		return f, true
	default:
		return 0, false
	}
}

func asBool(v any) bool {
	b, _ := v.(bool)
	return b
}

func optStr(v any) string {
	s, ok := v.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(s)
}

// Persist inserts one location-set row (service role) and returns its id.
// It is a no-op returning ("", nil) when there are no locations to save.
//
// @param source - "aichat", "mapchat", or a legacy source label.
// @param skill - Active map skill id (e.g. "map"), or "" when not applicable.
func Persist(ctx context.Context, sb *supabase.Client, userID, source, skill string, locations []Location) (string, error) {
	if len(locations) == 0 || sb == nil || userID == "" {
		return "", nil
	}
	row := map[string]any{
		"user_id":   userID,
		"source":    source,
		"locations": locations,
	}
	if skill != "" {
		row["skill"] = skill
	}
	var inserted []struct {
		ID string `json:"id"`
	}
	if err := sb.From("agent_location_sets").Insert(row).Returning().Select("id").Exec(ctx, &inserted); err != nil {
		log.Printf("ai/location: failed to persist location set (source=%s): %v", source, err)
		return "", err
	}
	if len(inserted) == 0 {
		return "", nil
	}
	return inserted[0].ID, nil
}
