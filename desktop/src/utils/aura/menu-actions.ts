import type Aura from '@/lib/mdcore/aura'
import { getActiveEditor } from '@/utils/aura/active-editor'
import {
  newDocument,
  pickAndReadMarkdownFile,
  saveMarkdownDocument,
} from '@/hooks/aura/document-store'
import {
  getPreferences,
} from '@/hooks/aura/preferences-store'
import { toggleFocusMode } from '@/hooks/aura/focus-mode-store'
import {
  setSidebarCollapsed,
  toggleSidebarCollapsed,
} from '@/hooks/aura/sidebar-store'
import { setSidebarTab } from '@/hooks/aura/sidebar-tab-store'
import { isSourceMode, toggleSourceMode } from '@/hooks/aura/source-mode-store'
import {
  getSourceEditorValue,
  getSourceEditorView,
  openSourceSearch,
  redoSourceEdit,
  selectAllSource,
  setSourceEditorValue,
  setSourceHeading,
  undoSourceEdit,
  wrapSourceSelection,
} from '@/hooks/aura/source-editor-store'
import { openFindReplace } from '@/hooks/aura/find-replace'

/** Markdown affixes for source-mode wrap formatting. */
const SOURCE_WRAP: Record<'bold' | 'italic' | 'strike', [string, string]> = {
  bold: ['**', '**'],
  italic: ['*', '*'],
  strike: ['~~', '~~'],
}

type AuraInternal = {
  currentMode: 'wysiwyg'
  options: {
    theme: 'classic' | 'dark'
  }
  markdown: {
    markdownToHtml: (markdown: string) => string
  }
  undo: {
    undo: (aura: unknown) => void
    redo: (aura: unknown) => void
  }
  wysiwyg?: { element: HTMLElement }
}

type AuraInstance = Aura & {
  aura: AuraInternal
}

/**
 * Resolve the global Aura instance mounted by the editor.
 *
 * @returns Aura instance or undefined.
 */
function getAura(): AuraInstance | undefined {
  return getActiveEditor() as AuraInstance | undefined
}

/**
 * Focus the active editor surface before running a command.
 */
function focusEditor(): void {
  if (isSourceMode()) {
    getSourceEditorView()?.focus()
    return
  }
  getAura()?.focus()
}

/**
 * Current markdown from the active surface (Monaco in source mode).
 *
 * @returns Markdown text.
 */
function getActiveMarkdown(): string {
  if (isSourceMode()) {
    const value = getSourceEditorValue()
    if (value !== null) {
      return value
    }
  }
  return getAura()?.getValue() ?? ''
}

/**
 * Render the active document as HTML (via the Markdown engine in source mode).
 *
 * @returns HTML string.
 */
function getActiveHTML(): string {
  const aura = getAura()
  if (isSourceMode()) {
    return aura?.aura.markdown.markdownToHtml(getActiveMarkdown()) ?? ''
  }
  return aura?.getHTML() ?? ''
}

/**
 * Select all content inside the active editor surface.
 */
function selectAll(): void {
  if (isSourceMode()) {
    selectAllSource()
    return
  }
  const internal = getAura()?.aura
  if (!internal) {
    return
  }
  focusEditor()
  const element = internal.wysiwyg?.element
  if (!element) {
    return
  }
  const selection = window.getSelection()!
  if (!selection) {
    return
  }
  const range = document.createRange()
  range.selectNodeContents(element)
  selection.removeAllRanges()
  selection.addRange(range)
}

/**
 * Download a text blob as a file in the renderer.
 *
 * @param filename - Suggested file name.
 * @param content - File contents.
 * @param mime - MIME type.
 */
function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/**
 * Execute a menu action inside the renderer (DOM menubar or keyboard).
 *
 * @param action - Menu action id.
 */
export function dispatchAuraMenuAction(action: string): void {
  handleAuraMenuAction(action)
}

