export type ThemePreference = 'system' | 'light' | 'dark'

export const themeStorageKey = 'powersource-workbench-theme'

/**
 * Applies and persists a Workbench theme preference.
 * @param theme - Theme preference to apply.
 * @returns Nothing.
 */
export function applyTheme(theme: ThemePreference): void {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && systemDark))
  localStorage.setItem(themeStorageKey, theme)
}

/**
 * Loads the persisted Workbench theme preference.
 * @returns A valid stored theme or the system default.
 */
export function loadTheme(): ThemePreference {
  const stored = localStorage.getItem(themeStorageKey)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}
