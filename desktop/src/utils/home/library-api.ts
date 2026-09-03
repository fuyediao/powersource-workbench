import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase as supabaseClient } from '@/lib/supabase'
import type { Database } from '@/types/database'

/**
 * Returns the configured Supabase client or throws.
 * @returns Typed Supabase client.
 */
function supabase(): SupabaseClient<Database> {
  if (!supabaseClient) {
    throw new Error('Supabase is not configured.')
  }
  return supabaseClient
}
import type { AppItem, Category } from '@/types/library'
import { isSearchEngine, type SearchEngine } from '@/types/search'
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
import { createWallpaperThumbnail, wallpaperThumbPath } from '@/utils/appearance/wallpaper-thumb'

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
  showSchedule: boolean
  showMail: boolean
  showFocus: boolean
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
  showSchedule: false,
  showMail: false,
  showFocus: false,
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

const WALLPAPER_BUCKET = 'wallpapers'
const WALLPAPER_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7

export interface WallpaperItem {
  id: string
  path: string
  /** Full-resolution signed URL (used for the page background). */
  url: string
  /** Small preview signed URL for the settings gallery. */
  thumbUrl: string
}

/**
 * Throws a readable error from a Supabase/Postgrest error, or does nothing.
 * @param message - Postgrest error message, or null/undefined when there was no error.
 * @returns Nothing.
 */
function throwIfError(message: string | null | undefined): void {
  if (message) {
    throw new Error(message)
  }
}

// ---------------------------------------------------------------------------
// Categories & apps (shared catalog + per-user layout)
// ---------------------------------------------------------------------------

/**
 * Loads shared navigation categories.
 * @returns Ordered categories.
 */
export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase().from('categories').select('id, position').order('position')
  throwIfError(error?.message)
  return (data ?? []).map((row) => ({ id: row.id, position: row.position }))
}

/**
 * Loads site url/name for a set of site ids.
 * @param siteIds - Site UUIDs to look up.
 * @returns Map from site id to its url/name.
 */
async function fetchSitesByIds(siteIds: string[]): Promise<Map<string, { url: string; name: string }>> {
  if (siteIds.length === 0) {
    return new Map()
  }
  const { data, error } = await supabase().from('sites').select('id, url, name').in('id', siteIds)
  throwIfError(error?.message)
  return new Map((data ?? []).map((row) => [row.id, { url: row.url, name: row.name }]))
}

/**
 * Loads the current user's ordered apps for a category.
 * @param userId - Signed-in user id.
 * @param categoryId - Category identifier.
 * @returns Ordered apps.
 */
export async function fetchCategoryApps(userId: string, categoryId: string): Promise<AppItem[]> {
  const { data, error } = await supabase()
    .from('user_category_sites')
    .select('site_id, position')
    .eq('user_id', userId)
    .eq('category_id', categoryId)
    .order('position')
  throwIfError(error?.message)

  const links = data ?? []
  const sites = await fetchSitesByIds(links.map((link) => link.site_id))
  return links.flatMap((link) => {
    const site = sites.get(link.site_id)
    if (!site) {
      return []
    }
    return [{ id: link.site_id, categoryId, position: link.position, url: site.url, name: site.name }]
  })
}

/**
 * Normalizes a user-entered site URL: prepends `https://` when missing and
 * validates with the URL constructor.
 * @param value - Raw URL text.
 * @returns Absolute http(s) URL, or null when invalid.
 */
