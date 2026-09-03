/**
 * Home / Settings appearance DTOs (theme, widgets, wallpapers).
 * Values live in machine SQLite; wallpaper bytes live under userData.
 */

/** Custom protocol that serves local wallpaper files to the renderer. */
export const HOME_WALLPAPER_SCHEME = 'workbench-wallpaper'

/** Host used in `workbench-wallpaper://files/...` URLs. */
export const HOME_WALLPAPER_HOST = 'files'

/** One wallpaper in the local library. */
export interface HomeWallpaperItemDto {
  id: string
  path: string
  url: string
  thumbUrl: string
}

/** How signed-in http(s) links open. Null means the user has not saved a value yet. */
export type HomeOpenLinksMode = 'inApp' | 'external'

/**
 * Parses a stored Open links preference.
 * @param value - Raw JSON value.
 * @returns Mode, or null when unset or invalid.
 */
export function parseHomeOpenLinksMode(value: unknown): HomeOpenLinksMode | null {
  return value === 'inApp' || value === 'external' ? value : null
}

/** Persisted Home / Settings row (one per signed-in user). */
export interface HomeSettingsRecord {
  searchEngine: string
  panelOpacity: number
  searchPanelOpacity: number
  backgroundOpacity: number
  backgroundPath: string | null
  appearanceTheme: string
  accentHue: string
  accentShade: number
  clockAccentHue: string
  clockAccentShade: number
  iconRadius: number
  searchRadius: number
  wallpaperRotateEnabled: boolean
  wallpaperRotateSeconds: number
  showWeather: boolean
  showMarkets: boolean
  showNews: boolean
  showTodo: boolean
  showCurrency: boolean
  showMail: boolean
  showApps: boolean
  peekApps: boolean
  openLinksMode: HomeOpenLinksMode | null
  currencyFrom: string
  currencyTo: string
  weatherLatitude: number | null
  weatherLongitude: number | null
  weatherPlace: string | null
  weatherSource: string | null
  asideWidgetOrderLeft: string[]
  asideWidgetOrderRight: string[]
  asideWidgetOrder: string[]
}

/** One local todo item. */
export interface HomeTodoItemDto {
  id: string
  text: string
  done: boolean
  position: number
}

/** One selected market asset for the Home markets widget. */
export interface HomeMarketAssetDto {
  id: string
  symbol: string
  name: string
  kind: 'crypto' | 'stock'
}

/** One Home search-history row. */
export interface HomeSearchHistoryItemDto {
  id: string
  query: string
  engine: string
  createdAt: string
}

/** Max suggestion strings stored for one query. */
export const HOME_SEARCH_SUGGESTION_LIMIT = 10

/** Max characters kept for one suggestion string. */
export const HOME_SEARCH_SUGGESTION_TEXT_LIMIT = 200

/**
 * Sanitizes a search-suggestion list for local SQLite.
 * @param value - Raw network or stored list.
 * @returns Deduplicated trimmed strings.
 */
export function sanitizeSearchSuggestions(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  const seen = new Set<string>()
  const next: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') {
      continue
    }
    const text = item.trim()
    if (!text || text.length > HOME_SEARCH_SUGGESTION_TEXT_LIMIT) {
      continue
    }
    const key = text.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    next.push(text)
    if (next.length >= HOME_SEARCH_SUGGESTION_LIMIT) {
      break
    }
  }
  return next
}

/**
 * Builds a renderer URL for a wallpaper stored as `userId/file.ext`.
 * @param storagePath - Relative path under the local wallpaper folder.
 * @returns Privileged custom-protocol URL.
 */
export function homeWallpaperMediaUrl(storagePath: string): string {
  const encoded = storagePath
    .split('/')
    .filter((part) => part.length > 0)
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `${HOME_WALLPAPER_SCHEME}://${HOME_WALLPAPER_HOST}/${encoded}`
}

/**
 * Derives the companion thumbnail path for a full wallpaper path.
 * @param storagePath - Full wallpaper storage path.
 * @returns Thumbnail storage path.
 */
export function homeWallpaperThumbPath(storagePath: string): string {
  const slash = storagePath.lastIndexOf('/')
  const folder = slash >= 0 ? storagePath.slice(0, slash + 1) : ''
  const file = slash >= 0 ? storagePath.slice(slash + 1) : storagePath
  const base = file.replace(/\.[^.]+$/u, '')
  return `${folder}${base}.thumb.webp`
}
