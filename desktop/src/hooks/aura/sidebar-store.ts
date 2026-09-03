type Listener = () => void

let collapsed = false
const listeners = new Set<Listener>()

/** Notify all sidebar collapse subscribers. */
function emit(): void {
  listeners.forEach((listener) => listener())
}

/** Whether the editor sidebar is currently collapsed. */
export function getSidebarCollapsed(): boolean {
  return collapsed
}

/**
 * Set sidebar collapsed state and notify subscribers.
 *
 * @param next - Collapsed when true.
 */
export function setSidebarCollapsed(next: boolean): void {
  if (collapsed === next) {
    return
  }
  collapsed = next
  emit()
}

/** Toggle sidebar visibility and notify subscribers. */
export function toggleSidebarCollapsed(): void {
  collapsed = !collapsed
  emit()
}

/**
 * Subscribe to sidebar collapse state changes.
 *
 * @param listener - Callback invoked on change.
 * @returns Unsubscribe function.
 */
export function subscribeSidebarCollapsed(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
