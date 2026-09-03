/**
 * Home / Settings appearance, widgets, wallpapers, and related Home prefs —
 * machine SQLite and local files, not company Supabase.
 */

import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite'
import { app } from 'electron'
import {
  HOME_WALLPAPER_HOST,
  HOME_WALLPAPER_SCHEME,
  homeWallpaperMediaUrl,
  homeWallpaperThumbPath,
  parseHomeOpenLinksMode,
  sanitizeSearchSuggestions,
  type HomeMarketAssetDto,
  type HomeSearchHistoryItemDto,
  type HomeSettingsRecord,
  type HomeTodoItemDto,
  type HomeWallpaperItemDto,
} from '../shared/home-settings'

const MAX_USER_ID_LENGTH = 64
const MAX_TODO_TEXT_LENGTH = 2000
const MAX_SEARCH_QUERY_LENGTH = 500
const MAX_WALLPAPERS = 12
const MAX_WALLPAPER_BYTES = 10 * 1024 * 1024
const MAX_TODOS = 200
const SEARCH_HISTORY_LIMIT = 30
const MAX_MARKET_ASSETS = 2
const MAX_SUGGESTION_QUERY_LENGTH = 120
const MAX_SUGGESTION_CACHE_ROWS = 300

const DEFAULT_HOME_SETTINGS: HomeSettingsRecord = {
  searchEngine: 'Google',
  panelOpacity: 0.5,
  searchPanelOpacity: 0.5,
  backgroundOpacity: 0.5,
  backgroundPath: null,
  appearanceTheme: 'light',
  accentHue: 'black',
  accentShade: 500,
  clockAccentHue: 'black',
  clockAccentShade: 500,
  iconRadius: 50,
  searchRadius: 50,
  wallpaperRotateEnabled: false,
  wallpaperRotateSeconds: 30,
  showWeather: false,
  showMarkets: false,
  showNews: false,
  showTodo: false,
  showCurrency: false,
  showMail: false,
  showApps: false,
  peekApps: false,
  openLinksMode: null,
  currencyFrom: 'USD',
  currencyTo: 'TWD',
  weatherLatitude: null,
  weatherLongitude: null,
  weatherPlace: null,
  weatherSource: null,
  asideWidgetOrderLeft: [],
  asideWidgetOrderRight: [],
  asideWidgetOrder: [],
}

type StoreRow = Record<string, SQLOutputValue>

let settingsDatabase: DatabaseSync | null = null

/**
 * Returns the lazily opened Home settings database.
 * @returns Initialized SQLite database.
 */
