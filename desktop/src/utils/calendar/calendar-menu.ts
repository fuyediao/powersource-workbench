/**
 * Native Calendar menu commands (macOS application menu).
 * The in-page CalendarMenubar and Schedule-X header controls are hidden when
 * `usesNativeApplicationMenu` is set; the range heading stays in the grid.
 */

/** Native Calendar menu command ids (everything except radios / toggles). */
export const CALENDAR_MENU_COMMANDS = [
  'scope:personal',
  'scope:group',
  'event:new',
  'calendar:add',
  'ics:import',
  'ics:export',
  'view:today',
  'view:previous',
  'view:next',
  'google:connect',
  'google:sync',
  'google:disconnect',
] as const

/** Native Calendar menu command id. */
export type CalendarMenuCommand = (typeof CALENDAR_MENU_COMMANDS)[number]

/** Native Calendar menu action. */
export type CalendarMenuAction =
  | { type: 'select-group'; groupId: string }
  | { type: 'set-view'; view: string }
  | { type: 'toggle-calendar'; id: string }
  | { type: 'rename-calendar'; id: string }
  | { type: 'delete-calendar'; id: string }
  | { type: 'toggle-google-calendar'; id: string }
  | { type: 'command'; id: CalendarMenuCommand }

/** One group row in the native Scope menu. */
export type CalendarMenuGroup = {
  id: string
  label: string
}

/** One named calendar in the native Calendars menu. */
export type CalendarMenuCalendar = {
  id: string
  label: string
  visible: boolean
  canRename: boolean
  canDelete: boolean
}

/** One Google calendar row in the native Connection menu. */
export type CalendarMenuGoogleCalendar = {
  id: string
  label: string
  selected: boolean
  enabled: boolean
}

/** Live Calendar-menu radios, checkboxes, and enablement. */
export type CalendarMenuViewState = {
  mode: 'personal' | 'group'
  groups: CalendarMenuGroup[]
  selectedGroupId: string | null
  canSwitchGroups: boolean
  canCreate: boolean
  calendars: CalendarMenuCalendar[]
  selectedView: string
  showConnectionMenu: boolean
  googleEmail: string | null
  googleConnecting: boolean
  googleSyncing: boolean
  googleNeedsReauth: boolean
  googleCalendars: CalendarMenuGoogleCalendar[]
}

type CalendarMenuHandlers = {
  setMode?: (mode: 'personal' | 'group') => void
  selectGroup?: (groupId: string) => void
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
  googleConnect?: () => void
  googleSync?: () => void
  googleDisconnect?: () => void
  toggleGoogleCalendar?: (id: string) => void
}

type SnapshotListener = () => void

const DEFAULT_VIEW: CalendarMenuViewState = {
  mode: 'personal',
  groups: [],
  selectedGroupId: null,
  canSwitchGroups: false,
  canCreate: false,
  calendars: [],
  selectedView: 'month-grid',
  showConnectionMenu: false,
  googleEmail: null,
  googleConnecting: false,
  googleSyncing: false,
  googleNeedsReauth: false,
  googleCalendars: [],
}

let handlers: CalendarMenuHandlers = {}
let snapshot: CalendarMenuViewState = {
  ...DEFAULT_VIEW,
  groups: [],
  calendars: [],
  googleCalendars: [],
}
const snapshotListeners = new Set<SnapshotListener>()

/**
 * Returns whether two id/label rows match.
 * @param left - Current row.
 * @param right - Candidate row.
 * @returns True when id and label match.
 */
function groupEquals(left: CalendarMenuGroup, right: CalendarMenuGroup): boolean {
  return left.id === right.id && left.label === right.label
}

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
 * Returns whether two Google-calendar rows match.
 * @param left - Current row.
 * @param right - Candidate row.
 * @returns True when every field matches.
 */
function googleEquals(
  left: CalendarMenuGoogleCalendar,
  right: CalendarMenuGoogleCalendar,
): boolean {
  return (
    left.id === right.id &&
    left.label === right.label &&
    left.selected === right.selected &&
    left.enabled === right.enabled
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
    left.mode !== right.mode ||
    left.selectedGroupId !== right.selectedGroupId ||
    left.canSwitchGroups !== right.canSwitchGroups ||
    left.canCreate !== right.canCreate ||
    left.selectedView !== right.selectedView ||
    left.showConnectionMenu !== right.showConnectionMenu ||
    left.googleEmail !== right.googleEmail ||
    left.googleConnecting !== right.googleConnecting ||
    left.googleSyncing !== right.googleSyncing ||
    left.googleNeedsReauth !== right.googleNeedsReauth ||
    left.groups.length !== right.groups.length ||
    left.calendars.length !== right.calendars.length ||
    left.googleCalendars.length !== right.googleCalendars.length
  ) {
    return false
  }
  return (
    left.groups.every((row, index) => {
      const other = right.groups[index]
      return other !== undefined && groupEquals(row, other)
    }) &&
    left.calendars.every((row, index) => {
      const other = right.calendars[index]
      return other !== undefined && calendarEquals(row, other)
    }) &&
    left.googleCalendars.every((row, index) => {
      const other = right.googleCalendars[index]
      return other !== undefined && googleEquals(row, other)
    })
  )
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
  return Boolean(window.geocrm?.window?.usesNativeApplicationMenu)
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
    groups: patch.groups ? patch.groups.map((row) => ({ ...row })) : snapshot.groups,
    calendars: patch.calendars
      ? patch.calendars.map((row) => ({ ...row }))
      : snapshot.calendars,
    googleCalendars: patch.googleCalendars
      ? patch.googleCalendars.map((row) => ({ ...row }))
      : snapshot.googleCalendars,
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
  const empty: CalendarMenuViewState = {
    ...DEFAULT_VIEW,
    groups: [],
    calendars: [],
    googleCalendars: [],
  }
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
  if (action.type === 'select-group') {
    handlers.selectGroup?.(action.groupId)
    return
  }
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
  if (action.type === 'toggle-google-calendar') {
    handlers.toggleGoogleCalendar?.(action.id)
    return
  }
  switch (action.id) {
    case 'scope:personal':
      handlers.setMode?.('personal')
      return
    case 'scope:group':
      handlers.setMode?.('group')
      return
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
    case 'google:connect':
      handlers.googleConnect?.()
      return
    case 'google:sync':
      handlers.googleSync?.()
      return
    case 'google:disconnect':
      handlers.googleDisconnect?.()
      return
    default:
      return
  }
}
