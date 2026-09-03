import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

/**
 * Configure Monaco workers for Vite (markdown uses the base editor worker).
 * Import once before creating any editor instance.
 */
export function ensureMonacoEnvironment(): void {
  if (typeof self === 'undefined') {
    return
  }
  const global = self as typeof self & {
    MonacoEnvironment?: {
      getWorker: (_: unknown, label: string) => Worker
    }
  }
  if (global.MonacoEnvironment) {
    return
  }
  global.MonacoEnvironment = {
    getWorker() {
      return new editorWorker()
    },
  }
}
