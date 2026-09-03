/**
 * sessionStorage helpers for Function-app sidebar active paths.
 * Used when jumping from Home / Kanban shortcuts into Admin or other Functions.
 */

/** Default cache key (matches AdminShell storageKey `workbench-electron-admin-sidebar-mode`). */
export const ADMIN_ACTIVE_PATH_STORAGE_KEY = 'workbench-electron-admin-active-path'

/**
 * Derives the path cache key from an Admin sidebar mode localStorage key.
 * @param modeStorageKey - Sidebar mode key.
 * @returns Path cache key.
 */
export function adminActivePathStorageKey(modeStorageKey: string): string {
  return modeStorageKey.endsWith('-sidebar-mode')
    ? `${modeStorageKey.slice(0, -'-sidebar-mode'.length)}-active-path`
    : `${modeStorageKey}-active-path`
}

/**
 * Reads the cached Admin sidebar path.
 * @param key - Path cache key.
 * @returns Stored path, or null.
 */
export function readAdminActivePath(
  key: string = ADMIN_ACTIVE_PATH_STORAGE_KEY,
): string | null {
  try {
    const raw = sessionStorage.getItem(key)
    return typeof raw === 'string' && raw.length > 0 ? raw : null
  } catch {
    return null
  }
}

/**
 * Writes the Admin sidebar path so the next Admin mount lands there.
 * @param path - Absolute Admin path (e.g. `/admin/leads`).
 * @param key - Path cache key.
 * @returns Nothing.
 */
export function writeAdminActivePath(
  path: string,
  key: string = ADMIN_ACTIVE_PATH_STORAGE_KEY,
): void {
  try {
    sessionStorage.setItem(key, path)
  } catch {
    // Ignore quota / private-mode failures.
  }
}