export function normalizeSiteUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const parsed = new URL(withProtocol)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    if (!parsed.hostname.includes('.')) {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

/**
 * Looks up a shared site by its canonical URL.
 * @param url - Absolute site URL.
 * @returns Existing site row, or null.
 */
async function findSiteByUrl(url: string): Promise<{ id: string; url: string; name: string } | null> {
  const { data, error } = await supabase().from('sites').select('id, url, name').eq('url', url).maybeSingle()
  throwIfError(error?.message)
  return data
}

/**
 * Computes the next append position for a user's category list.
 * @param userId - Signed-in user id.
 * @param categoryId - Category identifier.
 * @returns Next zero-based position.
 */
async function nextCategoryPosition(userId: string, categoryId: string): Promise<number> {
  const { data, error } = await supabase()
    .from('user_category_sites')
    .select('position')
    .eq('user_id', userId)
    .eq('category_id', categoryId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  throwIfError(error?.message)
  return (data?.position ?? -1) + 1
}

/**
 * Checks whether a site is already linked into a user's category list.
 * @param userId - Signed-in user id.
 * @param categoryId - Category identifier.
 * @param siteId - Site UUID.
 * @returns Whether the link already exists.
 */
async function isAlreadyLinked(userId: string, categoryId: string, siteId: string): Promise<boolean> {
  const { data, error } = await supabase()
    .from('user_category_sites')
    .select('site_id')
    .eq('user_id', userId)
    .eq('category_id', categoryId)
    .eq('site_id', siteId)
    .maybeSingle()
  throwIfError(error?.message)
  return Boolean(data)
}

/**
 * Creates a new shared site and appends it to the user's category list.
 * Rejects invalid URLs and URLs that already exist in the shared catalog.
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

  const existing = await findSiteByUrl(url)
  if (existing) {
    throw new Error('URL_EXISTS')
  }

  const { data: created, error: createError } = await supabase()
    .from('sites')
    .insert({ url, name })
    .select('id, url, name')
    .single()
  throwIfError(createError?.message)
  if (!created) {
    throw new Error('Failed to create site.')
  }

  const position = await nextCategoryPosition(userId, categoryId)
  const { error } = await supabase()
    .from('user_category_sites')
    .insert({ user_id: userId, category_id: categoryId, site_id: created.id, position })
  throwIfError(error?.message)

  return { id: created.id, categoryId, position, url: created.url, name: created.name }
}

/**
 * Searches the shared site catalog, excluding sites already in the user's category.
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
  const like = `%${query}%`
  const [
    { data: byUrl, error: byUrlError },
    { data: byName, error: byNameError },
    { data: linked, error: linkedError },
  ] = await Promise.all([
    supabase().from('sites').select('id, url, name').ilike('url', like).order('name').limit(30),
    supabase().from('sites').select('id, url, name').ilike('name', like).order('name').limit(30),
    supabase().from('user_category_sites').select('site_id').eq('user_id', userId).eq('category_id', categoryId),
  ])
  throwIfError(byUrlError?.message)
  throwIfError(byNameError?.message)
  throwIfError(linkedError?.message)

  const linkedIds = new Set((linked ?? []).map((row) => row.site_id))
  const merged = new Map<string, SiteSearchHitDto>()
  for (const hit of [...(byUrl ?? []), ...(byName ?? [])]) {
    if (!linkedIds.has(hit.id)) {
      merged.set(hit.id, hit)
    }
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 12)
}

/**
 * Links an existing shared site into the user's category list.
 * @param userId - Signed-in user id.
 * @param categoryId - Category identifier.
 * @param siteId - Existing site UUID.
 * @returns The linked app item.
 */
export async function linkCategorySite(userId: string, categoryId: string, siteId: string): Promise<AppItem> {
  const { data: site, error: siteError } = await supabase()
    .from('sites')
    .select('id, url, name')
    .eq('id', siteId)
    .maybeSingle()
  throwIfError(siteError?.message)
  if (!site) {
    throw new Error(`Unknown site: ${siteId}`)
  }
  if (await isAlreadyLinked(userId, categoryId, siteId)) {
    throw new Error('Site is already in this category.')
  }

  const position = await nextCategoryPosition(userId, categoryId)
  const { error } = await supabase()
    .from('user_category_sites')
    .insert({ user_id: userId, category_id: categoryId, site_id: siteId, position })
  throwIfError(error?.message)

  return { id: siteId, categoryId, position, url: site.url, name: site.name }
}

/**
 * Persists a category app order for the current user.
 * @param userId - Signed-in user id.
 * @param categoryId - Category identifier.
 * @param itemIds - Ordered site UUIDs.
 * @returns Nothing.
 */
export async function saveCategoryOrder(userId: string, categoryId: string, itemIds: string[]): Promise<void> {
  const rows = itemIds.map((siteId, position) => ({
    user_id: userId,
    category_id: categoryId,
    site_id: siteId,
    position,
  }))
  if (rows.length === 0) {
    return
  }
  const { error } = await supabase()
    .from('user_category_sites')
    .upsert(rows, { onConflict: 'user_id,category_id,site_id' })
  throwIfError(error?.message)
}

/**
 * Removes an app from the user's category list without deleting the shared site.
 * @param userId - Signed-in user id.
 * @param categoryId - Category identifier.
 * @param siteId - Site UUID to unlink.
 * @returns Remaining ordered apps in the category.
 */
export async function removeCategoryApp(userId: string, categoryId: string, siteId: string): Promise<AppItem[]> {
  const { error: deleteError } = await supabase()
    .from('user_category_sites')
    .delete()
    .eq('user_id', userId)
    .eq('category_id', categoryId)
    .eq('site_id', siteId)
  throwIfError(deleteError?.message)

  const { data: remaining, error: listError } = await supabase()
    .from('user_category_sites')
    .select('site_id')
    .eq('user_id', userId)
    .eq('category_id', categoryId)
    .order('position')
  throwIfError(listError?.message)

  const rows = (remaining ?? []).map((row, position) => ({
    user_id: userId,
    category_id: categoryId,
    site_id: row.site_id,
    position,
  }))
  if (rows.length > 0) {
    const { error: renumberError } = await supabase()
      .from('user_category_sites')
      .upsert(rows, { onConflict: 'user_id,category_id,site_id' })
    throwIfError(renumberError?.message)
  }

  return fetchCategoryApps(userId, categoryId)
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
  const { data, error } = await supabase()
    .from('search_history')
    .select('id, query, engine, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(SEARCH_HISTORY_LIMIT * 3)
  throwIfError(error?.message)

  const seen = new Set<string>()
  const deduped: SearchHistoryItem[] = []
  for (const row of data ?? []) {
    const key = row.query.trim().toLowerCase()
    if (!key || seen.has(key)) {
      continue
    }
    seen.add(key)
    deduped.push({
      id: row.id,
      query: row.query,
      engine: row.engine as SearchEngine,
      createdAt: row.created_at,
    })
    if (deduped.length >= SEARCH_HISTORY_LIMIT) {
      break
    }
  }
  return deduped
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

  // Remove every prior row for this query so history is not split per engine.
  const { error: deleteError } = await supabase()
    .from('search_history')
    .delete()
    .eq('user_id', userId)
    .eq('query', normalized)
  throwIfError(deleteError?.message)

  const { error: insertError } = await supabase()
    .from('search_history')
    .insert({ user_id: userId, query: normalized, engine })
  throwIfError(insertError?.message)

  const { data: overflow, error: overflowError } = await supabase()
    .from('search_history')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(SEARCH_HISTORY_LIMIT, SEARCH_HISTORY_LIMIT + 50)
  throwIfError(overflowError?.message)
  if (overflow && overflow.length > 0) {
    const { error: trimError } = await supabase()
      .from('search_history')
      .delete()
      .in('id', overflow.map((row) => row.id))
    throwIfError(trimError?.message)
  }

  return fetchSearchHistory(userId)
}

/**
 * Deletes one search history entry.
 * @param userId - Signed-in user id.
 * @param id - History row id.
 * @returns Updated history.
 */
export async function deleteSearchHistory(userId: string, id: string): Promise<SearchHistoryItem[]> {
  const { error } = await supabase().from('search_history').delete().eq('user_id', userId).eq('id', id)
  throwIfError(error?.message)
  return fetchSearchHistory(userId)
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
  const { data, error } = await supabase()
    .from('user_settings')
    .select('search_engine')
    .eq('user_id', userId)
    .maybeSingle()
  throwIfError(error?.message)
  const raw = data?.search_engine
  return isSearchEngine(raw) ? raw : 'Google'
}

/**
 * Saves the user's preferred search engine.
 * @param userId - Signed-in user id.
 * @param engine - Engine id.
 * @returns Stored engine id.
 */
export async function saveSearchEngine(userId: string, engine: SearchEngine): Promise<SearchEngine> {
  const next = isSearchEngine(engine) ? engine : 'Google'
  const { error } = await supabase()
    .from('user_settings')
    .upsert({ user_id: userId, search_engine: next }, { onConflict: 'user_id' })
  throwIfError(error?.message)
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
  const { data, error } = await supabase()
    .from('user_settings')
    .select('panel_opacity')
    .eq('user_id', userId)
    .maybeSingle()
  throwIfError(error?.message)
  return clampOpacity(data?.panel_opacity ?? DEFAULT_PANEL_OPACITY)
}

/**
 * Saves the user's glass panel opacity.
 * @param userId - Signed-in user id.
 * @param opacity - Opacity from 0 to 1.
 * @returns Stored opacity.
 */
export async function savePanelOpacity(userId: string, opacity: number): Promise<number> {
  const clamped = clampOpacity(opacity)
  const { error } = await supabase()
    .from('user_settings')
    .upsert({ user_id: userId, panel_opacity: clamped }, { onConflict: 'user_id' })
  throwIfError(error?.message)
  return clamped
}

/**
 * Loads the user's persisted search-suggestions panel opacity.
 * @param userId - Signed-in user id.
 * @returns Opacity from 0 to 1.
 */
export async function fetchSearchPanelOpacity(userId: string): Promise<number> {
  const { data, error } = await supabase()
    .from('user_settings')
    .select('search_panel_opacity')
    .eq('user_id', userId)
    .maybeSingle()
  throwIfError(error?.message)
  return clampOpacity(data?.search_panel_opacity ?? DEFAULT_SEARCH_PANEL_OPACITY)
}

/**
 * Saves the user's search-suggestions panel opacity.
 * @param userId - Signed-in user id.
 * @param opacity - Opacity from 0 to 1.
 * @returns Stored opacity.
 */
export async function saveSearchPanelOpacity(userId: string, opacity: number): Promise<number> {
  const clamped = clampOpacity(opacity)
  const { error } = await supabase()
    .from('user_settings')
    .upsert({ user_id: userId, search_panel_opacity: clamped }, { onConflict: 'user_id' })
  throwIfError(error?.message)
  return clamped
}

/**
 * Loads the user's persisted page wallpaper opacity.
 * @param userId - Signed-in user id.
 * @returns Opacity from 0 to 1.
 */
export async function fetchBackgroundOpacity(userId: string): Promise<number> {
  const { data, error } = await supabase()
    .from('user_settings')
    .select('background_opacity')
    .eq('user_id', userId)
    .maybeSingle()
  throwIfError(error?.message)
  return clampBackgroundOpacity(data?.background_opacity ?? DEFAULT_BACKGROUND_OPACITY)
}

/**
 * Saves the user's page wallpaper opacity.
 * @param userId - Signed-in user id.
 * @param opacity - Opacity from 0 to 1.
 * @returns Stored opacity.
 */
export async function saveBackgroundOpacity(userId: string, opacity: number): Promise<number> {
  const clamped = clampBackgroundOpacity(opacity)
  const { error } = await supabase()
    .from('user_settings')
    .upsert({ user_id: userId, background_opacity: clamped }, { onConflict: 'user_id' })
  throwIfError(error?.message)
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
  const { data, error } = await supabase()
    .from('user_settings')
    .select(
      'show_weather, show_markets, show_news, show_todo, show_currency, show_schedule, show_mail, show_focus, show_apps, peek_apps, aside_widget_order, aside_widget_order_left, aside_widget_order_right',
    )
    .eq('user_id', userId)
    .maybeSingle()
  throwIfError(error?.message)
  const storedShowApps = data?.show_apps ?? DEFAULT_PAGE_WIDGETS.showApps
  const storedPeekApps = data?.peek_apps ?? DEFAULT_PAGE_WIDGETS.peekApps
  // Category rail is gone; promote legacy peek-only into the single apps flag.
  const showApps = storedShowApps || storedPeekApps
  return {
    visibility: {
      showWeather: data?.show_weather ?? DEFAULT_PAGE_WIDGETS.showWeather,
      showMarkets: data?.show_markets ?? DEFAULT_PAGE_WIDGETS.showMarkets,
      showNews: data?.show_news ?? DEFAULT_PAGE_WIDGETS.showNews,
      showTodo: data?.show_todo ?? DEFAULT_PAGE_WIDGETS.showTodo,
      showCurrency: data?.show_currency ?? DEFAULT_PAGE_WIDGETS.showCurrency,
      showSchedule: data?.show_schedule ?? DEFAULT_PAGE_WIDGETS.showSchedule,
      showMail: data?.show_mail ?? DEFAULT_PAGE_WIDGETS.showMail,
      showFocus: data?.show_focus ?? DEFAULT_PAGE_WIDGETS.showFocus,
      showApps,
      peekApps: false,
    },
    asideRails: normalizeAsideWidgetRails(
      data?.aside_widget_order_left,
      data?.aside_widget_order_right,
      data?.aside_widget_order,
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
    showSchedule: Boolean(widgets.showSchedule),
    showMail: Boolean(widgets.showMail),
    showFocus: Boolean(widgets.showFocus),
    showApps: Boolean(widgets.showApps) || Boolean(widgets.peekApps),
    peekApps: false,
  }
  const { error } = await supabase().from('user_settings').upsert(
    {
      user_id: userId,
      show_weather: next.showWeather,
      show_markets: next.showMarkets,
      show_news: next.showNews,
      show_todo: next.showTodo,
      show_currency: next.showCurrency,
      show_schedule: next.showSchedule,
      show_mail: next.showMail,
      show_focus: next.showFocus,
      show_apps: next.showApps,
      peek_apps: false,
    },
    { onConflict: 'user_id' },
  )
  throwIfError(error?.message)
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
  const { error } = await supabase().from('user_settings').upsert(
    {
      user_id: userId,
      aside_widget_order_left: next.left,
      aside_widget_order_right: next.right,
      // Keep legacy column as the right rail for older clients.
      aside_widget_order: next.right,
    },
    { onConflict: 'user_id' },
  )
  throwIfError(error?.message)
  return next
}

/**
 * Loads the signed-in user's todo list (incomplete first, newest within each group).
 * @param userId - Signed-in user id.
 * @returns Todo items.
 */
export async function fetchTodos(userId: string): Promise<TodoItemDto[]> {
  const { data, error } = await supabase()
    .from('todos')
    .select('id, text, done, position')
    .eq('user_id', userId)
    .order('done', { ascending: true })
    .order('position', { ascending: false })
    .order('created_at', { ascending: false })
  throwIfError(error?.message)
  return sortTodos(
    (data ?? []).map((row) => ({
      id: row.id,
      text: row.text,
      done: row.done,
      position: row.position,
    })),
  )
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
  const { data: lastRows, error: lastError } = await supabase()
    .from('todos')
    .select('position')
    .eq('user_id', userId)
    .order('position', { ascending: false })
    .limit(1)
  throwIfError(lastError?.message)
  const nextPosition = (lastRows?.[0]?.position ?? -1) + 1
  const { data, error } = await supabase()
    .from('todos')
    .insert({
      user_id: userId,
      text: trimmed,
      done: false,
      position: nextPosition,
    })
    .select('id, text, done, position')
    .single()
  throwIfError(error?.message)
  if (!data) {
    throw new Error('Todo create returned no row')
  }
  return {
    id: data.id,
    text: data.text,
    done: data.done,
    position: data.position,
  }
}

/**
 * Updates whether a todo is completed.
 * @param userId - Signed-in user id.
 * @param id - Todo id.
 * @param done - Completed flag.
 * @returns Nothing.
 */
export async function setTodoDone(userId: string, id: string, done: boolean): Promise<void> {
  const { error } = await supabase()
    .from('todos')
    .update({ done })
    .eq('user_id', userId)
    .eq('id', id)
  throwIfError(error?.message)
}

/**
 * Deletes a todo owned by the user.
 * @param userId - Signed-in user id.
 * @param id - Todo id.
 * @returns Nothing.
 */
export async function deleteTodo(userId: string, id: string): Promise<void> {
  const { error } = await supabase().from('todos').delete().eq('user_id', userId).eq('id', id)
  throwIfError(error?.message)
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
  const { data, error } = await supabase()
    .from('user_settings')
    .select(
      'appearance_theme, accent_hue, accent_shade, clock_accent_hue, clock_accent_shade, icon_radius, search_radius',
    )
    .eq('user_id', userId)
    .maybeSingle()
  throwIfError(error?.message)
  return normalizeAppearanceSettings({
    theme: parseAppearanceTheme(data?.appearance_theme),
    accentHue: parseAccentHue(data?.accent_hue),
    accentShade: parseAccentShade(data?.accent_shade),
    clockAccentHue: parseAccentHue(data?.clock_accent_hue ?? DEFAULT_CLOCK_ACCENT_HUE),
    clockAccentShade: parseAccentShade(data?.clock_accent_shade ?? DEFAULT_CLOCK_ACCENT_SHADE),
    iconRadius: parseIconRadius(data?.icon_radius),
    searchRadius: parseSearchRadius(data?.search_radius),
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
  const { error } = await supabase().from('user_settings').upsert(
    {
      user_id: userId,
      appearance_theme: normalized.theme,
      accent_hue: normalized.accentHue,
      accent_shade: normalized.accentShade,
      clock_accent_hue: normalized.clockAccentHue,
      clock_accent_shade: normalized.clockAccentShade,
      icon_radius: normalized.iconRadius,
      search_radius: normalized.searchRadius,
    },
    { onConflict: 'user_id' },
  )
  throwIfError(error?.message)
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
// Background wallpaper gallery (Supabase Storage, private per-user folder)
// ---------------------------------------------------------------------------

/**
 * Infers a file extension for a wallpaper MIME type.
 * @param mimeType - Image MIME type (e.g. `image/jpeg`).
 * @returns File extension without a leading dot, defaulting to `jpg`.
 */
function extensionFromMimeType(mimeType: string): string {
  const mime = mimeType.toLowerCase()
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
}

/**
 * Normalizes an image MIME type for the wallpapers bucket allow-list.
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
 * Creates a temporary signed URL for a storage path.
 * @param path - Object path in the wallpapers bucket.
 * @returns Signed URL or null.
 */
async function signWallpaperPath(path: string): Promise<string | null> {
  const { data: signed, error: signError } = await supabase().storage
    .from(WALLPAPER_BUCKET)
    .createSignedUrl(path, WALLPAPER_SIGNED_URL_TTL_SECONDS)
  if (signError) {
    return null
  }
  return signed.signedUrl
}

/**
 * Uploads a companion thumbnail for a wallpaper (best-effort).
 * @param thumbPath - Destination object path.
 * @param source - Full image blob or data URL used to build the thumb.
 * @returns Nothing.
 */
async function uploadWallpaperThumbnail(
  thumbPath: string,
  source: Blob | string,
): Promise<void> {
  try {
    const thumbBlob = await createWallpaperThumbnail(source)
    const { error } = await supabase().storage.from(WALLPAPER_BUCKET).upload(thumbPath, thumbBlob, {
      contentType: thumbBlob.type || 'image/webp',
      upsert: true,
    })
    if (error) {
      console.warn('Wallpaper thumbnail upload failed:', error.message)
    }
  } catch (reason: unknown) {
    const message = reason instanceof Error ? reason.message : 'unknown error'
    console.warn('Wallpaper thumbnail create failed:', message)
  }
}

/**
 * Ensures a thumbnail exists for a wallpaper; creates one from the full image when missing.
 * @param storagePath - Full wallpaper storage path.
 * @param fullSignedUrl - Signed URL of the full image.
 * @param thumbExists - Whether the companion thumb object is already in storage.
 * @returns Signed thumbnail URL, or the full URL when a thumb cannot be produced.
 */
async function resolveWallpaperThumbUrl(
  storagePath: string,
  fullSignedUrl: string,
  thumbExists: boolean,
): Promise<string> {
  const thumbPath = wallpaperThumbPath(storagePath)
  if (!thumbExists) {
    await uploadWallpaperThumbnail(thumbPath, fullSignedUrl)
  }
  return (await signWallpaperPath(thumbPath)) ?? fullSignedUrl
}

/**
 * Lists object names in a user's wallpaper folder.
 * @param userId - Signed-in user id.
 * @returns Set of file names (not full paths).
 */
async function listWallpaperFileNames(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase().storage.from(WALLPAPER_BUCKET).list(userId, {
    limit: 100,
  })
  if (error || !data) {
    return new Set()
  }
  return new Set(data.map((entry) => entry.name))
}

/**
 * Lists the signed-in user's wallpaper library (newest first).
 * Gallery entries use compact thumbnails; `url` stays full-resolution for applying backgrounds.
 * @param userId - Signed-in user id.
 * @returns Wallpaper items with signed preview URLs.
 */
export async function listWallpapers(userId: string): Promise<WallpaperItem[]> {
  const { data, error } = await supabase()
    .from('user_wallpapers')
    .select('id, storage_path, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  throwIfError(error?.message)
  const rows = data ?? []
  if (rows.length === 0) {
    return []
  }

  const paths = rows.map((row) => row.storage_path)
  const [{ data: signed, error: signError }, fileNames] = await Promise.all([
    supabase().storage.from(WALLPAPER_BUCKET).createSignedUrls(paths, WALLPAPER_SIGNED_URL_TTL_SECONDS),
    listWallpaperFileNames(userId),
  ])
  throwIfError(signError?.message)

  const urlByPath = new Map<string, string>()
  for (const entry of signed ?? []) {
    if (entry.path && entry.signedUrl) {
      urlByPath.set(entry.path, entry.signedUrl)
    }
  }

  const withFullUrls = rows.flatMap((row, index) => {
    const url = urlByPath.get(row.storage_path) ?? signed?.[index]?.signedUrl ?? null
    if (!url) {
      return []
    }
    return [{ id: row.id, path: row.storage_path, url }]
  })

  return Promise.all(
    withFullUrls.map(async (item) => {
      const thumbName = wallpaperThumbPath(item.path).split('/').pop() ?? ''
      const thumbUrl = await resolveWallpaperThumbUrl(
        item.path,
        item.url,
        fileNames.has(thumbName),
      )
      return { ...item, thumbUrl }
    }),
  )
}

/**
 * Loads the active wallpaper path from user settings.
 * @param userId - Signed-in user id.
 * @returns Storage path or null.
 */
export async function fetchActiveWallpaperPath(userId: string): Promise<string | null> {
  const { data, error } = await supabase()
    .from('user_settings')
    .select('background_path')
    .eq('user_id', userId)
    .maybeSingle()
  throwIfError(error?.message)
  return data?.background_path ?? null
}

/**
 * Loads the user's active background image as a temporary signed URL.
 * @param userId - Signed-in user id.
 * @returns Signed URL or null.
 */
export async function fetchActiveWallpaperUrl(userId: string): Promise<string | null> {
  const path = await fetchActiveWallpaperPath(userId)
  if (!path) {
    return null
  }
  return signWallpaperPath(path)
}

/**
 * Sets or clears the active wallpaper without deleting library items.
 * Does not create a new signed URL ??callers should reuse gallery URLs when switching.
 * @param userId - Signed-in user id.
 * @param path - Storage path to activate, or null to show no wallpaper.
 * @returns Nothing.
 */
export async function selectWallpaper(userId: string, path: string | null): Promise<void> {
  const { error } = await supabase()
    .from('user_settings')
    .upsert({ user_id: userId, background_path: path }, { onConflict: 'user_id' })
  throwIfError(error?.message)
}

/**
 * Uploads a new wallpaper into the library and makes it active.
 * Passes an explicit MIME type so Storage allow-list checks succeed even when
 * Electron/Windows leaves `File.type` / `Blob.type` empty.
 * @param userId - Signed-in user id.
 * @param image - Image blob or file.
 * @param mimeType - Declared image MIME type (jpeg / png / webp).
 * @returns Signed URL for the new active wallpaper.
 */
export async function addWallpaper(
  userId: string,
  image: Blob,
  mimeType: string,
): Promise<string> {
  const { count, error: countError } = await supabase()
    .from('user_wallpapers')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  throwIfError(countError?.message)
  if ((count ?? 0) >= MAX_WALLPAPERS) {
    throw new Error('WALLPAPER_LIMIT')
  }

  const contentType = normalizeWallpaperMimeType(mimeType || image.type)
  const wallpaperId = crypto.randomUUID()
  const path = `${userId}/${wallpaperId}.${extensionFromMimeType(contentType)}`
  const thumbPath = wallpaperThumbPath(path)

  const { error: uploadError } = await supabase().storage
    .from(WALLPAPER_BUCKET)
    .upload(path, image, { contentType, upsert: false })
  throwIfError(uploadError?.message)

  await uploadWallpaperThumbnail(thumbPath, image)

  const { error: insertError } = await supabase().from('user_wallpapers').insert({
    id: wallpaperId,
    user_id: userId,
    storage_path: path,
  })
  if (insertError) {
    await supabase().storage.from(WALLPAPER_BUCKET).remove([path, thumbPath])
    throwIfError(insertError.message)
  }

  await selectWallpaper(userId, path)
  const signed = await signWallpaperPath(path)
  if (!signed) {
    throw new Error('Failed to sign wallpaper URL.')
  }
  return signed
}

/**
 * Removes one wallpaper from the library (and storage).
 * If it was active, falls back to the newest remaining wallpaper or clears.
 * @param userId - Signed-in user id.
 * @param wallpaperId - Wallpaper row id.
 * @returns Signed URL for the new active wallpaper, or null when none remain / none selected.
 */
export async function removeWallpaper(
  userId: string,
  wallpaperId: string,
): Promise<string | null> {
  const { data: row, error } = await supabase()
    .from('user_wallpapers')
    .select('id, storage_path')
    .eq('user_id', userId)
    .eq('id', wallpaperId)
    .maybeSingle()
  throwIfError(error?.message)
  if (!row) {
    return fetchActiveWallpaperUrl(userId)
  }

  const activePath = await fetchActiveWallpaperPath(userId)
  const thumbPath = wallpaperThumbPath(row.storage_path)
  await supabase().storage.from(WALLPAPER_BUCKET).remove([row.storage_path, thumbPath])

  const { error: deleteError } = await supabase()
    .from('user_wallpapers')
    .delete()
    .eq('user_id', userId)
    .eq('id', wallpaperId)
  throwIfError(deleteError?.message)

  if (activePath !== row.storage_path) {
    return activePath ? signWallpaperPath(activePath) : null
  }

  const { data: newest, error: newestError } = await supabase()
    .from('user_wallpapers')
    .select('storage_path')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  throwIfError(newestError?.message)

  const nextPath = newest?.storage_path ?? null
  await selectWallpaper(userId, nextPath)
  return nextPath ? signWallpaperPath(nextPath) : null
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
  const { data, error } = await supabase()
    .from('user_settings')
    .select('wallpaper_rotate_enabled, wallpaper_rotate_seconds')
    .eq('user_id', userId)
    .maybeSingle()
  throwIfError(error?.message)
  return {
    enabled: Boolean(data?.wallpaper_rotate_enabled),
    seconds: clampWallpaperRotateSeconds(
      data?.wallpaper_rotate_seconds ?? DEFAULT_WALLPAPER_ROTATE_SECONDS,
    ),
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
  const { error } = await supabase().from('user_settings').upsert(
    {
      user_id: userId,
      wallpaper_rotate_enabled: next.enabled,
      wallpaper_rotate_seconds: next.seconds,
    },
    { onConflict: 'user_id' },
  )
  throwIfError(error?.message)
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
  const { data, error } = await supabase()
    .from('user_settings')
    .select('currency_from, currency_to')
    .eq('user_id', userId)
    .maybeSingle()
  throwIfError(error?.message)
  return {
    from: data?.currency_from?.trim() || DEFAULT_CURRENCY_FROM,
    to: data?.currency_to?.trim() || DEFAULT_CURRENCY_TO,
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
  const { error } = await supabase().from('user_settings').upsert(
    {
      user_id: userId,
      currency_from: next.from,
      currency_to: next.to,
    },
    { onConflict: 'user_id' },
  )
  throwIfError(error?.message)
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
  const { data, error } = await supabase()
    .from('market_assets')
    .select('asset_id, symbol, name, kind')
    .eq('user_id', userId)
    .order('position')
  throwIfError(error?.message)
  return (data ?? []).map((row) => ({
    id: row.asset_id,
    symbol: row.symbol,
    name: row.name,
    kind: row.kind as 'crypto' | 'stock',
  }))
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

  const { error: deleteError } = await supabase().from('market_assets').delete().eq('user_id', userId)
  throwIfError(deleteError?.message)

  if (limited.length > 0) {
    const rows = limited.map((asset, position) => ({
      user_id: userId,
      position,
      asset_id: asset.id,
      symbol: asset.symbol,
      name: asset.name,
      kind: asset.kind,
    }))
    const { error: insertError } = await supabase().from('market_assets').insert(rows)
    throwIfError(insertError?.message)
  }

  return fetchMarketAssetSelection(userId)
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
  const { data, error } = await supabase()
    .from('user_settings')
    .select('weather_latitude, weather_longitude, weather_place, weather_source')
    .eq('user_id', userId)
    .maybeSingle()
  throwIfError(error?.message)
  const latitude =
    typeof data?.weather_latitude === 'number' && Number.isFinite(data.weather_latitude)
      ? data.weather_latitude
      : null
  const longitude =
    typeof data?.weather_longitude === 'number' && Number.isFinite(data.weather_longitude)
      ? data.weather_longitude
      : null
  const place = data?.weather_place?.trim() || null
  const source = parseWeatherSource(data?.weather_source)
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

  const { error } = await supabase().from('user_settings').upsert(
    {
      user_id: userId,
      weather_latitude: next.latitude,
      weather_longitude: next.longitude,
      weather_place: next.place,
      weather_source: next.source,
    },
    { onConflict: 'user_id' },
  )
  throwIfError(error?.message)
  return next
}
