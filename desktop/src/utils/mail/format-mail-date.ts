/**
 * Formats a mail timestamp for the thread list (time today, weekday this week, else short date).
 * @param iso - ISO timestamp, or null.
 * @param locale - BCP 47 locale.
 * @returns Display string, or empty when missing.
 */
export function formatMailListDate(iso: string | null, locale: string): string {
  if (!iso) {
    return ''
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (sameDay) {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date)
  }
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000)
  if (diffDays >= 0 && diffDays < 6) {
    return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date)
  }
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date)
}

/**
 * Formats a full date+time for the reading pane header.
 * @param iso - ISO timestamp, or null.
 * @param locale - BCP 47 locale.
 * @returns Display string, or empty when missing.
 */
export function formatMailDetailDate(iso: string | null, locale: string): string {
  if (!iso) {
    return ''
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}
