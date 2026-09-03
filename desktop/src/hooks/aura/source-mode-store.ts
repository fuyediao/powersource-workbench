import {
  getSidebarCollapsed,
  setSidebarCollapsed,
} from '@/hooks/aura/sidebar-store'

type Listener = () => void

let sourceMode = false
let sidebarBeforeSource = false
const listeners = new Set<Listener>()

/** Notify source-mode subscribers. */
function emit(): void {
  listeners.forEach((listener) => listener())
}

/**
 * Whether the shell is currently in Source View (Monaco).
 *
 * @returns True when source mode is active.
 */
export function isSourceMode(): boolean {
  return sourceMode
}

/**
 * Subscribe to source-mode changes.
 *
 * @param listener - Callback invoked on change.
 * @returns Unsubscribe function.
 */
export function subscribeSourceMode(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Set Source View on/off. The editor shell reacts by swapping
 * WYSIWYG and Monaco and syncing markdown between them.
 * Collapses the sidebar while in source mode and restores it on exit.
 *
 * @param next - Source mode enabled when true.
 */
export function setSourceMode(next: boolean): void {
  if (sourceMode === next) {
    return
  }
  if (next) {
    sidebarBeforeSource = getSidebarCollapsed()
    setSidebarCollapsed(true)
  } else {
    setSidebarCollapsed(sidebarBeforeSource)
  }
  sourceMode = next
  emit()
}

/** Toggle Source View vs WYSIWYG (Typora-style single switch). */
export function toggleSourceMode(): void {
  setSourceMode(!sourceMode)
}
