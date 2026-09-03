type Listener = () => void

export interface HintItem {
  html: string
  value: string
}

export interface HintState {
  visible: boolean
  items: HintItem[]
  selectedIndex: number
  left: number
  top: number
  right: number | 'auto'
}

const EMPTY: HintState = {
  visible: false,
  items: [],
  selectedIndex: 0,
  left: 0,
  top: 0,
  right: 'auto',
}

let state: HintState = { ...EMPTY }
let fillHandler: ((value: string) => void) | null = null
const listeners = new Set<Listener>()

/** Notify hint subscribers. */
function emit(): void {
  listeners.forEach((listener) => listener())
}

/**
 * Current hint popup state.
 *
 * @returns Hint UI state.
 */
export function getHintState(): HintState {
  return state
}

/**
 * Register the editor callback that inserts the selected hint value.
 *
 * @param handler - Insert callback, or null to clear.
 */
export function setHintFillHandler(
  handler: ((value: string) => void) | null,
): void {
  fillHandler = handler
}

/**
 * Show or update the hint popup.
 *
 * @param next - Partial state to merge (must include items when showing).
 */
export function setHintState(next: Partial<HintState>): void {
  state = { ...state, ...next }
  if (state.items.length === 0) {
    state = { ...EMPTY }
  } else if (state.selectedIndex >= state.items.length) {
    state.selectedIndex = 0
  }
  emit()
}

/** Hide the hint popup. */
export function hideHint(): void {
  if (!state.visible && state.items.length === 0) {
    return
  }
  state = { ...EMPTY }
  emit()
}

/**
 * Move the highlight within the hint list.
 *
 * @param delta - +1 down, -1 up.
 */
export function moveHintSelection(delta: number): void {
  if (!state.visible || state.items.length === 0) {
    return
  }
  const len = state.items.length
  state = {
    ...state,
    selectedIndex: (state.selectedIndex + delta + len) % len,
  }
  emit()
}

/**
 * Insert the currently selected hint via the registered editor handler.
 *
 * @returns True when a selection was committed.
 */
export function commitHintSelection(): boolean {
  if (!state.visible || !fillHandler) {
    return false
  }
  const item = state.items[state.selectedIndex]
  if (!item) {
    return false
  }
  fillHandler(item.value)
  hideHint()
  return true
}

/**
 * Insert a specific hint value (e.g. mouse click).
 *
 * @param value - Encoded hint value.
 * @returns True when handled.
 */
export function commitHintValue(value: string): boolean {
  if (!fillHandler) {
    return false
  }
  fillHandler(value)
  hideHint()
  return true
}

/**
 * Whether the hint popup is visible.
 *
 * @returns True when open.
 */
export function isHintVisible(): boolean {
  return state.visible
}

/**
 * Subscribe to hint UI changes.
 *
 * @param listener - Callback on change.
 * @returns Unsubscribe function.
 */
export function subscribeHint(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
