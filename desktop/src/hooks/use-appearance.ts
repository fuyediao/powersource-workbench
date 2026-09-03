import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ACCENT_HUES,
  ACCENT_SHADES,
  applyAccent,
  applyClockAccent,
  getStoredAccentHue,
  getStoredAccentShade,
  getStoredClockAccentHue,
  getStoredClockAccentShade,
  resolveAccentHueForTheme,
  type AccentHue,
  type AccentShade,
} from '@/utils/appearance/accent'
import { applyTheme, getInitialTheme, type Theme } from '@/hooks/use-theme'
import {
  applyIconRadius,
  clampIconRadius,
  DEFAULT_ICON_RADIUS,
  getStoredIconRadius,
} from '@/utils/appearance/icon-radius'
import {
  applySearchRadius,
  clampSearchRadius,
  DEFAULT_SEARCH_RADIUS,
  getStoredSearchRadius,
} from '@/utils/appearance/search-radius'
import {
  fetchAppearanceSettings,
  saveAppearanceSettings,
  type AppearanceSettings,
} from '@/utils/home/library-api'
import {
  notifyAppearancePeers,
  subscribeAppearancePeers,
} from '@/utils/appearance/sync-appearance-storage'

export type { AccentHue, AccentShade, Theme }
export { ACCENT_HUES, ACCENT_SHADES }

/**
 * Reads the theme already applied to the document (or localStorage) so remounts do not flash light.
 * @returns Current DOM / stored theme.
 */
function readHydratedTheme(): Theme {
  if (typeof document !== 'undefined') {
    if (document.documentElement.classList.contains('dark')) {
      return 'dark'
    }
    if (document.documentElement.classList.contains('light')) {
      return 'light'
    }
  }
  return getInitialTheme()
}

const BOOT_ACCENT_HUE: AccentHue = getStoredAccentHue()
const BOOT_ACCENT_SHADE: AccentShade = getStoredAccentShade()
const BOOT_CLOCK_HUE: AccentHue = getStoredClockAccentHue()
const BOOT_CLOCK_SHADE: AccentShade = getStoredClockAccentShade()
const BOOT_ICON_RADIUS = getStoredIconRadius()
const BOOT_SEARCH_RADIUS = getStoredSearchRadius()

/**
 * Combines light/dark theme with brand/clock accents, icon radius, and search-bar radius.
 * Signed-in users load from Supabase as the source of truth (localStorage is write-through only).
 * @param userId - Signed-in user id, or null while unauthenticated.
 * @returns Theme/accent/radius state, ready flag, and setters.
 */
