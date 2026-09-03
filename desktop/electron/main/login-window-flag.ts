/** Electron `BrowserWindow.id` values for the compact sign-in window. */
const loginWindowIds = new Set<number>()

/**
 * Marks a window as the compact sign-in window.
 * @param id - `BrowserWindow.id`.
 * @returns Nothing.
 */
export function markLoginWindowId(id: number): void {
  loginWindowIds.add(id)
}

/**
 * Clears the compact sign-in mark after the window closes.
 * @param id - `BrowserWindow.id`.
 * @returns Nothing.
 */
export function unmarkLoginWindowId(id: number): void {
  loginWindowIds.delete(id)
}

/**
 * Returns whether `id` belongs to the compact sign-in window.
 * @param id - `BrowserWindow.id`.
 * @returns True for the login window.
 */
export function isLoginWindowId(id: number): boolean {
  return loginWindowIds.has(id)
}
