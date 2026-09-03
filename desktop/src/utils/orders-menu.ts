/** Native Orders menu commands (macOS application menu). */
export const ORDERS_MENU_COMMANDS = ['sync-erp', 'refresh'] as const

/** Native Orders menu command id. */
export type OrdersMenuCommand = (typeof ORDERS_MENU_COMMANDS)[number]

/** Native Orders menu action (module radio, group radio, or command). */
export type OrdersMenuAction =
  | { type: 'select-module'; moduleId: string }
  | { type: 'select-group'; groupId: string | null }
  | { type: 'command'; id: OrdersMenuCommand }

/** One labeled row in the native Orders or Group menu. */
export type OrdersMenuItem = {
  id: string
  label: string
}

/** Live Orders-menu radios and enablement. */
export type OrdersMenuViewState = {
  modules: OrdersMenuItem[]
  selectedModuleId: string | null
  groups: OrdersMenuItem[]
  selectedGroupId: string | null
  showGroupMenu: boolean
  canSyncErp: boolean
  isSyncing: boolean
  canRefresh: boolean
  isRefreshing: boolean
}

type OrdersMenuHandlers = {
  selectModule?: (moduleId: string) => void
  selectGroup?: (groupId: string | null) => void
  syncErp?: () => void
  refresh?: () => void
}

type SnapshotListener = () => void

const DEFAULT_VIEW: OrdersMenuViewState = {
  modules: [],
  selectedModuleId: null,
  groups: [],
  selectedGroupId: null,
  showGroupMenu: false,
  canSyncErp: false,
  isSyncing: false,
  canRefresh: false,
  isRefreshing: false,
}

let handlers: OrdersMenuHandlers = {}
let snapshot: OrdersMenuViewState = {
  ...DEFAULT_VIEW,
  modules: [],
  groups: [],
}
const snapshotListeners = new Set<SnapshotListener>()

/**
 * Returns whether two labeled menu rows match.
 * @param left - Current row.
 * @param right - Candidate row.
 * @returns True when id and label match.
 */
function itemEquals(left: OrdersMenuItem, right: OrdersMenuItem): boolean {
  return left.id === right.id && left.label === right.label
}

/**
 * Returns whether two labeled-row lists match.
 * @param left - Current list.
 * @param right - Candidate list.
 * @returns True when every row matches in order.
 */
function itemsEqual(left: OrdersMenuItem[], right: OrdersMenuItem[]): boolean {
  if (left.length !== right.length) {
    return false
  }
  return left.every((item, index) => {
    const other = right[index]
    return other !== undefined && itemEquals(item, other)
  })
}

/**
 * Returns whether two Orders-menu snapshots are equivalent.
 * @param left - Current snapshot.
 * @param right - Candidate snapshot.
 * @returns True when every field matches.
 */
function viewEquals(left: OrdersMenuViewState, right: OrdersMenuViewState): boolean {
  return (
    left.selectedModuleId === right.selectedModuleId &&
    left.selectedGroupId === right.selectedGroupId &&
    left.showGroupMenu === right.showGroupMenu &&
    left.canSyncErp === right.canSyncErp &&
    left.isSyncing === right.isSyncing &&
    left.canRefresh === right.canRefresh &&
    left.isRefreshing === right.isRefreshing &&
    itemsEqual(left.modules, right.modules) &&
    itemsEqual(left.groups, right.groups)
  )
}

/**
 * Notify Orders-menu snapshot subscribers.
 * @returns Nothing.
 */
function emitSnapshot(): void {
  snapshotListeners.forEach((listener) => listener())
}

/**
 * Returns whether the Orders toolbar should hide controls that live in the
 * macOS application menu (module switcher, group filter, Sync ERP, Refresh).
 * @returns True on macOS with a native application menu.
 */
export function usesNativeOrdersMenu(): boolean {
  return Boolean(window.workbench?.window?.usesNativeApplicationMenu)
}

/**
 * Latest Orders menu snapshot for the macOS application menu.
 * @returns View state.
 */
export function getOrdersMenuSnapshot(): OrdersMenuViewState {
  return snapshot
}

/**
 * Subscribe to Orders menu snapshot changes.
 * @param listener - Callback invoked when radios or enablement change.
 * @returns Unsubscribe function.
 */
export function subscribeOrdersMenuSnapshot(listener: SnapshotListener): () => void {
  snapshotListeners.add(listener)
  return () => {
    snapshotListeners.delete(listener)
  }
}

/**
 * Merges live Orders-menu radios and enablement.
 * @param patch - Fields to update.
 * @returns Nothing.
 */
export function setOrdersMenuView(patch: Partial<OrdersMenuViewState>): void {
  const next: OrdersMenuViewState = {
    ...snapshot,
    ...patch,
    modules: patch.modules
      ? patch.modules.map((row) => ({ ...row }))
      : snapshot.modules,
    groups: patch.groups ? patch.groups.map((row) => ({ ...row })) : snapshot.groups,
  }
  if (viewEquals(snapshot, next)) {
    return
  }
  snapshot = next
  emitSnapshot()
}

/**
 * Merges Orders-menu command handlers from the Orders page or list pane.
 * @param next - Handler patch.
 * @returns Nothing.
 */
export function patchOrdersMenuHandlers(next: OrdersMenuHandlers): void {
  handlers = { ...handlers, ...next }
}

/**
 * Clears list-pane handlers (group / Sync ERP / Refresh) without dropping
 * the page-level module switcher.
 * @returns Nothing.
 */
export function clearOrdersListMenu(): void {
  handlers = {
    selectModule: handlers.selectModule,
  }
  setOrdersMenuView({
    groups: [],
    selectedGroupId: null,
    showGroupMenu: false,
    canSyncErp: false,
    isSyncing: false,
    canRefresh: false,
    isRefreshing: false,
  })
}

/**
 * Clears Orders-menu handlers and snapshot when the Orders page unmounts.
 * @returns Nothing.
 */
export function unregisterOrdersMenuHost(): void {
  handlers = {}
  const empty: OrdersMenuViewState = {
    ...DEFAULT_VIEW,
    modules: [],
    groups: [],
  }
  if (viewEquals(snapshot, empty)) {
    return
  }
  snapshot = empty
  emitSnapshot()
}

/**
 * Runs a native Orders menu command.
 * @param action - Menu action.
 * @returns Nothing.
 */
export function dispatchOrdersMenuAction(action: OrdersMenuAction): void {
  if (action.type === 'select-module') {
    handlers.selectModule?.(action.moduleId)
    return
  }
  if (action.type === 'select-group') {
    handlers.selectGroup?.(action.groupId)
    return
  }
  if (action.id === 'sync-erp') {
    handlers.syncErp?.()
    return
  }
  handlers.refresh?.()
}
