/**
 * Team Collaboration period edit window (current + previous calendar month).
 */

/**
 * True when the selected year/month is the current or previous calendar month.
 * Older periods are view-only for BSC / PBC / Retro.
 * @param fiscalYear - Selected year.
 * @param periodMonth - Selected month 1–12.
 * @param now - Optional clock (tests / inject).
 * @returns Whether edits are allowed for that period.
 */
export function isTeamPeriodEditable(
  fiscalYear: number,
  periodMonth: number,
  now: Date = new Date(),
): boolean {
  if (periodMonth < 1 || periodMonth > 12) return false
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  if (fiscalYear === currentYear && periodMonth === currentMonth) return true

  let prevYear = currentYear
  let prevMonth = currentMonth - 1
  if (prevMonth < 1) {
    prevMonth = 12
    prevYear -= 1
  }
  return fiscalYear === prevYear && periodMonth === prevMonth
}
