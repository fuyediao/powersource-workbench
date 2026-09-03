/**
 * Folio native application-menu bridge (macOS).
 * The in-page FolioMenubar is hidden when `usesNativeApplicationMenu` is set;
 * commands live on the system menu bar instead.
 */

/** Native Folio menu commands. */
export type FolioMenuCommand =
  | 'scope:personal'
  | 'scope:group'
  | 'page:new'
  | 'page:move-to-group'
  | 'page:copy-to-personal'
  | 'page:delete'

/** Native Folio menu action (group radio or command). */
export type FolioMenuAction =
  | { type: 'select-group'; groupId: string }
  | { type: 'command'; id: FolioMenuCommand }

/** One group row in the native Scope menu. */
export type FolioMenuGroup = {
  id: string
  label: string
}

/** Live Folio-menu radios and enablement. */
export type FolioMenuViewState = {
  mode: 'personal' | 'group'
  groups: FolioMenuGroup[]
  selectedGroupId: string | null
  canSwitchGroups: boolean
  canCreate: boolean
  canMoveToGroup: boolean
  canCopyToPersonal: boolean
  canDelete: boolean
  hasSelection: boolean
}

type FolioMenuHandlers = {
  setMode?: (mode: 'personal' | 'group') => void
  selectGroup?: (groupId: string) => void
  newPage?: () => void
  moveToGroup?: () => void
  copyToPersonal?: () => void
  deletePage?: () => void
}

const DEFAULT_VIEW: FolioMenuViewState = {
  mode: 'personal',
  groups: [],
  selectedGroupId: null,
  canSwitchGroups: false,
  canCreate: false,
  canMoveToGroup: false,
  canCopyToPersonal: false,
  canDelete: false,
  hasSelection: false,
}

let snapshot: FolioMenuViewState = { ...DEFAULT_VIEW, groups: [] }
let handlers: FolioMenuHandlers = {}
const listeners = new Set<(view: FolioMenuViewState) => void>()

/**
 * Compares two Folio menu view snapshots.
 * @param a - Left.
 * @param b - Right.
 * @returns True when equal.
 */
function viewEquals(a: FolioMenuViewState, b: FolioMenuViewState): boolean {
  if (
    a.mode !== b.mode ||
    a.selectedGroupId !== b.selectedGroupId ||
    a.canSwitchGroups !== b.canSwitchGroups ||
    a.canCreate !== b.canCreate ||
    a.canMoveToGroup !== b.canMoveToGroup ||
    a.canCopyToPersonal !== b.canCopyToPersonal ||
    a.canDelete !== b.canDelete ||
    a.hasSelection !== b.hasSelection ||
    a.groups.length !== b.groups.length
  ) {
    return false
  }
  return a.groups.every(
    (row, index) => row.id === b.groups[index]?.id && row.label === b.groups[index]?.label,
  )
}

/**
 * Notifies subscribers of the current Folio menu snapshot.
 * @returns Nothing.
 */
function emitSnapshot(): void {
  for (const listener of listeners) {
    listener(snapshot)
  }
}

/**
 * Returns the current Folio menu view snapshot.
 * @returns Current view.
 */
export function getFolioMenuSnapshot(): FolioMenuViewState {
  return {
    ...snapshot,
    groups: snapshot.groups.map((row) => ({ ...row })),
  }
}

/**
 * Subscribes to Folio menu view changes.
 * @param listener - Callback.
 * @returns Unsubscribe function.
 */
export function subscribeFolioMenuSnapshot(
  listener: (view: FolioMenuViewState) => void,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Merges live Folio-menu radios and enablement.
 * @param patch - Fields to update.
 * @returns Nothing.
 */
export function setFolioMenuView(patch: Partial<FolioMenuViewState>): void {
  const next: FolioMenuViewState = {
    ...snapshot,
    ...patch,
    groups: patch.groups ? patch.groups.map((row) => ({ ...row })) : snapshot.groups,
  }
  if (viewEquals(snapshot, next)) {
    return
  }
  snapshot = next
  emitSnapshot()
}

/**
 * Merges Folio-menu command handlers from the Folio page.
 * @param next - Handler patch.
 * @returns Nothing.
 */
export function patchFolioMenuHandlers(next: FolioMenuHandlers): void {
  handlers = { ...handlers, ...next }
}

/**
 * Clears Folio-menu handlers and snapshot when the Folio page unmounts.
 * @returns Nothing.
 */
export function unregisterFolioMenuHost(): void {
  handlers = {}
  const empty: FolioMenuViewState = { ...DEFAULT_VIEW, groups: [] }
  if (viewEquals(snapshot, empty)) {
    return
  }
  snapshot = empty
  emitSnapshot()
}

/**
 * Runs a native Folio menu command.
 * @param action - Menu action.
 * @returns Nothing.
 */
export function dispatchFolioMenuAction(action: FolioMenuAction): void {
  if (action.type === 'select-group') {
    handlers.setMode?.('group')
    handlers.selectGroup?.(action.groupId)
    return
  }
  switch (action.id) {
    case 'scope:personal':
      handlers.setMode?.('personal')
      return
    case 'scope:group':
      handlers.setMode?.('group')
      return
    case 'page:new':
      handlers.newPage?.()
      return
    case 'page:move-to-group':
      handlers.moveToGroup?.()
      return
    case 'page:copy-to-personal':
      handlers.copyToPersonal?.()
      return
    case 'page:delete':
      handlers.deletePage?.()
      return
    default:
      return
  }
}

/**
 * Reports whether a title-bar screen id is Folio (feature or per-page tab).
 * @param screen - Active title-bar id.
 * @returns True for Folio screens.
 */
export function isFolioScreen(screen: string): boolean {
  return screen === 'folio' || screen.startsWith('folio:')
}
