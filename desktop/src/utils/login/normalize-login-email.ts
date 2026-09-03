/**
 * Normalizes login email input: appends @gmail.com when no @ is present.
 * @param raw - User-entered email or local-part.
 * @returns Email address for auth.
 */
export function normalizeLoginEmail(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) {
    return trimmed
  }
  if (!trimmed.includes('@')) {
    return `${trimmed}@gmail.com`
  }
  return trimmed
}
