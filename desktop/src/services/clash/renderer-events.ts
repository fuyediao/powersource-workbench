/**
 * In-renderer event bus for Clash frontend-to-frontend events.
 *
 * Tauri `emit` / `listen` stay in the same webview. Electron `workbenchClash.listen` only
 * receives main-process pushes, so names such as `verge://test-all` must be delivered here.
 */

type RendererEventHandler = (event: { payload: unknown }) => void

const listeners = new Map<string, Set<RendererEventHandler>>()

/**
 * Publishes an event to renderer subscribers.
 * @param name - Event name (same strings as Tauri, e.g. `verge://test-all`).
 * @param payload - Optional payload.
 */
export function emitRendererEvent(name: string, payload?: unknown): void {
  const set = listeners.get(name)
  if (!set) return
  for (const handler of [...set]) {
    handler({ payload })
  }
}

/**
 * Subscribes to a renderer event.
 * @param name - Event name.
 * @param handler - Callback with `{ payload }`, matching Tauri `listen`.
 * @returns Unsubscribe function.
 */
export function listenRendererEvent(
  name: string,
  handler: RendererEventHandler,
): () => void {
  let set = listeners.get(name)
  if (!set) {
    set = new Set()
    listeners.set(name, set)
  }
  set.add(handler)
  return () => {
    set.delete(handler)
    if (set.size === 0) {
      listeners.delete(name)
    }
  }
}
