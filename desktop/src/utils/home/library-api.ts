import type { AppItem, Category } from '@/types/library'
import { isSearchEngine, type SearchEngine } from '@/types/search'
import { normalizeSiteUrl } from '@/utils/home/site-url'
import {
  normalizeAsideWidgetRails,
  type AsideWidgetRails,
} from '@/constants/aside-widgets'
import {
  ACCENT_HUES,
  ACCENT_SHADES,
  DEFAULT_ACCENT_HUE,
  DEFAULT_ACCENT_SHADE,
  DEFAULT_CLOCK_ACCENT_HUE,
  DEFAULT_CLOCK_ACCENT_SHADE,
  resolveAccentHueForTheme,
  type AccentHue,
  type AccentShade,
  type AppearanceTheme,
} from '@/utils/appearance/accent'
import { clampIconRadius, DEFAULT_ICON_RADIUS } from '@/utils/appearance/icon-radius'
import { clampSearchRadius, DEFAULT_SEARCH_RADIUS } from '@/utils/appearance/search-radius'
import { createWallpaperThumbnail } from '@/utils/appearance/wallpaper-thumb'
import {
  isLinkOpenMode,
  loadLinkOpenMode,
  saveLinkOpenMode,
  type LinkOpenMode,
} from '@/utils/settings/link-open-preference'

export interface SearchHistoryItem {
  id: string
  query: string
  engine: SearchEngine
  createdAt: string
}

export interface MarketAssetDto {
  id: string
  symbol: string
  name: string
  kind: 'crypto' | 'stock'
}

export interface SiteSearchHitDto {
  id: string
  url: string
  name: string
}

/** Max background image size in bytes (10MB). */
export const MAX_BACKGROUND_BYTES = 10 * 1024 * 1024
/** Max wallpapers stored per user. */
export const MAX_WALLPAPERS = 12
export const DEFAULT_PANEL_OPACITY = 0.5
export const DEFAULT_SEARCH_PANEL_OPACITY = 0.5
export const MIN_PANEL_OPACITY = 0
export const MAX_PANEL_OPACITY = 1
/** Default page wallpaper opacity (50% visible). */
export const DEFAULT_BACKGROUND_OPACITY = 0.5
export const MIN_BACKGROUND_OPACITY = 0
export const MAX_BACKGROUND_OPACITY = 1

export interface PageWidgetVisibility {
  showWeather: boolean
  showMarkets: boolean
  showNews: boolean
  showTodo: boolean
  showCurrency: boolean
  showMail: boolean
  showApps: boolean
  /** When the apps rail is hidden, whether the apps panel still shows on home. */
  peekApps: boolean
}

export const DEFAULT_PAGE_WIDGETS: PageWidgetVisibility = {
  showWeather: false,
  showMarkets: false,
  showNews: false,
  showTodo: false,
  showCurrency: false,
  showMail: false,
  showApps: false,
  peekApps: false,
}

export interface TodoItemDto {
  id: string
  text: string
  done: boolean
  position: number
}

/**
 * Sorts todos: incomplete first, then completed; newest (higher position) within each group.
 * @param items - Todo items.
 * @returns New sorted array.
 */
export function sortTodos(items: TodoItemDto[]): TodoItemDto[] {
  return [...items].sort((a, b) => {
    if (a.done !== b.done) {
      return a.done ? 1 : -1
    }
    if (a.position !== b.position) {
      return b.position - a.position
    }
    return 0
  })
}
export const SEARCH_HISTORY_LIMIT = 30
export const DEFAULT_APPEARANCE_THEME = 'light' as const
export const DEFAULT_ACCENT_HUE_SETTING = 'black' as const
export const DEFAULT_ACCENT_SHADE_SETTING = 500 as const
export const DEFAULT_CLOCK_ACCENT_HUE_SETTING = 'black' as const
export const DEFAULT_CLOCK_ACCENT_SHADE_SETTING = 500 as const
export const DEFAULT_WALLPAPER_ROTATE_ENABLED = false
export const DEFAULT_WALLPAPER_ROTATE_SECONDS = 30
export const MIN_WALLPAPER_ROTATE_SECONDS = 10
export const MAX_WALLPAPER_ROTATE_SECONDS = 3600
/** Slow crossfade for auto-rotate wallpaper switches (ms). */
export const WALLPAPER_ROTATE_CROSSFADE_MS = 3000
/** Fast crossfade for manual thumbnail / upload switches (ms). */
export const WALLPAPER_MANUAL_CROSSFADE_MS = 450

