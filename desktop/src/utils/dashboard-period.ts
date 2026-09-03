/**
 * Sales dashboard trailing period helpers (aligned with workbench-web).
 */

export type DashboardPeriod = 'all' | 'week' | 'month' | 'quarter' | 'year'

const TRAILING_DAYS: Record<Exclude<DashboardPeriod, 'all'>, number> = {
  week: 7,
  month: 30,
  quarter: 90,
  year: 365,
}

/**
 * Returns ISO timestamp at local midnight for the start of the trailing window.
 * @param period - Non-`all` dashboard period.
 * @returns Inclusive range start ISO string.
 */
export function getDashboardPeriodRangeStartIso(
  period: Exclude<DashboardPeriod, 'all'>,
): string {
  const days = TRAILING_DAYS[period]
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

/**
 * Type guard for dashboard period strings.
 * @param value - Raw string.
 * @returns Whether value is a {@link DashboardPeriod}.
 */
export function isDashboardPeriod(value: string): value is DashboardPeriod {
  return (
    value === 'all' ||
    value === 'week' ||
    value === 'month' ||
    value === 'quarter' ||
    value === 'year'
  )
}
