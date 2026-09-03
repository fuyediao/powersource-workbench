/**
 * Normalizes a user-entered site URL: prepends `https://` when missing and
 * validates with the URL constructor.
 * @param value - Raw URL text.
 * @returns Absolute http(s) URL, or null when invalid.
 */
export function normalizeSiteUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const parsed = new URL(withProtocol)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    if (!parsed.hostname.includes('.')) {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}
