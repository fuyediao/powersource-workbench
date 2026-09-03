/**
 * Named calendar CRUD against `calendars` (Supabase RLS).
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'

/** Persisted named calendar. */
export interface CalendarListRecord {
  id: string
  name: string
  color: string
  ownerUserId: string | null
  groupId: string | null
  isDefault: boolean
  /** Mirrored Google calendar id when this row syncs with Google. */
  googleCalendarId: string | null
  createdAt: string
  updatedAt: string
}

/** Scope for listing/creating calendars. */
export type CalendarListScope = { ownerUserId: string } | { groupId: string }

const CALENDAR_SELECT =
  'id, name, color, owner_user_id, group_id, is_default, google_calendar_id, created_at, updated_at'

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
 * Maps a DB row to {@link CalendarListRecord}.
 * @param row - Raw calendars row.
 * @returns Mapped record.
 */
function mapCalendar(row: {
  id: string
  name: string
  color: string
  owner_user_id: string | null
  group_id: string | null
  is_default: boolean
  google_calendar_id?: string | null
  created_at: string
  updated_at: string
}): CalendarListRecord {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    ownerUserId: row.owner_user_id,
    groupId: row.group_id,
    isDefault: row.is_default,
    googleCalendarId: row.google_calendar_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Lists named calendars for a personal or group scope.
 * @param scope - Owner or group.
 * @returns Calendar records.
 */
export async function listCalendars(scope: CalendarListScope): Promise<CalendarListRecord[]> {
  if (!isSupabaseConfigured || !supabase) {
    return []
  }
  let query = supabase.from('calendars').select(CALENDAR_SELECT).order('created_at', {
    ascending: true,
  })
  if ('ownerUserId' in scope) {
    query = query.eq('owner_user_id', scope.ownerUserId)
  } else {
    query = query.eq('group_id', scope.groupId)
  }
  const { data, error } = await query
  if (error) {
    throw error
  }
  return (data ?? []).map(mapCalendar)
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
  if (!supabase) {
    throw new Error('Supabase is not configured')
  }
  if ('ownerUserId' in scope) {
    const { error } = await supabase.from('calendars').insert({
      name: defaultName,
      color: DEFAULT_COLORS[0],
      owner_user_id: scope.ownerUserId,
      group_id: null,
      is_default: true,
    })
    if (error) {
      throw error
    }
  } else {
    const { error } = await supabase.from('calendars').insert({
      name: defaultName,
      color: DEFAULT_COLORS[0],
      owner_user_id: null,
      group_id: scope.groupId,
      is_default: true,
    })
    if (error) {
      throw error
    }
  }
  return listCalendars(scope)
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
  if (!supabase) {
    throw new Error('Supabase is not configured')
  }
  const existing = await listCalendars(scope)
  const colorPick = color ?? DEFAULT_COLORS[existing.length % DEFAULT_COLORS.length] ?? DEFAULT_COLORS[0]
  if ('ownerUserId' in scope) {
    const { data, error } = await supabase
      .from('calendars')
      .insert({
        name: name.trim() || 'Calendar',
        color: colorPick,
        owner_user_id: scope.ownerUserId,
        group_id: null,
        is_default: false,
      })
      .select(CALENDAR_SELECT)
      .single()
    if (error) {
      throw error
    }
    return mapCalendar(data)
  }
  const { data, error } = await supabase
    .from('calendars')
    .insert({
      name: name.trim() || 'Calendar',
      color: colorPick,
      owner_user_id: null,
      group_id: scope.groupId,
      is_default: false,
    })
    .select(CALENDAR_SELECT)
    .single()
  if (error) {
    throw error
  }
  return mapCalendar(data)
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
  if (!supabase) {
    throw new Error('Supabase is not configured')
  }
  const { data, error } = await supabase
    .from('calendars')
    .update({
      ...(patch.name !== undefined ? { name: patch.name.trim() || 'Calendar' } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
    })
    .eq('id', calendarId)
    .select(CALENDAR_SELECT)
    .single()
  if (error) {
    throw error
  }
  return mapCalendar(data)
}

/**
 * Deletes a named calendar. When the target is the default and other calendars
 * remain, promotes the oldest sibling to default first (RLS forbids deleting
 * `is_default` rows). Refuses to delete the last calendar in the scope.
 * @param calendar - Calendar to remove.
 * @param siblings - All calendars in the same personal/group scope.
 * @returns Nothing.
 */
export async function deleteCalendar(
  calendar: CalendarListRecord,
  siblings: CalendarListRecord[],
): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase is not configured')
  }
  if (siblings.length <= 1) {
    throw new Error('Cannot delete the last calendar')
  }
  if (calendar.isDefault) {
    const next = siblings
      .filter((row) => row.id !== calendar.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
    if (!next) {
      throw new Error('Cannot delete the last calendar')
    }
    // Demote first so a unique default index never sees two true rows.
    const { error: demoteError } = await supabase
      .from('calendars')
      .update({ is_default: false })
      .eq('id', calendar.id)
    if (demoteError) {
      throw demoteError
    }
    const { error: promoteError } = await supabase
      .from('calendars')
      .update({ is_default: true })
      .eq('id', next.id)
    if (promoteError) {
      throw promoteError
    }
  }
  const { error } = await supabase.from('calendars').delete().eq('id', calendar.id)
  if (error) {
    throw error
  }
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
