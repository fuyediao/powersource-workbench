type Listener = () => void

const FOCUS_ROOT = 'on-focus-mode'
const FOCUS_BLOCK = 'aura-focus'

let focusMode = false
const listeners = new Set<Listener>()
let selectionBound = false

/** Notify focus-mode subscribers. */
function emit(): void {
  listeners.forEach((listener) => listener())
}

/**
 * Resolve the WYSIWYG / SV content root (`#write`).
 *
 * @returns Writing root element, or null.
 */
function getWriteRoot(): HTMLElement | null {
  return document.getElementById('write')
}

/**
 * Clear focus markers and the root focus-mode class.
 */
function clearFocusStyles(): void {
  const root = getWriteRoot()
  root?.classList.remove(FOCUS_ROOT)
  root
    ?.querySelectorAll(`.${FOCUS_BLOCK}`)
    .forEach((el) => el.classList.remove(FOCUS_BLOCK))
}

/**
 * Mark the block that currently contains the caret.
 */
function refreshFocusBlock(): void {
  if (!focusMode) {
    return
  }
  const root = getWriteRoot()
  if (!root) {
    return
  }
  root.classList.add(FOCUS_ROOT)
  const selection = window.getSelection()!
  if (!selection || selection.rangeCount === 0) {
    return
  }
  const node = selection.getRangeAt(0).startContainer
  const block =
    node instanceof Element
      ? node.closest<HTMLElement>('[data-block="0"]')
      : node.parentElement?.closest<HTMLElement>('[data-block="0"]')
  if (!block || !root.contains(block)) {
    return
  }
  root
    .querySelectorAll(`.${FOCUS_BLOCK}`)
    .forEach((el) => {
      if (el !== block) {
        el.classList.remove(FOCUS_BLOCK)
      }
    })
  block.classList.add(FOCUS_BLOCK)
}

/** Bind selection tracking while focus mode is on. */
function ensureSelectionListener(): void {
  if (selectionBound) {
    return
  }
  selectionBound = true
  document.addEventListener('selectionchange', refreshFocusBlock)
}

/**
 * Whether focus mode is enabled.
 *
 * @returns True when active.
 */
export function isFocusMode(): boolean {
  return focusMode
}

/**
 * Set focus mode on or off.
 *
 * @param next - Enabled when true.
 */
export function setFocusMode(next: boolean): void {
  if (focusMode === next) {
    return
  }
  focusMode = next
  if (focusMode) {
    ensureSelectionListener()
    refreshFocusBlock()
  } else {
    clearFocusStyles()
  }
  emit()
}

/** Toggle focus mode. */
export function toggleFocusMode(): void {
  setFocusMode(!focusMode)
}

/**
 * Subscribe to focus-mode changes.
 *
 * @param listener - Callback invoked on change.
 * @returns Unsubscribe function.
 */
export function subscribeFocusMode(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