export interface WallpaperItem {
  id: string
  path: string
  /** Full-resolution signed URL (used for the page background). */
  url: string
  /** Small preview signed URL for the settings gallery. */
  thumbUrl: string
}

/**
 * Returns the Home / Settings IPC bridge.
 * @returns Preload homeSettings API.
 */
function homeSettings(): NonNullable<typeof window.workbench>['homeSettings'] {
  const api = window.workbench?.homeSettings
  if (!api) {
    throw new Error('Home settings are not available.')
  }
  return api
}

/**
 * Builds a custom-protocol URL for a local wallpaper storage path.
 * @param storagePath - `userId/file.ext`.
 * @returns `workbench-wallpaper://files/...` URL.
 */
function wallpaperMediaUrl(storagePath: string): string {
  const encoded = storagePath
    .split('/')
    .filter((part) => part.length > 0)
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `workbench-wallpaper://files/${encoded}`
}

// ---------------------------------------------------------------------------
// Categories & apps (local SQLite catalog + per-user layout)
// ---------------------------------------------------------------------------

export { normalizeSiteUrl }

/**
 * Returns the Home website library IPC bridge.
 * @returns Preload homeLibrary API.
 */
function homeLibrary(): NonNullable<typeof window.workbench>['homeLibrary'] {
  const api = window.workbench?.homeLibrary
  if (!api) {
    throw new Error('Home library is not available.')
  }
  return api
}

/**
 * Loads Home website categories from local SQLite.
 * @returns Ordered categories.
 */
export async function fetchCategories(): Promise<Category[]> {
  return homeLibrary().listCategories()
}

/**
 * Loads the current user's ordered apps for a category from local SQLite.
 * @param userId - Signed-in user id.
 * @param categoryId - Category identifier.
 * @returns Ordered apps.
 */
export async function fetchCategoryApps(userId: string, categoryId: string): Promise<AppItem[]> {
  return homeLibrary().listCategoryApps(userId, categoryId)
}

/**
 * Creates a new local site and appends it to the user's category list.
 * Rejects invalid URLs and URLs that already exist in the local catalog.
 * @param userId - Signed-in user id.
 * @param categoryId - Category identifier.
 * @param fields - New app fields.
 * @returns The category-facing app item.
 */
export async function createCategoryApp(
  userId: string,
  categoryId: string,
  fields: { url: string; name: string },
): Promise<AppItem> {
  const url = normalizeSiteUrl(fields.url)
  if (!url) {
    throw new Error('INVALID_URL')
  }
  const name = fields.name.trim()
  if (!name) {
    throw new Error('INVALID_NAME')
  }
  return homeLibrary().createApp(userId, categoryId, { url, name })
}

/**
 * Searches the local site catalog, excluding sites already in the user's category.
 * @param userId - Signed-in user id.
 * @param categoryId - Category identifier.
 * @param query - Search text.
 * @returns Up to 12 matching sites.
 */
export async function searchLibrarySites(
  userId: string,
  categoryId: string,
  query: string,
): Promise<SiteSearchHitDto[]> {
  return homeLibrary().searchSites(userId, categoryId, query)
}

/**
 * Links an existing local site into the user's category list.
 * @param userId - Signed-in user id.
 * @param categoryId - Category identifier.
 * @param siteId - Existing site UUID.
 * @returns The linked app item.
 */
export async function linkCategorySite(userId: string, categoryId: string, siteId: string): Promise<AppItem> {
  return homeLibrary().linkSite(userId, categoryId, siteId)
}

/**
 * Persists a category app order for the current user in local SQLite.
 * @param userId - Signed-in user id.
 * @param categoryId - Category identifier.
 * @param itemIds - Ordered site UUIDs.
 * @returns Nothing.
 */
export async function saveCategoryOrder(userId: string, categoryId: string, itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) {
    return
  }
  await homeLibrary().saveOrder(userId, categoryId, itemIds)
}

/**
 * Removes an app from the user's category list without deleting the local site.
 * @param userId - Signed-in user id.
 * @param categoryId - Category identifier.
 * @param siteId - Site UUID to unlink.
 * @returns Remaining ordered apps in the category.
 */
export async function removeCategoryApp(userId: string, categoryId: string, siteId: string): Promise<AppItem[]> {
  return homeLibrary().removeApp(userId, categoryId, siteId)
}

// ---------------------------------------------------------------------------
// Search history
// ---------------------------------------------------------------------------

/**
 * Loads recent search history for the current user.
 * Deduplicates by query (case-insensitive); engine is not part of uniqueness.
 * @param userId - Signed-in user id.
 * @returns History items, newest first.
 */
