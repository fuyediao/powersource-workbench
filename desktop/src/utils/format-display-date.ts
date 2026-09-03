/**
 * Locale-aware date formatting for admin list/detail panes.
 */

/**
 * Formats an ISO / ERP date string for display (date only).
 * @param value - Date string or null.
 * @returns Localized date, or em dash when empty/invalid.
 */
export function formatDisplayDate(value: string | null | undefined): string {
  if (!value) return '—'
  const trimmed = String(value).trim()
  if (!trimmed) return '—'
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return trimmed
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  })
}

/**
 * Formats an ISO date-time string for display.
 * @param value - Date string or null.
 * @returns Localized date-time, or em dash when empty/invalid.
 */
export function formatDisplayDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const trimmed = String(value).trim()
  if (!trimmed) return '—'
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return trimmed
  return parsed.toLocaleString()
}
