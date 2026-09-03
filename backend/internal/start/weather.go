package start

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const weatherTimeout = 8 * time.Second

// WeatherDto is the current-conditions payload expected by the desktop widget.
type WeatherDto struct {
	TemperatureC float64 `json:"temperatureC"`
	Humidity     float64 `json:"humidity"`
	WindSpeedKmh float64 `json:"windSpeedKmh"`
	WeatherCode  float64 `json:"weatherCode"`
	Timezone     string  `json:"timezone"`
}

// PlaceSearchHit is one city / place picker result.
type PlaceSearchHit struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Detail    string  `json:"detail"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

// parseLatLon reads lat/lon query parameters in valid geographic ranges.
func parseLatLon(r *http.Request) (float64, float64, bool) {
	lat, okLat := parseCoord(r.URL.Query().Get("lat"), -90, 90)
	lon, okLon := parseCoord(r.URL.Query().Get("lon"), -180, 180)
	return lat, lon, okLat && okLon
}

func parseCoord(raw string, min, max float64) (float64, bool) {
	v, err := strconv.ParseFloat(strings.TrimSpace(raw), 64)
	if err != nil || math.IsNaN(v) || math.IsInf(v, 0) || v < min || v > max {
		return 0, false
	}
	return v, true
}

func placeLanguage(language string) string {
	switch language {
	case "zh-TW":
		return "zh-TW"
	case "zh-CN":
		return "zh"
	default:
		return "en"
	}
}

func geocodeLanguage(language string) string {
	switch language {
	case "zh-TW":
		return "zh_tw"
	case "zh-CN":
		return "zh"
	default:
		return "en"
	}
}

// fetchWeather loads current conditions from Open-Meteo.
func fetchWeather(ctx context.Context, lat, lon float64) (*WeatherDto, error) {
	u, err := url.Parse("https://api.open-meteo.com/v1/forecast")
	if err != nil {
		return nil, err
	}
	q := u.Query()
	q.Set("latitude", formatCoord(lat))
	q.Set("longitude", formatCoord(lon))
	q.Set("current", "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m")
	q.Set("timezone", "auto")
	q.Set("wind_speed_unit", "kmh")
	u.RawQuery = q.Encode()
	body, err := httpGetBytes(ctx, u.String(), weatherTimeout, map[string]string{"Accept": "application/json"})
	if err != nil {
		return nil, err
	}
	var data struct {
		Timezone string `json:"timezone"`
		Current  *struct {
			Temperature2m      *float64 `json:"temperature_2m"`
			RelativeHumidity2m *float64 `json:"relative_humidity_2m"`
			WeatherCode        *float64 `json:"weather_code"`
			WindSpeed10m       *float64 `json:"wind_speed_10m"`
		} `json:"current"`
	}
	if json.Unmarshal(body, &data) != nil || data.Current == nil || data.Current.Temperature2m == nil || data.Current.WeatherCode == nil {
		return nil, errors.New("weather response incomplete")
	}
	humidity := 0.0
	if data.Current.RelativeHumidity2m != nil {
		humidity = *data.Current.RelativeHumidity2m
	}
	wind := 0.0
	if data.Current.WindSpeed10m != nil {
		wind = *data.Current.WindSpeed10m
	}
	timezone := data.Timezone
	if timezone == "" {
		timezone = "auto"
	}
	return &WeatherDto{
		TemperatureC: *data.Current.Temperature2m,
		Humidity:     humidity,
		WindSpeedKmh: wind,
		WeatherCode:  *data.Current.WeatherCode,
		Timezone:     timezone,
	}, nil
}

// fetchPlaceName reverse-geocodes coordinates via BigDataCloud.
func fetchPlaceName(ctx context.Context, lat, lon float64, language string) *string {
	u, err := url.Parse("https://api.bigdatacloud.net/data/reverse-geocode-client")
	if err != nil {
		return nil
	}
	q := u.Query()
	q.Set("latitude", formatCoord(lat))
	q.Set("longitude", formatCoord(lon))
	q.Set("localityLanguage", placeLanguage(language))
	u.RawQuery = q.Encode()
	body, err := httpGetBytes(ctx, u.String(), weatherTimeout, map[string]string{"Accept": "application/json"})
	if err != nil {
		return nil
	}
	var data struct {
		City                 string `json:"city"`
		Locality             string `json:"locality"`
		PrincipalSubdivision string `json:"principalSubdivision"`
		CountryName          string `json:"countryName"`
	}
	if json.Unmarshal(body, &data) != nil {
		return nil
	}
	city := strings.TrimSpace(data.City)
	if city == "" {
		city = strings.TrimSpace(data.Locality)
	}
	region := strings.TrimSpace(data.PrincipalSubdivision)
	if city != "" && region != "" && city != region {
		label := city + ", " + region
		return &label
	}
	if city != "" {
		return &city
	}
	if region != "" {
		return &region
	}
	country := strings.TrimSpace(data.CountryName)
	if country == "" {
		return nil
	}
	return &country
}

// searchPlaces looks up cities via Open-Meteo geocoding.
func searchPlaces(ctx context.Context, query, language string) []PlaceSearchHit {
	normalized := strings.TrimSpace(query)
	if normalized == "" {
		return []PlaceSearchHit{}
	}
	u, err := url.Parse("https://geocoding-api.open-meteo.com/v1/search")
	if err != nil {
		return []PlaceSearchHit{}
	}
	q := u.Query()
	q.Set("name", normalized)
	q.Set("count", "8")
	q.Set("language", geocodeLanguage(language))
	q.Set("format", "json")
	u.RawQuery = q.Encode()
	body, err := httpGetBytes(ctx, u.String(), weatherTimeout, map[string]string{"Accept": "application/json"})
	if err != nil {
		return []PlaceSearchHit{}
	}
	var data struct {
		Results []struct {
			ID        *int64   `json:"id"`
			Name      string   `json:"name"`
			Latitude  *float64 `json:"latitude"`
			Longitude *float64 `json:"longitude"`
			Admin1    string   `json:"admin1"`
			Country   string   `json:"country"`
		} `json:"results"`
	}
	if json.Unmarshal(body, &data) != nil {
		return []PlaceSearchHit{}
	}
	out := make([]PlaceSearchHit, 0, len(data.Results))
	for _, row := range data.Results {
		name := strings.TrimSpace(row.Name)
		if name == "" || row.Latitude == nil || row.Longitude == nil {
			continue
		}
		id := fmt.Sprintf("%g,%g", *row.Latitude, *row.Longitude)
		if row.ID != nil {
			id = strconv.FormatInt(*row.ID, 10)
		}
		region := strings.TrimSpace(row.Admin1)
		country := strings.TrimSpace(row.Country)
		parts := make([]string, 0, 2)
		if region != "" && region != name {
			parts = append(parts, region)
		}
		if country != "" && country != name {
			parts = append(parts, country)
		}
		out = append(out, PlaceSearchHit{
			ID:        id,
			Name:      name,
			Detail:    strings.Join(parts, ", "),
			Latitude:  *row.Latitude,
			Longitude: *row.Longitude,
		})
	}
	return out
}

func formatCoord(v float64) string {
	return strconv.FormatFloat(v, 'f', -1, 64)
}