export async function fetchSearchHistory(userId: string): Promise<SearchHistoryItem[]> {
  const rows = await homeSettings().listSearchHistory(userId)
  return rows.map((row) => ({
    id: row.id,
    query: row.query,
    engine: isSearchEngine(row.engine) ? row.engine : 'Google',
    createdAt: row.createdAt,
  }))
}

/**
 * Records a completed search by query only (engine is stored but not unique).
 * Re-searching the same text refreshes one history row and uses the current engine column.
 * @param userId - Signed-in user id.
 * @param query - Search text.
 * @param engine - Search engine selected at submit time (metadata only).
 * @returns Updated history.
 */
export async function recordSearchHistory(
  userId: string,
  query: string,
  engine: SearchEngine,
): Promise<SearchHistoryItem[]> {
  const normalized = query.trim()
  if (!normalized) {
    return fetchSearchHistory(userId)
  }
  const nextEngine = isSearchEngine(engine) ? engine : 'Google'
  const rows = await homeSettings().recordSearchHistory(userId, normalized, nextEngine)
  return rows.map((row) => ({
    id: row.id,
    query: row.query,
    engine: isSearchEngine(row.engine) ? row.engine : nextEngine,
    createdAt: row.createdAt,
  }))
}

/**
 * Deletes one search history entry.
 * @param userId - Signed-in user id.
 * @param id - History row id.
 * @returns Updated history.
 */
export async function deleteSearchHistory(userId: string, id: string): Promise<SearchHistoryItem[]> {
  const rows = await homeSettings().deleteSearchHistory(userId, id)
  return rows.map((row) => ({
    id: row.id,
    query: row.query,
    engine: isSearchEngine(row.engine) ? row.engine : 'Google',
    createdAt: row.createdAt,
  }))
}

// ---------------------------------------------------------------------------
// Settings: search engine & panel opacity
// ---------------------------------------------------------------------------

/**
 * Loads the user's preferred search engine.
 * @param userId - Signed-in user id.
 * @returns Engine id.
 */
export async function fetchSearchEngine(userId: string): Promise<SearchEngine> {
  const settings = await homeSettings().getSettings(userId)
  return isSearchEngine(settings.searchEngine) ? settings.searchEngine : 'Google'
}

/**
 * Saves the user's preferred search engine.
 * @param userId - Signed-in user id.
 * @param engine - Engine id.
 * @returns Stored engine id.
 */
export async function saveSearchEngine(userId: string, engine: SearchEngine): Promise<SearchEngine> {
  const next = isSearchEngine(engine) ? engine : 'Google'
  await homeSettings().patchSettings(userId, { searchEngine: next })
  return next
}

/**
 * Clamps panel opacity into the supported range.
 * @param value - Raw opacity.
 * @returns Clamped opacity.
 */
function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_PANEL_OPACITY
  }
  return Math.min(MAX_PANEL_OPACITY, Math.max(MIN_PANEL_OPACITY, value))
}

/**
 * Clamps page wallpaper opacity into the supported range.
 * @param value - Raw opacity.
 * @returns Clamped opacity.
 */
function clampBackgroundOpacity(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BACKGROUND_OPACITY
  }
  return Math.min(MAX_BACKGROUND_OPACITY, Math.max(MIN_BACKGROUND_OPACITY, value))
}

/**
 * Loads the user's persisted glass panel opacity.
 * @param userId - Signed-in user id.
 * @returns Opacity from 0 to 1.
 */
export async function fetchPanelOpacity(userId: string): Promise<number> {
  const settings = await homeSettings().getSettings(userId)
  return clampOpacity(settings.panelOpacity)
}

/**
 * Saves the user's glass panel opacity.
 * @param userId - Signed-in user id.
 * @param opacity - Opacity from 0 to 1.
 * @returns Stored opacity.
 */
export async function savePanelOpacity(userId: string, opacity: number): Promise<number> {
  const clamped = clampOpacity(opacity)
  await homeSettings().patchSettings(userId, { panelOpacity: clamped })
  return clamped
}

/**
 * Loads the user's persisted search-suggestions panel opacity.
 * @param userId - Signed-in user id.
 * @returns Opacity from 0 to 1.
 */
export async function fetchSearchPanelOpacity(userId: string): Promise<number> {
  const settings = await homeSettings().getSettings(userId)
  return clampOpacity(settings.searchPanelOpacity)
}

/**
 * Saves the user's search-suggestions panel opacity.
 * @param userId - Signed-in user id.
 * @param opacity - Opacity from 0 to 1.
 * @returns Stored opacity.
 */
