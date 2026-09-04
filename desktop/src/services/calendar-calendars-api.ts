/**
 * Named calendar CRUD against local Electron SQLite.
 */

import { supabase } from '@/lib/supabase'

/** Persisted named calendar. */
export interface CalendarListRecord {
  id: string
  name: string
  color: string
  ownerUserId: string | null
  groupId: string | null
  isDefault: boolean
  /** Unused Google id kept so existing UI types stay stable. */
  googleCalendarId: string | null
  createdAt: string
  updatedAt: string
}

/** Scope for listing/creating calendars. */
export type CalendarListScope = { ownerUserId: string } | { groupId: string }

/** Preset swatches for named calendars (create / edit UI). */
export const CALENDAR_COLOR_PALETTE = [
  '#0b6e4f',
  '#2563eb',
  '#b45309',
  '#7c3aed',
  '#be123c',
  '#0f766e',
  '#ca8a04',
  '#db2777',
] as const

const DEFAULT_COLORS = CALENDAR_COLOR_PALETTE

/**
 * Returns the local calendar IPC bridge.
 * @returns Calendar API.
 */
function calendarBridge(): NonNullable<Window['workbench']>['calendar'] {
  const api = window.workbench?.calendar
  if (!api) {
    throw new Error('Calendar is only available in the desktop app.')
  }
  return api
}

/**
 * Resolves the signed-in user id for calendar IPC.
 * @returns Auth user id.
 */
async function requireSignedInUserId(): Promise<string> {
  if (!supabase) {
    throw new Error('Sign in required.')
  }
  const { data } = await supabase.auth.getSession()
  if (data.session?.user.id) {
    return data.session.user.id
  }
  const { data: refreshed } = await supabase.auth.refreshSession()
  const userId = refreshed.session?.user.id
  if (!userId) {
    throw new Error('Sign in required.')
  }
  return userId
}

/**
 * Lists named calendars for a personal or group scope.
 * @param scope - Owner or group.
 * @returns Calendar records.
 */
export async function listCalendars(scope: CalendarListScope): Promise<CalendarListRecord[]> {
  if (!window.workbench?.calendar) {
    return []
  }
  const userId = await requireSignedInUserId()
  return calendarBridge().listCalendars(userId, scope)
}

/**
 * Ensures a default calendar exists for the scope; creates one when empty.
 * @param scope - Owner or group.
 * @param defaultName - Localized default calendar name.
 * @returns Full calendar list for the scope.
 */
export async function ensureDefaultCalendar(
  scope: CalendarListScope,
  defaultName: string,
): Promise<CalendarListRecord[]> {
  const existing = await listCalendars(scope)
  if (existing.length > 0) {
    return existing
  }
  const userId = await requireSignedInUserId()
  return calendarBridge().ensureDefault(userId, scope, defaultName)
}

/**
 * Creates a named calendar in the active scope.
 * @param scope - Owner or group.
 * @param name - Display name.
 * @param color - Hex color.
 * @returns Created record.
 */
export async function createCalendar(
  scope: CalendarListScope,
  name: string,
  color?: string,
): Promise<CalendarListRecord> {
  const userId = await requireSignedInUserId()
  return calendarBridge().createCalendar(userId, scope, name, color)
}

/**
 * Updates a named calendar.
 * @param calendarId - Calendar uuid.
 * @param patch - Name and/or color.
 * @returns Updated record.
 */
export async function updateCalendar(
  calendarId: string,
  patch: { name?: string; color?: string },
): Promise<CalendarListRecord> {
  const userId = await requireSignedInUserId()
  return calendarBridge().updateCalendar(userId, calendarId, patch)
}

/**
 * Deletes a named calendar. Refuses to delete the last calendar in the scope.
 * @param calendar - Calendar to remove.
 * @param siblings - All calendars in the same personal/group scope.
 * @returns Nothing.
 */
export async function deleteCalendar(
  calendar: CalendarListRecord,
  siblings: CalendarListRecord[],
): Promise<void> {
  if (siblings.length <= 1) {
    throw new Error('Cannot delete the last calendar')
  }
  const userId = await requireSignedInUserId()
  await calendarBridge().deleteCalendar(userId, calendar.id)
}

/**
 * Builds Schedule-X calendar color maps from list records.
 * @param calendars - Named calendars.
 * @returns Record keyed by calendar id.
 */
export function toScheduleXCalendars(
  calendars: CalendarListRecord[],
): Record<
  string,
  {
    colorName: string
    label?: string
    lightColors: { main: string; container: string; onContainer: string }
    darkColors: { main: string; container: string; onContainer: string }
  }
> {
  const out: ReturnType<typeof toScheduleXCalendars> = {}
  for (const calendar of calendars) {
    const main = calendar.color || DEFAULT_COLORS[0]
    out[calendar.id] = {
      colorName: calendar.id,
      label: calendar.name,
      lightColors: {
        main,
        container: `${main}22`,
        onContainer: '#1a1a1a',
      },
      darkColors: {
        main,
        container: `${main}33`,
        onContainer: '#f4f7f5',
      },
    }
  }
  return out
}
