/**
 * Native Calendar menu commands (macOS application menu).
 * The in-page CalendarMenubar and Schedule-X header controls are hidden when
 * `usesNativeApplicationMenu` is set; the range heading stays in the grid.
 */

/** Native Calendar menu command ids (everything except radios / toggles). */
export const CALENDAR_MENU_COMMANDS = [
  'event:new',
  'calendar:add',
  'ics:import',
  'ics:export',
  'view:today',
  'view:previous',
  'view:next',
] as const

/** Native Calendar menu command id. */
export type CalendarMenuCommand = (typeof CALENDAR_MENU_COMMANDS)[number]

/** Native Calendar menu action. */
export type CalendarMenuAction =
  | { type: 'set-view'; view: string }
  | { type: 'toggle-calendar'; id: string }
  | { type: 'rename-calendar'; id: string }
  | { type: 'delete-calendar'; id: string }
  | { type: 'command'; id: CalendarMenuCommand }

/** One named calendar in the native Calendars menu. */
export type CalendarMenuCalendar = {
  id: string
  label: string
  visible: boolean
  canRename: boolean
  canDelete: boolean
}

/** Live Calendar-menu radios, checkboxes, and enablement. */
export type CalendarMenuViewState = {
  canCreate: boolean
  calendars: CalendarMenuCalendar[]
  selectedView: string
}

type CalendarMenuHandlers = {
  newEvent?: () => void
  addCalendar?: () => void
  importIcs?: () => void
  exportIcs?: () => void
  toggleCalendar?: (id: string) => void
  renameCalendar?: (id: string) => void
  deleteCalendar?: (id: string) => void
  setView?: (view: string) => void
  today?: () => void
  previous?: () => void
  next?: () => void
}

type SnapshotListener = () => void

const DEFAULT_VIEW: CalendarMenuViewState = {
  canCreate: false,
  calendars: [],
  selectedView: 'month-grid',
}

let handlers: CalendarMenuHandlers = {}
let snapshot: CalendarMenuViewState = { ...DEFAULT_VIEW }
const snapshotListeners = new Set<SnapshotListener>()

/**
 * Returns whether two named-calendar rows match.
 * @param left - Current row.
 * @param right - Candidate row.
 * @returns True when every field matches.
 */
function calendarEquals(
  left: CalendarMenuCalendar,
  right: CalendarMenuCalendar,
): boolean {
  return (
    left.id === right.id &&
    left.label === right.label &&
    left.visible === right.visible &&
    left.canRename === right.canRename &&
    left.canDelete === right.canDelete
  )
}

/**
 * Returns whether two Calendar-menu snapshots are equivalent.
 * @param left - Current snapshot.
 * @param right - Candidate snapshot.
 * @returns True when every field matches.
 */
function viewEquals(left: CalendarMenuViewState, right: CalendarMenuViewState): boolean {
  if (
    left.canCreate !== right.canCreate ||
    left.selectedView !== right.selectedView ||
    left.calendars.length !== right.calendars.length
  ) {
    return false
  }
  return left.calendars.every((row, index) => {
    const other = right.calendars[index]
    return other !== undefined && calendarEquals(row, other)
  })
}

/**
 * Notify Calendar-menu snapshot subscribers.
 * @returns Nothing.
 */
function emitSnapshot(): void {
  snapshotListeners.forEach((listener) => listener())
}

/**
 * Returns whether Calendar chrome should hide controls that live in the
 * macOS application menu.
 * @returns True on macOS with a native application menu.
 */
export function usesNativeCalendarMenu(): boolean {
  return Boolean(window.workbench?.window?.usesNativeApplicationMenu)
}

/**
 * Latest Calendar menu snapshot for the macOS application menu.
 * @returns View state.
 */
export function getCalendarMenuSnapshot(): CalendarMenuViewState {
  return snapshot
}

/**
 * Subscribe to Calendar menu snapshot changes.
 * @param listener - Callback invoked when radios or enablement change.
 * @returns Unsubscribe function.
 */
export function subscribeCalendarMenuSnapshot(listener: SnapshotListener): () => void {
  snapshotListeners.add(listener)
  return () => {
    snapshotListeners.delete(listener)
  }
}

/**
 * Merges live Calendar-menu radios and enablement.
 * @param patch - Fields to update.
 * @returns Nothing.
 */
export function setCalendarMenuView(patch: Partial<CalendarMenuViewState>): void {
  const next: CalendarMenuViewState = {
    ...snapshot,
    ...patch,
    calendars: patch.calendars
      ? patch.calendars.map((row) => ({ ...row }))
      : snapshot.calendars,
  }
  if (viewEquals(snapshot, next)) {
    return
  }
  snapshot = next
  emitSnapshot()
}

/**
 * Merges Calendar-menu command handlers from the Calendar page or host.
 * @param next - Handler patch.
 * @returns Nothing.
 */
export function patchCalendarMenuHandlers(next: CalendarMenuHandlers): void {
  handlers = { ...handlers, ...next }
}

/**
 * Clears Schedule-X view/navigation handlers when the calendar host unmounts.
 * @returns Nothing.
 */
export function clearCalendarHostMenu(): void {
  handlers = {
    ...handlers,
    setView: undefined,
    today: undefined,
    previous: undefined,
    next: undefined,
  }
}

/**
 * Clears Calendar-menu handlers and snapshot when the Calendar page unmounts.
 * @returns Nothing.
 */
export function unregisterCalendarMenuHost(): void {
  handlers = {}
  const empty: CalendarMenuViewState = { ...DEFAULT_VIEW }
  if (viewEquals(snapshot, empty)) {
    return
  }
  snapshot = empty
  emitSnapshot()
}

/**
 * Runs a native Calendar menu command.
 * @param action - Menu action.
 * @returns Nothing.
 */
export function dispatchCalendarMenuAction(action: CalendarMenuAction): void {
  if (action.type === 'set-view') {
    handlers.setView?.(action.view)
    return
  }
  if (action.type === 'toggle-calendar') {
    handlers.toggleCalendar?.(action.id)
    return
  }
  if (action.type === 'rename-calendar') {
    handlers.renameCalendar?.(action.id)
    return
  }
  if (action.type === 'delete-calendar') {
    handlers.deleteCalendar?.(action.id)
    return
  }
  switch (action.id) {
    case 'event:new':
      handlers.newEvent?.()
      return
    case 'calendar:add':
      handlers.addCalendar?.()
      return
    case 'ics:import':
      handlers.importIcs?.()
      return
    case 'ics:export':
      handlers.exportIcs?.()
      return
    case 'view:today':
      handlers.today?.()
      return
    case 'view:previous':
      handlers.previous?.()
      return
    case 'view:next':
      handlers.next?.()
      return
    default:
      return
  }
}
