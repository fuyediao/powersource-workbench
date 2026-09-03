/**
 * Map native application-menu bridge (macOS).
 * The in-page MapSidebarMenubar is hidden when `usesNativeApplicationMenu` is set;
 * source and group radios live on the system menu bar instead.
 */

import type { Favorite } from '@/types/favorite'

/** Map sidebar sources shown as radios on the macOS application menu. */
export type MapMenuSourceId = 'map' | 'customer_map' | 'crm_map' | 'competitor_map'

/** One group row in the native Map Group menu. */
export type MapMenuGroup = {
  id: string
  label: string
}

/** Native Map menu commands (macOS application menu). */
export type MapMenuCommand =
  | 'view:toggle-sidebar'
  | 'view:favorites'
  | 'view:locations'
  | 'view:locate'
  | 'view:back'
  | 'view:forward'
  | 'favorites:add'
  | 'favorites:show-all'
  | 'favorites:export'
  | 'favorites:clear-all'
  | 'favorites:toggle-select'
  | 'favorites:select-all'
  | 'favorites:show-selected'
  | 'favorites:delete-selected'
  | 'filter:important'
  | 'filter:normal'
  | 'filter:unimportant'
  | 'filter:weekdays'
  | 'filter:sunday'

/** Native Map menu action (command, source radio, or group radio). */
export type MapMenuAction =
  | MapMenuCommand
  | { type: 'select-source'; source: MapMenuSourceId }
  | { type: 'select-group'; groupId: string | null }

/** Live Map-menu checkboxes and enablement. */
export type MapMenuViewState = {
  sidebarVisible: boolean
  tab: 'chat' | 'shops'
  canGoBackward: boolean
  canGoForward: boolean
  favoriteCount: number
  filteredCount: number
  shopCount: number
  selectionMode: boolean
  selectedCount: number
  allFilteredSelected: boolean
  filterImportant: boolean
  filterNormal: boolean
  filterUnimportant: boolean
  weekdaysOnly: boolean
  sundayOnly: boolean
  source: MapMenuSourceId
  availableSources: MapMenuSourceId[]
  groups: MapMenuGroup[]
  selectedGroupId: string | null
  canSwitchGroups: boolean
}

type MapMenuHandlers = {
  toggleSidebar?: () => void
  setTab?: (tab: 'chat' | 'shops') => void
  locate?: () => void
  goBackward?: () => void
  goForward?: () => void
  addCustom?: () => void
  showAll?: () => void
  exportFavorites?: () => void
  clearAll?: () => void
  toggleSelect?: () => void
  selectAll?: () => void
  showSelected?: () => void
  deleteSelected?: () => void
  toggleFilterImportant?: () => void
  toggleFilterNormal?: () => void
  toggleFilterUnimportant?: () => void
  toggleWeekdays?: () => void
  toggleSunday?: () => void
  setSource?: (source: MapMenuSourceId) => void
  selectGroup?: (groupId: string | null) => void
}

type SnapshotListener = () => void

const DEFAULT_VIEW: MapMenuViewState = {
  sidebarVisible: true,
  tab: 'chat',
  canGoBackward: false,
  canGoForward: false,
  favoriteCount: 0,
  filteredCount: 0,
  shopCount: 0,
  selectionMode: false,
  selectedCount: 0,
  allFilteredSelected: false,
  filterImportant: false,
  filterNormal: false,
  filterUnimportant: false,
  weekdaysOnly: false,
  sundayOnly: false,
  source: 'map',
  availableSources: ['map'],
  groups: [],
  selectedGroupId: null,
  canSwitchGroups: false,
}

let handlers: MapMenuHandlers = {}
let snapshot: MapMenuViewState = {
  ...DEFAULT_VIEW,
  availableSources: [...DEFAULT_VIEW.availableSources],
  groups: [],
}
const snapshotListeners = new Set<SnapshotListener>()

/**
 * Returns whether two Map-menu snapshots are equivalent.
 * @param left - Current snapshot.
 * @param right - Candidate snapshot.
 * @returns True when every field matches.
 */
