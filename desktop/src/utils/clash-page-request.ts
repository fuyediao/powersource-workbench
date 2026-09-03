const OPEN_EVENT = 'workbench:open-clash'
const PATH_EVENT = 'workbench:clash-path'

const CLASH_PATHS = ['/', '/proxies', '/profile', '/connections', '/rules', '/logs', '/unlock'] as const

export type ClashPagePath = (typeof CLASH_PATHS)[number]

let pendingClashPath: ClashPagePath | null = null

/**
 * Returns whether a value is a Clash island route.
 * @param value - Candidate path.
 * @returns True for known Clash paths.
 */
export function isClashPagePath(value: string): value is ClashPagePath {
  return (CLASH_PATHS as readonly string[]).includes(value)
}

/**
 * Opens the Workbench Clash title-bar tab and navigates the Clash island to `path`.
 * Safe to call from Settings (Clash may be unmounted); the path is queued until mount.
 * @param path - Clash memory-router path (default home).
 * @returns Nothing.
 */
export function openClashPage(path: ClashPagePath = '/'): void {
  pendingClashPath = path
  window.dispatchEvent(new CustomEvent(PATH_EVENT, { detail: path }))
  window.dispatchEvent(new Event(OPEN_EVENT))
}

/**
 * Reads and clears a pending Clash path (for Clash island mount).
 * @returns Pending path, or null.
 */
export function consumePendingClashPath(): ClashPagePath | null {
  const next = pendingClashPath
  pendingClashPath = null
  return next
}

/**
 * Subscribe to Clash tab open requests.
 * @param listener - Callback when Clash should open.
 * @returns Unsubscribe function.
 */
export function subscribeOpenClashRequest(listener: () => void): () => void {
  const handler = (): void => {
    listener()
  }
  window.addEventListener(OPEN_EVENT, handler)
  return () => window.removeEventListener(OPEN_EVENT, handler)
}

/**
 * Subscribe to Clash in-island path requests while the island is mounted.
 * @param listener - Receives the requested path.
 * @returns Unsubscribe function.
 */
export function subscribeClashPathRequest(
  listener: (path: ClashPagePath) => void,
): () => void {
  /**
   * @param event - Custom event with path detail.
   */
  function handler(event: Event): void {
    const detail = (event as CustomEvent<string>).detail
    if (typeof detail === 'string' && isClashPagePath(detail)) {
      pendingClashPath = null
      listener(detail)
    }
  }
  window.addEventListener(PATH_EVENT, handler)
  return () => window.removeEventListener(PATH_EVENT, handler)
}
