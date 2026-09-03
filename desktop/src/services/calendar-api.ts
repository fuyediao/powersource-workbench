/**
 * Calendar event CRUD against `calendar_events` (Supabase RLS).
 */

import 'temporal-polyfill/global'
import type { CalendarEvent } from '@schedule-x/calendar'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import {
  expandRruleOccurrences,
  isOccurrenceExcluded,
  masterIdFromScheduleId,
  occurrenceScheduleId,
  shiftSeriesByOccurrenceDelta,
  truncateRruleBefore,
  type RecurrenceEditScope,
} from '@/utils/calendar/calendar-rrule'

/** Attendee RSVP status stored on `calendar_event_attendees.status`. */
export type CalendarAttendeeStatus = 'invited' | 'accepted' | 'declined' | 'tentative'

/** Invitee row on a calendar event. */
export interface CalendarAttendee {
  userId: string
  status: CalendarAttendeeStatus
}

/** Persisted calendar event row. */
export interface CalendarEventRecord {
  id: string
  title: string
  description: string | null
  startAt: string
  endAt: string
  allDay: boolean
  ownerUserId: string | null
  groupId: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  /** `workbench` native or `google` synced. */
  source: 'workbench' | 'google'
  googleEventId: string | null
  googleCalendarId: string | null
  googleEtag: string | null
  googleUpdatedAt: string | null
  calendarId: string | null
  rrule: string | null
  /** Excluded occurrence start instants (EXDATE). */
  exdates: string[]
  attendees: CalendarAttendee[]
  /** Convenience list of invitee user ids (same order as `attendees`). */
  attendeeUserIds: string[]
}

/** Scope discriminator for list/create. */
export type CalendarEventScope = { ownerUserId: string } | { groupId: string }

/** Writable fields for create/update. */
export interface CalendarEventWrite {
  title: string
  description?: string | null
  startAt: string
  endAt: string
  allDay: boolean
  calendarId?: string | null
  rrule?: string | null
  exdates?: string[]
  attendeeUserIds?: string[]
}

const EVENT_SELECT =
  'id, title, description, start_at, end_at, all_day, owner_user_id, group_id, created_by, created_at, updated_at, source, google_event_id, google_calendar_id, google_etag, google_updated_at, calendar_id, rrule, exdate'

type EventRow = {
  id: string
  title: string
  description: string | null
  start_at: string
  end_at: string
  all_day: boolean
  owner_user_id: string | null
  group_id: string | null
  created_by: string
  created_at: string
  updated_at: string
  source?: string | null
  google_event_id?: string | null
  google_calendar_id?: string | null
  google_etag?: string | null
  google_updated_at?: string | null
  calendar_id?: string | null
  rrule?: string | null
  exdate?: string[] | null
}

/**
 * Normalizes a stored attendee status string.
 * @param value - Raw status from Postgres.
 * @returns Known RSVP status.
 */
function normalizeAttendeeStatus(value: string | null | undefined): CalendarAttendeeStatus {
  if (
    value === 'accepted' ||
    value === 'declined' ||
    value === 'tentative' ||
    value === 'invited'
  ) {
    return value
  }
  return 'invited'
}

/**
 * Maps a DB row to {@link CalendarEventRecord}.
 * @param row - Raw calendar_events row.
 * @param attendees - Invitee rows for this event.
 * @returns Mapped record.
 */
function mapEvent(row: EventRow, attendees: CalendarAttendee[] = []): CalendarEventRecord {
  const source = row.source === 'google' ? 'google' : 'workbench'
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startAt: row.start_at,
    endAt: row.end_at,
    allDay: row.all_day,
    ownerUserId: row.owner_user_id,
    groupId: row.group_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source,
    googleEventId: row.google_event_id ?? null,
    googleCalendarId: row.google_calendar_id ?? null,
    googleEtag: row.google_etag ?? null,
    googleUpdatedAt: row.google_updated_at ?? null,
    calendarId: row.calendar_id ?? null,
    rrule: row.rrule ?? null,
    exdates: row.exdate ?? [],
    attendees,
    attendeeUserIds: attendees.map((attendee) => attendee.userId),
  }
}

