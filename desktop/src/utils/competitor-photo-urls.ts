/** Maximum image URLs stored per shop or competitor line (JSONB array length). */
export const MAX_COMPETITOR_PHOTO_URLS = 20

/**
 * Trims, drops empty entries, removes duplicates, and caps length.
 * @param urls - Raw URL strings from the form.
 * @returns Sanitized list safe to persist.
 */
export function normalizeCompetitorPhotoUrlList(urls: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const url of urls) {
    const trimmed = url.trim()
    if (!trimmed || seen.has(trimmed)) {
      continue
    }
    seen.add(trimmed)
    out.push(trimmed)
    if (out.length >= MAX_COMPETITOR_PHOTO_URLS) {
      break
    }
  }
  return out
}

/**
 * Returns true when the string is safe to use as an image src.
 * @param url - Candidate URL.
 * @returns True for http(s) URLs.
 */
export function isHttpsImageSrc(url: string): boolean {
  const trimmed = url.trim()
  return trimmed.startsWith('https://') || trimmed.startsWith('http://')
}

/**
 * Reads a JSONB string-array column.
 * @param value - Raw column value.
 * @returns String URLs.
 */
export function parseCompetitorPhotoUrls(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return normalizeCompetitorPhotoUrlList(
    value.filter((item): item is string => typeof item === 'string'),
  )
}