function getSettingsDatabase(): DatabaseSync {
  if (settingsDatabase) {
    return settingsDatabase
  }
  const databasePath = path.join(app.getPath('userData'), 'home-settings.sqlite')
  const database = new DatabaseSync(databasePath)
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_wallpapers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS user_wallpapers_user_created
      ON user_wallpapers (user_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      text TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS todos_user_position
      ON todos (user_id, done, position DESC);
    CREATE TABLE IF NOT EXISTS market_assets (
      user_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      asset_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      PRIMARY KEY (user_id, asset_id)
    );
    CREATE TABLE IF NOT EXISTS search_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      query TEXT NOT NULL,
      engine TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS search_history_user_created
      ON search_history (user_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS search_suggestions (
      user_id TEXT NOT NULL,
      engine TEXT NOT NULL,
      query TEXT NOT NULL,
      suggestions_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, engine, query)
    );
    CREATE INDEX IF NOT EXISTS search_suggestions_user_updated
      ON search_suggestions (user_id, updated_at DESC);
  `)
  settingsDatabase = database
  return database
}

/**
 * Validates a signed-in user id.
 * @param userId - Auth user id.
 * @returns Trimmed user id.
 */
function requireUserId(userId: string): string {
  const trimmed = userId.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_USER_ID_LENGTH) {
    throw new Error('Home settings user id is invalid.')
  }
  return trimmed
}

/**
 * Reads a SQLite text column.
 * @param value - Raw cell.
 * @returns String, or empty when missing.
 */
function asString(value: SQLOutputValue | undefined): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Reads a SQLite integer column.
 * @param value - Raw cell.
 * @returns Integer, or 0 when missing.
 */
function asInteger(value: SQLOutputValue | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * Reads the first numeric cell from a COUNT(*) row.
 * @param row - Query row.
 * @returns Count, or 0.
 */
function countFromRow(row: StoreRow | undefined): number {
  if (!row) {
    return 0
  }
  for (const value of Object.values(row)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }
  return 0
}

/**
 * Parses a stored string list.
 * @param value - Unknown JSON.
 * @returns String array.
 */
function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is string => typeof item === 'string')
}

/**
 * Reads a finite number or a fallback.
 * @param value - Unknown JSON.
 * @param fallback - Default.
 * @returns Number.
 */
function asFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * Reads an optional finite number.
 * @param value - Unknown JSON.
 * @returns Number or null.
 */
function asOptionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Directory that holds wallpaper files for every user.
 * @returns Absolute folder path.
 */
function wallpaperRoot(): string {
  return path.join(app.getPath('userData'), 'home-wallpapers')
}

/**
 * Resolves a wallpaper storage path to an absolute file, or null when unsafe.
 * @param storagePath - `userId/file.ext`.
 * @returns Absolute path, or null.
 */
function resolveWallpaperDiskPath(storagePath: string): string | null {
  const parts = storagePath.split('/').filter((part) => part.length > 0)
  if (parts.length !== 2) {
    return null
  }
  const [userId, fileName] = parts
  if (!userId || !fileName || fileName.includes('..') || userId.includes('..')) {
    return null
  }
  if (!/^[A-Za-z0-9._-]+$/.test(fileName)) {
    return null
  }
  const root = wallpaperRoot()
  const absolute = path.join(root, userId, fileName)
  const relative = path.relative(root, absolute)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null
  }
  return absolute
}

/**
 * Maps a custom-protocol wallpaper URL to a file on disk.
 * @param rawUrl - `workbench-wallpaper://files/...` request URL.
 * @returns Absolute file path, or null when the URL is invalid or missing.
 */
export function resolveHomeWallpaperFile(rawUrl: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return null
  }
  if (parsed.protocol !== `${HOME_WALLPAPER_SCHEME}:` || parsed.hostname !== HOME_WALLPAPER_HOST) {
    return null
  }
  const storagePath = decodeURIComponent(parsed.pathname.replace(/^\/+/u, ''))
  const absolute = resolveWallpaperDiskPath(storagePath)
  if (!absolute || !existsSync(absolute)) {
    return null
  }
  return absolute
}

/**
 * Merges a stored JSON payload onto the default settings row.
 * @param value - Parsed JSON.
 * @returns Complete settings record.
 */
function normalizeSettings(value: unknown): HomeSettingsRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ...DEFAULT_HOME_SETTINGS }
  }
  const raw = value as Record<string, unknown>
  return {
    searchEngine: typeof raw.searchEngine === 'string' ? raw.searchEngine : DEFAULT_HOME_SETTINGS.searchEngine,
    panelOpacity: asFiniteNumber(raw.panelOpacity, DEFAULT_HOME_SETTINGS.panelOpacity),
    searchPanelOpacity: asFiniteNumber(
      raw.searchPanelOpacity,
      DEFAULT_HOME_SETTINGS.searchPanelOpacity,
    ),
    backgroundOpacity: asFiniteNumber(
      raw.backgroundOpacity,
      DEFAULT_HOME_SETTINGS.backgroundOpacity,
    ),
    backgroundPath: typeof raw.backgroundPath === 'string' ? raw.backgroundPath : null,
    appearanceTheme:
      typeof raw.appearanceTheme === 'string' ? raw.appearanceTheme : DEFAULT_HOME_SETTINGS.appearanceTheme,
    accentHue: typeof raw.accentHue === 'string' ? raw.accentHue : DEFAULT_HOME_SETTINGS.accentHue,
    accentShade: asFiniteNumber(raw.accentShade, DEFAULT_HOME_SETTINGS.accentShade),
    clockAccentHue:
      typeof raw.clockAccentHue === 'string' ? raw.clockAccentHue : DEFAULT_HOME_SETTINGS.clockAccentHue,
    clockAccentShade: asFiniteNumber(raw.clockAccentShade, DEFAULT_HOME_SETTINGS.clockAccentShade),
    iconRadius: asFiniteNumber(raw.iconRadius, DEFAULT_HOME_SETTINGS.iconRadius),
    searchRadius: asFiniteNumber(raw.searchRadius, DEFAULT_HOME_SETTINGS.searchRadius),
    wallpaperRotateEnabled: Boolean(raw.wallpaperRotateEnabled),
    wallpaperRotateSeconds: asFiniteNumber(
      raw.wallpaperRotateSeconds,
      DEFAULT_HOME_SETTINGS.wallpaperRotateSeconds,
    ),
    showWeather: Boolean(raw.showWeather),
    showMarkets: Boolean(raw.showMarkets),
    showNews: Boolean(raw.showNews),
    showTodo: Boolean(raw.showTodo),
    showCurrency: Boolean(raw.showCurrency),
    showMail: Boolean(raw.showMail),
    showApps: Boolean(raw.showApps),
    peekApps: Boolean(raw.peekApps),
    openLinksMode: parseHomeOpenLinksMode(raw.openLinksMode),
    currencyFrom: typeof raw.currencyFrom === 'string' ? raw.currencyFrom : DEFAULT_HOME_SETTINGS.currencyFrom,
    currencyTo: typeof raw.currencyTo === 'string' ? raw.currencyTo : DEFAULT_HOME_SETTINGS.currencyTo,
    weatherLatitude: asOptionalNumber(raw.weatherLatitude),
    weatherLongitude: asOptionalNumber(raw.weatherLongitude),
    weatherPlace: typeof raw.weatherPlace === 'string' ? raw.weatherPlace : null,
    weatherSource: typeof raw.weatherSource === 'string' ? raw.weatherSource : null,
    asideWidgetOrderLeft: asStringArray(raw.asideWidgetOrderLeft),
    asideWidgetOrderRight: asStringArray(raw.asideWidgetOrderRight),
    asideWidgetOrder: asStringArray(raw.asideWidgetOrder),
  }
}