export async function saveSearchPanelOpacity(userId: string, opacity: number): Promise<number> {
  const clamped = clampOpacity(opacity)
  await homeSettings().patchSettings(userId, { searchPanelOpacity: clamped })
  return clamped
}

/**
 * Loads the user's persisted page wallpaper opacity.
 * @param userId - Signed-in user id.
 * @returns Opacity from 0 to 1.
 */
export async function fetchBackgroundOpacity(userId: string): Promise<number> {
  const settings = await homeSettings().getSettings(userId)
  return clampBackgroundOpacity(settings.backgroundOpacity)
}

/**
 * Saves the user's page wallpaper opacity.
 * @param userId - Signed-in user id.
 * @param opacity - Opacity from 0 to 1.
 * @returns Stored opacity.
 */
export async function saveBackgroundOpacity(userId: string, opacity: number): Promise<number> {
  const clamped = clampBackgroundOpacity(opacity)
  await homeSettings().patchSettings(userId, { backgroundOpacity: clamped })
  return clamped
}

/**
 * Loads which home widgets are visible for the user, plus aside order.
 * @param userId - Signed-in user id.
 * @returns Widget visibility flags and aside order.
 */
export async function fetchPageWidgets(userId: string): Promise<{
  visibility: PageWidgetVisibility
  asideRails: AsideWidgetRails
}> {
  const settings = await homeSettings().getSettings(userId)
  const storedShowApps = settings.showApps ?? DEFAULT_PAGE_WIDGETS.showApps
  const storedPeekApps = settings.peekApps ?? DEFAULT_PAGE_WIDGETS.peekApps
  // Category rail is gone; promote legacy peek-only into the single apps flag.
  const showApps = storedShowApps || storedPeekApps
  return {
    visibility: {
      showWeather: settings.showWeather ?? DEFAULT_PAGE_WIDGETS.showWeather,
      showMarkets: settings.showMarkets ?? DEFAULT_PAGE_WIDGETS.showMarkets,
      showNews: settings.showNews ?? DEFAULT_PAGE_WIDGETS.showNews,
      showTodo: settings.showTodo ?? DEFAULT_PAGE_WIDGETS.showTodo,
      showCurrency: settings.showCurrency ?? DEFAULT_PAGE_WIDGETS.showCurrency,
      showMail: settings.showMail ?? DEFAULT_PAGE_WIDGETS.showMail,
      showApps,
      peekApps: false,
    },
    asideRails: normalizeAsideWidgetRails(
      settings.asideWidgetOrderLeft,
      settings.asideWidgetOrderRight,
      settings.asideWidgetOrder,
    ),
  }
}

/**
 * Saves home widget visibility for the user.
 * @param userId - Signed-in user id.
 * @param widgets - Visibility flags.
 * @returns Stored visibility flags.
 */
export async function savePageWidgets(
  userId: string,
  widgets: PageWidgetVisibility,
): Promise<PageWidgetVisibility> {
  const next: PageWidgetVisibility = {
    showWeather: Boolean(widgets.showWeather),
    showMarkets: Boolean(widgets.showMarkets),
    showNews: Boolean(widgets.showNews),
    showTodo: Boolean(widgets.showTodo),
    showCurrency: Boolean(widgets.showCurrency),
    showMail: Boolean(widgets.showMail),
    showApps: Boolean(widgets.showApps) || Boolean(widgets.peekApps),
    peekApps: false,
  }
  await homeSettings().patchSettings(userId, {
    showWeather: next.showWeather,
    showMarkets: next.showMarkets,
    showNews: next.showNews,
    showTodo: next.showTodo,
    showCurrency: next.showCurrency,
    showMail: next.showMail,
    showApps: next.showApps,
    peekApps: false,
  })
  return next
}

/**
 * Loads the Open links preference from Home SQLite.
 * Migrates a leftover localStorage value once when the row has no mode yet.
 * @param userId - Signed-in user id.
 * @returns Stored mode (defaults to in-app).
 */
export async function fetchOpenLinksMode(userId: string): Promise<LinkOpenMode> {
  const settings = await homeSettings().getSettings(userId)
  if (isLinkOpenMode(settings.openLinksMode)) {
    saveLinkOpenMode(settings.openLinksMode)
    return settings.openLinksMode
  }
  const legacy = loadLinkOpenMode()
  await homeSettings().patchSettings(userId, { openLinksMode: legacy })
  return legacy
}

