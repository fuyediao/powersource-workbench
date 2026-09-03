/** Whether the editor mount should use the `aura--dark` chrome pack. */
let editorChromeDark = false

const listeners = new Set<() => void>()

/**
 * Read the editor chrome dark flag (React shell class + diagram theme hint).
 *
 * @returns True when Night / dark color scheme is active.
 */
export function getEditorChromeDark(): boolean {
  return editorChromeDark
}

/**
 * Update the editor chrome dark flag and notify React subscribers.
 *
 * @param dark - True for `aura--dark`.
 */
export function setEditorChromeDark(dark: boolean): void {
  if (editorChromeDark === dark) {
    return
  }
  editorChromeDark = dark
  listeners.forEach((listener) => {
    listener()
  })
}

/**
 * Subscribe to editor chrome dark changes.
 *
 * @param listener - Callback when the flag changes.
 * @returns Unsubscribe function.
 */
export function subscribeEditorChromeDark(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