/**
 * Loads one user's Home / Settings row.
 * @param userId - Auth user id.
 * @returns Settings, or product defaults when unset.
 */
export function getHomeSettings(userId: string): HomeSettingsRecord {
  const id = requireUserId(userId)
  const row = getSettingsDatabase()
    .prepare('SELECT payload_json FROM user_settings WHERE user_id = ?')
    .get(id) as StoreRow | undefined
  if (!row) {
    return { ...DEFAULT_HOME_SETTINGS }
  }
  try {
    return normalizeSettings(JSON.parse(asString(row.payload_json)) as unknown)
  } catch {
    return { ...DEFAULT_HOME_SETTINGS }
  }
}

/**
 * Merges a partial Home / Settings patch onto the stored row.
 * @param userId - Auth user id.
 * @param patch - Fields to overwrite.
 * @returns Stored settings after the merge.
 */
export function patchHomeSettings(
  userId: string,
  patch: Partial<HomeSettingsRecord>,
): HomeSettingsRecord {
  const id = requireUserId(userId)
  const next = normalizeSettings({ ...getHomeSettings(id), ...patch })
  getSettingsDatabase()
    .prepare(
      `INSERT INTO user_settings (user_id, payload_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at`,
    )
    .run(id, JSON.stringify(next), Date.now())
  return next
}

/**
 * Builds renderer URLs for one wallpaper row.
 * @param storagePath - `userId/file.ext`.
 * @returns Item URLs.
 */
function wallpaperUrls(storagePath: string): { url: string; thumbUrl: string } {
  const url = homeWallpaperMediaUrl(storagePath)
  const thumbPath = homeWallpaperThumbPath(storagePath)
  const thumbFile = resolveWallpaperDiskPath(thumbPath)
  const thumbUrl = thumbFile && existsSync(thumbFile) ? homeWallpaperMediaUrl(thumbPath) : url
  return { url, thumbUrl }
}

