/**
 * Cross-page handoff to open Calendar and start a create-event dialog (Mail-style).
 */

export interface CalendarEventDraftRequest {
  /** Event title (e.g. mail subject). */
  title?: string
  /** Optional description / notes. */
  description?: string
}

const OPEN_CALENDAR_EVENT = 'workbench:open-calendar'
const CREATE_EVENT = 'workbench:calendar-create-event'

let pendingDraft: CalendarEventDraftRequest | null = null

/**
 * Normalizes a create-event draft (empty payload is still valid).
 * @param request - Raw request.
 * @returns Normalized request.
 */
function normalizeDraftRequest(
  request: CalendarEventDraftRequest,
): CalendarEventDraftRequest {
  const title = request.title?.trim()
  const description = request.description?.trim()
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
  }
}

/**
 * Opens the Calendar title-bar tab and requests a new event dialog with optional fields.
 * Safe to call from any React tree (uses window events + pending payload).
 * @param request - Optional title / description seed.
 * @returns Nothing.
 */
export function openCalendarCreateEvent(request: CalendarEventDraftRequest = {}): void {
  const next = normalizeDraftRequest(request)
  pendingDraft = next
  window.dispatchEvent(new CustomEvent(CREATE_EVENT, { detail: next }))
  window.dispatchEvent(new Event(OPEN_CALENDAR_EVENT))
}

/**
 * Reads and clears a pending create-event draft (for Calendar mount).
 * @returns Pending draft, or null.
 */
export function consumePendingCalendarEventDraft(): CalendarEventDraftRequest | null {
  const next = pendingDraft
  pendingDraft = null
  return next
}

/**
 * Subscribe to Calendar tab open requests.
 * @param listener - Callback when Calendar should open.
 * @returns Unsubscribe function.
 */
export function subscribeOpenCalendarRequest(listener: () => void): () => void {
  const handler = (): void => {
    listener()
  }
  window.addEventListener(OPEN_CALENDAR_EVENT, handler)
  return () => window.removeEventListener(OPEN_CALENDAR_EVENT, handler)
}

/**
 * Subscribe to create-event drafts while Calendar is already mounted.
 * @param listener - Receives the draft payload.
 * @returns Unsubscribe function.
 */
export function subscribeCalendarEventDraftRequest(
  listener: (request: CalendarEventDraftRequest) => void,
): () => void {
  /**
   * @param event - Custom event with draft detail.
   */
  function handler(event: Event): void {
    const detail = (event as CustomEvent<CalendarEventDraftRequest>).detail
    const next = normalizeDraftRequest(detail ?? {})
    pendingDraft = null
    listener(next)
  }
  window.addEventListener(CREATE_EVENT, handler)
  return () => window.removeEventListener(CREATE_EVENT, handler)
}
