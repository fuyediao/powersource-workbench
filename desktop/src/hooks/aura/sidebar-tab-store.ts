export type SidebarTab = 'files' | 'outline'

type Listener = () => void

let activeTab: SidebarTab = 'outline'
const listeners = new Set<Listener>()

/** Notify sidebar-tab subscribers. */
function emit(): void {
  listeners.forEach((listener) => listener())
}

/**
 * Active sidebar panel tab.
 *
 * @returns Current tab id.
 */
export function getSidebarTab(): SidebarTab {
  return activeTab
}

/**
 * Set the active sidebar tab and notify subscribers.
 *
 * @param next - Tab to show.
 */
export function setSidebarTab(next: SidebarTab): void {
  if (activeTab === next) {
    return
  }
  activeTab = next
  emit()
}

/**
 * Subscribe to sidebar tab changes.
 *
 * @param listener - Callback invoked on change.
 * @returns Unsubscribe function.
 */
export function subscribeSidebarTab(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
