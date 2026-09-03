/**
 * Google Maps URL helpers (workbench-web parity).
 */

/**
 * Builds a single query string: name + address when both exist.
 *
 * @param name - Place / shop name
 * @param address - Full street address
 * @returns Trimmed combined text, or empty string
 */
export function buildGoogleMapsTextQuery(
  name: string | undefined | null,
  address: string | undefined | null,
): string {
  const n = (name ?? '').trim()
  const a = (address ?? '').trim()
  if (n && a) return `${n} ${a}`
  if (n) return n
  if (a) return a
  return ''
}

/**
 * Google Maps Directions URL (`/maps/dir/`).
 *
 * @param name - Place name
 * @param address - Full address
 * @param latitude - Fallback latitude
 * @param longitude - Fallback longitude
 * @returns HTTPS URL or empty string
 */
export function buildGoogleMapsDirectionsUrl(
  name: string | undefined | null,
  address: string | undefined | null,
  latitude: number,
  longitude: number,
): string {
  const text = buildGoogleMapsTextQuery(name, address)
  if (text) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(text)}`
  }
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`
  }
  return ''
}

/**
 * Google Maps place search URL (`/maps/search/`).
 *
 * @param name - Place name
 * @param address - Full address
 * @param latitude - Fallback latitude
 * @param longitude - Fallback longitude
 * @returns HTTPS URL or empty string
 */
export function buildGoogleMapsSearchUrl(
  name: string | undefined | null,
  address: string | undefined | null,
  latitude: number,
  longitude: number,
): string {
  const text = buildGoogleMapsTextQuery(name, address)
  const query =
    text ||
    (Number.isFinite(latitude) && Number.isFinite(longitude) ? `${latitude},${longitude}` : '')
  if (!query) return ''
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}