/**
 * Loads attendees for a set of events.
 * @param eventIds - Event uuids.
 * @returns Map of event id → attendees.
 */
async function loadAttendeesByEventIds(
  eventIds: string[],
): Promise<Map<string, CalendarAttendee[]>> {
  const map = new Map<string, CalendarAttendee[]>()
  if (!supabase || eventIds.length === 0) {
    return map
  }
  const { data, error } = await supabase
    .from('calendar_event_attendees')
    .select('event_id, user_id, status')
    .in('event_id', eventIds)
  if (error) {
    throw error
  }
  for (const row of data ?? []) {
    const eventId = row.event_id as string
    const list = map.get(eventId) ?? []
    list.push({
      userId: row.user_id as string,
      status: normalizeAttendeeStatus(row.status as string | null),
    })
    map.set(eventId, list)
  }
  return map
}

/**
 * Replaces attendees for one event, preserving RSVP status for retained users.
 * @param eventId - Event uuid.
 * @param userIds - Desired invitee ids.
 * @returns Nothing.
 */
async function replaceEventAttendees(eventId: string, userIds: string[]): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase is not configured')
  }
  const unique = [...new Set(userIds.filter(Boolean))]
  const existing = await loadAttendeesByEventIds([eventId])
  const statusByUser = new Map(
    (existing.get(eventId) ?? []).map((attendee) => [attendee.userId, attendee.status]),
  )
  const { error: deleteError } = await supabase
    .from('calendar_event_attendees')
    .delete()
    .eq('event_id', eventId)
  if (deleteError) {
    throw deleteError
  }
  if (unique.length === 0) {
    return
  }
  const { error: insertError } = await supabase.from('calendar_event_attendees').insert(
    unique.map((userId) => ({
      event_id: eventId,
      user_id: userId,
      status: statusByUser.get(userId) ?? 'invited',
    })),
  )
  if (insertError) {
    throw insertError
  }
}

/**
 * Resolves the IANA timezone for Temporal conversions.
 * @returns Timezone id string.
 */
function appTimeZone(): string {
  try {
    return Temporal.Now.timeZoneId()
  } catch {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  }
}

/**
 * Converts a stored ISO timestamptz into a Schedule-X Temporal start/end.
 * @param iso - Instant ISO string from Postgres.
 * @param allDay - Whether the event is all-day.
 * @returns Temporal PlainDate or ZonedDateTime.
 */
export function isoToTemporal(
  iso: string,
  allDay: boolean,
): Temporal.ZonedDateTime | Temporal.PlainDate {
  const zone = appTimeZone()
  const normalized = normalizeInstantIso(iso)
  if (allDay) {
    const instant = Temporal.Instant.from(normalized)
    return instant.toZonedDateTimeISO(zone).toPlainDate()
  }
  return Temporal.Instant.from(normalized).toZonedDateTimeISO(zone)
}

/**
 * Normalizes Postgres / Google timestamps into Instant-compatible ISO.
 * @param iso - Raw timestamptz string.
 * @returns Instant ISO string.
 */
function normalizeInstantIso(iso: string): string {
  const trimmed = iso.trim()
  if (!trimmed) {
    throw new RangeError('Empty timestamp')
  }
  if (trimmed.includes('T')) {
    return trimmed
  }
  // Postgres may return "2026-08-10 00:00:00+00" without T.
  return trimmed.replace(' ', 'T')
}

/**
 * Converts a Schedule-X Temporal value to an ISO timestamptz for Supabase.
 * @param value - Schedule-X start/end.
 * @param allDay - Whether the event is all-day.
 * @returns ISO instant string.
 */
