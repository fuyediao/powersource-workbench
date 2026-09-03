export type AccentHue =
  | 'red'
  | 'orange'
  | 'amber'
  | 'yellow'
  | 'lime'
  | 'green'
  | 'emerald'
  | 'teal'
  | 'cyan'
  | 'sky'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'purple'
  | 'fuchsia'
  | 'pink'
  | 'rose'
  | 'black'
  | 'white'

/** Common Tailwind shades offered in settings (100–950). */
export type AccentShade = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950

export type AppearanceTheme = 'light' | 'dark'

export const ACCENT_HUES: AccentHue[] = [
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
  'black',
  'white',
]

export const ACCENT_SHADES: AccentShade[] = [100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

export const DEFAULT_ACCENT_HUE: AccentHue = 'black'
export const DEFAULT_ACCENT_SHADE: AccentShade = 500
/** Default clock color matches ink (black in light, remapped to white in dark). */
export const DEFAULT_CLOCK_ACCENT_HUE: AccentHue = 'black'
export const DEFAULT_CLOCK_ACCENT_SHADE: AccentShade = 500

export const ACCENT_HUE_KEY = 'atlas-accent-hue'
export const ACCENT_SHADE_KEY = 'atlas-accent-shade'
export const CLOCK_ACCENT_HUE_KEY = 'atlas-clock-accent-hue'
export const CLOCK_ACCENT_SHADE_KEY = 'atlas-clock-accent-shade'

/**
 * Returns whether the hue is a pure black/white neutral.
 * @param hue - Accent hue.
 * @returns True for black or white.
 */
export function isNeutralAccent(hue: AccentHue): boolean {
  return hue === 'black' || hue === 'white'
}

/**
 * Accent hues shown for the current appearance (black/white are mutually exclusive).
 * @param theme - Light or dark appearance.
 * @returns Visible hue list.
 */
export function visibleAccentHues(theme: AppearanceTheme): AccentHue[] {
  return ACCENT_HUES.filter((hue) => {
    if (hue === 'black') {
      return theme === 'light'
    }
    if (hue === 'white') {
      return theme === 'dark'
    }
    return true
  })
}

/**
 * Maps a neutral accent to the opposite when appearance flips.
 * @param hue - Current accent hue.
 * @param theme - Next appearance theme.
 * @returns Hue valid for that theme.
 */
export function resolveAccentHueForTheme(hue: AccentHue, theme: AppearanceTheme): AccentHue {
  if (hue === 'black' && theme === 'dark') {
    return 'white'
  }
  if (hue === 'white' && theme === 'light') {
    return 'black'
  }
  return hue
}

/**
 * CSS variable used for a hue swatch preview (500 for chromatic, pure for neutrals).
 * @param hue - Accent hue.
 * @returns CSS `var(--color-…)` value.
 */
export function accentSwatchVar(hue: AccentHue): string {
  if (hue === 'black') {
    return 'var(--color-black)'
  }
  if (hue === 'white') {
    return 'var(--color-white)'
  }
  return `var(--color-${hue}-500)`
}

/**
 * Builds the Tailwind CSS color variable reference for a hue/shade pair.
 * @param hue - Palette hue name.
 * @param shade - Palette shade step (ignored for black/white).
 * @returns CSS `var(--color-…)` value.
 */
export function accentCssVar(hue: AccentHue, shade: AccentShade): string {
  if (hue === 'black') {
    return 'var(--color-black)'
  }
  if (hue === 'white') {
    return 'var(--color-white)'
  }
  return `var(--color-${hue}-${shade})`
}

/**
 * Applies the brand accent CSS variables on the document root.
 * @param hue - Palette hue name.
 * @param shade - Palette shade step.
 * @returns Nothing.
 */
export function applyAccent(hue: AccentHue, shade: AccentShade): void {
  const root = document.documentElement
  root.style.setProperty('--brand', accentCssVar(hue, shade))
  root.style.setProperty(
    '--brand-fg',
    hue === 'white' || (hue !== 'black' && shade <= 400)
      ? 'var(--color-zinc-950)'
      : 'var(--color-white)',
  )
  root.dataset.accentHue = hue
  root.dataset.accentShade = String(shade)
  localStorage.setItem(ACCENT_HUE_KEY, hue)
  localStorage.setItem(ACCENT_SHADE_KEY, String(shade))
}

/**
 * Applies the independent clock color CSS variable on the document root.
 * @param hue - Palette hue name.
 * @param shade - Palette shade step.
 * @returns Nothing.
 */
export function applyClockAccent(hue: AccentHue, shade: AccentShade): void {
  const root = document.documentElement
  root.style.setProperty('--clock', accentCssVar(hue, shade))
  root.dataset.clockAccentHue = hue
  root.dataset.clockAccentShade = String(shade)
  localStorage.setItem(CLOCK_ACCENT_HUE_KEY, hue)
  localStorage.setItem(CLOCK_ACCENT_SHADE_KEY, String(shade))
}

/**
 * Reads the persisted accent hue, falling back to sky.
 * @returns Accent hue.
 */
export function getStoredAccentHue(): AccentHue {
  const saved = localStorage.getItem(ACCENT_HUE_KEY)
  if (saved && (ACCENT_HUES as string[]).includes(saved)) {
    return saved as AccentHue
  }
  return DEFAULT_ACCENT_HUE
}

/**
 * Reads the persisted accent shade, falling back to 500.
 * @returns Accent shade.
 */
export function getStoredAccentShade(): AccentShade {
  const saved = Number(localStorage.getItem(ACCENT_SHADE_KEY))
  if ((ACCENT_SHADES as number[]).includes(saved)) {
    return saved as AccentShade
  }
  return DEFAULT_ACCENT_SHADE
}

/**
 * Reads the persisted clock accent hue, falling back to black.
 * @returns Clock accent hue.
 */
export function getStoredClockAccentHue(): AccentHue {
  const saved = localStorage.getItem(CLOCK_ACCENT_HUE_KEY)
  if (saved && (ACCENT_HUES as string[]).includes(saved)) {
    return saved as AccentHue
  }
  return DEFAULT_CLOCK_ACCENT_HUE
}

/**
 * Reads the persisted clock accent shade, falling back to 500.
 * @returns Clock accent shade.
 */
export function getStoredClockAccentShade(): AccentShade {
  const saved = Number(localStorage.getItem(CLOCK_ACCENT_SHADE_KEY))
  if ((ACCENT_SHADES as number[]).includes(saved)) {
    return saved as AccentShade
  }
  return DEFAULT_CLOCK_ACCENT_SHADE
}
