/**
 * Calendar helpers for Sales Board year → quarter → month → week cascade.
 * Weeks use Monday-start (ISO / Postgres `date_trunc('week')` parity).
 */

/** Inclusive local date range as `YYYY-MM-DD`. */
export interface SalesBoardDateRange {
  from: string
  to: string
}

/** One week option that intersects a calendar month. */
export interface SalesBoardWeekOption {
  /** Monday of the week (`YYYY-MM-DD`). */
  value: string
  from: string
  to: string
  /** Short label like `08/03–08/09`. */
  label: string
}

/**
 * @param date - Local date.
 * @returns `YYYY-MM-DD` in local time.
 */
function toYmd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * @param date - Any local date.
 * @returns Monday of that ISO week.
 */
function mondayOf(date: Date): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = copy.getDay()
  const offset = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + offset)
  return copy
}

/**
 * @param date - Any local date.
 * @returns Sunday of that ISO week.
 */
function sundayOf(date: Date): Date {
  const monday = mondayOf(date)
  return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)
}

/**
 * @param month - 1–12.
 * @returns Short `MM/DD` for the first day (unused — kept for label helper).
 */
function formatMd(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${m}/${d}`
}

/**
 * @param quarter - 1–4.
 * @returns Month numbers (1–12) in that quarter.
 */
export function monthsInQuarter(quarter: number): number[] {
  const start = (quarter - 1) * 3 + 1
  return [start, start + 1, start + 2]
}

/**
 * @param year - Calendar year.
 * @returns Full-year inclusive range.
 */
export function rangeForYear(year: number): SalesBoardDateRange {
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}

/**
 * @param year - Calendar year.
 * @param quarter - 1–4.
 * @returns Inclusive quarter range.
 */
export function rangeForQuarter(year: number, quarter: number): SalesBoardDateRange {
  const months = monthsInQuarter(quarter)
  const startMonth = months[0]
  const endMonth = months[2]
  const lastDay = new Date(year, endMonth, 0).getDate()
  return {
    from: `${year}-${String(startMonth).padStart(2, '0')}-01`,
    to: `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  }
}

/**
 * @param year - Calendar year.
 * @param month - 1–12.
 * @returns Inclusive month range.
 */
export function rangeForMonth(year: number, month: number): SalesBoardDateRange {
  const lastDay = new Date(year, month, 0).getDate()
  return {
    from: `${year}-${String(month).padStart(2, '0')}-01`,
    to: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  }
}

/**
 * Lists ISO weeks that intersect the given calendar month, clipped to the month
 * for the query range (so "week in month" stays inside the month).
 * @param year - Calendar year.
 * @param month - 1–12.
 * @returns Week options ordered by Monday.
 */
export function weeksInMonth(year: number, month: number): SalesBoardWeekOption[] {
  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month, 0)
  const options: SalesBoardWeekOption[] = []
  let cursor = mondayOf(monthStart)
  while (cursor <= monthEnd) {
    const weekStart = cursor
    const weekEnd = sundayOf(cursor)
    const clipStart = weekStart < monthStart ? monthStart : weekStart
    const clipEnd = weekEnd > monthEnd ? monthEnd : weekEnd
    if (clipStart <= monthEnd && clipEnd >= monthStart) {
      options.push({
        value: toYmd(weekStart),
        from: toYmd(clipStart),
        to: toYmd(clipEnd),
        label: `${formatMd(clipStart)}–${formatMd(clipEnd)}`,
      })
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7)
  }
  return options
}

/**
 * Resolves the year-cascade selection into an RPC period + optional custom bounds.
 * Whole year alone uses `period=YYYY` (month buckets). Any quarter/month/week
 * drill-down uses `period=custom` with inclusive dates.
 * @param year - Selected year string (e.g. `2025`).
 * @param quarter - `` | `1`–`4`.
 * @param month - `` | `1`–`12`.
 * @param week - `` or Monday `YYYY-MM-DD` from {@link weeksInMonth}.
 * @returns Query period and optional from/to.
 */
export function resolveYearCascadeQuery(
  year: string,
  quarter: string,
  month: string,
  week: string,
): { period: string; from?: string; to?: string } {
  const y = Number(year)
  if (!Number.isFinite(y) || y < 1970) {
    return { period: 'all' }
  }
  if (!quarter && !month && !week) {
    return { period: String(y) }
  }
  if (week && month) {
    const match = weeksInMonth(y, Number(month)).find((row) => row.value === week)
    if (match) {
      return { period: 'custom', from: match.from, to: match.to }
    }
  }
  if (month) {
    const range = rangeForMonth(y, Number(month))
    return { period: 'custom', from: range.from, to: range.to }
  }
  if (quarter) {
    const range = rangeForQuarter(y, Number(quarter))
    return { period: 'custom', from: range.from, to: range.to }
  }
  return { period: String(y) }
}
