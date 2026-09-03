/**
 * Editor UI façade used by the Markdown WYSIWYG kernel.
 * Ask and Harness only render Markdown; these hooks are no-ops unless an
 * editor instance is constructed.
 */

export type EditorImageTheme = 'classic' | 'dark'

export type EditorHintState = {
  visible?: boolean
  items?: unknown
  selectedIndex?: number
  html?: string
  left?: number
  top?: number
  right?: number | 'auto'
}

/**
 * Imperative UI hooks for toast, autocomplete hint, and image lightbox.
 */
export const editorUi = {
  /**
   * Shows a toast. No-op when the Editor page is not mounted.
   * @param _message - Toast text.
   * @param _timeout - Dismiss delay in milliseconds.
   * @returns Nothing.
   */
  showToast(_message: string, _timeout?: number): void {
    // Editor chrome is not shipped; chat / Harness do not surface these toasts.
  },
  /**
   * Registers the hint fill callback.
   * @param _handler - Fill handler, or null to clear.
   * @returns Nothing.
   */
  setHintFillHandler(_handler: ((value: string) => void) | null): void {},
  /**
   * Updates hint popup state.
   * @param _next - Partial hint state.
   * @returns Nothing.
   */
  setHintState(_next: EditorHintState): void {},
  /**
   * Hides the hint popup.
   * @returns Nothing.
   */
  hideHint(): void {},
  /**
   * Moves the hint selection.
   * @param _delta - Selection offset.
   * @returns Nothing.
   */
  moveHintSelection(_delta: number): void {},
  /**
   * Commits the current hint selection.
   * @returns Whether a hint was committed.
   */
  commitHintSelection(): boolean {
    return false
  },
  /**
   * Reports whether the hint popup is visible.
   * @returns Always false without Editor chrome.
   */
  isHintVisible(): boolean {
    return false
  },
  /**
   * Opens the image lightbox.
   * @param _img - Image element.
   * @param _theme - Lightbox theme.
   * @returns Nothing.
   */
  openImagePreview(_img: HTMLImageElement, _theme: EditorImageTheme = 'classic'): void {},
} as const
