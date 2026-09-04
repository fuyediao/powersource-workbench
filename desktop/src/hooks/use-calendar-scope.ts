/**
 * Calendar capability flags. Workbench Calendar is personal-only.
 */

/** Capability flags for the Calendar workspace. */
export interface CalendarCapabilities {
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  readOnly: boolean
}

/** Full write access on the signed-in user's personal calendars. */
export const PERSONAL_CALENDAR_CAPABILITIES: CalendarCapabilities = {
  canCreate: true,
  canEdit: true,
  canDelete: true,
  readOnly: false,
}
