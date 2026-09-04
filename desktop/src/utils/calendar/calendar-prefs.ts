/**
 * Persisted Calendar UI preferences (localStorage).
 */

const VIEW_KEY = 'workbench-electron-calendar-view'

/** Views offered in the Electron Calendar host View menu. */
export const CALENDAR_VIEW_OPTIONS = [
  'day',
  'week',
  'month-grid',
  'year',
  'list',
  'four-days',
] as const

export type CalendarViewPref = (typeof CALENDAR_VIEW_OPTIONS)[number]

/**
 * True when `value` is a supported calendar view id.
 * @param value - Raw storage or Schedule-X view name.
 * @returns Whether the value is a host view option.
 */
function isCalendarViewPref(value: string): value is CalendarViewPref {
  return (CALENDAR_VIEW_OPTIONS as readonly string[]).includes(value)
}

/**
 * Loads the last selected Day / Week / Month view.
 * @returns Stored view, or week when missing / invalid.
 */
export function loadCalendarDefaultView(): CalendarViewPref {
  try {
    const raw = localStorage.getItem(VIEW_KEY)
    if (raw && isCalendarViewPref(raw)) {
      return raw
    }
  } catch {
    // Ignore quota / private-mode failures.
  }
  return 'week'
}

/**
 * Persists the active calendar view for the next open.
 * @param view - Schedule-X view name.
 * @returns Nothing.
 */
export function saveCalendarDefaultView(view: string): void {
  if (!isCalendarViewPref(view)) {
    return
  }
  try {
    localStorage.setItem(VIEW_KEY, view)
  } catch {
    // Ignore quota / private-mode failures.
  }
}
