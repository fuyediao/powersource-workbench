/** Native Team menu commands (macOS application menu). */
export const TEAM_MENU_COMMANDS = ['period:current'] as const

/** Native Team menu command id. */
export type TeamMenuCommand = (typeof TEAM_MENU_COMMANDS)[number]

/** BSC / PBC / Retro radios in the native View menu. */
export const TEAM_MENU_MODES = ['bsc', 'pbc', 'retro'] as const

/** Native Team view-mode id. */
export type TeamMenuMode = (typeof TEAM_MENU_MODES)[number]

/** PBC group vs individual radios in the native PBC menu. */
export const TEAM_PBC_SCOPES = ['group', 'individual'] as const

/** Native Team PBC scope id. */
export type TeamPbcScope = (typeof TEAM_PBC_SCOPES)[number]

/** Native Team menu action. */
export type TeamMenuAction =
  | { type: 'select-mode'; mode: TeamMenuMode }
  | { type: 'select-year'; year: number }
  | { type: 'select-month'; month: number }
  | { type: 'select-group'; groupId: string }
  | { type: 'select-pbc-scope'; scope: TeamPbcScope }
  | { type: 'select-pbc-member'; userId: string }
  | { type: 'command'; id: TeamMenuCommand }

/** One labeled row in the native Team menus. */
export type TeamMenuItem = {
  id: string
  label: string
}

/** Live Team-menu radios and enablement. */
export type TeamMenuViewState = {
  modes: TeamMenuItem[]
  selectedMode: TeamMenuMode
  years: TeamMenuItem[]
  selectedYear: number
  months: TeamMenuItem[]
  selectedMonth: number
  canGoToCurrent: boolean
  groups: TeamMenuItem[]
  selectedGroupId: string | null
  showGroupMenu: boolean
  pbcScope: TeamPbcScope
  pbcMembers: TeamMenuItem[]
  selectedPbcMemberId: string | null
}

type TeamMenuHandlers = {
  setMode?: (mode: TeamMenuMode) => void
  selectYear?: (year: number) => void
  selectMonth?: (month: number) => void
  selectGroup?: (groupId: string) => void
  setPbcScope?: (scope: TeamPbcScope) => void
  selectPbcMember?: (userId: string) => void
  goToCurrent?: () => void
}

type SnapshotListener = () => void

const DEFAULT_VIEW: TeamMenuViewState = {
  modes: [],
  selectedMode: 'bsc',
  years: [],
  selectedYear: new Date().getFullYear(),
  months: [],
  selectedMonth: new Date().getMonth() + 1,
  canGoToCurrent: false,
  groups: [],
  selectedGroupId: null,
  showGroupMenu: false,
  pbcScope: 'group',
  pbcMembers: [],
  selectedPbcMemberId: null,
}

let handlers: TeamMenuHandlers = {}
let snapshot: TeamMenuViewState = {
  ...DEFAULT_VIEW,
  modes: [],
  years: [],
  months: [],
  groups: [],
  pbcMembers: [],
}
const snapshotListeners = new Set<SnapshotListener>()

/**
 * Returns whether a value is a Team view-mode id.
 * @param value - Candidate mode.
 * @returns True for bsc, pbc, or retro.
 */
export function isTeamMenuMode(value: string): value is TeamMenuMode {
  return (TEAM_MENU_MODES as readonly string[]).includes(value)
}

/**
 * Returns whether two labeled menu rows match.
 * @param left - Current row.
 * @param right - Candidate row.
 * @returns True when id and label match.
 */
function itemEquals(left: TeamMenuItem, right: TeamMenuItem): boolean {
  return left.id === right.id && left.label === right.label
}

/**
 * Returns whether two labeled-row lists match.
 * @param left - Current list.
 * @param right - Candidate list.
 * @returns True when every row matches in order.
 */
function itemsEqual(left: TeamMenuItem[], right: TeamMenuItem[]): boolean {
  if (left.length !== right.length) {
    return false
  }
  return left.every((item, index) => {
    const other = right[index]
    return other !== undefined && itemEquals(item, other)
  })
}

/**
 * Returns whether two Team-menu snapshots are equivalent.
 * @param left - Current snapshot.
 * @param right - Candidate snapshot.
 * @returns True when every field matches.
 */
