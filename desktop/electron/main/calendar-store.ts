/**
 * Personal calendars and events — machine SQLite, not Supabase.
 */

import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite'
import { app } from 'electron'
import type {
  CalendarAttendeeDto,
  CalendarAttendeeStatus,
  CalendarEventRecordDto,
  CalendarEventWriteDto,
  CalendarListRecordDto,
  CalendarScopeDto,
} from '../shared/calendar'

const MAX_USER_ID_LENGTH = 64
const MAX_NAME_LENGTH = 200
const MAX_TITLE_LENGTH = 500
const MAX_DESCRIPTION_LENGTH = 20_000
const MAX_RRULE_LENGTH = 2000
const MAX_EXDATES = 400
const MAX_ATTENDEES = 100
const DEFAULT_CALENDAR_COLOR = '#0b6e4f'
const DEFAULT_COLORS = [
  '#0b6e4f',
  '#2563eb',
  '#b45309',
  '#7c3aed',
  '#be123c',
  '#0f766e',
  '#ca8a04',
  '#db2777',
] as const

type StoreRow = Record<string, SQLOutputValue>

let calendarDatabase: DatabaseSync | null = null

/**
 * Returns the lazily opened calendar database.
 * @returns Initialized SQLite database.
 */
function getCalendarDatabase(): DatabaseSync {
  if (calendarDatabase) {
    return calendarDatabase
  }
  const databasePath = path.join(app.getPath('userData'), 'calendar.sqlite')
  const database = new DatabaseSync(databasePath)
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS calendars (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      owner_user_id TEXT,
      group_id TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      google_calendar_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS calendars_owner_created
      ON calendars (owner_user_id, created_at);
    CREATE INDEX IF NOT EXISTS calendars_group_created
      ON calendars (group_id, created_at);
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      all_day INTEGER NOT NULL DEFAULT 0,
      owner_user_id TEXT,
      group_id TEXT,
      created_by TEXT NOT NULL,
      calendar_id TEXT,
      rrule TEXT,
      exdates_json TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL DEFAULT 'workbench',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS events_owner_start
      ON events (owner_user_id, start_at);
    CREATE INDEX IF NOT EXISTS events_group_start
      ON events (group_id, start_at);
    CREATE TABLE IF NOT EXISTS attendees (
      event_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'invited',
      PRIMARY KEY (event_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS attendees_user
      ON attendees (user_id);
  `)
  calendarDatabase = database
  return calendarDatabase
}

/**
 * Validates an auth user id received over IPC.
 * @param value - Candidate id.
 * @returns Trimmed user id.
 */
function requireUserId(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_USER_ID_LENGTH) {
    throw new Error('Calendar user id is invalid.')
  }
  return trimmed
}

/**
 * Validates a row id received over IPC.
 * @param value - Candidate id.
 * @param label - Field label.
 * @returns Trimmed id.
 */
function requireRowId(value: string, label: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 80) {
    throw new Error(`${label} is invalid.`)
  }
  return trimmed
}

/**
 * Reads a SQLite text column.
 * @param value - Raw cell.
 * @returns String, or empty when missing.
 */
function asString(value: SQLOutputValue | undefined): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Reads a SQLite integer column as boolean.
 * @param value - Raw cell.
 * @returns True when the cell is 1.
 */
function asBoolean(value: SQLOutputValue | undefined): boolean {
  return value === 1 || value === true
}

/**
 * Returns the current UTC instant as ISO-8601.
 * @returns ISO timestamp.
 */
function nowIso(): string {
  return new Date().toISOString()
}

/**
 * Clamps a display name.
 * @param value - Raw name.
 * @param fallback - Default when empty.
 * @returns Trimmed name.
 */
function clampName(value: string, fallback: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return fallback
  }
  return trimmed.slice(0, MAX_NAME_LENGTH)
}

/**
 * Parses stored EXDATE JSON.
 * @param raw - JSON text.
 * @returns ISO instants.
 */
function parseExdates(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  } catch {
    return []
  }
}

/**
 * Normalizes an attendee RSVP status.
 * @param value - Raw status.
 * @returns Known status.
 */
function normalizeAttendeeStatus(value: string): CalendarAttendeeStatus {
  if (value === 'accepted' || value === 'declined' || value === 'tentative' || value === 'invited') {
    return value
  }
  return 'invited'
}

/**
 * Maps a calendars row to a DTO.
 * @param row - Database row.
 * @returns List record, or null when required columns are missing.
 */
function mapCalendar(row: StoreRow): CalendarListRecordDto | null {
  const id = asString(row.id)
  const name = asString(row.name)
  if (!id || !name) {
    return null
  }
  const owner = asString(row.owner_user_id)
  const group = asString(row.group_id)
  return {
    id,
    name,
    color: asString(row.color) || DEFAULT_CALENDAR_COLOR,
    ownerUserId: owner.length > 0 ? owner : null,
    groupId: group.length > 0 ? group : null,
    isDefault: asBoolean(row.is_default),
    googleCalendarId: asString(row.google_calendar_id) || null,
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  }
}

/**
 * Loads attendees for a set of events.
 * @param eventIds - Event ids.
 * @returns Map of event id to attendees.
 */
function loadAttendeesByEventIds(eventIds: string[]): Map<string, CalendarAttendeeDto[]> {
  const map = new Map<string, CalendarAttendeeDto[]>()
  if (eventIds.length === 0) {
    return map
  }
  const database = getCalendarDatabase()
  const statement = database.prepare(
    `SELECT event_id, user_id, status FROM attendees WHERE event_id IN (${eventIds.map(() => '?').join(',')})`,
  )
  const rows = statement.all(...eventIds) as StoreRow[]
  for (const row of rows) {
    const eventId = asString(row.event_id)
    const userId = asString(row.user_id)
    if (!eventId || !userId) {
      continue
    }
    const list = map.get(eventId) ?? []
    list.push({
      userId,
      status: normalizeAttendeeStatus(asString(row.status)),
    })
    map.set(eventId, list)
  }
  return map
}

/**
 * Maps an events row plus attendees to a DTO.
 * @param row - Database row.
 * @param attendees - Invitees.
 * @returns Event record, or null when required columns are missing.
 */
function mapEvent(row: StoreRow, attendees: CalendarAttendeeDto[]): CalendarEventRecordDto | null {
  const id = asString(row.id)
  if (!id) {
    return null
  }
  const owner = asString(row.owner_user_id)
  const group = asString(row.group_id)
  const calendarId = asString(row.calendar_id)
  const rrule = asString(row.rrule)
  return {
    id,
    title: asString(row.title),
    description: asString(row.description) || null,
    startAt: asString(row.start_at),
    endAt: asString(row.end_at),
    allDay: asBoolean(row.all_day),
    ownerUserId: owner.length > 0 ? owner : null,
    groupId: group.length > 0 ? group : null,
    createdBy: asString(row.created_by),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    source: 'workbench',
    googleEventId: null,
    googleCalendarId: null,
    googleEtag: null,
    googleUpdatedAt: null,
    calendarId: calendarId.length > 0 ? calendarId : null,
    rrule: rrule.length > 0 ? rrule : null,
    exdates: parseExdates(row.exdates_json),
    attendees,
    attendeeUserIds: attendees.map((attendee) => attendee.userId),
  }
}

/**
 * Replaces attendees for one event, preserving RSVP status for retained users.
 * @param eventId - Event id.
 * @param userIds - Desired invitee ids.
 * @returns Nothing.
 */
function replaceEventAttendees(eventId: string, userIds: string[]): void {
  const database = getCalendarDatabase()
  const unique = [...new Set(userIds.map((id) => id.trim()).filter((id) => id.length > 0))]
  if (unique.length > MAX_ATTENDEES) {
    throw new Error('Too many calendar attendees.')
  }
  const existing = loadAttendeesByEventIds([eventId]).get(eventId) ?? []
  const statusByUser = new Map(existing.map((attendee) => [attendee.userId, attendee.status]))
  database.prepare('DELETE FROM attendees WHERE event_id = ?').run(eventId)
  const insert = database.prepare(
    'INSERT INTO attendees (event_id, user_id, status) VALUES (?, ?, ?)',
  )
  for (const userId of unique) {
    insert.run(eventId, userId, statusByUser.get(userId) ?? 'invited')
  }
}

/**
 * Lists named calendars for a personal or group scope.
 * @param scope - Owner or group.
 * @returns Calendar records.
 */
export function listCalendars(scope: CalendarScopeDto): CalendarListRecordDto[] {
  const database = getCalendarDatabase()
  const rows =
    'ownerUserId' in scope
      ? (database
          .prepare(
            'SELECT * FROM calendars WHERE owner_user_id = ? ORDER BY created_at ASC',
          )
          .all(requireUserId(scope.ownerUserId)) as StoreRow[])
      : (database
          .prepare('SELECT * FROM calendars WHERE group_id = ? ORDER BY created_at ASC')
          .all(requireRowId(scope.groupId, 'Calendar group id')) as StoreRow[])
  return rows.map(mapCalendar).filter((row): row is CalendarListRecordDto => row !== null)
}

/**
 * Ensures a default calendar exists for the scope.
 * @param scope - Owner or group.
 * @param defaultName - Localized default calendar name.
 * @returns Full calendar list for the scope.
 */
export function ensureDefaultCalendar(
  scope: CalendarScopeDto,
  defaultName: string,
): CalendarListRecordDto[] {
  const existing = listCalendars(scope)
  if (existing.length > 0) {
    return existing
  }
  const now = nowIso()
  const id = randomUUID()
  const name = clampName(defaultName, 'Calendar')
  if ('ownerUserId' in scope) {
    getCalendarDatabase()
      .prepare(
        `INSERT INTO calendars (
          id, name, color, owner_user_id, group_id, is_default, google_calendar_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, 1, NULL, ?, ?)`,
      )
      .run(id, name, DEFAULT_COLORS[0], requireUserId(scope.ownerUserId), now, now)
  } else {
    getCalendarDatabase()
      .prepare(
        `INSERT INTO calendars (
          id, name, color, owner_user_id, group_id, is_default, google_calendar_id, created_at, updated_at
        ) VALUES (?, ?, ?, NULL, ?, 1, NULL, ?, ?)`,
      )
      .run(id, name, DEFAULT_COLORS[0], requireRowId(scope.groupId, 'Calendar group id'), now, now)
  }
  return listCalendars(scope)
}

/**
 * Creates a named calendar in the active scope.
 * @param scope - Owner or group.
 * @param name - Display name.
 * @param color - Optional hex color.
 * @returns Created record.
 */
export function createCalendar(
  scope: CalendarScopeDto,
  name: string,
  color?: string,
): CalendarListRecordDto {
  const existing = listCalendars(scope)
  const colorPick =
    (typeof color === 'string' && color.trim()) ||
    DEFAULT_COLORS[existing.length % DEFAULT_COLORS.length] ||
    DEFAULT_COLORS[0]
  const now = nowIso()
  const id = randomUUID()
  const displayName = clampName(name, 'Calendar')
  if ('ownerUserId' in scope) {
    getCalendarDatabase()
      .prepare(
        `INSERT INTO calendars (
          id, name, color, owner_user_id, group_id, is_default, google_calendar_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, 0, NULL, ?, ?)`,
      )
      .run(id, displayName, colorPick, requireUserId(scope.ownerUserId), now, now)
  } else {
    getCalendarDatabase()
      .prepare(
        `INSERT INTO calendars (
          id, name, color, owner_user_id, group_id, is_default, google_calendar_id, created_at, updated_at
        ) VALUES (?, ?, ?, NULL, ?, 0, NULL, ?, ?)`,
      )
      .run(
        id,
        displayName,
        colorPick,
        requireRowId(scope.groupId, 'Calendar group id'),
        now,
        now,
      )
  }
  const created = listCalendars(scope).find((row) => row.id === id)
  if (!created) {
    throw new Error('Failed to create calendar')
  }
  return created
}

/**
 * Updates a named calendar.
 * @param userId - Signed-in user id.
 * @param calendarId - Calendar id.
 * @param patch - Name and/or color.
 * @returns Updated record.
 */
export function updateCalendar(
  userId: string,
  calendarId: string,
  patch: { name?: string; color?: string },
): CalendarListRecordDto {
  const owner = requireUserId(userId)
  const id = requireRowId(calendarId, 'Calendar id')
  const existing = getCalendarDatabase()
    .prepare('SELECT * FROM calendars WHERE id = ?')
    .get(id) as StoreRow | undefined
  if (!existing) {
    throw new Error('Calendar not found')
  }
  const mapped = mapCalendar(existing)
  if (!mapped) {
    throw new Error('Calendar not found')
  }
  if (mapped.ownerUserId !== owner && mapped.groupId === null) {
    throw new Error('Calendar not found')
  }
  const nextName =
    patch.name !== undefined ? clampName(patch.name, 'Calendar') : mapped.name
  const nextColor =
    patch.color !== undefined && patch.color.trim().length > 0 ? patch.color.trim() : mapped.color
  getCalendarDatabase()
    .prepare('UPDATE calendars SET name = ?, color = ?, updated_at = ? WHERE id = ?')
    .run(nextName, nextColor, nowIso(), id)
  const updated = getCalendarDatabase()
    .prepare('SELECT * FROM calendars WHERE id = ?')
    .get(id) as StoreRow | undefined
  const record = updated ? mapCalendar(updated) : null
  if (!record) {
    throw new Error('Calendar not found')
  }
  return record
}

/**
 * Deletes a named calendar. Promotes a sibling when the target is default.
 * @param userId - Signed-in user id.
 * @param calendarId - Calendar to remove.
 * @returns Nothing.
 */
export function deleteCalendar(userId: string, calendarId: string): void {
  const owner = requireUserId(userId)
  const id = requireRowId(calendarId, 'Calendar id')
  const target = getCalendarDatabase()
    .prepare('SELECT * FROM calendars WHERE id = ?')
    .get(id) as StoreRow | undefined
  const calendar = target ? mapCalendar(target) : null
  if (!calendar) {
    throw new Error('Calendar not found')
  }
  const scope: CalendarScopeDto = calendar.ownerUserId
    ? { ownerUserId: calendar.ownerUserId }
    : { groupId: calendar.groupId ?? '' }
  if ('ownerUserId' in scope) {
    if (scope.ownerUserId !== owner) {
      throw new Error('Calendar not found')
    }
  }
  const siblings = listCalendars(scope)
  if (siblings.length <= 1) {
    throw new Error('Cannot delete the last calendar')
  }
  const database = getCalendarDatabase()
  if (calendar.isDefault) {
    const next = siblings
      .filter((row) => row.id !== calendar.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
    if (!next) {
      throw new Error('Cannot delete the last calendar')
    }
    database.prepare('UPDATE calendars SET is_default = 0, updated_at = ? WHERE id = ?').run(
      nowIso(),
      calendar.id,
    )
    database.prepare('UPDATE calendars SET is_default = 1, updated_at = ? WHERE id = ?').run(
      nowIso(),
      next.id,
    )
  }
  database.prepare('UPDATE events SET calendar_id = NULL WHERE calendar_id = ?').run(calendar.id)
  database.prepare('DELETE FROM calendars WHERE id = ?').run(calendar.id)
}

/**
 * Lists events overlapping a time window for one scope.
 * @param userId - Signed-in user (personal invitee lookup).
 * @param scope - Personal owner or group id.
 * @param rangeStartIso - Inclusive window start.
 * @param rangeEndIso - Window end.
 * @returns Event records.
 */
export function listCalendarEvents(
  userId: string,
  scope: CalendarScopeDto,
  rangeStartIso: string,
  rangeEndIso: string,
): CalendarEventRecordDto[] {
  const caller = requireUserId(userId)
  const start = rangeStartIso.trim()
  const end = rangeEndIso.trim()
  if (!start || !end) {
    throw new Error('Calendar range is invalid.')
  }
  const database = getCalendarDatabase()
  let rows: StoreRow[] = []
  if ('ownerUserId' in scope) {
    const owner = requireUserId(scope.ownerUserId)
    const owned = database
      .prepare(
        `SELECT * FROM events
         WHERE owner_user_id = ?
           AND start_at < ?
           AND (rrule IS NOT NULL AND length(rrule) > 0 OR end_at > ?)
         ORDER BY start_at ASC`,
      )
      .all(owner, end, start) as StoreRow[]
    const inviteRows = database
      .prepare('SELECT event_id FROM attendees WHERE user_id = ?')
      .all(caller) as StoreRow[]
    const ownedIds = new Set(owned.map((row) => asString(row.id)))
    const inviteIds = [
      ...new Set(inviteRows.map((row) => asString(row.event_id))),
    ].filter((id) => id.length > 0 && !ownedIds.has(id))
    let invited: StoreRow[] = []
    if (inviteIds.length > 0) {
      invited = database
        .prepare(
          `SELECT * FROM events
           WHERE id IN (${inviteIds.map(() => '?').join(',')})
             AND start_at < ?
             AND (rrule IS NOT NULL AND length(rrule) > 0 OR end_at > ?)
           ORDER BY start_at ASC`,
        )
        .all(...inviteIds, end, start) as StoreRow[]
    }
    const byId = new Map<string, StoreRow>()
    for (const row of [...owned, ...invited]) {
      byId.set(asString(row.id), row)
    }
    rows = [...byId.values()].sort((a, b) => asString(a.start_at).localeCompare(asString(b.start_at)))
  } else {
    rows = database
      .prepare(
        `SELECT * FROM events
         WHERE group_id = ?
           AND start_at < ?
           AND (rrule IS NOT NULL AND length(rrule) > 0 OR end_at > ?)
         ORDER BY start_at ASC`,
      )
      .all(requireRowId(scope.groupId, 'Calendar group id'), end, start) as StoreRow[]
  }
  const attendees = loadAttendeesByEventIds(rows.map((row) => asString(row.id)))
  return rows
    .map((row) => mapEvent(row, attendees.get(asString(row.id)) ?? []))
    .filter((row): row is CalendarEventRecordDto => row !== null)
}

/**
 * Loads one event by id including attendees.
 * @param userId - Signed-in user id.
 * @param eventId - Event id.
 * @returns Record or null.
 */
export function getCalendarEvent(
  userId: string,
  eventId: string,
): CalendarEventRecordDto | null {
  const caller = requireUserId(userId)
  const id = requireRowId(eventId, 'Calendar event id')
  const row = getCalendarDatabase()
    .prepare('SELECT * FROM events WHERE id = ?')
    .get(id) as StoreRow | undefined
  if (!row) {
    return null
  }
  const attendees = loadAttendeesByEventIds([id]).get(id) ?? []
  const mapped = mapEvent(row, attendees)
  if (!mapped) {
    return null
  }
  const isOwner = mapped.ownerUserId === caller
  const isInvitee = attendees.some((attendee) => attendee.userId === caller)
  if (!isOwner && !isInvitee && mapped.groupId === null) {
    return null
  }
  return mapped
}

/**
 * Normalizes a write payload for insert/update.
 * @param write - Incoming write.
 * @returns Clamped fields.
 */
function normalizeWrite(write: CalendarEventWriteDto): {
  title: string
  description: string | null
  startAt: string
  endAt: string
  allDay: number
  calendarId: string | null
  rrule: string | null
  exdates: string[]
} {
  const title = write.title.trim().slice(0, MAX_TITLE_LENGTH) || 'Untitled'
  const description =
    typeof write.description === 'string' && write.description.trim().length > 0
      ? write.description.trim().slice(0, MAX_DESCRIPTION_LENGTH)
      : null
  const startAt = write.startAt.trim()
  const endAt = write.endAt.trim()
  if (!startAt || !endAt) {
    throw new Error('Calendar event times are invalid.')
  }
  const rrule =
    typeof write.rrule === 'string' && write.rrule.trim().length > 0
      ? write.rrule.trim().slice(0, MAX_RRULE_LENGTH)
      : null
  const exdates = (write.exdates ?? []).filter((iso) => typeof iso === 'string' && iso.trim().length > 0)
  if (exdates.length > MAX_EXDATES) {
    throw new Error('Too many calendar exception dates.')
  }
  const calendarId =
    typeof write.calendarId === 'string' && write.calendarId.trim().length > 0
      ? write.calendarId.trim()
      : null
  return {
    title,
    description,
    startAt,
    endAt,
    allDay: write.allDay ? 1 : 0,
    calendarId,
    rrule,
    exdates,
  }
}

/**
 * Creates a personal calendar event.
 * @param userId - Auth user id (owner + created_by).
 * @param write - Event fields.
 * @returns Created record.
 */
export function createPersonalCalendarEvent(
  userId: string,
  write: CalendarEventWriteDto,
): CalendarEventRecordDto {
  const owner = requireUserId(userId)
  const fields = normalizeWrite(write)
  const now = nowIso()
  const id = randomUUID()
  getCalendarDatabase()
    .prepare(
      `INSERT INTO events (
        id, title, description, start_at, end_at, all_day, owner_user_id, group_id,
        created_by, calendar_id, rrule, exdates_json, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 'workbench', ?, ?)`,
    )
    .run(
      id,
      fields.title,
      fields.description,
      fields.startAt,
      fields.endAt,
      fields.allDay,
      owner,
      owner,
      fields.calendarId,
      fields.rrule,
      JSON.stringify(fields.exdates),
      now,
      now,
    )
  replaceEventAttendees(id, write.attendeeUserIds ?? [])
  const created = getCalendarEvent(owner, id)
  if (!created) {
    throw new Error('Failed to create calendar event')
  }
  return created
}

/**
 * Updates an existing calendar event by id.
 * @param userId - Signed-in user id.
 * @param eventId - Event id.
 * @param write - Fields to update.
 * @returns Updated record.
 */
export function updateCalendarEvent(
  userId: string,
  eventId: string,
  write: CalendarEventWriteDto,
): CalendarEventRecordDto {
  const owner = requireUserId(userId)
  const id = requireRowId(eventId, 'Calendar event id')
  const existing = getCalendarEvent(owner, id)
  if (!existing || existing.ownerUserId !== owner) {
    throw new Error('Calendar event not found')
  }
  const fields = normalizeWrite(write)
  getCalendarDatabase()
    .prepare(
      `UPDATE events SET
        title = ?, description = ?, start_at = ?, end_at = ?, all_day = ?,
        calendar_id = ?, rrule = ?, exdates_json = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      fields.title,
      fields.description,
      fields.startAt,
      fields.endAt,
      fields.allDay,
      fields.calendarId,
      fields.rrule,
      JSON.stringify(write.exdates !== undefined ? fields.exdates : existing.exdates),
      nowIso(),
      id,
    )
  if (write.attendeeUserIds !== undefined) {
    replaceEventAttendees(id, write.attendeeUserIds)
  }
  const updated = getCalendarEvent(owner, id)
  if (!updated) {
    throw new Error('Calendar event not found')
  }
  return updated
}

/**
 * Deletes a calendar event by id.
 * @param userId - Signed-in user id.
 * @param eventId - Event id.
 * @returns Nothing.
 */
export function deleteCalendarEvent(userId: string, eventId: string): void {
  const owner = requireUserId(userId)
  const id = requireRowId(eventId, 'Calendar event id')
  const existing = getCalendarEvent(owner, id)
  if (!existing || existing.ownerUserId !== owner) {
    throw new Error('Calendar event not found')
  }
  const database = getCalendarDatabase()
  database.prepare('DELETE FROM attendees WHERE event_id = ?').run(id)
  database.prepare('DELETE FROM events WHERE id = ?').run(id)
}

/**
 * Updates the caller's RSVP status on an event.
 * @param eventId - Event id.
 * @param userId - Attendee user id.
 * @param status - New RSVP status.
 * @returns Updated attendee status.
 */
export function updateCalendarAttendeeRsvp(
  eventId: string,
  userId: string,
  status: CalendarAttendeeStatus,
): CalendarAttendeeStatus {
  const id = requireRowId(eventId, 'Calendar event id')
  const attendee = requireUserId(userId)
  const result = getCalendarDatabase()
    .prepare('UPDATE attendees SET status = ? WHERE event_id = ? AND user_id = ?')
    .run(status, id, attendee)
  if (result.changes === 0) {
    throw new Error('Attendee row not found')
  }
  return status
}