export function temporalToIso(
  value: Temporal.ZonedDateTime | Temporal.PlainDate,
  allDay: boolean,
): string {
  const zone = appTimeZone()
  if (allDay || value instanceof Temporal.PlainDate) {
    const plain = value instanceof Temporal.PlainDate ? value : value.toPlainDate()
    return plain
      .toZonedDateTime({ timeZone: zone, plainTime: Temporal.PlainTime.from('00:00') })
      .toInstant()
      .toString()
  }
  return value.toInstant().toString()
}

/**
 * Maps a DB record to one or more Schedule-X calendar events (RRULE expanded).
 * @param record - Persisted row.
 * @param options - Grid options and optional range for expansion.
 * @returns Calendar events for the grid.
 */
export function recordToScheduleEvents(
  record: CalendarEventRecord,
  options?: {
    disableInteraction?: boolean
    rangeStartIso?: string
    rangeEndIso?: string
  },
): CalendarEvent[] {
  const calendarId = record.calendarId ?? undefined
  const baseOptions = options?.disableInteraction
    ? { disableDND: true, disableResize: true }
    : undefined
  const recurringDisable =
    record.rrule && !options?.disableInteraction
      ? { disableDND: true, disableResize: true }
      : baseOptions

  if (record.rrule && options?.rangeStartIso && options.rangeEndIso) {
    const occurrences = expandRruleOccurrences(
      record.startAt,
      record.endAt,
      record.rrule,
      options.rangeStartIso,
      options.rangeEndIso,
      record.exdates,
    )
    if (occurrences.length === 0) {
      return []
    }
    return occurrences.map((occ) => ({
      id: occurrenceScheduleId(record.id, occ.startAt),
      title: record.title,
      description: record.description ?? undefined,
      start: isoToTemporal(occ.startAt, record.allDay),
      end: isoToTemporal(occ.endAt, record.allDay),
      calendarId,
      _options: recurringDisable,
    }))
  }

  return [
    {
      id: record.id,
      title: record.title,
      description: record.description ?? undefined,
      start: isoToTemporal(record.startAt, record.allDay),
      end: isoToTemporal(record.endAt, record.allDay),
      calendarId,
      _options: baseOptions,
    },
  ]
}

/**
 * @deprecated Prefer {@link recordToScheduleEvents}.
 * @param record - Persisted row.
 * @param options - Optional Schedule-X event options.
 * @returns First schedule event.
 */
export function recordToScheduleEvent(
  record: CalendarEventRecord,
  options?: { disableInteraction?: boolean },
): CalendarEvent {
  return recordToScheduleEvents(record, options)[0]!
}

/**
 * Maps a Schedule-X event to a write payload (preserves unknown fields via caller).
 * @param event - External calendar event.
 * @returns Write fields for upsert.
 */
export function scheduleEventToWrite(event: CalendarEvent): CalendarEventWrite {
  const allDay =
    event.start instanceof Temporal.PlainDate || event.end instanceof Temporal.PlainDate
  return {
    title: (event.title ?? '').trim() || 'Untitled',
    description: event.description?.trim() ? event.description.trim() : null,
    startAt: temporalToIso(event.start, allDay),
    endAt: temporalToIso(event.end, allDay),
    allDay,
    calendarId: event.calendarId ? String(event.calendarId) : null,
  }
}

export { masterIdFromScheduleId }

/**
 * Lists events for one personal or group scope overlapping a time window.
 * Personal scope also includes events where the user is an invitee.
 * Recurring masters with `rrule` are included when their series may intersect.
 * @param scope - Personal owner or group id.
 * @param rangeStartIso - Inclusive window start.
 * @param rangeEndIso - Window end.
 * @returns Event records.
 */
