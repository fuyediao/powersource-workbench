import { syncDocument } from '../document/markdown-document'

/**
 * Push document length to the React status bar via `options.counter.after`.
 *
 * @param aura - Active editor instance.
 * @param mdText - Current markdown source.
 */
function notifyCounter(aura: IAura, mdText: string): void {
  if (!aura.options.counter.enable || !aura.options.counter.after) {
    return
  }
  const length = mdText.endsWith('\n') ? mdText.length - 1 : mdText.length
  aura.options.counter.after(length, {
    enable: aura.options.counter.enable,
    max: aura.options.counter.max,
    type: aura.options.counter.type,
  })
}

/**
 * Debounced post-edit work: counter, undo stack, optional hint refresh.
 *
 * @param aura - Active editor instance.
 * @param options - Which side effects to run.
 */
export const afterRenderEvent = (
  aura: IAura,
  options = {
    enableAddUndoStack: true,
    enableHint: false,
  },
) => {
  if (options.enableHint) {
    aura.hint.render(aura)
  }
  // Keep the source-of-truth text current synchronously. IME composition is
  // the exception: its intermediate DOM is not a committed edit, so defer that
  // sync until composition has ended.
  const deferredSync = aura.wysiwyg.composingLock
  const text = deferredSync ? aura.document.getText() : syncDocument(aura)
  clearTimeout(aura.wysiwyg.afterRenderTimeoutId)
  aura.wysiwyg.afterRenderTimeoutId = window.setTimeout(() => {
    if (aura.wysiwyg.composingLock) {
      return
    }
    const currentText = deferredSync ? syncDocument(aura) : text
    notifyCounter(aura, currentText)
    if (options.enableAddUndoStack) {
      aura.undo.addToUndoStack(aura)
    }
  }, aura.options.undoDelay)
}
