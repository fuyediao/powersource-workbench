import { useEffect, useRef } from 'react'
import * as monaco from 'monaco-editor'
import 'monaco-editor/min/vs/editor/editor.main.css'
import { ensureMonacoEnvironment } from '@/utils/aura/monaco-environment'
import { registerMonacoLanguages } from '@/utils/aura/monaco-languages'
import {
  getEditorChromeDark,
  subscribeEditorChromeDark,
} from '@/hooks/aura/editor-chrome-theme-store'
import { setSourceEditorView } from '@/hooks/aura/source-editor-store'

interface SourceEditorProps {
  /** Initial markdown (not a controlled value; Monaco owns the model). */
  initialValue: string
  /** Called on every document change. */
  onChange: (value: string) => void
}

const AURA_LIGHT = 'aura-light'
const AURA_DARK = 'aura-dark'

/**
 * Read a CSS custom property from the document element.
 *
 * @param name - Property name including leading `--`.
 * @param fallback - Value when the property is empty.
 * @returns Trimmed computed value.
 */
function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  return value || fallback
}

/**
 * Register Aura light/dark Monaco themes from the live shell CSS variables.
 */
function defineAuraThemes(): void {
  const bg = cssVar('--bg-color', '#ffffff')
  const fg = cssVar('--text-color', '#1f2328')
  const lineHighlight = cssVar('--item-hover-bg-color', '#f0f0f0')
  // Monaco theme colors expect #RRGGBB / #RRGGBBAA (not CSS rgba()).
  const gutterLight = '#8b949e'
  const gutterDark = '#6e7681'
  const selection = '#2563eb40'

  monaco.editor.defineTheme(AURA_LIGHT, {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword.md', foreground: '2563eb', fontStyle: 'bold' },
      { token: 'strong.md', fontStyle: 'bold' },
      { token: 'emphasis.md', fontStyle: 'italic' },
      { token: 'string.link.md', foreground: '2563eb' },
      { token: 'variable.md', foreground: '2563eb' },
    ],
    colors: {
      'editor.background': bg,
      'editor.foreground': fg,
      'editorLineNumber.foreground': gutterLight,
      'editorLineNumber.activeForeground': fg,
      'editor.lineHighlightBackground': lineHighlight,
      'editor.selectionBackground': selection,
      'editorCursor.foreground': fg,
      'editorGutter.background': bg,
      'editorWidget.background': bg,
      'editorWidget.foreground': fg,
      'editorSuggestWidget.background': bg,
      'editorSuggestWidget.foreground': fg,
      'editorSuggestWidget.border': lineHighlight,
      'focusBorder': '#00000000',
    },
  })

  monaco.editor.defineTheme(AURA_DARK, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword.md', foreground: '60a5fa', fontStyle: 'bold' },
      { token: 'strong.md', fontStyle: 'bold' },
      { token: 'emphasis.md', fontStyle: 'italic' },
      { token: 'string.link.md', foreground: '60a5fa' },
      { token: 'variable.md', foreground: '60a5fa' },
    ],
    colors: {
      'editor.background': bg,
      'editor.foreground': fg,
      'editorLineNumber.foreground': gutterDark,
      'editorLineNumber.activeForeground': fg,
      'editor.lineHighlightBackground': lineHighlight,
      'editor.selectionBackground': selection,
      'editorCursor.foreground': fg,
      'editorGutter.background': bg,
      'editorWidget.background': bg,
      'editorWidget.foreground': fg,
      'editorSuggestWidget.background': bg,
      'editorSuggestWidget.foreground': fg,
      'editorSuggestWidget.border': lineHighlight,
      'focusBorder': '#00000000',
    },
  })
}

/**
 * Apply the Monaco theme that matches the current chrome dark flag.
 *
 * @param dark - True when Night / dark chrome is active.
 */
function applyMonacoTheme(dark: boolean): void {
  defineAuraThemes()
  monaco.editor.setTheme(dark ? AURA_DARK : AURA_LIGHT)
}

/**
 * Monaco markdown source editor for Source View.
 *
 * @param props - Initial value and change callback.
 * @returns Editor host element.
 */
export function SourceEditor({ initialValue, onChange }: SourceEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }

    ensureMonacoEnvironment()
    registerMonacoLanguages(monaco)
    applyMonacoTheme(getEditorChromeDark())

    const editor = monaco.editor.create(host, {
      value: initialValue,
      language: 'markdown',
      automaticLayout: true,
      wordWrap: 'on',
      lineNumbers: 'on',
      folding: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderLineHighlight: 'line',
      fontSize: 14,
      lineHeight: 22,
      fontFamily: cssVar(
        '--monospace',
        "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace",
      ),
      padding: { top: 10, bottom: 80 },
      contextmenu: true,
      find: {
        addExtraSpaceOnTop: false,
        autoFindInSelection: 'never',
      },
      // Avoid Monaco stealing Electron menu accelerator focus oddly.
      fixedOverflowWidgets: true,
    })

    const changeSub = editor.onDidChangeModelContent(() => {
      onChangeRef.current(editor.getValue())
    })

    setSourceEditorView(editor)
    editor.focus()

    const unsubTheme = subscribeEditorChromeDark(() => {
      applyMonacoTheme(getEditorChromeDark())
    })

    return () => {
      unsubTheme()
      changeSub.dispose()
      setSourceEditorView(null)
      editor.dispose()
    }
    // Remount only when the seed value identity changes (mode toggle).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValue])

  return <div ref={hostRef} className="h-full min-h-0 overflow-hidden" />
}