export async function listCalendarEvents(
  scope: CalendarEventScope,
  rangeStartIso: string,
  rangeEndIso: string,
): Promise<CalendarEventRecord[]> {
  if (!isSupabaseConfigured || !supabase) {
    return []
  }

  let rows: EventRow[] = []
  if ('ownerUserId' in scope) {
    const { data: ownedData, error: ownedError } = await supabase
      .from('calendar_events')
      .select(EVENT_SELECT)
      .eq('owner_user_id', scope.ownerUserId)
      .lt('start_at', rangeEndIso)
      .or(`rrule.not.is.null,end_at.gt."${rangeStartIso}"`)
      .order('start_at', { ascending: true })
    if (ownedError) {
      throw ownedError
    }
    const owned = (ownedData ?? []) as EventRow[]
    const { data: inviteRows, error: inviteError } = await supabase
      .from('calendar_event_attendees')
      .select('event_id')
      .eq('user_id', scope.ownerUserId)
    if (inviteError) {
      throw inviteError
    }
    const ownedIds = new Set(owned.map((row) => row.id))
    const inviteIds = [
      ...new Set((inviteRows ?? []).map((row) => row.event_id as string)),
    ].filter((id) => !ownedIds.has(id))
    let invited: EventRow[] = []
    if (inviteIds.length > 0) {
      const { data: invitedData, error: invitedError } = await supabase
        .from('calendar_events')
        .select(EVENT_SELECT)
        .in('id', inviteIds)
        .lt('start_at', rangeEndIso)
        .or(`rrule.not.is.null,end_at.gt."${rangeStartIso}"`)
        .order('start_at', { ascending: true })
      if (invitedError) {
        throw invitedError
      }
      invited = (invitedData ?? []) as EventRow[]
    }
    const byId = new Map<string, EventRow>()
    for (const row of [...owned, ...invited]) {
      byId.set(row.id, row)
    }
    rows = [...byId.values()].sort((a, b) => a.start_at.localeCompare(b.start_at))
  } else {
    const { data, error } = await supabase
      .from('calendar_events')
      .select(EVENT_SELECT)
      .eq('group_id', scope.groupId)
      .lt('start_at', rangeEndIso)
      .or(`rrule.not.is.null,end_at.gt."${rangeStartIso}"`)
      .order('start_at', { ascending: true })
    if (error) {
      throw error
    }
    rows = (data ?? []) as EventRow[]
  }

  const attendees = await loadAttendeesByEventIds(rows.map((row) => row.id))
  return rows.map((row) => mapEvent(row, attendees.get(row.id) ?? []))
}

/**
 * Creates a personal calendar event.
 * @param userId - Auth user id (owner + created_by).
 * @param write - Event fields.
 * @returns Created record.
 */
export async function createPersonalCalendarEvent(
  userId: string,
  write: CalendarEventWrite,
): Promise<CalendarEventRecord> {
  if (!supabase) {
    throw new Error('Supabase is not configured')
  }
  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
      title: write.title,
      description: write.description ?? null,
      start_at: write.startAt,
      end_at: write.endAt,
      all_day: write.allDay,
      owner_user_id: userId,
      group_id: null,
      created_by: userId,
      calendar_id: write.calendarId ?? null,
      rrule: write.rrule ?? null,
      exdate: write.exdates ?? [],
      source: 'workbench',
    })
    .select(EVENT_SELECT)
    .single()
  if (error) {
    throw error
  }
  const row = data as EventRow
  const userIds = write.attendeeUserIds ?? []
  await replaceEventAttendees(row.id, userIds)
  const attendees = await loadAttendeesByEventIds([row.id])
  return mapEvent(row, attendees.get(row.id) ?? [])
}

/**
 * Creates a group calendar event.
 * @param groupId - Target group.
 * @param userId - Auth user id (created_by).
 * @param write - Event fields.
 * @returns Created record.
 */
export async function createGroupCalendarEvent(
  groupId: string,
  userId: string,
  write: CalendarEventWrite,
): Promise<CalendarEventRecord> {
  if (!supabase) {
    throw new Error('Supabase is not configured')
  }
  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
      title: write.title,
      description: write.description ?? null,
      start_at: write.startAt,
      end_at: write.endAt,
      all_day: write.allDay,
      owner_user_id: null,
      group_id: groupId,
      created_by: userId,
      calendar_id: write.calendarId ?? null,
      rrule: write.rrule ?? null,
      exdate: write.exdates ?? [],
      source: 'workbench',
    })
    .select(EVENT_SELECT)
    .single()
  if (error) {
    throw error
  }
  const row = data as EventRow
  await replaceEventAttendees(row.id, write.attendeeUserIds ?? [])
  const attendees = await loadAttendeesByEventIds([row.id])
  return mapEvent(row, attendees.get(row.id) ?? [])
}

