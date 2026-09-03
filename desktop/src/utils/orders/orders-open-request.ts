/**
 * Cross-page handoff to open the Orders Function on a list or detail path.
 */

import {
  adminActivePathStorageKey,
  writeAdminActivePath,
} from '@/utils/admin-active-path'

const OPEN_EVENT = 'workbench:open-orders'
const PATH_EVENT = 'workbench:orders-path'

/** sessionStorage key for last Orders path (list or detail). */
export const ORDERS_PATH_STORAGE_KEY = 'workbench-electron-orders-path'

const ORDERS_ROOTS = ['/orders/crm', '/orders/nexdot', '/orders/te'] as const

let pendingOrdersPath: string | null = null

/**
 * Returns whether a path belongs to the Orders Function.
 * @param path - Candidate path.
 * @returns True for CRM / NEXDOT / T&E list or detail paths.
 */
export function isOrdersFunctionPath(path: string): boolean {
  return ORDERS_ROOTS.some((root) => path === root || path.startsWith(`${root}/`))
}

/**
 * Opens the Orders title-bar tab on a list or detail path.
 * Safe to call from Admin (Orders may be unmounted); the path is queued until mount.
 * @param path - Absolute Orders path (e.g. `/orders/crm/:id`).
 * @returns Nothing.
 */
export function openOrdersPath(path: string): void {
  const next = path.trim()
  if (!isOrdersFunctionPath(next)) {
    return
  }
  pendingOrdersPath = next
  writeAdminActivePath(next, adminActivePathStorageKey(ORDERS_PATH_STORAGE_KEY))
  window.dispatchEvent(new CustomEvent(PATH_EVENT, { detail: next }))
  window.dispatchEvent(new Event(OPEN_EVENT))
}

/**
 * Reads and clears a pending Orders path (for Orders page mount).
 * @returns Pending path, or null.
 */
export function consumePendingOrdersPath(): string | null {
  const next = pendingOrdersPath
  pendingOrdersPath = null
  return next
}

/**
 * Subscribe to Orders tab open requests.
 * @param listener - Callback when Orders should open.
 * @returns Unsubscribe function.
 */
export function subscribeOpenOrdersRequest(listener: () => void): () => void {
  const handler = (): void => {
    listener()
  }
  window.addEventListener(OPEN_EVENT, handler)
  return () => window.removeEventListener(OPEN_EVENT, handler)
}

/**
 * Subscribe to Orders path requests while the Orders page is mounted.
 * @param listener - Receives the requested path.
 * @returns Unsubscribe function.
 */
export function subscribeOrdersPathRequest(listener: (path: string) => void): () => void {
  /**
   * @param event - Custom event with path detail.
   */
  function handler(event: Event): void {
    const detail = (event as CustomEvent<string>).detail
    if (typeof detail === 'string' && isOrdersFunctionPath(detail)) {
      pendingOrdersPath = null
      listener(detail)
    }
  }
  window.addEventListener(PATH_EVENT, handler)
  return () => window.removeEventListener(PATH_EVENT, handler)
}
