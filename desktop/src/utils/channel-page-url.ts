/**
 * Turn a pasted channel URL into an absolute http(s) href.
 * Values like `www.youtube.com/@handle` lack a scheme; browsers treat them as
 * paths relative to the current page (e.g. `/admin/kol/www.youtube.com/...`).
 *
 * @param raw - Stored or user-entered channel page URL.
 * @returns String safe to use as `<a href>` when non-empty; unchanged if already absolute.
 */
export function toAbsoluteChannelPageUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) {
    return ''
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return trimmed
  }
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`
  }
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return trimmed
    }
  } catch {
    // Not parseable as absolute — often missing scheme.
  }
  const withoutLeadingSlashes = trimmed.replace(/^\/+/, '')
  if (
    /^www\./i.test(withoutLeadingSlashes) ||
    /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/|$)/i.test(withoutLeadingSlashes)
  ) {
    return `https://${withoutLeadingSlashes}`
  }
  return trimmed
}