/**
 * Saves the Open links preference to Home SQLite and the localStorage cache.
 * @param userId - Signed-in user id.
 * @param mode - Target mode.
 * @returns Stored mode.
 */
export async function saveOpenLinksMode(userId: string, mode: LinkOpenMode): Promise<LinkOpenMode> {
  const next = isLinkOpenMode(mode) ? mode : 'inApp'
  saveLinkOpenMode(next)
  await homeSettings().patchSettings(userId, { openLinksMode: next })
  return next
}

/**
 * Saves the left/right aside widget display order for the user.
 * @param userId - Signed-in user id.
 * @param rails - Left and right top-to-bottom widget ids.
 * @returns Normalized stored rails.
 */
export async function saveAsideWidgetOrder(
  userId: string,
  rails: AsideWidgetRails,
): Promise<AsideWidgetRails> {
  const next = normalizeAsideWidgetRails(rails.left, rails.right)
  await homeSettings().patchSettings(userId, {
    asideWidgetOrderLeft: next.left,
    asideWidgetOrderRight: next.right,
    asideWidgetOrder: next.right,
  })
  return next
}

/**
 * Loads the signed-in user's todo list (incomplete first, newest within each group).
 * @param userId - Signed-in user id.
 * @returns Todo items.
 */
export async function fetchTodos(userId: string): Promise<TodoItemDto[]> {
  const rows = await homeSettings().listTodos(userId)
  return sortTodos(rows)
}

/**
 * Creates a todo at the top of the list (highest position).
 * @param userId - Signed-in user id.
 * @param text - Todo text.
 * @returns Created todo.
 */
export async function createTodo(userId: string, text: string): Promise<TodoItemDto> {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('Todo text is required')
  }
  return homeSettings().createTodo(userId, trimmed)
}

/**
 * Updates whether a todo is completed.
 * @param userId - Signed-in user id.
 * @param id - Todo id.
 * @param done - Completed flag.
 * @returns Nothing.
 */
export async function setTodoDone(userId: string, id: string, done: boolean): Promise<void> {
  await homeSettings().setTodoDone(userId, id, done)
}

/**
 * Deletes a todo owned by the user.
 * @param userId - Signed-in user id.
 * @param id - Todo id.
 * @returns Nothing.
 */
export async function deleteTodo(userId: string, id: string): Promise<void> {
  await homeSettings().deleteTodo(userId, id)
}

export interface AppearanceSettings {
  theme: AppearanceTheme
  accentHue: AccentHue
  accentShade: AccentShade
  clockAccentHue: AccentHue
  clockAccentShade: AccentShade
  iconRadius: number
  searchRadius: number
}

/**
 * Parses a stored appearance theme string.
 * @param value - Raw theme value.
 * @returns Valid theme or default.
 */
function parseAppearanceTheme(value: string | null | undefined): AppearanceTheme {
  if (value === 'light' || value === 'dark') {
    return value
  }
  return DEFAULT_APPEARANCE_THEME
}

/**
 * Parses a stored accent hue string.
 * @param value - Raw hue value.
 * @returns Valid hue or default.
 */
function parseAccentHue(value: string | null | undefined): AccentHue {
  if (value && (ACCENT_HUES as string[]).includes(value)) {
    return value as AccentHue
  }
  return DEFAULT_ACCENT_HUE
}

/**
 * Parses a stored accent shade number.
 * @param value - Raw shade value.
 * @returns Valid shade or default.
 */
function parseAccentShade(value: number | null | undefined): AccentShade {
  if (typeof value === 'number' && (ACCENT_SHADES as number[]).includes(value)) {
    return value as AccentShade
  }
  return DEFAULT_ACCENT_SHADE
}

/**
 * Parses a stored icon radius number.
 * @param value - Raw radius value.
 * @returns Valid radius percent or default.
 */
function parseIconRadius(value: number | null | undefined): number {
  if (typeof value === 'number') {
    return clampIconRadius(value)
  }
  return DEFAULT_ICON_RADIUS
}

/**
 * Parses a stored search-bar radius number.
 * @param value - Raw radius value.
 * @returns Valid radius percent or default.
 */
function parseSearchRadius(value: number | null | undefined): number {
  if (typeof value === 'number') {
    return clampSearchRadius(value)
  }
  return DEFAULT_SEARCH_RADIUS
}

/**
 * Normalizes appearance settings (maps black/white to the active theme).
 * @param settings - Raw appearance settings.
 * @returns Normalized settings.
 */