/**
 * Lists one user's wallpaper library (newest first).
 * @param userId - Auth user id.
 * @returns Wallpaper items with custom-protocol URLs.
 */
export function listHomeWallpapers(userId: string): HomeWallpaperItemDto[] {
  const id = requireUserId(userId)
  const rows = getSettingsDatabase()
    .prepare(
      'SELECT id, storage_path FROM user_wallpapers WHERE user_id = ? ORDER BY created_at DESC',
    )
    .all(id) as StoreRow[]
  return rows.flatMap((row) => {
    const storagePath = asString(row.storage_path)
    const file = resolveWallpaperDiskPath(storagePath)
    if (!file || !existsSync(file)) {
      return []
    }
    const urls = wallpaperUrls(storagePath)
    return [
      {
        id: asString(row.id),
        path: storagePath,
        url: urls.url,
        thumbUrl: urls.thumbUrl,
      },
    ]
  })
}

/**
 * Infers a file extension from a wallpaper MIME type.
 * @param mimeType - Image MIME type.
 * @returns Extension without a dot.
 */
function extensionFromMimeType(mimeType: string): string {
  const mime = mimeType.toLowerCase()
  if (mime === 'image/png') {
    return 'png'
  }
  if (mime === 'image/webp') {
    return 'webp'
  }
  return 'jpg'
}

/**
 * Writes a wallpaper file under the user folder.
 * @param storagePath - `userId/file.ext`.
 * @param bytes - File contents.
 * @returns Nothing.
 */
function writeWallpaperFile(storagePath: string, bytes: Uint8Array): void {
  const absolute = resolveWallpaperDiskPath(storagePath)
  if (!absolute) {
    throw new Error('Wallpaper path is invalid.')
  }
  mkdirSync(path.dirname(absolute), { recursive: true })
  writeFileSync(absolute, bytes)
}

/**
 * Deletes a wallpaper file when it exists.
 * @param storagePath - `userId/file.ext`.
 * @returns Nothing.
 */
function removeWallpaperFile(storagePath: string): void {
  const absolute = resolveWallpaperDiskPath(storagePath)
  if (absolute && existsSync(absolute)) {
    rmSync(absolute, { force: true })
  }
}

/**
 * Adds a wallpaper to the local library and makes it active.
 * @param userId - Auth user id.
 * @param bytes - Full image bytes.
 * @param mimeType - Declared MIME type.
 * @param thumbBytes - Optional thumbnail bytes.
 * @returns Created wallpaper item.
 */
export function addHomeWallpaper(
  userId: string,
  bytes: Uint8Array,
  mimeType: string,
  thumbBytes: Uint8Array | null,
): HomeWallpaperItemDto {
  const id = requireUserId(userId)
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_WALLPAPER_BYTES) {
    throw new Error('Wallpaper file is invalid.')
  }
  const countRow = getSettingsDatabase()
    .prepare('SELECT COUNT(*) AS n FROM user_wallpapers WHERE user_id = ?')
    .get(id) as StoreRow | undefined
  if (countFromRow(countRow) >= MAX_WALLPAPERS) {
    throw new Error('WALLPAPER_LIMIT')
  }
  const wallpaperId = randomUUID()
  const storagePath = `${id}/${wallpaperId}.${extensionFromMimeType(mimeType)}`
  writeWallpaperFile(storagePath, bytes)
  if (thumbBytes && thumbBytes.byteLength > 0 && thumbBytes.byteLength <= MAX_WALLPAPER_BYTES) {
    writeWallpaperFile(homeWallpaperThumbPath(storagePath), thumbBytes)
  }
  getSettingsDatabase()
    .prepare(
      'INSERT INTO user_wallpapers (id, user_id, storage_path, created_at) VALUES (?, ?, ?, ?)',
    )
    .run(wallpaperId, id, storagePath, Date.now())
  patchHomeSettings(id, { backgroundPath: storagePath })
  const urls = wallpaperUrls(storagePath)
  return {
    id: wallpaperId,
    path: storagePath,
    url: urls.url,
    thumbUrl: urls.thumbUrl,
  }
}

