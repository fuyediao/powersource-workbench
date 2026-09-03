/**
 * Sync Aura editor chrome with GeoCRM Settings Theme (`html.dark` / atlas-theme).
 * No separate Aura content-theme stylesheets.
 */
import { getActiveEditor } from '@/utils/aura/active-editor'
import { applyCodeTheme } from '@/utils/aura/code-theme'
import { setEditorChromeDark } from '@/hooks/aura/editor-chrome-theme-store'

/**
 * Whether the shell is currently in dark mode.
 * @returns True when `html` has the `dark` class.
 */
function isShellDark(): boolean {
  return document.documentElement.classList.contains('dark')
}

/**
 * Mirror Settings Theme onto the live editor kernel (diagram theme + hljs).
 * React owns `aura--dark` on the mount element via {@link setEditorChromeDark}.
 *
 * @param scheme - `light` or `dark` from the shell.
 */
function syncAuraChromeTheme(scheme: 'light' | 'dark'): void {
  const chromeTheme = scheme === 'dark' ? 'dark' : 'classic'
  const codeTheme = scheme === 'dark' ? 'github-dark' : 'github'
  setEditorChromeDark(scheme === 'dark')

  const instance = getActiveEditor()
  if (!instance?.aura) {
    applyCodeTheme(codeTheme)
    return
  }
  instance.aura.options.theme = chromeTheme
  instance.aura.options.preview.hljs.style = codeTheme
  applyCodeTheme(codeTheme)
}

/**
 * Sync editor chrome / code theme from Settings Theme (`html.dark`).
 */
export function syncEditorChromeFromShellTheme(): void {
  const scheme = isShellDark() ? 'dark' : 'light'
  // Do not write documentElement styles — Settings Theme owns the shell.
  syncAuraChromeTheme(scheme)
}

/**
 * Apply shell theme sync once (Aura page mount / editor after-init).
 */
export function ensureShellThemeSynced(): void {
  syncEditorChromeFromShellTheme()
}

/**
 * Subscribe to Settings Theme class changes on `html`.
 *
 * @param listener - Callback when `class` changes.
 * @returns Unsubscribe function.
 */
export function subscribeShellTheme(listener: () => void): () => void {
  const observer = new MutationObserver((mutations) => {
    if (mutations.some((m) => m.attributeName === 'class')) {
      listener()
    }
  })
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })
  return () => observer.disconnect()
}