export function useAppearance(userId: string | null): {
  ready: boolean
  theme: Theme
  setTheme: (theme: Theme) => void
  accentHue: AccentHue
  accentShade: AccentShade
  setAccentHue: (hue: AccentHue) => void
  setAccentShade: (shade: AccentShade) => void
  clockAccentHue: AccentHue
  clockAccentShade: AccentShade
  setClockAccentHue: (hue: AccentHue) => void
  setClockAccentShade: (shade: AccentShade) => void
  iconRadius: number
  setIconRadius: (radius: number) => void
  searchRadius: number
  setSearchRadius: (radius: number) => void
  restoreDefaults: () => void
} {
  const [ready, setReady] = useState(true)
  const [theme, setThemeState] = useState<Theme>(readHydratedTheme)
  const [accentHue, setAccentHueState] = useState<AccentHue>(BOOT_ACCENT_HUE)
  const [accentShade, setAccentShadeState] = useState<AccentShade>(BOOT_ACCENT_SHADE)
  const [clockAccentHue, setClockAccentHueState] = useState<AccentHue>(BOOT_CLOCK_HUE)
  const [clockAccentShade, setClockAccentShadeState] =
    useState<AccentShade>(BOOT_CLOCK_SHADE)
  const [iconRadius, setIconRadiusState] = useState(BOOT_ICON_RADIUS)
  const [searchRadius, setSearchRadiusState] = useState(BOOT_SEARCH_RADIUS)
  const saveTimer = useRef<number | null>(null)
  const pendingSettings = useRef<AppearanceSettings | null>(null)
  const userIdRef = useRef<string | null>(userId)
  const themeRef = useRef(theme)
  const accentHueRef = useRef(accentHue)
  const accentShadeRef = useRef(accentShade)
  const clockAccentHueRef = useRef(clockAccentHue)
  const clockAccentShadeRef = useRef(clockAccentShade)
  const iconRadiusRef = useRef(iconRadius)
  const searchRadiusRef = useRef(searchRadius)
  userIdRef.current = userId
  themeRef.current = theme
  accentHueRef.current = accentHue
  accentShadeRef.current = accentShade
  clockAccentHueRef.current = clockAccentHue
  clockAccentShadeRef.current = clockAccentShade
  iconRadiusRef.current = iconRadius
  searchRadiusRef.current = searchRadius

  useLayoutEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    applyAccent(accentHue, accentShade)
  }, [accentHue, accentShade])

  useEffect(() => {
    applyClockAccent(clockAccentHue, clockAccentShade)
  }, [clockAccentHue, clockAccentShade])

  useEffect(() => {
    applyIconRadius(iconRadius)
  }, [iconRadius])

  useEffect(() => {
    applySearchRadius(searchRadius)
  }, [searchRadius])

  useEffect(() => {
    return subscribeAppearancePeers(() => {
      setThemeState(getInitialTheme())
      setAccentHueState(getStoredAccentHue())
      setAccentShadeState(getStoredAccentShade())
      setClockAccentHueState(getStoredClockAccentHue())
      setClockAccentShadeState(getStoredClockAccentShade())
      setIconRadiusState(getStoredIconRadius())
      setSearchRadiusState(getStoredSearchRadius())
    })
  }, [])

  useEffect(() => {
    if (!userId) {
      return
    }

    let active = true
    // Hydrated local/DOM theme stays visible; remote settings patch in without a light flash.

    void fetchAppearanceSettings(userId)
      .then((remote) => {
        if (!active) {
          return
        }

        setThemeState(remote.theme)
        setAccentHueState(remote.accentHue)
        setAccentShadeState(remote.accentShade)
        setClockAccentHueState(remote.clockAccentHue)
        setClockAccentShadeState(remote.clockAccentShade)
        setIconRadiusState(remote.iconRadius)
        setSearchRadiusState(remote.searchRadius)
        applyTheme(remote.theme)
        applyAccent(remote.accentHue, remote.accentShade)
        applyClockAccent(remote.clockAccentHue, remote.clockAccentShade)
        applyIconRadius(remote.iconRadius)
        applySearchRadius(remote.searchRadius)
        setReady(true)
      })
      .catch(() => {
        if (!active) {
          return
        }
        // Keep whatever theme is already on the document; only ensure accents/radii defaults.
        applyAccent(BOOT_ACCENT_HUE, BOOT_ACCENT_SHADE)
        applyClockAccent(BOOT_CLOCK_HUE, BOOT_CLOCK_SHADE)
        applyIconRadius(BOOT_ICON_RADIUS)
        applySearchRadius(BOOT_SEARCH_RADIUS)
        setReady(true)
      })

    return () => {
      active = false
    }
  }, [userId])

  useEffect(() => {
    /**
     * Flushes any debounced appearance write to Supabase immediately.
     * @returns Nothing.
     */
    function flushPendingSave(): void {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
      if (pendingSettings.current === null) {
        return
      }
      const value = pendingSettings.current
      pendingSettings.current = null
      const currentUserId = userIdRef.current
      if (!currentUserId) {
        return
      }
      void saveAppearanceSettings(currentUserId, value).catch(() => undefined)
    }

    window.addEventListener('pagehide', flushPendingSave)
    return () => {
      window.removeEventListener('pagehide', flushPendingSave)
      flushPendingSave()
    }
  }, [])

  /**
   * Schedules a debounced upsert of the current appearance settings.
   * @param settings - Settings to persist.
   * @returns Nothing.
   */
  function scheduleSave(settings: AppearanceSettings): void {
    notifyAppearancePeers()
    const currentUserId = userIdRef.current
    if (!currentUserId) {
      return
    }
    pendingSettings.current = settings
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current)
    }
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null
      const value = pendingSettings.current
      if (value === null) {
        return
      }
      pendingSettings.current = null
      void saveAppearanceSettings(currentUserId, value).catch(() => undefined)
    }, 250)
  }

  /**
   * Builds the current appearance payload for persistence.
   * @param patch - Fields to override.
   * @returns Full appearance settings.
   */
  function currentSettings(patch: Partial<AppearanceSettings> = {}): AppearanceSettings {
    return {
      theme: themeRef.current,
      accentHue: accentHueRef.current,
      accentShade: accentShadeRef.current,
      clockAccentHue: clockAccentHueRef.current,
      clockAccentShade: clockAccentShadeRef.current,
      iconRadius: iconRadiusRef.current,
      searchRadius: searchRadiusRef.current,
      ...patch,
    }
  }

  /**
   * Updates appearance and remaps black/white accents when needed.
   * @param nextTheme - Light or dark.
   * @returns Nothing.
   */
  function setTheme(nextTheme: Theme): void {
    if (nextTheme === themeRef.current) {
      return
    }

    /**
     * Writes the theme and remapped accents to React state.
     * Applies CSS (and localStorage) before peer notify so Spotlight / this
     * window do not re-hydrate stale black/white clock accents.
     * @returns Nothing.
     */
    function commit(): void {
      const nextHue = resolveAccentHueForTheme(accentHueRef.current, nextTheme)
      const nextClockHue = resolveAccentHueForTheme(clockAccentHueRef.current, nextTheme)
      applyTheme(nextTheme)
      applyAccent(nextHue, accentShadeRef.current)
      applyClockAccent(nextClockHue, clockAccentShadeRef.current)
      themeRef.current = nextTheme
      accentHueRef.current = nextHue
      clockAccentHueRef.current = nextClockHue
      setThemeState(nextTheme)
      setAccentHueState(nextHue)
      setClockAccentHueState(nextClockHue)
      scheduleSave(
        currentSettings({
          theme: nextTheme,
          accentHue: nextHue,
          clockAccentHue: nextClockHue,
        }),
      )
    }

    if (typeof document.startViewTransition === 'function') {
      document.startViewTransition(commit)
      return
    }

    commit()
  }

  /**
   * Updates the brand accent hue and reapplies CSS.
   * @param hue - Next hue.
   * @returns Nothing.
   */
  function setAccentHue(hue: AccentHue): void {
    const nextHue = resolveAccentHueForTheme(hue, themeRef.current)
    applyAccent(nextHue, accentShadeRef.current)
    accentHueRef.current = nextHue
    setAccentHueState(nextHue)
    scheduleSave(currentSettings({ accentHue: nextHue }))
  }

  /**
   * Updates the brand accent shade and reapplies CSS.
   * @param shade - Next shade.
   * @returns Nothing.
   */
  function setAccentShade(shade: AccentShade): void {
    applyAccent(accentHueRef.current, shade)
    accentShadeRef.current = shade
    setAccentShadeState(shade)
    scheduleSave(currentSettings({ accentShade: shade }))
  }

  /**
   * Updates the clock accent hue and reapplies CSS.
   * @param hue - Next hue.
   * @returns Nothing.
   */
  function setClockAccentHue(hue: AccentHue): void {
    const nextHue = resolveAccentHueForTheme(hue, themeRef.current)
    applyClockAccent(nextHue, clockAccentShadeRef.current)
    clockAccentHueRef.current = nextHue
    setClockAccentHueState(nextHue)
    scheduleSave(currentSettings({ clockAccentHue: nextHue }))
  }

  /**
   * Updates the clock accent shade and reapplies CSS.
   * @param shade - Next shade.
   * @returns Nothing.
   */
  function setClockAccentShade(shade: AccentShade): void {
    applyClockAccent(clockAccentHueRef.current, shade)
    clockAccentShadeRef.current = shade
    setClockAccentShadeState(shade)
    scheduleSave(currentSettings({ clockAccentShade: shade }))
  }

  /**
   * Updates the app icon corner radius and reapplies CSS.
   * @param radius - Roundness percent (0 = square, 100 = circle).
   * @returns Nothing.
   */
  function setIconRadius(radius: number): void {
    const next = clampIconRadius(radius)
    setIconRadiusState(next)
    scheduleSave(currentSettings({ iconRadius: next }))
  }

  /**
   * Updates the search bar corner radius and reapplies CSS.
   * @param radius - Roundness percent (0 = square, 100 = pill/circle).
   * @returns Nothing.
   */
  function setSearchRadius(radius: number): void {
    const next = clampSearchRadius(radius)
    setSearchRadiusState(next)
    scheduleSave(currentSettings({ searchRadius: next }))
  }

  /**
   * Restores preferred defaults: light theme, black accents, and default radii.
   * @returns Nothing.
   */
  function restoreDefaults(): void {
    const nextTheme: Theme = 'light'
    const nextHue: AccentHue = 'black'
    const nextShade: AccentShade = 500
    const nextIconRadius = DEFAULT_ICON_RADIUS
    const nextSearchRadius = DEFAULT_SEARCH_RADIUS
    /**
     * Applies default appearance values.
     * @returns Nothing.
     */
    function commit(): void {
      applyTheme(nextTheme)
      applyAccent(nextHue, nextShade)
      applyClockAccent(nextHue, nextShade)
      applyIconRadius(nextIconRadius)
      applySearchRadius(nextSearchRadius)
      themeRef.current = nextTheme
      accentHueRef.current = nextHue
      accentShadeRef.current = nextShade
      clockAccentHueRef.current = nextHue
      clockAccentShadeRef.current = nextShade
      iconRadiusRef.current = nextIconRadius
      searchRadiusRef.current = nextSearchRadius
      setThemeState(nextTheme)
      setAccentHueState(nextHue)
      setAccentShadeState(nextShade)
      setClockAccentHueState(nextHue)
      setClockAccentShadeState(nextShade)
      setIconRadiusState(nextIconRadius)
      setSearchRadiusState(nextSearchRadius)
      scheduleSave({
        theme: nextTheme,
        accentHue: nextHue,
        accentShade: nextShade,
        clockAccentHue: nextHue,
        clockAccentShade: nextShade,
        iconRadius: nextIconRadius,
        searchRadius: nextSearchRadius,
      })
    }

    if (typeof document.startViewTransition === 'function') {
      document.startViewTransition(commit)
      return
    }

    commit()
  }

  return {
    ready,
    theme,
    setTheme,
    accentHue,
    accentShade,
    setAccentHue,
    setAccentShade,
    clockAccentHue,
    clockAccentShade,
    setClockAccentHue,
    setClockAccentShade,
    iconRadius,
    setIconRadius,
    searchRadius,
    setSearchRadius,
    restoreDefaults,
  }
}
