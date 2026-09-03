export type FindReplaceMode = 'find' | 'replace'

type Listener = () => void

type FindReplaceState = {
  open: boolean
  mode: FindReplaceMode
  /** Bumped when the bar should focus/select the find field. */
  focusNonce: number
  seedQuery: string
}

const listeners = new Set<Listener>()

let state: FindReplaceState = {
  open: false,
  mode: 'find',
  focusNonce: 0,
  seedQuery: '',
}

/** Notify find/replace UI subscribers. */
function emit(): void {
  listeners.forEach((listener) => listener())
}

/**
 * Snapshot of find/replace panel state.
 *
 * @returns Current panel state.
 */
export function getFindReplaceState(): FindReplaceState {
  return state
}

/**
 * Open (or re-focus) the find/replace bar.
 *
 * @param mode - Show find only, or expand the replace row.
 * @param seedQuery - Optional prefill (e.g. current selection).
 */
export function openFindReplace(
  mode: FindReplaceMode = 'find',
  seedQuery = '',
): void {
  state = {
    open: true,
    mode,
    focusNonce: state.focusNonce + 1,
    seedQuery,
  }
  emit()
}

/** Close the find/replace bar. */
export function closeFindReplace(): void {
  if (!state.open) {
    return
  }
  state = { ...state, open: false, seedQuery: '' }
  emit()
}

/**
 * Switch between find-only and find+replace without closing.
 *
 * @param mode - Target mode.
 */
export function setFindReplaceMode(mode: FindReplaceMode): void {
  if (state.mode === mode) {
    return
  }
  state = { ...state, mode }
  emit()
}

/**
 * Subscribe to find/replace panel state.
 *
 * @param listener - Callback on change.
 * @returns Unsubscribe function.
 */
export function subscribeFindReplace(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