/**
 * Removes one wallpaper. If it was active, selects the newest remaining file.
 * @param userId - Auth user id.
 * @param wallpaperId - Wallpaper row id.
 * @returns Custom-protocol URL for the new active wallpaper, or null.
 */
export function removeHomeWallpaper(userId: string, wallpaperId: string): string | null {
  const id = requireUserId(userId)
  const row = getSettingsDatabase()
    .prepare('SELECT id, storage_path FROM user_wallpapers WHERE user_id = ? AND id = ?')
    .get(id, wallpaperId.trim()) as StoreRow | undefined
  if (!row) {
    return getHomeSettings(id).backgroundPath
      ? homeWallpaperMediaUrl(getHomeSettings(id).backgroundPath ?? '')
      : null
  }
  const storagePath = asString(row.storage_path)
  removeWallpaperFile(storagePath)
  removeWallpaperFile(homeWallpaperThumbPath(storagePath))
  getSettingsDatabase()
    .prepare('DELETE FROM user_wallpapers WHERE user_id = ? AND id = ?')
    .run(id, wallpaperId.trim())
  const settings = getHomeSettings(id)
  if (settings.backgroundPath !== storagePath) {
    return settings.backgroundPath ? homeWallpaperMediaUrl(settings.backgroundPath) : null
  }
  const newest = getSettingsDatabase()
    .prepare(
      'SELECT storage_path FROM user_wallpapers WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
    )
    .get(id) as StoreRow | undefined
  const nextPath = newest ? asString(newest.storage_path) : null
  patchHomeSettings(id, { backgroundPath: nextPath })
  return nextPath ? homeWallpaperMediaUrl(nextPath) : null
}

/**
 * Loads todos for one user (incomplete first, then newest).
 * @param userId - Auth user id.
 * @returns Todo items.
 */
export function listHomeTodos(userId: string): HomeTodoItemDto[] {
  const id = requireUserId(userId)
  const rows = getSettingsDatabase()
    .prepare(
      'SELECT id, text, done, position FROM todos WHERE user_id = ? ORDER BY done ASC, position DESC, created_at DESC',
    )
    .all(id) as StoreRow[]
  return rows.map((row) => ({
    id: asString(row.id),
    text: asString(row.text),
    done: asInteger(row.done) === 1,
    position: asInteger(row.position),
  }))
}

/**
 * Creates a todo at the top of the list.
 * @param userId - Auth user id.
 * @param text - Todo text.
 * @returns Created todo.
 */
export function createHomeTodo(userId: string, text: string): HomeTodoItemDto {
  const id = requireUserId(userId)
  const trimmed = text.trim()
  if (!trimmed || trimmed.length > MAX_TODO_TEXT_LENGTH) {
    throw new Error('Todo text is required')
  }
  const countRow = getSettingsDatabase()
    .prepare('SELECT COUNT(*) AS n FROM todos WHERE user_id = ?')
    .get(id) as StoreRow | undefined
  if (countFromRow(countRow) >= MAX_TODOS) {
    throw new Error('Todo list is full.')
  }
  const last = getSettingsDatabase()
    .prepare('SELECT position FROM todos WHERE user_id = ? ORDER BY position DESC LIMIT 1')
    .get(id) as StoreRow | undefined
  const todoId = randomUUID()
  const position = asInteger(last?.position) + 1
  getSettingsDatabase()
    .prepare(
      'INSERT INTO todos (id, user_id, text, done, position, created_at) VALUES (?, ?, ?, 0, ?, ?)',
    )
    .run(todoId, id, trimmed, position, Date.now())
  return { id: todoId, text: trimmed, done: false, position }
}

/**
 * Updates whether a todo is completed.
 * @param userId - Auth user id.
 * @param todoId - Todo id.
 * @param done - Completed flag.
 * @returns Nothing.
 */
export function setHomeTodoDone(userId: string, todoId: string, done: boolean): void {
  const id = requireUserId(userId)
  getSettingsDatabase()
    .prepare('UPDATE todos SET done = ? WHERE user_id = ? AND id = ?')
    .run(done ? 1 : 0, id, todoId.trim())
}