function normalizeAppearanceSettings(settings: AppearanceSettings): AppearanceSettings {
  const theme = settings.theme
  return {
    theme,
    accentHue: resolveAccentHueForTheme(settings.accentHue, theme),
    accentShade: settings.accentShade,
    clockAccentHue: resolveAccentHueForTheme(settings.clockAccentHue, theme),
    clockAccentShade: settings.clockAccentShade,
    iconRadius: clampIconRadius(settings.iconRadius),
    searchRadius: clampSearchRadius(settings.searchRadius),
  }
}

/**
 * Loads the user's appearance theme and accent palette.
 * @param userId - Signed-in user id.
 * @returns Appearance settings.
 */
export async function fetchAppearanceSettings(userId: string): Promise<AppearanceSettings> {
  const settings = await homeSettings().getSettings(userId)
  return normalizeAppearanceSettings({
    theme: parseAppearanceTheme(settings.appearanceTheme),
    accentHue: parseAccentHue(settings.accentHue),
    accentShade: parseAccentShade(settings.accentShade),
    clockAccentHue: parseAccentHue(settings.clockAccentHue ?? DEFAULT_CLOCK_ACCENT_HUE),
    clockAccentShade: parseAccentShade(settings.clockAccentShade ?? DEFAULT_CLOCK_ACCENT_SHADE),
    iconRadius: parseIconRadius(settings.iconRadius),
    searchRadius: parseSearchRadius(settings.searchRadius),
  })
}

/**
 * Saves the user's appearance theme and accent palette.
 * @param userId - Signed-in user id.
 * @param settings - Appearance settings to store.
 * @returns Stored settings.
 */
export async function saveAppearanceSettings(
  userId: string,
  settings: AppearanceSettings,
): Promise<AppearanceSettings> {
  const normalized = normalizeAppearanceSettings(settings)
  await homeSettings().patchSettings(userId, {
    appearanceTheme: normalized.theme,
    accentHue: normalized.accentHue,
    accentShade: normalized.accentShade,
    clockAccentHue: normalized.clockAccentHue,
    clockAccentShade: normalized.clockAccentShade,
    iconRadius: normalized.iconRadius,
    searchRadius: normalized.searchRadius,
  })
  return normalized
}

/**
 * Returns whether settings still match the database column defaults.
 * @param settings - Appearance settings.
 * @returns True when theme/accents/radius are all defaults.
 */
export function isDefaultAppearanceSettings(settings: AppearanceSettings): boolean {
  return (
    settings.theme === DEFAULT_APPEARANCE_THEME &&
    settings.accentHue === DEFAULT_ACCENT_HUE_SETTING &&
    settings.accentShade === DEFAULT_ACCENT_SHADE_SETTING &&
    settings.clockAccentHue ===
      resolveAccentHueForTheme(DEFAULT_CLOCK_ACCENT_HUE_SETTING, settings.theme) &&
    settings.clockAccentShade === DEFAULT_CLOCK_ACCENT_SHADE_SETTING &&
    settings.iconRadius === DEFAULT_ICON_RADIUS &&
    settings.searchRadius === DEFAULT_SEARCH_RADIUS
  )
}

// ---------------------------------------------------------------------------
// Background wallpaper gallery (local files + SQLite)
// ---------------------------------------------------------------------------

/**
 * Normalizes an image MIME type for local wallpaper storage.
 * @param mimeType - Raw MIME type from the file or blob.
 * @returns Canonical `image/jpeg`, `image/png`, or `image/webp`.
 */
function normalizeWallpaperMimeType(mimeType: string): string {
  const mime = mimeType.toLowerCase().split(';', 1)[0]?.trim() ?? ''
  if (mime === 'image/png') return 'image/png'
  if (mime === 'image/webp') return 'image/webp'
  if (mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/pjpeg') {
    return 'image/jpeg'
  }
  return 'image/jpeg'
}

/**
 * Lists the signed-in user's wallpaper library (newest first).
 * Gallery entries use compact thumbnails; `url` stays full-resolution for applying backgrounds.
 * @param userId - Signed-in user id.
 * @returns Wallpaper items with local custom-protocol URLs.
 */
export async function listWallpapers(userId: string): Promise<WallpaperItem[]> {
  return homeSettings().listWallpapers(userId)
}

/**
 * Loads the active wallpaper path from user settings.
 * @param userId - Signed-in user id.
 * @returns Storage path or null.
 */
export async function fetchActiveWallpaperPath(userId: string): Promise<string | null> {
  const settings = await homeSettings().getSettings(userId)
  return settings.backgroundPath
}

