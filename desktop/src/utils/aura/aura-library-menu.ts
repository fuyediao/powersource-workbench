/**
 * Aura Scope/Library native application-menu bridge (macOS).
 * The in-page Aura Files panel shows an equivalent Scope toggle when the
 * native application menu is not used (Windows / Linux); commands otherwise
 * live on the system menu bar. Aura has at most one open tab, so this keeps
 * a single global snapshot (Folio pattern), unlike Office's per-kind bridge.
 */

/** Native Aura Scope/Library menu commands. */
export type AuraLibraryMenuCommand =
  | 'scope:personal'
  | 'scope:group'
  | 'library:move-to-group'
  | 'library:copy-to-personal'
  | 'library:delete'

/** Native Aura Scope/Library menu action (group radio or command). */
export type AuraLibraryMenuAction =
  | { type: 'select-group'; groupId: string }
  | { type: 'command'; id: AuraLibraryMenuCommand }

/** One group row in the native Aura Scope menu. */
export type AuraLibraryMenuGroup = {
  id: string
  label: string
}

/** Live Aura Scope/Library-menu radios and enablement. */
export type AuraLibraryMenuViewState = {
  mode: 'personal' | 'group'
  groups: AuraLibraryMenuGroup[]
  selectedGroupId: string | null
  canSwitchGroups: boolean
  canMoveToGroup: boolean
  canCopyToPersonal: boolean
  canDelete: boolean
  hasSelection: boolean
}

type AuraLibraryMenuHandlers = {
  setMode?: (mode: 'personal' | 'group') => void
  selectGroup?: (groupId: string) => void
  moveToGroup?: () => void
  copyToPersonal?: () => void
  deleteFile?: () => void
}

const DEFAULT_VIEW: AuraLibraryMenuViewState = {
  mode: 'personal',
  groups: [],
  selectedGroupId: null,
  canSwitchGroups: false,
  canMoveToGroup: false,
  canCopyToPersonal: false,
  canDelete: false,
  hasSelection: false,
}

let snapshot: AuraLibraryMenuViewState = { ...DEFAULT_VIEW, groups: [] }
let handlers: AuraLibraryMenuHandlers = {}
const listeners = new Set<(view: AuraLibraryMenuViewState) => void>()

/**
 * Compares two Aura Scope/Library menu view snapshots.
 * @param a - Left.
 * @param b - Right.
 * @returns True when equal.
 */
function viewEquals(a: AuraLibraryMenuViewState, b: AuraLibraryMenuViewState): boolean {
  if (
    a.mode !== b.mode ||
    a.selectedGroupId !== b.selectedGroupId ||
    a.canSwitchGroups !== b.canSwitchGroups ||
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
 * Notifies subscribers of the current Aura Scope/Library menu snapshot.
 * @returns Nothing.
 */
function emitSnapshot(): void {
  for (const listener of listeners) {
    listener(snapshot)
  }
}

/**
 * Returns the current Aura Scope/Library menu view snapshot.
 * @returns Current view.
 */
export function getAuraLibraryMenuSnapshot(): AuraLibraryMenuViewState {
  return {
    ...snapshot,
    groups: snapshot.groups.map((row) => ({ ...row })),
  }
}

/**
 * Subscribes to Aura Scope/Library menu view changes.
 * @param listener - Callback.
 * @returns Unsubscribe function.
 */
export function subscribeAuraLibraryMenuSnapshot(
  listener: (view: AuraLibraryMenuViewState) => void,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Merges live Aura Scope/Library-menu radios and enablement.
 * @param patch - Fields to update.
 * @returns Nothing.
 */
export function setAuraLibraryMenuView(patch: Partial<AuraLibraryMenuViewState>): void {
  const next: AuraLibraryMenuViewState = {
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
 * Merges Aura Scope/Library-menu command handlers from the Aura page.
 * @param next - Handler patch.
 * @returns Nothing.
 */
export function patchAuraLibraryMenuHandlers(next: AuraLibraryMenuHandlers): void {
  handlers = { ...handlers, ...next }
}

/**
 * Clears Aura Scope/Library-menu handlers and snapshot when the Aura page unmounts.
 * @returns Nothing.
 */
export function unregisterAuraLibraryMenuHost(): void {
  handlers = {}
  const empty: AuraLibraryMenuViewState = { ...DEFAULT_VIEW, groups: [] }
  if (viewEquals(snapshot, empty)) {
    return
  }
  snapshot = empty
  emitSnapshot()
}

/**
 * Runs a native Aura Scope/Library menu command.
 * @param action - Menu action.
 * @returns Nothing.
 */
export function dispatchAuraLibraryMenuAction(action: AuraLibraryMenuAction): void {
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
    case 'library:move-to-group':
      handlers.moveToGroup?.()
      return
    case 'library:copy-to-personal':
      handlers.copyToPersonal?.()
      return
    case 'library:delete':
      handlers.deleteFile?.()
      return
    default:
      return
  }
}