/**
 * Deletes a todo owned by the user.
 * @param userId - Auth user id.
 * @param todoId - Todo id.
 * @returns Nothing.
 */
export function deleteHomeTodo(userId: string, todoId: string): void {
  const id = requireUserId(userId)
  getSettingsDatabase()
    .prepare('DELETE FROM todos WHERE user_id = ? AND id = ?')
    .run(id, todoId.trim())
}

/**
 * Loads the user's market asset selection.
 * @param userId - Auth user id.
 * @returns Selected assets in display order.
 */
export function listHomeMarketAssets(userId: string): HomeMarketAssetDto[] {
  const id = requireUserId(userId)
  const rows = getSettingsDatabase()
    .prepare(
      'SELECT asset_id, symbol, name, kind FROM market_assets WHERE user_id = ? ORDER BY position ASC',
    )
    .all(id) as StoreRow[]
  return rows.map((row) => ({
    id: asString(row.asset_id),
    symbol: asString(row.symbol),
    name: asString(row.name),
    kind: asString(row.kind) === 'stock' ? 'stock' : 'crypto',
  }))
}

/**
 * Replaces the user's market asset selection.
 * @param userId - Auth user id.
 * @param assets - Selected assets (max 2).
 * @returns Stored assets.
 */
export function saveHomeMarketAssets(
  userId: string,
  assets: HomeMarketAssetDto[],
): HomeMarketAssetDto[] {
  const id = requireUserId(userId)
  const limited = assets.slice(0, MAX_MARKET_ASSETS)
  const database = getSettingsDatabase()
  database.prepare('DELETE FROM market_assets WHERE user_id = ?').run(id)
  const insert = database.prepare(
    'INSERT INTO market_assets (user_id, position, asset_id, symbol, name, kind) VALUES (?, ?, ?, ?, ?, ?)',
  )
  limited.forEach((asset, position) => {
    insert.run(id, position, asset.id.trim(), asset.symbol.trim(), asset.name.trim(), asset.kind)
  })
  return listHomeMarketAssets(id)
}

/**
 * Loads recent search history for the user.
 * @param userId - Auth user id.
 * @returns History items, newest first.
 */
export function listHomeSearchHistory(userId: string): HomeSearchHistoryItemDto[] {
  const id = requireUserId(userId)
  const rows = getSettingsDatabase()
    .prepare(
      'SELECT id, query, engine, created_at FROM search_history WHERE user_id = ? ORDER BY created_at DESC',
    )
    .all(id) as StoreRow[]
  const seen = new Set<string>()
  const items: HomeSearchHistoryItemDto[] = []
  for (const row of rows) {
    const query = asString(row.query).trim()
    const key = query.toLowerCase()
    if (!query || seen.has(key)) {
      continue
    }
    seen.add(key)
    items.push({
      id: asString(row.id),
      query,
      engine: asString(row.engine),
      createdAt: new Date(asInteger(row.created_at)).toISOString(),
    })
    if (items.length >= SEARCH_HISTORY_LIMIT) {
      break
    }
  }
  return items
}

/**
 * Records a completed search query.
 * @param userId - Auth user id.
 * @param query - Search text.
 * @param engine - Engine id.
 * @returns Updated history.
 */
