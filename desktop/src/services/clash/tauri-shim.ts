/**
 * Stand-in for `@tauri-apps/*` when Clash Verge runs inside GeoCRM Electron.
 * Real window/file/updater APIs are no-ops; `invoke` goes through the host bridge.
 * `emit` / `listen` use the in-renderer bus (frontend-to-frontend events).
 */

import { emitRendererEvent, listenRendererEvent } from './renderer-events'

type Unlisten = () => void

/**
 * Empty async listener registration.
 * @returns Unsubscribe that is already a no-op.
 */
async function unlistenStub(): Promise<Unlisten> {
  return () => {}
}

/**
 * Routes leftover Tauri `invoke` calls through the Electron Clash bridge.
 * @param cmd - Command name.
 * @param args - Argument object.
 * @returns Bridge result.
 */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const bridge = window.geocrmClash
  if (!bridge?.invoke) {
    throw new Error(`Clash host bridge is missing (${cmd})`)
  }
  return bridge.invoke(cmd, args) as Promise<T>
}

/**
 * Converts a local path to a URL (identity in the Electron renderer).
 * @param filePath - Filesystem path.
 * @returns Path unchanged.
 */
export function convertFileSrc(filePath: string): string {
  return filePath
}

/**
 * Joins path segments with `/`.
 * @param segments - Path parts.
 * @returns Joined path.
 */
export function join(...segments: string[]): Promise<string> {
  return Promise.resolve(segments.filter(Boolean).join('/'))
}

/**
 * App name for Clash User-Agent fallbacks.
 * @returns Display name.
 */
export async function getName(): Promise<string> {
  return 'GeoCRM'
}

/**
 * App version for Clash User-Agent fallbacks.
 * @returns Package version string.
 */
export async function getVersion(): Promise<string> {
  return '0.1.0'
}

export const TauriEvent = {
  WINDOW_CLOSE_REQUESTED: 'tauri://close-requested',
  WINDOW_FOCUS: 'tauri://focus',
  WINDOW_BLUR: 'tauri://blur',
} as const

/**
 * Emits a Tauri-style event to renderer subscribers (frontend-to-frontend).
 * @param event - Event name.
 * @param payload - Optional payload.
 */
export async function emit(event: string, payload?: unknown): Promise<void> {
  emitRendererEvent(event, payload)
}

/**
 * Subscribes to a Tauri-style renderer event.
 * @param event - Event name.
 * @param handler - Callback.
 * @returns Unsubscribe.
 */
export async function listen(
  event: string,
  handler: (event: { payload: unknown }) => void,
): Promise<Unlisten> {
  return listenRendererEvent(event, handler)
}

const noopAsync = async (): Promise<void> => {}

/**
 * Builds a window/webview stub used by Clash layout chrome.
 * @returns Object with the Tauri window methods Clash calls.
 */
function windowStub() {
  return {
    close: noopAsync,
    minimize: noopAsync,
    maximize: noopAsync,
    unmaximize: noopAsync,
    isMaximized: async () => false,
    isFullscreen: async () => false,
    setFullscreen: noopAsync,
    isDecorated: async () => true,
    setDecorations: noopAsync,
    setMinimizable: () => undefined,
    isVisible: async () => document.visibilityState === 'visible',
    isMinimized: async () => false,
    theme: async () =>
      document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    setTheme: noopAsync,
    onResized: unlistenStub,
    onThemeChanged: unlistenStub,
    onFocusChanged: async (handler: (event: { payload: boolean }) => void) => {
      const onFocus = () => handler({ payload: true })
      const onBlur = () => handler({ payload: false })
      window.addEventListener('focus', onFocus)
      window.addEventListener('blur', onBlur)
      return () => {
        window.removeEventListener('focus', onFocus)
        window.removeEventListener('blur', onBlur)
      }
    },
    listen: unlistenStub,
  }
}

export type WebviewWindow = ReturnType<typeof windowStub>
export type Theme = 'light' | 'dark'

/**
 * Current Clash window (stub).
 * @returns Window stub.
 */
export function getCurrentWindow(): ReturnType<typeof windowStub> {
  return windowStub()
}

/**
 * Current Clash webview (stub).
 * @returns Window stub.
 */
export function getCurrentWebviewWindow(): ReturnType<typeof windowStub> {
  return windowStub()
}

export const fetch = globalThis.fetch.bind(globalThis)

/**
 * Writes text to the clipboard.
 * @param text - Clipboard payload.
 */
export async function writeText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}

/**
 * Reads text from the clipboard.
 * @returns Clipboard text.
 */
export async function readText(): Promise<string> {
  return navigator.clipboard.readText()
}

type DialogFilter = { name?: string; extensions: string[] }

/**
 * Native file/directory picker, routed through the Electron main-process dialog.
 * @param options - `directory` / `multiple` / `filters` (Tauri plugin-dialog shape).
 * @returns Selected path(s), or null when cancelled.
 */
export async function open(options?: {
  directory?: boolean
  multiple?: boolean
  filters?: DialogFilter[]
}): Promise<string | string[] | null> {
  return invoke('show_open_dialog', options as unknown as Record<string, unknown>)
}

/**
 * Native save picker, routed through the Electron main-process dialog.
 * @param options - `defaultPath` / `filters` (Tauri plugin-dialog shape).
 * @returns Selected destination, or null when cancelled.
 */
export async function save(options?: {
  defaultPath?: string
  filters?: DialogFilter[]
}): Promise<string | null> {
  return invoke('show_save_dialog', options as unknown as Record<string, unknown>)
}

/**
 * Whether a path exists (always false without a filesystem plugin).
 * @returns False.
 */
export async function exists(): Promise<boolean> {
  return false
}

/**
 * Reads a text file (unavailable in the GeoCRM island).
 * @returns Empty string.
 */
export async function readTextFile(): Promise<string> {
  return ''
}

export type DownloadEvent = { event: string; data?: { downloaded?: number; contentLength?: number } }

export type CheckOptions = Record<string, unknown>

export type Update = null

/**
 * Clash auto-updater is disabled in GeoCRM.
 * @returns No update.
 */
export async function check(_options?: CheckOptions): Promise<Update> {
  return null
}
