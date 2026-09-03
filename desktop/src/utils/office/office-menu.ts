/**
 * Office native application-menu bridge (macOS).
 * The in-page OfficeMenubar is hidden when `usesNativeApplicationMenu` is set;
 * personal/group scope, Admin-style library sidebar modes, and file actions
 * live on the system menu bar instead.
 *
 * Docs / Sheets / Slides tabs stay mounted while open (keep-alive). Each kind
 * owns its own view + handlers so a hidden empty library cannot wipe the
 * active tab's selection enablement (Move to group / Delete).
 */

import type { OfficeFeatureId } from '@/constants/office-folder'
import type { SidebarMode } from '@/hooks/use-sidebar-mode'

/** Native Office menu commands. */
export type OfficeMenuCommand =
  | 'scope:personal'
  | 'scope:group'
  | 'sidebar:expanded'
  | 'sidebar:collapsed'
  | 'sidebar:hover'
  | 'sidebar:hidden'
  | 'file:new'
  | 'file:move-to-group'
  | 'file:copy-to-personal'
  | 'file:delete'

/** Native Office menu action (group radio or command). */
export type OfficeMenuAction =
  | { type: 'select-group'; groupId: string }
  | { type: 'command'; id: OfficeMenuCommand }

/** One group row in the native Scope menu. */
export type OfficeMenuGroup = {
  id: string
  label: string
}

/** Live Office-menu radios and enablement. */
export type OfficeMenuViewState = {
  mode: 'personal' | 'group'
  groups: OfficeMenuGroup[]
  selectedGroupId: string | null
  canSwitchGroups: boolean
  canCreate: boolean
  canMoveToGroup: boolean
  canCopyToPersonal: boolean
  canDelete: boolean
  hasSelection: boolean
  /** Library rail mode (Admin-style four-state). */
  sidebarMode: SidebarMode
}

type OfficeMenuHandlers = {
  setMode?: (mode: 'personal' | 'group') => void
  selectGroup?: (groupId: string) => void
  setSidebarMode?: (mode: SidebarMode) => void
  newFile?: () => void
  moveToGroup?: () => void
  copyToPersonal?: () => void
  deleteFile?: () => void
}

const DEFAULT_VIEW: OfficeMenuViewState = {
  mode: 'personal',
  groups: [],
  selectedGroupId: null,
  canSwitchGroups: false,
  canCreate: false,
  canMoveToGroup: false,
  canCopyToPersonal: false,
  canDelete: false,
  hasSelection: false,
  sidebarMode: 'expanded',
}

/**
 * Clones the default empty Office menu view.
 * @returns Fresh default view.
 */
function createDefaultView(): OfficeMenuViewState {
  return { ...DEFAULT_VIEW, groups: [] }
}

const viewsByKind: Record<OfficeFeatureId, OfficeMenuViewState> = {
  docs: createDefaultView(),
  sheets: createDefaultView(),
  slides: createDefaultView(),
}

const handlersByKind: Record<OfficeFeatureId, OfficeMenuHandlers> = {
  docs: {},
  sheets: {},
  slides: {},
}

const listeners = new Set<(kind: OfficeFeatureId, view: OfficeMenuViewState) => void>()

/**
 * Compares two Office menu view snapshots.
 * @param a - Left.
 * @param b - Right.
 * @returns True when equal.
 */
function viewEquals(a: OfficeMenuViewState, b: OfficeMenuViewState): boolean {
  if (
    a.mode !== b.mode ||
    a.selectedGroupId !== b.selectedGroupId ||
    a.canSwitchGroups !== b.canSwitchGroups ||
    a.canCreate !== b.canCreate ||
    a.canMoveToGroup !== b.canMoveToGroup ||
    a.canCopyToPersonal !== b.canCopyToPersonal ||
    a.canDelete !== b.canDelete ||
    a.hasSelection !== b.hasSelection ||
    a.sidebarMode !== b.sidebarMode ||
    a.groups.length !== b.groups.length
  ) {
    return false
  }
  return a.groups.every(
    (row, index) => row.id === b.groups[index]?.id && row.label === b.groups[index]?.label,
  )
}