/**
 * Loads the user's active background image as a local custom-protocol URL.
 * @param userId - Signed-in user id.
 * @returns Wallpaper URL or null.
 */
export async function fetchActiveWallpaperUrl(userId: string): Promise<string | null> {
  const path = await fetchActiveWallpaperPath(userId)
  if (!path) {
    return null
  }
  return wallpaperMediaUrl(path)
}

/**
 * Sets or clears the active wallpaper without deleting library items.
 * Callers should reuse gallery URLs when switching.
 * @param userId - Signed-in user id.
 * @param path - Storage path to activate, or null to show no wallpaper.
 * @returns Nothing.
 */
export async function selectWallpaper(userId: string, path: string | null): Promise<void> {
  await homeSettings().patchSettings(userId, { backgroundPath: path })
}

/**
 * Writes a new wallpaper into the local library and makes it active.
 * @param userId - Signed-in user id.
 * @param image - Image blob or file.
 * @param mimeType - Declared image MIME type (jpeg / png / webp).
 * @returns Local URL for the new active wallpaper.
 */
export async function addWallpaper(
  userId: string,
  image: Blob,
  mimeType: string,
): Promise<string> {
  const contentType = normalizeWallpaperMimeType(mimeType || image.type)
  const bytes = await image.arrayBuffer()
  let thumbBytes: ArrayBuffer | null = null
  try {
    const thumbBlob = await createWallpaperThumbnail(image)
    thumbBytes = await thumbBlob.arrayBuffer()
  } catch (reason: unknown) {
    const message = reason instanceof Error ? reason.message : 'unknown error'
    console.warn('Wallpaper thumbnail create failed:', message)
  }
  const item = await homeSettings().addWallpaper(userId, bytes, contentType, thumbBytes)
  return item.url
}

/**
 * Removes one wallpaper from the local library.
 * If it was active, falls back to the newest remaining wallpaper or clears.
 * @param userId - Signed-in user id.
 * @param wallpaperId - Wallpaper row id.
 * @returns Local URL for the new active wallpaper, or null when none remain / none selected.
 */
export async function removeWallpaper(
  userId: string,
  wallpaperId: string,
): Promise<string | null> {
  return homeSettings().removeWallpaper(userId, wallpaperId)
}

/**
 * Clears the active wallpaper selection without deleting library items.
 * @param userId - Signed-in user id.
 * @returns Null.
 */
export async function clearActiveWallpaper(userId: string): Promise<null> {
  await selectWallpaper(userId, null)
  return null
}

export interface WallpaperRotateSettings {
  enabled: boolean
  seconds: number
}

/**
 * Clamps wallpaper rotate interval into the supported range.
 * @param value - Raw seconds.
 * @returns Clamped seconds (>= 10).
 */
export function clampWallpaperRotateSeconds(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_WALLPAPER_ROTATE_SECONDS
  }
  return Math.min(
    MAX_WALLPAPER_ROTATE_SECONDS,
    Math.max(MIN_WALLPAPER_ROTATE_SECONDS, Math.round(value)),
  )
}

/**
 * Loads wallpaper auto-rotate preferences.
 * @param userId - Signed-in user id.
 * @returns Rotate enabled flag and interval seconds.
 */
export async function fetchWallpaperRotateSettings(
  userId: string,
): Promise<WallpaperRotateSettings> {
  const settings = await homeSettings().getSettings(userId)
  return {
    enabled: Boolean(settings.wallpaperRotateEnabled),
    seconds: clampWallpaperRotateSeconds(settings.wallpaperRotateSeconds),
  }
}

/**
 * Saves wallpaper auto-rotate preferences.
 * @param userId - Signed-in user id.
 * @param settings - Enabled flag and interval seconds.
 * @returns Stored settings.
 */
export async function saveWallpaperRotateSettings(
  userId: string,
  settings: WallpaperRotateSettings,
): Promise<WallpaperRotateSettings> {
  const next: WallpaperRotateSettings = {
    enabled: settings.enabled,
    seconds: clampWallpaperRotateSeconds(settings.seconds),
  }
  await homeSettings().patchSettings(userId, {
    wallpaperRotateEnabled: next.enabled,
    wallpaperRotateSeconds: next.seconds,
  })
  return next
}

// ---------------------------------------------------------------------------
// Currency converter pair
// ---------------------------------------------------------------------------

export interface CurrencyPairSettings {
  from: string
  to: string
}

const DEFAULT_CURRENCY_FROM = 'USD'
const DEFAULT_CURRENCY_TO = 'TWD'

/**
 * Loads the user's currency converter From / To pair.
 * @param userId - Signed-in user id.
 * @returns Currency pair codes.
 */