function viewEquals(left: TeamMenuViewState, right: TeamMenuViewState): boolean {
  return (
    left.selectedMode === right.selectedMode &&
    left.selectedYear === right.selectedYear &&
    left.selectedMonth === right.selectedMonth &&
    left.canGoToCurrent === right.canGoToCurrent &&
    left.selectedGroupId === right.selectedGroupId &&
    left.showGroupMenu === right.showGroupMenu &&
    left.pbcScope === right.pbcScope &&
    left.selectedPbcMemberId === right.selectedPbcMemberId &&
    itemsEqual(left.modes, right.modes) &&
    itemsEqual(left.years, right.years) &&
    itemsEqual(left.months, right.months) &&
    itemsEqual(left.groups, right.groups) &&
    itemsEqual(left.pbcMembers, right.pbcMembers)
  )
}

/**
 * Notify Team-menu snapshot subscribers.
 * @returns Nothing.
 */
function emitSnapshot(): void {
  snapshotListeners.forEach((listener) => listener())
}

/**
 * Returns whether the Team toolbar should hide controls that live in the
 * macOS application menu (view switcher, period filters, group picker, and
 * PBC group/individual plus member picker).
 * @returns True on macOS with a native application menu.
 */
export function usesNativeTeamMenu(): boolean {
  return Boolean(window.geocrm?.window?.usesNativeApplicationMenu)
}

/**
 * Latest Team menu snapshot for the macOS application menu.
 * @returns View state.
 */
export function getTeamMenuSnapshot(): TeamMenuViewState {
  return snapshot
}

/**
 * Subscribe to Team menu snapshot changes.
 * @param listener - Callback invoked when radios or enablement change.
 * @returns Unsubscribe function.
 */
export function subscribeTeamMenuSnapshot(listener: SnapshotListener): () => void {
  snapshotListeners.add(listener)
  return () => {
    snapshotListeners.delete(listener)
  }
}

/**
 * Merges live Team-menu radios and enablement.
 * @param patch - Fields to update.
 * @returns Nothing.
 */
export function setTeamMenuView(patch: Partial<TeamMenuViewState>): void {
  const next: TeamMenuViewState = {
    ...snapshot,
    ...patch,
    modes: patch.modes ? patch.modes.map((row) => ({ ...row })) : snapshot.modes,
    years: patch.years ? patch.years.map((row) => ({ ...row })) : snapshot.years,
    months: patch.months ? patch.months.map((row) => ({ ...row })) : snapshot.months,
    groups: patch.groups ? patch.groups.map((row) => ({ ...row })) : snapshot.groups,
    pbcMembers: patch.pbcMembers
      ? patch.pbcMembers.map((row) => ({ ...row }))
      : snapshot.pbcMembers,
  }
  if (viewEquals(snapshot, next)) {
    return
  }
  snapshot = next
  emitSnapshot()
}

/**
 * Merges Team-menu command handlers from the Team page.
 * @param next - Handler patch.
 * @returns Nothing.
 */
export function patchTeamMenuHandlers(next: TeamMenuHandlers): void {
  handlers = { ...handlers, ...next }
}

/**
 * Clears PBC scope/member handlers when the PBC pane unmounts.
 * @returns Nothing.
 */
export function clearPbcMenu(): void {
  handlers = {
    ...handlers,
    setPbcScope: undefined,
    selectPbcMember: undefined,
  }
  setTeamMenuView({
    pbcScope: 'group',
    pbcMembers: [],
    selectedPbcMemberId: null,
  })
}

/**
 * Clears Team-menu handlers and snapshot when the Team page unmounts.
 * @returns Nothing.
 */
export function unregisterTeamMenuHost(): void {
  handlers = {}
  const empty: TeamMenuViewState = {
    ...DEFAULT_VIEW,
    modes: [],
    years: [],
    months: [],
    groups: [],
    pbcMembers: [],
  }
  if (viewEquals(snapshot, empty)) {
    return
  }
  snapshot = empty
  emitSnapshot()
}

/**
 * Runs a native Team menu command.
 * @param action - Menu action.
 * @returns Nothing.
 */
export function dispatchTeamMenuAction(action: TeamMenuAction): void {
  if (action.type === 'select-mode') {
    handlers.setMode?.(action.mode)
    return
  }
  if (action.type === 'select-year') {
    handlers.selectYear?.(action.year)
    return
  }
  if (action.type === 'select-month') {
    handlers.selectMonth?.(action.month)
    return
  }
  if (action.type === 'select-group') {
    handlers.selectGroup?.(action.groupId)
    return
  }
  if (action.type === 'select-pbc-scope') {
    handlers.setPbcScope?.(action.scope)
    return
  }
  if (action.type === 'select-pbc-member') {
    handlers.selectPbcMember?.(action.userId)
    return
  }
  handlers.goToCurrent?.()
}