/**
 * Notifies subscribers that one Office kind's snapshot changed.
 * @param kind - Docs / Sheets / Slides.
 * @returns Nothing.
 */
function emitSnapshot(kind: OfficeFeatureId): void {
  const view = getOfficeMenuSnapshot(kind)
  for (const listener of listeners) {
    listener(kind, view)
  }
}

/**
 * Returns whether a title-bar screen id is an Office feature kind.
 * @param screen - Active title-bar id.
 * @returns True for docs / sheets / slides.
 */
export function isOfficeScreen(screen: string): screen is OfficeFeatureId {
  return screen === 'docs' || screen === 'sheets' || screen === 'slides'
}

/**
 * Returns the Office menu view snapshot for one feature kind.
 * @param kind - Docs / Sheets / Slides (defaults to docs when omitted for boot).
 * @returns Current view clone.
 */
export function getOfficeMenuSnapshot(kind: OfficeFeatureId = 'docs'): OfficeMenuViewState {
  const snapshot = viewsByKind[kind] ?? createDefaultView()
  return {
    ...snapshot,
    groups: snapshot.groups.map((row) => ({ ...row })),
  }
}

/**
 * Subscribes to Office menu view changes (any kind).
 * @param listener - Callback with the kind that changed and its view.
 * @returns Unsubscribe function.
 */
export function subscribeOfficeMenuSnapshot(
  listener: (kind: OfficeFeatureId, view: OfficeMenuViewState) => void,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Merges live Office-menu radios and enablement for one kind.
 * @param kind - Docs / Sheets / Slides host.
 * @param patch - Fields to update.
 * @returns Nothing.
 */
export function setOfficeMenuView(
  kind: OfficeFeatureId,
  patch: Partial<OfficeMenuViewState>,
): void {
  const snapshot = viewsByKind[kind] ?? createDefaultView()
  const next: OfficeMenuViewState = {
    ...snapshot,
    ...patch,
    groups: patch.groups ? patch.groups.map((row) => ({ ...row })) : snapshot.groups,
  }
  if (viewEquals(snapshot, next)) {
    return
  }
  viewsByKind[kind] = next
  emitSnapshot(kind)
}

/**
 * Merges Office-menu command handlers for one kind.
 * @param kind - Docs / Sheets / Slides host.
 * @param next - Handler patch.
 * @returns Nothing.
 */
export function patchOfficeMenuHandlers(
  kind: OfficeFeatureId,
  next: OfficeMenuHandlers,
): void {
  handlersByKind[kind] = { ...handlersByKind[kind], ...next }
}

/**
 * Clears handlers and snapshot for one Office kind when that tab unmounts.
 * Other open Office tabs keep their slots.
 * @param kind - Docs / Sheets / Slides host being closed.
 * @returns Nothing.
 */
export function unregisterOfficeMenuHost(kind: OfficeFeatureId): void {
  handlersByKind[kind] = {}
  const empty = createDefaultView()
  if (viewEquals(viewsByKind[kind], empty)) {
    return
  }
  viewsByKind[kind] = empty
  emitSnapshot(kind)
}

/**
 * Runs a native Office menu command against the active kind's handlers.
 * @param action - Menu action.
 * @param kind - Active Docs / Sheets / Slides screen.
 * @returns Nothing.
 */
export function dispatchOfficeMenuAction(
  action: OfficeMenuAction,
  kind: OfficeFeatureId,
): void {
  const handlers = handlersByKind[kind] ?? {}
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
    case 'sidebar:expanded':
      handlers.setSidebarMode?.('expanded')
      return
    case 'sidebar:collapsed':
      handlers.setSidebarMode?.('collapsed')
      return
    case 'sidebar:hover':
      handlers.setSidebarMode?.('hover')
      return
    case 'sidebar:hidden':
      handlers.setSidebarMode?.('hidden')
      return
    case 'file:new':
      handlers.newFile?.()
      return
    case 'file:move-to-group':
      handlers.moveToGroup?.()
      return
    case 'file:copy-to-personal':
      handlers.copyToPersonal?.()
      return
    case 'file:delete':
      handlers.deleteFile?.()
      return
    default:
      return
  }
}
