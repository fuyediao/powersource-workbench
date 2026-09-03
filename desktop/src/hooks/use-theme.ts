import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

/** localStorage key for light/dark appearance (shared with Spotlight). */
export const THEME_KEY = 'atlas-theme'

/**
 * Resolves the saved theme, or the light preset when none is stored.
 * @returns The initial visual theme.
 */
export function getInitialTheme(): Theme {
  const savedTheme = localStorage.getItem(THEME_KEY)
  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme
  }

  return 'light'
}

/**
 * Applies the theme class and persistence side effects.
 * @param theme - Theme to apply.
 * @returns Nothing.
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  localStorage.setItem(THEME_KEY, theme)
}

/**
 * Manages and persists the page color theme (local only).
 * Prefer `useAppearance` when signed-in sync is needed.
 * @returns Current theme and setters.
 */
export function useTheme(): {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
} {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  /**
   * Commits a theme change with an optional view-transition cross-fade.
   * @param nextTheme - Theme to apply.
   * @returns Nothing.
   */
  function commitTheme(nextTheme: Theme): void {
    if (nextTheme === theme) {
      return
    }

    /**
     * Writes the theme to the DOM and React state.
     * @returns Nothing.
     */
    function commit(): void {
      applyTheme(nextTheme)
      setThemeState(nextTheme)
    }

    if (typeof document.startViewTransition === 'function') {
      document.startViewTransition(commit)
      return
    }

    commit()
  }

  /**
   * Switches between light and dark themes.
   * @returns Nothing.
   */
  function toggleTheme(): void {
    commitTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return { theme, setTheme: commitTheme, toggleTheme }
}