/**
 * Updates an existing calendar event by id.
 * @param eventId - Event uuid (master id for recurring).
 * @param write - Fields to update.
 * @returns Updated record.
 */
export async function updateCalendarEvent(
  eventId: string,
  write: CalendarEventWrite,
): Promise<CalendarEventRecord> {
  if (!supabase) {
    throw new Error('Supabase is not configured')
  }
  const masterId = masterIdFromScheduleId(eventId)
  const { data, error } = await supabase
    .from('calendar_events')
    .update({
      title: write.title,
      description: write.description ?? null,
      start_at: write.startAt,
      end_at: write.endAt,
      all_day: write.allDay,
      calendar_id: write.calendarId ?? null,
      rrule: write.rrule ?? null,
      ...(write.exdates !== undefined ? { exdate: write.exdates } : {}),
    })
    .eq('id', masterId)
    .select(EVENT_SELECT)
    .single()
  if (error) {
    throw error
  }
  const row = data as EventRow
  if (write.attendeeUserIds !== undefined) {
    await replaceEventAttendees(masterId, write.attendeeUserIds)
  }
  const attendees = await loadAttendeesByEventIds([masterId])
  return mapEvent(row, attendees.get(masterId) ?? [])
}

/**
 * Appends an EXDATE to a recurring master (idempotent for the same instant).
 * @param eventId - Master event uuid.
 * @param occurrenceStartIso - Occurrence start to exclude.
 * @returns Updated record.
 */
export async function appendCalendarEventExdate(
  eventId: string,
  occurrenceStartIso: string,
): Promise<CalendarEventRecord> {
  const master = await getCalendarEvent(eventId)
  if (!master) {
    throw new Error('Calendar event not found')
  }
  if (isOccurrenceExcluded(occurrenceStartIso, master.exdates)) {
    return master
  }
  return updateCalendarEvent(master.id, {
    title: master.title,
    description: master.description,
    startAt: master.startAt,
    endAt: master.endAt,
    allDay: master.allDay,
    calendarId: master.calendarId,
    rrule: master.rrule,
    exdates: [...master.exdates, occurrenceStartIso],
    attendeeUserIds: master.attendeeUserIds,
  })
}

/**
 * Truncates a recurring master so occurrences at/after the cut are gone.
 * Deletes the master when no prior occurrences remain.
 * @param eventId - Master event uuid.
 * @param cutStartIso - First occurrence to remove from the old series.
 * @returns Updated master, or null when deleted.
 */
export async function truncateCalendarEventBefore(
  eventId: string,
  cutStartIso: string,
): Promise<CalendarEventRecord | null> {
  const master = await getCalendarEvent(eventId)
  if (!master?.rrule) {
    throw new Error('Calendar event is not recurring')
  }
  const nextRrule = truncateRruleBefore(master.rrule, master.startAt, cutStartIso)
  if (!nextRrule) {
    await deleteCalendarEvent(master.id)
    return null
  }
  const nextExdates = master.exdates.filter(
    (iso) => new Date(iso).getTime() < new Date(cutStartIso).getTime(),
  )
  return updateCalendarEvent(master.id, {
    title: master.title,
    description: master.description,
    startAt: master.startAt,
    endAt: master.endAt,
    allDay: master.allDay,
    calendarId: master.calendarId,
    rrule: nextRrule,
    exdates: nextExdates,
    attendeeUserIds: master.attendeeUserIds,
  })
}

/**
 * Applies a recurring edit for this / following / all.
 * @param params - Master, scope, original occurrence, and write payload.
 * @returns Nothing.
 */