export function recordHomeSearchHistory(
  userId: string,
  query: string,
  engine: string,
): HomeSearchHistoryItemDto[] {
  const id = requireUserId(userId)
  const normalized = query.trim()
  if (!normalized || normalized.length > MAX_SEARCH_QUERY_LENGTH) {
    return listHomeSearchHistory(id)
  }
  const database = getSettingsDatabase()
  database
    .prepare('DELETE FROM search_history WHERE user_id = ? AND lower(query) = lower(?)')
    .run(id, normalized)
  database
    .prepare(
      'INSERT INTO search_history (id, user_id, query, engine, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(randomUUID(), id, normalized, engine.trim() || 'Google', Date.now())
  const overflow = database
    .prepare(
      'SELECT id FROM search_history WHERE user_id = ? ORDER BY created_at DESC LIMIT -1 OFFSET ?',
    )
    .all(id, SEARCH_HISTORY_LIMIT) as StoreRow[]
  if (overflow.length > 0) {
    const deleteOne = database.prepare('DELETE FROM search_history WHERE id = ?')
    for (const row of overflow) {
      deleteOne.run(asString(row.id))
    }
  }
  return listHomeSearchHistory(id)
}

/**
 * Deletes one search-history row.
 * @param userId - Auth user id.
 * @param historyId - Row id.
 * @returns Updated history.
 */
export function deleteHomeSearchHistory(
  userId: string,
  historyId: string,
): HomeSearchHistoryItemDto[] {
  const id = requireUserId(userId)
  getSettingsDatabase()
    .prepare('DELETE FROM search_history WHERE user_id = ? AND id = ?')
    .run(id, historyId.trim())
  return listHomeSearchHistory(id)
}

/**
 * Normalizes a suggestion-cache query key.
 * @param query - Raw search text.
 * @returns Lowercased trimmed query, or empty when invalid.
 */
function normalizeSuggestionQuery(query: string): string {
  const normalized = query.trim().toLowerCase()
  if (!normalized || normalized.length > MAX_SUGGESTION_QUERY_LENGTH) {
    return ''
  }
  return normalized
}

/**
 * Normalizes a suggestion-cache engine key.
 * @param engine - Raw engine id.
 * @returns Google, Bing, or Yahoo.
 */
function normalizeSuggestionEngine(engine: string): string {
  if (engine === 'Bing' || engine === 'Yahoo') {
    return engine
  }
  return 'Google'
}

/**
 * Reads cached autocomplete suggestions for one query.
 * @param userId - Auth user id.
 * @param engine - Suggest engine id.
 * @param query - Search text.
 * @returns Cached suggestion strings, or an empty list.
 */
export function getHomeSearchSuggestions(
  userId: string,
  engine: string,
  query: string,
): string[] {
  const id = userId.trim()
  const key = normalizeSuggestionQuery(query)
  if (!id || id.length > MAX_USER_ID_LENGTH || !key) {
    return []
  }
  const row = getSettingsDatabase()
    .prepare(
      'SELECT suggestions_json FROM search_suggestions WHERE user_id = ? AND engine = ? AND query = ?',
    )
    .get(id, normalizeSuggestionEngine(engine), key) as StoreRow | undefined
  if (!row) {
    return []
  }
  try {
    return sanitizeSearchSuggestions(JSON.parse(asString(row.suggestions_json)) as unknown)
  } catch {
    return []
  }
}

/**
 * Stores autocomplete suggestions for one query and prunes old rows.
 * @param userId - Auth user id.
 * @param engine - Suggest engine id.
 * @param query - Search text.
 * @param suggestions - Suggestion strings.
 * @returns Nothing.
 */
export function putHomeSearchSuggestions(
  userId: string,
  engine: string,
  query: string,
  suggestions: string[],
): void {
  const id = userId.trim()
  const key = normalizeSuggestionQuery(query)
  const next = sanitizeSearchSuggestions(suggestions)
  if (!id || id.length > MAX_USER_ID_LENGTH || !key || next.length === 0) {
    return
  }
  const database = getSettingsDatabase()
  database
    .prepare(
      `INSERT INTO search_suggestions (user_id, engine, query, suggestions_json, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, engine, query) DO UPDATE SET
         suggestions_json = excluded.suggestions_json,
         updated_at = excluded.updated_at`,
    )
    .run(id, normalizeSuggestionEngine(engine), key, JSON.stringify(next), Date.now())
  const overflow = database
    .prepare(
      'SELECT query, engine FROM search_suggestions WHERE user_id = ? ORDER BY updated_at DESC LIMIT -1 OFFSET ?',
    )
    .all(id, MAX_SUGGESTION_CACHE_ROWS) as StoreRow[]
  if (overflow.length === 0) {
    return
  }
  const deleteOne = database.prepare(
    'DELETE FROM search_suggestions WHERE user_id = ? AND engine = ? AND query = ?',
  )
  for (const row of overflow) {
    deleteOne.run(id, asString(row.engine), asString(row.query))
  }
}
