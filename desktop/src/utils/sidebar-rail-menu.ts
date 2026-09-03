/**
 * Shared macOS application-menu bridge for rails that use SidebarModeControl
 * (Clash, Settings, Admin, Board, Products, NEXDOT, T&E Admin). Mail is not
 * included. Hide the in-page footer control when `usesNativeApplicationMenu`
 * is set.
 */

import type { SidebarMode } from '@/hooks/use-sidebar-mode'

/** Title-bar screens that host the shared Sidebar native menus. */
export const SIDEBAR_CONTROL_SCREENS = [
  'clash',
  'settings',
  'admin',
  'kanban',
  'products',
  'nexdot',
  'teAdmin',
] as const

/** Native sidebar-control commands (Expanded / Collapsed / Hover / Hide). */
export type SidebarRailMenuCommand =
  | 'sidebar:expanded'
  | 'sidebar:collapsed'
  | 'sidebar:hover'
  | 'sidebar:hidden'

/** Native sidebar menu action (mode radio or nav item). */
export type SidebarRailMenuAction =
  | SidebarRailMenuCommand
  | { type: 'select-item'; id: string }

/** One page row in the native Sidebar menu. */
export type SidebarRailMenuItem = {
  id: string
  label: string
  separatorBefore?: boolean
}

/** Live sidebar radios and nav rows. */
export type SidebarRailMenuViewState = {
  sidebarMode: SidebarMode
  items: SidebarRailMenuItem[]
  selectedId: string | null
}

type SidebarRailMenuHandlers = {
  setSidebarMode?: (mode: SidebarMode) => void
  selectItem?: (id: string) => void
}

type SnapshotListener = () => void

const DEFAULT_VIEW: SidebarRailMenuViewState = {
  sidebarMode: 'hover',
  items: [],
  selectedId: null,
}

let handlers: SidebarRailMenuHandlers = {}
let snapshot: SidebarRailMenuViewState = { ...DEFAULT_VIEW, items: [] }
const snapshotListeners = new Set<SnapshotListener>()

/**
 * Reports whether a title-bar screen uses the shared Sidebar native menus.
 * @param screen - Active title-bar id.
 * @returns True for Clash, Settings, Board, and Admin-shell Function apps.
 */
export function isSidebarControlScreen(screen: string): boolean {
  return (SIDEBAR_CONTROL_SCREENS as readonly string[]).includes(screen)
}

/**
 * Picks the longest nav id that matches a nested path (Admin customer drills).
 * @param items - Sidebar page rows.
 * @param activePath - Current shell path.
 * @returns Matching id, or null.
 */
export function longestMatchingSidebarItemId(
  items: readonly { id: string }[],
  activePath: string | null,
): string | null {
  if (!activePath) {
    return null
  }
  const pathOnly = (activePath.split('#')[0] ?? activePath).split('?')[0] ?? activePath
  let best: string | null = null
  for (const item of items) {
    if (pathOnly === item.id || pathOnly.startsWith(`${item.id}/`)) {
      if (best === null || item.id.length > best.length) {
        best = item.id
      }
    }
  }
  return best
}

/**
 * Notify sidebar-menu snapshot subscribers.
 * @returns Nothing.
 */
function emitSnapshot(): void {
  snapshotListeners.forEach((listener) => listener())
}

/**
 * Whether two sidebar-menu snapshots are equivalent.
 * @param left - Current snapshot.
 * @param right - Candidate snapshot.
 * @returns True when radios and nav rows match.
 */
function sameView(
  left: SidebarRailMenuViewState,
  right: SidebarRailMenuViewState,
): boolean {
  if (left.sidebarMode !== right.sidebarMode || left.selectedId !== right.selectedId) {
    return false
  }
  if (left.items.length !== right.items.length) {
    return false
  }
  return left.items.every((item, index) => {
    const other = right.items[index]
    return (
      other !== undefined &&
      item.id === other.id &&
      item.label === other.label &&
      Boolean(item.separatorBefore) === Boolean(other.separatorBefore)
    )
  })
}

/**
 * Latest sidebar-menu snapshot for the macOS application menu.
 * @returns View state.
 */
export function getSidebarRailMenuSnapshot(): SidebarRailMenuViewState {
  return snapshot
}

/**
 * Subscribe to sidebar-menu snapshot changes.
 * @param listener - Callback invoked when mode or nav rows change.
 * @returns Unsubscribe function.
 */
export function subscribeSidebarRailMenuSnapshot(
  listener: SnapshotListener,
): () => void {
  snapshotListeners.add(listener)
  return () => {
    snapshotListeners.delete(listener)
  }
}

/**
 * Merges live sidebar-menu radios and nav rows.
 * @param patch - Fields to update.
 * @returns Nothing.
 */
export function setSidebarRailMenuView(
  patch: Partial<SidebarRailMenuViewState>,
): void {
  const next: SidebarRailMenuViewState = {
    ...snapshot,
    ...patch,
    items: patch.items ? patch.items.map((item) => ({ ...item })) : snapshot.items,
  }
  if (sameView(snapshot, next)) {
    return
  }
  snapshot = next
  emitSnapshot()
}

/**
 * Merges sidebar-menu command handlers from the active rail host.
 * @param next - Handler patch.
 * @returns Nothing.
 */
export function patchSidebarRailMenuHandlers(next: SidebarRailMenuHandlers): void {
  handlers = { ...handlers, ...next }
}

/**
 * Clears sidebar-menu handlers and snapshot when the rail host unmounts.
 * @returns Nothing.
 */
export function unregisterSidebarRailMenuHost(): void {
  handlers = {}
  const next = { ...DEFAULT_VIEW, items: [] as SidebarRailMenuItem[] }
  if (sameView(snapshot, next)) {
    return
  }
  snapshot = next
  emitSnapshot()
}

/**
 * Runs a native Sidebar or Sidebar control command.
 * @param action - Menu action.
 * @returns Nothing.
 */
export function dispatchSidebarRailMenuAction(action: SidebarRailMenuAction): void {
  if (typeof action !== 'string') {
    if (action.type === 'select-item') {
      handlers.selectItem?.(action.id)
    }
    return
  }
  switch (action) {
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
    default:
      return
  }
}
