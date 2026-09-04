/** Calendar rows stored in Electron SQLite (this PC only). */

/** Attendee RSVP status. */
export type CalendarAttendeeStatus = 'invited' | 'accepted' | 'declined' | 'tentative'

/** Invitee row on a calendar event. */
export interface CalendarAttendeeDto {
  userId: string
  status: CalendarAttendeeStatus
}

/** Named calendar list row. */
export interface CalendarListRecordDto {
  id: string
  name: string
  color: string
  ownerUserId: string | null
  groupId: string | null
  isDefault: boolean
  googleCalendarId: string | null
  createdAt: string
  updatedAt: string
}

/** Persisted calendar event row. */
export interface CalendarEventRecordDto {
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
  source: 'workbench' | 'google'
  googleEventId: string | null
  googleCalendarId: string | null
  googleEtag: string | null
  googleUpdatedAt: string | null
  calendarId: string | null
  rrule: string | null
  exdates: string[]
  attendees: CalendarAttendeeDto[]
  attendeeUserIds: string[]
}

/** Personal owner or group id. */
export type CalendarScopeDto = { ownerUserId: string } | { groupId: string }

/** Writable fields for create/update. */
export interface CalendarEventWriteDto {
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

/**
 * Returns whether a value is a calendar list/event scope.
 * @param value - Candidate IPC payload.
 * @returns True when ownerUserId or groupId is a non-empty string.
 */
export function isCalendarScopeDto(value: unknown): value is CalendarScopeDto {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const record = value as Record<string, unknown>
  if (typeof record.ownerUserId === 'string' && record.ownerUserId.trim().length > 0) {
    return true
  }
  return typeof record.groupId === 'string' && record.groupId.trim().length > 0
}

/**
 * Returns whether a value is an event write payload.
 * @param value - Candidate IPC payload.
 * @returns True when required fields are present.
 */
export function isCalendarEventWriteDto(value: unknown): value is CalendarEventWriteDto {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.title === 'string' &&
    typeof record.startAt === 'string' &&
    typeof record.endAt === 'string' &&
    typeof record.allDay === 'boolean'
  )
}