/**
 * Execute a menu action inside the renderer.
 *
 * @param action - Menu action id.
 */
export function handleAuraMenuAction(action: string): void {
  switch (action) {
    case 'view:toggle-sidebar':
      if (!isSourceMode() && getPreferences().outlineCollapsible) {
        toggleSidebarCollapsed()
      }
      return
    case 'view:sidebar-outline':
      if (isSourceMode()) {
        return
      }
      setSidebarTab('outline')
      if (getPreferences().outlineCollapsible) {
        setSidebarCollapsed(false)
      }
      return
    case 'view:sidebar-files':
      if (isSourceMode()) {
        return
      }
      setSidebarTab('files')
      if (getPreferences().outlineCollapsible) {
        setSidebarCollapsed(false)
      }
      return
    case 'view:toggle-source':
      toggleSourceMode()
      return
    case 'view:toggle-focus':
      toggleFocusMode()
      return
    default:
      break
  }

  const aura = getAura()
  const internal = aura?.aura
  if (!aura || !internal) {
    return
  }

  switch (action) {
    case 'file:new':
      if (!setSourceEditorValue('')) {
        aura.setValue('')
      }
      newDocument()
      break
    case 'file:open':
      void pickAndReadMarkdownFile().then((result) => {
        if (!result) {
          return
        }
        if (!setSourceEditorValue(result.markdown)) {
          getAura()?.setValue(result.markdown, true)
        }
      })
      break
    case 'file:save':
      void saveMarkdownDocument(getActiveMarkdown())
      break
    case 'export:markdown':
      downloadText(
        `export.${getPreferences().defaultExtension}`,
        getActiveMarkdown(),
        'text/markdown;charset=utf-8',
      )
      break
    case 'export:html':
      downloadText(
        'export.html',
        getActiveHTML(),
        'text/html;charset=utf-8',
      )
      break
    case 'export:default': {
      const format = getPreferences().defaultExportFormat
      if (format === 'html') {
        downloadText(
          'export.html',
          getActiveHTML(),
          'text/html;charset=utf-8',
        )
      } else {
        downloadText(
          `export.${getPreferences().defaultExtension}`,
          getActiveMarkdown(),
          'text/markdown;charset=utf-8',
        )
      }
      break
    }
    case 'edit:undo':
      if (isSourceMode()) {
        undoSourceEdit()
      } else {
        internal.undo.undo(internal)
      }
      break
    case 'edit:redo':
      if (isSourceMode()) {
        redoSourceEdit()
      } else {
        internal.undo.redo(internal)
      }
      break
    case 'edit:cut':
      focusEditor()
      document.execCommand('cut')
      break
    case 'edit:copy':
      focusEditor()
      document.execCommand('copy')
      break
    case 'edit:paste':
      focusEditor()
      document.execCommand('paste')
      break
    case 'edit:select-all':
      selectAll()
      break
    case 'edit:find':
      if (isSourceMode()) {
        openSourceSearch()
      } else {
        openFindReplace('find', getAura()?.getSelection() ?? '')
      }
      break
    case 'edit:replace':
      if (isSourceMode()) {
        openSourceSearch()
      } else {
        openFindReplace('replace', getAura()?.getSelection() ?? '')
      }
      break
    case 'format:bold':
    case 'format:italic':
    case 'format:strike': {
      const type = action.slice('format:'.length) as
        | 'bold'
        | 'italic'
        | 'strike'
      if (isSourceMode()) {
        wrapSourceSelection(...SOURCE_WRAP[type])
      } else {
        focusEditor()
        getAura()?.execFormat(type)
      }
      break
    }
    case 'format:h1':
    case 'format:h2':
    case 'format:h3': {
      const level = Number(action.slice('format:h'.length)) as 1 | 2 | 3
      if (isSourceMode()) {
        setSourceHeading(level)
      } else {
        focusEditor()
        getAura()?.execHeading(level)
      }
      break
    }
    default:
      break
  }
}
