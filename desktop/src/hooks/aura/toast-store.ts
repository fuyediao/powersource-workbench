type Listener = () => void

export interface ToastState {
  message: string
  /** 0 = sticky until dismissed */
  durationMs: number
  id: number
}

let toast: ToastState | null = null
let toastId = 0
const listeners = new Set<Listener>()

/** Notify toast subscribers. */
function emit(): void {
  listeners.forEach((listener) => listener())
}

/**
 * Current toast, or null when hidden.
 *
 * @returns Toast state.
 */
export function getToast(): ToastState | null {
  return toast
}

/**
 * Show a toast message in the React shell.
 *
 * @param message - Message text (already localized).
 * @param durationMs - Auto-hide delay; 0 keeps it until close.
 */
export function showToast(message: string, durationMs = 6000): void {
  toastId += 1
  toast = { message, durationMs, id: toastId }
  emit()
}

/** Hide the active toast. */
export function hideToast(): void {
  if (!toast) {
    return
  }
  toast = null
  emit()
}

/**
 * Subscribe to toast changes.
 *
 * @param listener - Callback on change.
 * @returns Unsubscribe function.
 */
export function subscribeToast(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
