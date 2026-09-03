/** localStorage cache for Electron in-app vs system-browser link opening. */
export const LINK_OPEN_PREFERENCE_KEY = 'workbench.electron.openLinksInApp'

/** How http(s) links open after sign-in (login / OAuth stay external). */
export type LinkOpenMode = 'external' | 'inApp'

/**
 * Returns whether a value is a stored Open links mode.
 * @param value - Candidate value.
 * @returns True for `inApp` or `external`.
 */
export function isLinkOpenMode(value: unknown): value is LinkOpenMode {
  return value === 'inApp' || value === 'external'
}

/**
 * Reads the cached link-open preference (defaults to in-app).
 * Signed-in Settings persist the same value in Home SQLite.
 * @returns Current mode.
 */
export function loadLinkOpenMode(): LinkOpenMode {
  try {
    return localStorage.getItem(LINK_OPEN_PREFERENCE_KEY) === '0' ? 'external' : 'inApp'
  } catch {
    return 'inApp'
  }
}

/**
 * Writes the link-open cache used before SQLite loads and in unsigned windows.
 * @param mode - Target mode.
 * @returns Nothing.
 */
export function saveLinkOpenMode(mode: LinkOpenMode): void {
  try {
    localStorage.setItem(LINK_OPEN_PREFERENCE_KEY, mode === 'inApp' ? '1' : '0')
  } catch {
    // Ignore quota / private-mode failures.
  }
}

/**
 * Builds a short tab label from a URL hostname.
 * @param url - Absolute http(s) URL.
 * @returns Hostname without a leading `www.`, or a fallback.
 */
export function tabLabelFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || 'Page'
  } catch {
    return 'Page'
  }
}

/**
 * Returns whether a title-bar tab id is an in-app browser tab.
 * @param tabId - Title-bar tab id.
 * @returns True for `browser:*` tabs.
 */
export function isBrowserTabId(tabId: string): boolean {
  return tabId.startsWith('browser:')
}