export async function fetchCurrencyPairSettings(
  userId: string,
): Promise<CurrencyPairSettings> {
  const settings = await homeSettings().getSettings(userId)
  return {
    from: settings.currencyFrom.trim() || DEFAULT_CURRENCY_FROM,
    to: settings.currencyTo.trim() || DEFAULT_CURRENCY_TO,
  }
}

/**
 * Saves the currency converter From / To pair.
 * @param userId - Signed-in user id.
 * @param settings - Pair codes.
 * @returns Stored pair.
 */
export async function saveCurrencyPairSettings(
  userId: string,
  settings: CurrencyPairSettings,
): Promise<CurrencyPairSettings> {
  const next: CurrencyPairSettings = {
    from: settings.from.trim().toUpperCase() || DEFAULT_CURRENCY_FROM,
    to: settings.to.trim().toUpperCase() || DEFAULT_CURRENCY_TO,
  }
  await homeSettings().patchSettings(userId, {
    currencyFrom: next.from,
    currencyTo: next.to,
  })
  return next
}

// ---------------------------------------------------------------------------
// Market asset selection (quotes themselves still come from the Express proxy)
// ---------------------------------------------------------------------------

/**
 * Loads the user's persisted market asset selection.
 * @param userId - Signed-in user id.
 * @returns Selected assets in display order.
 */
export async function fetchMarketAssetSelection(userId: string): Promise<MarketAssetDto[]> {
  return homeSettings().listMarketAssets(userId)
}

/**
 * Replaces the user's persisted market asset selection.
 * @param userId - Signed-in user id.
 * @param assets - Selected assets (max 2).
 * @returns Stored assets in display order.
 */
export async function saveMarketAssetSelection(
  userId: string,
  assets: MarketAssetDto[],
): Promise<MarketAssetDto[]> {
  const limited = assets.slice(0, 2)
  return homeSettings().saveMarketAssets(userId, limited)
}

// ---------------------------------------------------------------------------
// Weather location (device geo or manual city)
// ---------------------------------------------------------------------------

export type WeatherLocationSource = 'geo' | 'manual'

export interface WeatherLocationSettings {
  latitude: number | null
  longitude: number | null
  place: string | null
  source: WeatherLocationSource | null
}

/**
 * Parses a stored weather source string.
 * @param value - Raw DB value.
 * @returns Source or null.
 */
function parseWeatherSource(value: string | null | undefined): WeatherLocationSource | null {
  if (value === 'geo' || value === 'manual') {
    return value
  }
  return null
}

/**
 * Loads the user's weather location preference.
 * @param userId - Signed-in user id.
 * @returns Location settings (null fields when cleared).
 */
export async function fetchWeatherLocationSettings(
  userId: string,
): Promise<WeatherLocationSettings> {
  const settings = await homeSettings().getSettings(userId)
  const latitude =
    typeof settings.weatherLatitude === 'number' && Number.isFinite(settings.weatherLatitude)
      ? settings.weatherLatitude
      : null
  const longitude =
    typeof settings.weatherLongitude === 'number' && Number.isFinite(settings.weatherLongitude)
      ? settings.weatherLongitude
      : null
  const place = settings.weatherPlace?.trim() || null
  const source = parseWeatherSource(settings.weatherSource)
  if (latitude === null || longitude === null) {
    return { latitude: null, longitude: null, place: null, source: null }
  }
  return { latitude, longitude, place, source }
}

/**
 * Saves or clears the weather location preference.
 * @param userId - Signed-in user id.
 * @param settings - Location to store; null coords clears.
 * @returns Stored settings.
 */
export async function saveWeatherLocationSettings(
  userId: string,
  settings: WeatherLocationSettings,
): Promise<WeatherLocationSettings> {
  const hasCoords =
    typeof settings.latitude === 'number' &&
    Number.isFinite(settings.latitude) &&
    typeof settings.longitude === 'number' &&
    Number.isFinite(settings.longitude)
  const next: WeatherLocationSettings = hasCoords
    ? {
        latitude: settings.latitude,
        longitude: settings.longitude,
        place: settings.place?.trim() || null,
        source: settings.source === 'geo' || settings.source === 'manual' ? settings.source : 'manual',
      }
    : { latitude: null, longitude: null, place: null, source: null }

  await homeSettings().patchSettings(userId, {
    weatherLatitude: next.latitude,
    weatherLongitude: next.longitude,
    weatherPlace: next.place,
    weatherSource: next.source,
  })
  return next
}
