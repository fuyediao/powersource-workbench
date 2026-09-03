import { apiGetJson } from './api-client'

export interface WeatherDto {
  temperatureC: number
  humidity: number
  windSpeedKmh: number
  weatherCode: number
  timezone: string
}

export interface PlaceSearchHit {
  id: string
  name: string
  detail: string
  latitude: number
  longitude: number
}

/**
 * Loads current weather via workbench-api GET /start/weather.
 * @param latitude - Degrees north.
 * @param longitude - Degrees east.
 * @returns Current conditions.
 */
export async function fetchWeather(latitude: number, longitude: number): Promise<WeatherDto> {
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
  })
  return apiGetJson<WeatherDto>(`/start/weather?${params.toString()}`)
}

/**
 * Reverse-geocodes coordinates via workbench-api GET /start/weather/place.
 * @param latitude - Degrees north.
 * @param longitude - Degrees east.
 * @param language - App UI language.
 * @returns Place label, or null when unavailable.
 */
export async function fetchPlaceName(
  latitude: number,
  longitude: number,
  language: string,
): Promise<string | null> {
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    language,
  })
  const data = await apiGetJson<{ place?: string | null }>(
    `/start/weather/place?${params.toString()}`,
  )
  return typeof data.place === 'string' && data.place.trim() ? data.place : null
}

/**
 * Searches cities via workbench-api GET /start/weather/search.
 * @param query - Free-text place name.
 * @param language - App UI language.
 * @returns Matching places (empty on failure).
 */
export async function searchPlaces(query: string, language: string): Promise<PlaceSearchHit[]> {
  const trimmed = query.trim()
  if (!trimmed) {
    return []
  }
  try {
    const params = new URLSearchParams({ q: trimmed, language })
    const data = await apiGetJson<{ results?: PlaceSearchHit[] }>(
      `/start/weather/search?${params.toString()}`,
    )
    return Array.isArray(data.results) ? data.results : []
  } catch {
    return []
  }
}