export async function applyRecurringCalendarEdit(params: {
  master: CalendarEventRecord
  scope: RecurrenceEditScope
  occurrenceStartIso: string
  write: CalendarEventWrite
  createEvent: (write: CalendarEventWrite) => Promise<CalendarEventRecord>
}): Promise<void> {
  const { master, scope, occurrenceStartIso, write, createEvent } = params
  if (!master.rrule) {
    await updateCalendarEvent(master.id, write)
    return
  }

  if (scope === 'all') {
    const shifted = shiftSeriesByOccurrenceDelta(
      master.startAt,
      master.endAt,
      occurrenceStartIso,
      write.startAt,
      write.endAt,
    )
    await updateCalendarEvent(master.id, {
      ...write,
      startAt: shifted.startAt,
      endAt: shifted.endAt,
      exdates: master.exdates,
    })
    return
  }

  if (scope === 'this') {
    await appendCalendarEventExdate(master.id, occurrenceStartIso)
    await createEvent({
      ...write,
      rrule: null,
      exdates: [],
    })
    return
  }

  // following
  await truncateCalendarEventBefore(master.id, occurrenceStartIso)
  await createEvent({
    ...write,
    exdates: [],
  })
}

/**
 * Applies a recurring delete for this / following / all.
 * @param params - Master, scope, and original occurrence start.
 * @returns Nothing.
 */
export async function applyRecurringCalendarDelete(params: {
  master: CalendarEventRecord
  scope: RecurrenceEditScope
  occurrenceStartIso: string
}): Promise<void> {
  const { master, scope, occurrenceStartIso } = params
  if (!master.rrule || scope === 'all') {
    await deleteCalendarEvent(master.id)
    return
  }
  if (scope === 'this') {
    await appendCalendarEventExdate(master.id, occurrenceStartIso)
    return
  }
  await truncateCalendarEventBefore(master.id, occurrenceStartIso)
}

/**
 * Deletes a calendar event by id.
 * @param eventId - Event uuid (master id for recurring).
 * @returns Nothing.
 */
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase is not configured')
  }
  const masterId = masterIdFromScheduleId(eventId)
  const { error } = await supabase.from('calendar_events').delete().eq('id', masterId)
  if (error) {
    throw error
  }
}

/**
 * Loads one event by id including attendees.
 * @param eventId - Master event uuid.
 * @returns Record or null.
 */
export async function getCalendarEvent(
  eventId: string,
): Promise<CalendarEventRecord | null> {
  if (!supabase) {
    return null
  }
  const masterId = masterIdFromScheduleId(eventId)
  const { data, error } = await supabase
    .from('calendar_events')
    .select(EVENT_SELECT)
    .eq('id', masterId)
    .maybeSingle()
  if (error) {
    throw error
  }
  if (!data) {
    return null
  }
  const row = data as EventRow
  const attendees = await loadAttendeesByEventIds([masterId])
  return mapEvent(row, attendees.get(masterId) ?? [])
}

/**
 * Updates the caller's RSVP status on an event.
 * @param eventId - Master event uuid.
 * @param userId - Attendee user id (must match auth.uid via RLS).
 * @param status - New RSVP status.
 * @returns Updated attendee status.
 */
export async function updateCalendarAttendeeRsvp(
  eventId: string,
  userId: string,
  status: CalendarAttendeeStatus,
): Promise<CalendarAttendeeStatus> {
  if (!supabase) {
    throw new Error('Supabase is not configured')
  }
  const masterId = masterIdFromScheduleId(eventId)
  const { data, error } = await supabase
    .from('calendar_event_attendees')
    .update({ status })
    .eq('event_id', masterId)
    .eq('user_id', userId)
    .select('status')
    .maybeSingle()
  if (error) {
    throw error
  }
  if (!data) {
    throw new Error('Attendee row not found')
  }
  return normalizeAttendeeStatus(data.status as string | null)
}