function viewEquals(left: MapMenuViewState, right: MapMenuViewState): boolean {
  if (
    left.sidebarVisible !== right.sidebarVisible ||
    left.tab !== right.tab ||
    left.canGoBackward !== right.canGoBackward ||
    left.canGoForward !== right.canGoForward ||
    left.favoriteCount !== right.favoriteCount ||
    left.filteredCount !== right.filteredCount ||
    left.shopCount !== right.shopCount ||
    left.selectionMode !== right.selectionMode ||
    left.selectedCount !== right.selectedCount ||
    left.allFilteredSelected !== right.allFilteredSelected ||
    left.filterImportant !== right.filterImportant ||
    left.filterNormal !== right.filterNormal ||
    left.filterUnimportant !== right.filterUnimportant ||
    left.weekdaysOnly !== right.weekdaysOnly ||
    left.sundayOnly !== right.sundayOnly ||
    left.source !== right.source ||
    left.selectedGroupId !== right.selectedGroupId ||
    left.canSwitchGroups !== right.canSwitchGroups ||
    left.availableSources.length !== right.availableSources.length ||
    left.groups.length !== right.groups.length
  ) {
    return false
  }
  if (left.availableSources.some((id, index) => id !== right.availableSources[index])) {
    return false
  }
  return left.groups.every(
    (row, index) => row.id === right.groups[index]?.id && row.label === right.groups[index]?.label,
  )
}

/**
 * Notify Map-menu snapshot subscribers.
 * @returns Nothing.
 */
function emitSnapshot(): void {
  snapshotListeners.forEach((listener) => listener())
}

/**
 * Downloads favorites as a JSON file.
 * @param favorites - Favorites to export.
 * @returns Nothing.
 */
export function exportFavoritesJson(favorites: Favorite[]): void {
  const blob = new Blob([JSON.stringify(favorites, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `workbench-favorites-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Latest Map menu snapshot for the macOS application menu.
 * @returns View state.
 */
export function getMapMenuSnapshot(): MapMenuViewState {
  return snapshot
}

/**
 * Subscribe to Map menu snapshot changes.
 * @param listener - Callback invoked when enablement or checkboxes change.
 * @returns Unsubscribe function.
 */
export function subscribeMapMenuSnapshot(listener: SnapshotListener): () => void {
  snapshotListeners.add(listener)
  return () => {
    snapshotListeners.delete(listener)
  }
}

/**
 * Merges live Map-menu checkboxes and enablement.
 * @param patch - Fields to update.
 * @returns Nothing.
 */
export function setMapMenuView(patch: Partial<MapMenuViewState>): void {
  const next = { ...snapshot, ...patch }
  if (viewEquals(snapshot, next)) {
    return
  }
  snapshot = next
  emitSnapshot()
}

/**
 * Merges Map-menu command handlers from the Map page / sidebar.
 * @param next - Handler patch.
 * @returns Nothing.
 */
export function patchMapMenuHandlers(next: MapMenuHandlers): void {
  handlers = { ...handlers, ...next }
}

/**
 * Clears Map-menu handlers and snapshot when the Map page unmounts.
 * @returns Nothing.
 */
export function unregisterMapMenuHost(): void {
  handlers = {}
  const reset: MapMenuViewState = {
    ...DEFAULT_VIEW,
    availableSources: [...DEFAULT_VIEW.availableSources],
    groups: [],
  }
  if (viewEquals(snapshot, reset)) {
    return
  }
  snapshot = reset
  emitSnapshot()
}

/**
 * Runs a native Map menu command.
 * @param action - Menu action id or source/group radio.
 * @returns Nothing.
 */
export function dispatchMapMenuAction(action: MapMenuAction): void {
  if (typeof action !== 'string') {
    if (action.type === 'select-source') {
      handlers.setSource?.(action.source)
      return
    }
    handlers.selectGroup?.(action.groupId)
    return
  }
  switch (action) {
    case 'view:toggle-sidebar':
      handlers.toggleSidebar?.()
      return
    case 'view:favorites':
      handlers.setTab?.('chat')
      return
    case 'view:locations':
      handlers.setTab?.('shops')
      return
    case 'view:locate':
      handlers.locate?.()
      return
    case 'view:back':
      handlers.goBackward?.()
      return
    case 'view:forward':
      handlers.goForward?.()
      return
    case 'favorites:add':
      handlers.addCustom?.()
      return
    case 'favorites:show-all':
      handlers.showAll?.()
      return
    case 'favorites:export':
      handlers.exportFavorites?.()
      return
    case 'favorites:clear-all':
      handlers.clearAll?.()
      return
    case 'favorites:toggle-select':
      handlers.toggleSelect?.()
      return
    case 'favorites:select-all':
      handlers.selectAll?.()
      return
    case 'favorites:show-selected':
      handlers.showSelected?.()
      return
    case 'favorites:delete-selected':
      handlers.deleteSelected?.()
      return
    case 'filter:important':
      handlers.toggleFilterImportant?.()
      return
    case 'filter:normal':
      handlers.toggleFilterNormal?.()
      return
    case 'filter:unimportant':
      handlers.toggleFilterUnimportant?.()
      return
    case 'filter:weekdays':
      handlers.toggleWeekdays?.()
      return
    case 'filter:sunday':
      handlers.toggleSunday?.()
      return
    default:
      return
  }
}
