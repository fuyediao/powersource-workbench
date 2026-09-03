import {
  isFeatureTabId,
  isFolioPageTabId,
  type FeatureTabId,
} from '@/constants/feature-tabs'

/**
 * Locale folders needed for login, Home chrome, title bar, menus, and Spotlight.
 * `home` covers Home aside widgets (also used as Settings Page labels).
 * Title-bar labels for Settings and untitled Folio tabs load with the shell.
 * `settings/updates` is required for the blocking auto-update overlay (any tab).
 * `ask-ai` covers the companion sidebar on every tab. `chat/model-selector`
 * is the model-name list that sidebar shares with Chat (not the rest of `chat`).
 * Other feature folders load when that tab opens.
 */
export const SHELL_LOCALE_PREFIXES = [
  'actions',
  'apps',
  'ask-ai',
  'auth',
  'background',
  'browser',
  'categories',
  'chat/model-selector',
  'common',
  'currency',
  'desktop-menu',
  'features',
  'form',
  'functions',
  'home',
  'markets',
  'nav',
  'news',
  'search',
  'status',
  'title-bar',
  'todo',
  'weather',
  'widget-tools',
  'settings/title',
  'settings/updates',
  'folio/untitled',
] as const

/**
 * Extra locale folders for each feature tab (beyond {@link SHELL_LOCALE_PREFIXES}).
 * Map reuses Chat favorites / location strings (`chat.tabs.*`, `chat.favorites.*`).
 * Clash reuses the shared rail mode control (`admin.sidebar.mode.*`). Mail
 * keeps its own three-mode control and is not on this native Sidebar menu.
 * Docs / Sheets / Slides also load `admin/sidebar` for the same four-state
 * control. Settings also loads Aura preference strings for the Editor section.
 */
const FEATURE_LOCALE_PREFIXES: Record<FeatureTabId, readonly string[]> = {
  chat: ['chat'],
  mail: ['mail'],
  calendar: ['calendar'],
  aura: ['aura'],
  folio: ['folio'],
  docs: ['office', 'admin/sidebar'],
  sheets: ['office', 'admin/sidebar'],
  slides: ['office', 'admin/sidebar'],
  harness: ['harness'],
}

/**
 * Deduplicates prefix names while preserving order.
 * @param prefixes - Locale folder prefixes.
 * @returns Unique list.
 */
export function uniqueLocalePrefixes(prefixes: readonly string[]): string[] {
  return [...new Set(prefixes)]
}

/**
 * Locale folders to load for a title-bar screen.
 * @param screen - Active tab id (`home`, `settings`, a feature id, browser tab, …).
 * @returns Prefixes including the shell set.
 */
export function localePrefixesForScreen(screen: string): string[] {
  const shell = [...SHELL_LOCALE_PREFIXES]
  if (screen === 'home') {
    return uniqueLocalePrefixes([
      ...shell,
      'admin/follow-ups',
      'admin/follow-up-timeline',
    ])
  }
  if (screen === 'settings') {
    return uniqueLocalePrefixes([
      ...shell,
      'settings',
      'admin/sidebar',
      'aura/preferences',
    ])
  }
  if (isFolioPageTabId(screen)) {
    return uniqueLocalePrefixes([...shell, 'folio'])
  }
  if (isFeatureTabId(screen)) {
    return uniqueLocalePrefixes([...shell, ...FEATURE_LOCALE_PREFIXES[screen]])
  }
  return shell
}

/** Must match {@link TITLE_TABS_SESSION_KEY} in `use-title-tabs.ts`. */
const TITLE_TABS_SESSION_KEY = 'geocrm.electron.titleTabs.v1'

/**
 * Locale prefixes for the title-bar screen restored after Ctrl+R.
 * @returns Shell prefixes plus the persisted feature folder set.
 */
export function localePrefixesForPersistedScreen(): string[] {
  if (typeof sessionStorage === 'undefined') {
    return localePrefixesForScreen('home')
  }
  try {
    const raw = sessionStorage.getItem(TITLE_TABS_SESSION_KEY)
    if (!raw) {
      return localePrefixesForScreen('home')
    }
    const parsed = JSON.parse(raw) as { screen?: unknown }
    const screen = typeof parsed.screen === 'string' ? parsed.screen : 'home'
    return localePrefixesForScreen(screen)
  } catch {
    return localePrefixesForScreen('home')
  }
}
