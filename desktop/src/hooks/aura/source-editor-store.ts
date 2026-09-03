import type * as Monaco from 'monaco-editor'

/** Active Monaco editor while source mode is open (null otherwise). */
let activeEditor: Monaco.editor.IStandaloneCodeEditor | null = null

/**
 * Register the mounted Monaco editor.
 *
 * @param editor - Editor instance, or null on unmount.
 */
export function setSourceEditorView(
  editor: Monaco.editor.IStandaloneCodeEditor | null,
): void {
  activeEditor = editor
}

/**
 * Currently mounted Monaco editor.
 *
 * @returns Editor, or null when source mode is closed.
 */
export function getSourceEditorView(): Monaco.editor.IStandaloneCodeEditor | null {
  return activeEditor
}

/**
 * Current source document text.
 *
 * @returns Markdown text, or null when source mode is closed.
 */
export function getSourceEditorValue(): string | null {
  return activeEditor ? activeEditor.getValue() : null
}

/**
 * Replace the whole source document (e.g. after opening a file).
 *
 * @param markdown - New document text.
 * @returns True when an editor was mounted and updated.
 */
export function setSourceEditorValue(markdown: string): boolean {
  if (!activeEditor) {
    return false
  }
  activeEditor.setValue(markdown)
  return true
}

/** Undo the last source edit. */
export function undoSourceEdit(): void {
  activeEditor?.trigger('aura', 'undo', null)
}

/** Redo the last undone source edit. */
export function redoSourceEdit(): void {
  activeEditor?.trigger('aura', 'redo', null)
}

/** Open Monaco's built-in find widget. */
export function openSourceSearch(): void {
  if (!activeEditor) {
    return
  }
  activeEditor.focus()
  activeEditor.trigger('aura', 'actions.find', null)
}

/** Select the whole source document. */
export function selectAllSource(): void {
  if (!activeEditor) {
    return
  }
  activeEditor.focus()
  const model = activeEditor.getModel()
  if (!model) {
    return
  }
  activeEditor.setSelection(model.getFullModelRange())
}

/**
 * Wrap the current selection with markdown affixes (bold / italic / strike).
 *
 * @param prefix - Opening marker.
 * @param suffix - Closing marker.
 */
export function wrapSourceSelection(prefix: string, suffix: string): void {
  if (!activeEditor) {
    return
  }
  const editor = activeEditor
  const model = editor.getModel()
  if (!model) {
    return
  }
  editor.focus()
  const selection = editor.getSelection()
  if (!selection) {
    return
  }
  const selected = model.getValueInRange(selection)
  const replacement = `${prefix}${selected}${suffix}`
  editor.executeEdits('aura-wrap', [
    {
      range: selection,
      text: replacement,
      forceMoveMarkers: true,
    },
  ])
  const startOffset = model.getOffsetAt(selection.getStartPosition())
  const newStart = model.getPositionAt(startOffset + prefix.length)
  const newEnd = model.getPositionAt(
    startOffset + prefix.length + selected.length,
  )
  editor.setSelection({
    startLineNumber: newStart.lineNumber,
    startColumn: newStart.column,
    endLineNumber: newEnd.lineNumber,
    endColumn: newEnd.column,
  })
}

/**
 * Set the heading level of the current line (replaces any existing `#` run).
 *
 * @param level - Heading level 1–6.
 */
export function setSourceHeading(level: 1 | 2 | 3 | 4 | 5 | 6): void {
  if (!activeEditor) {
    return
  }
  const editor = activeEditor
  const model = editor.getModel()
  if (!model) {
    return
  }
  editor.focus()
  const position = editor.getPosition()
  if (!position) {
    return
  }
  const lineNumber = position.lineNumber
  const line = model.getLineContent(lineNumber)
  const stripped = line.replace(/^#{1,6}\s+/, '')
  const next = `${'#'.repeat(level)} ${stripped}`
  editor.executeEdits('aura-heading', [
    {
      range: {
        startLineNumber: lineNumber,
        startColumn: 1,
        endLineNumber: lineNumber,
        endColumn: line.length + 1,
      },
      text: next,
      forceMoveMarkers: true,
    },
  ])
  editor.setPosition({ lineNumber, column: next.length + 1 })
}
