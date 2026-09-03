/**
 * Persisted Calendar UI preferences (localStorage).
 */

const VIEW_KEY = 'workbench-electron-calendar-view'
const SCOPE_MODE_KEY = 'workbench-electron-calendar-scope-mode'
const SCOPE_GROUP_KEY = 'workbench-electron-calendar-scope-group'

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

/** Calendar personal / group workspace preference. */
export type CalendarScopeModePref = 'personal' | 'group'

/**
 * True when `value` is a supported calendar view id.
 * @param value - Raw storage or Schedule-X view name.
 * @returns Whether the value is a host view option.
 */
function isCalendarViewPref(value: string): value is CalendarViewPref {
  return (CALENDAR_VIEW_OPTIONS as readonly string[]).includes(value)
}

/**
 * Storage key scoped to the signed-in user when possible.
 * @param base - Preference key prefix.
 * @param userId - Auth user id.
 * @returns localStorage key.
 */
function userScopedKey(base: string, userId: string | null | undefined): string {
  return userId ? `${base}:${userId}` : base
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

/**
 * Loads the last Calendar personal / group scope mode.
 * @param userId - Auth user id.
 * @returns Stored mode, or personal when missing / invalid.
 */
export function loadCalendarScopeMode(
  userId: string | null | undefined,
): CalendarScopeModePref {
  try {
    const raw = localStorage.getItem(userScopedKey(SCOPE_MODE_KEY, userId))
    if (raw === 'personal' || raw === 'group') {
      return raw
    }
  } catch {
    // Ignore quota / private-mode failures.
  }
  return 'personal'
}

/**
 * Persists Calendar personal / group scope mode.
 * @param userId - Auth user id.
 * @param mode - Scope mode.
 * @returns Nothing.
 */
export function saveCalendarScopeMode(
  userId: string | null | undefined,
  mode: CalendarScopeModePref,
): void {
  try {
    localStorage.setItem(userScopedKey(SCOPE_MODE_KEY, userId), mode)
  } catch {
    // Ignore quota / private-mode failures.
  }
}

/**
 * Loads the last selected Calendar group id.
 * @param userId - Auth user id.
 * @returns Stored group uuid, or null.
 */
export function loadCalendarScopeGroupId(
  userId: string | null | undefined,
): string | null {
  try {
    const raw = localStorage.getItem(userScopedKey(SCOPE_GROUP_KEY, userId))
    if (raw && raw.trim()) {
      return raw.trim()
    }
  } catch {
    // Ignore quota / private-mode failures.
  }
  return null
}

/**
 * Persists the selected Calendar group id.
 * @param userId - Auth user id.
 * @param groupId - Group uuid, or null to clear.
 * @returns Nothing.
 */
export function saveCalendarScopeGroupId(
  userId: string | null | undefined,
  groupId: string | null,
): void {
  try {
    const key = userScopedKey(SCOPE_GROUP_KEY, userId)
    if (!groupId) {
      localStorage.removeItem(key)
      return
    }
    localStorage.setItem(key, groupId)
  } catch {
    // Ignore quota / private-mode failures.
  }
}
