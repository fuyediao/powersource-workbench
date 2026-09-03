/**
 * Cross-page handoff to open the Kanban Function on a sidebar path.
 */

import {
  adminActivePathStorageKey,
  writeAdminActivePath,
} from '@/utils/admin-active-path'

const OPEN_EVENT = 'workbench:open-kanban'
const PATH_EVENT = 'workbench:kanban-path'

/** Sidebar mode + active-path storage for the Kanban Function. */
export const KANBAN_SIDEBAR_MODE_KEY = 'workbench-electron-kanban-sidebar-mode'

const KANBAN_ROOTS = ['/kanban/workbench', '/kanban/opportunities', '/kanban/sales'] as const

let pendingKanbanPath: string | null = null

/**
 * Returns whether a path belongs to the Kanban Function.
 * @param path - Candidate path.
 * @returns True for workbench / opportunity board paths.
 */
export function isKanbanFunctionPath(path: string): boolean {
  return KANBAN_ROOTS.some((root) => path === root || path.startsWith(`${root}/`))
}

/**
 * Opens the Kanban title-bar tab on a sidebar path.
 * Safe to call when Kanban is unmounted; the path is queued until mount.
 * @param path - Absolute Kanban path (e.g. `/kanban/opportunities`).
 * @returns Nothing.
 */
export function openKanbanPath(path: string): void {
  const next = path.trim()
  if (!isKanbanFunctionPath(next)) {
    return
  }
  pendingKanbanPath = next
  writeAdminActivePath(next, adminActivePathStorageKey(KANBAN_SIDEBAR_MODE_KEY))
  window.dispatchEvent(new CustomEvent(PATH_EVENT, { detail: next }))
  window.dispatchEvent(new Event(OPEN_EVENT))
}

/**
 * Reads and clears a pending Kanban path (for Kanban page mount).
 * @returns Pending path, or null.
 */
export function consumePendingKanbanPath(): string | null {
  const next = pendingKanbanPath
  pendingKanbanPath = null
  return next
}

/**
 * Subscribe to Kanban tab open requests.
 * @param listener - Callback when Kanban should open.
 * @returns Unsubscribe function.
 */
export function subscribeOpenKanbanRequest(listener: () => void): () => void {
  const handler = (): void => {
    listener()
  }
  window.addEventListener(OPEN_EVENT, handler)
  return () => window.removeEventListener(OPEN_EVENT, handler)
}

/**
 * Subscribe to Kanban path requests while the Kanban page is mounted.
 * @param listener - Receives the requested path.
 * @returns Unsubscribe function.
 */
export function subscribeKanbanPathRequest(listener: (path: string) => void): () => void {
  /**
   * @param event - Custom event with path detail.
   */
  function handler(event: Event): void {
    const detail = (event as CustomEvent<string>).detail
    if (typeof detail === 'string' && isKanbanFunctionPath(detail)) {
      pendingKanbanPath = null
      listener(detail)
    }
  }
  window.addEventListener(PATH_EVENT, handler)
  return () => window.removeEventListener(PATH_EVENT, handler)
}
