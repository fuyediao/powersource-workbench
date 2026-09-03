/**
 * Home website catalog and per-user layouts — machine SQLite, not Supabase.
 * Built-in Function tiles (Ask, Mail, OA, ERP, …) stay in renderer code.
 */

import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite'
import { app } from 'electron'
import type {
  HomeLibraryAppDto,
  HomeLibraryCategoryDto,
  HomeLibrarySiteHitDto,
} from '../shared/home-library'

const MAX_USER_ID_LENGTH = 64
const MAX_CATEGORY_ID_LENGTH = 64
const MAX_SITE_ID_LENGTH = 64
const MAX_SITE_NAME_LENGTH = 200
const MAX_SEARCH_QUERY_LENGTH = 200
const MAX_SITES_PER_CATEGORY = 200
const SEARCH_LIMIT = 12
const WEBSITES_CATEGORY_ID = 'websites'

type LibraryRow = Record<string, SQLOutputValue>

/**
 * Normalizes a user-entered site URL for SQLite storage.
 * @param value - Raw URL text.
 * @returns Absolute http(s) URL, or null when invalid.
 */
function normalizeSiteUrl(value: string): string | null {
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

let libraryDatabase: DatabaseSync | null = null

/**
 * Returns the lazily opened Home website library database.
 * @returns Initialized SQLite database.
 */
function getLibraryDatabase(): DatabaseSync {
  if (libraryDatabase) {
    return libraryDatabase
  }

  const databasePath = path.join(app.getPath('userData'), 'home-library.sqlite')
  const database = new DatabaseSync(databasePath)
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      position INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_category_sites (
      user_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (user_id, category_id, site_id)
    );
    CREATE INDEX IF NOT EXISTS idx_user_category_sites_list
      ON user_category_sites (user_id, category_id, position);
    INSERT OR IGNORE INTO categories (id, position) VALUES ('${WEBSITES_CATEGORY_ID}', 1);
  `)
  libraryDatabase = database
  return database
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
 * Validates a signed-in user id for SQLite storage.
 * @param userId - Auth user id.
 * @returns Trimmed user id.
 */
function requireUserId(userId: string): string {
  const trimmed = userId.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_USER_ID_LENGTH) {
    throw new Error('Home library user id is invalid.')
  }
  return trimmed
}

/**
 * Validates a category id.
 * @param categoryId - Category identifier.
 * @returns Trimmed category id.
 */
function requireCategoryId(categoryId: string): string {
  const trimmed = categoryId.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_CATEGORY_ID_LENGTH) {
    throw new Error('Home library category id is invalid.')
  }
  return trimmed
}

/**
 * Validates a site id.
 * @param siteId - Site UUID.
 * @returns Trimmed site id.
 */
function requireSiteId(siteId: string): string {
  const trimmed = siteId.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_SITE_ID_LENGTH) {
    throw new Error('Home library site id is invalid.')
  }
  return trimmed
}

/**
 * Escapes `%` / `_` for a SQLite LIKE pattern.
 * @param value - Raw search text.
 * @returns Escaped fragment.
 */
function escapeLike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
}

/**
 * Looks up a site by exact URL.
 * @param url - Canonical site URL.
 * @returns Site row, or null.
 */
function findSiteByUrl(url: string): { id: string; url: string; name: string } | null {
  const row = getLibraryDatabase()
    .prepare('SELECT id, url, name FROM sites WHERE url = ?')
    .get(url) as LibraryRow | undefined
  if (!row) {
    return null
  }
  return { id: asString(row.id), url: asString(row.url), name: asString(row.name) }
}

/**
 * Looks up a site by id.
 * @param siteId - Site UUID.
 * @returns Site row, or null.
 */
function findSiteById(siteId: string): { id: string; url: string; name: string } | null {
  const row = getLibraryDatabase()
    .prepare('SELECT id, url, name FROM sites WHERE id = ?')
    .get(siteId) as LibraryRow | undefined
  if (!row) {
    return null
  }
  return { id: asString(row.id), url: asString(row.url), name: asString(row.name) }
}

/**
 * Returns whether a site is already linked into a user's category.
 * @param userId - Signed-in user id.
 * @param categoryId - Category identifier.
 * @param siteId - Site UUID.
 * @returns True when the link exists.
 */
function isAlreadyLinked(userId: string, categoryId: string, siteId: string): boolean {
  const row = getLibraryDatabase()
    .prepare(
      `SELECT site_id FROM user_category_sites
       WHERE user_id = ? AND category_id = ? AND site_id = ?`,
    )
    .get(userId, categoryId, siteId) as LibraryRow | undefined
  return Boolean(row)
}

/**
 * Next append position (empty list starts at 0).
 * @param userId - Signed-in user id.
 * @param categoryId - Category identifier.
 * @returns Next zero-based position.
 */
function nextAppendPosition(userId: string, categoryId: string): number {
  const row = getLibraryDatabase()
    .prepare(
      `SELECT position FROM user_category_sites
       WHERE user_id = ? AND category_id = ?
       ORDER BY position DESC LIMIT 1`,
    )
    .get(userId, categoryId) as LibraryRow | undefined
  if (!row) {
    return 0
  }
  return asInteger(row.position) + 1
}

/**
 * Counts how many sites a user has in one category.
 * @param userId - Signed-in user id.
 * @param categoryId - Category identifier.
 * @returns Link count.
 */
function countCategoryLinks(userId: string, categoryId: string): number {
  const row = getLibraryDatabase()
    .prepare(
      `SELECT COUNT(*) AS count FROM user_category_sites
       WHERE user_id = ? AND category_id = ?`,
    )
    .get(userId, categoryId) as LibraryRow | undefined
  return asInteger(row?.count)
}

/**
 * Inserts a category link at the given position.
 * @param userId - Signed-in user id.
 * @param categoryId - Category identifier.
 * @param siteId - Site UUID.
 * @param position - Zero-based order.
 * @returns Nothing.
 */
function insertLink(userId: string, categoryId: string, siteId: string, position: number): void {
  if (countCategoryLinks(userId, categoryId) >= MAX_SITES_PER_CATEGORY) {
    throw new Error('Home library category is full.')
  }
  getLibraryDatabase()
    .prepare(
      `INSERT INTO user_category_sites (user_id, category_id, site_id, position)
       VALUES (?, ?, ?, ?)`,
    )
    .run(userId, categoryId, siteId, position)
}

/**
 * Lists Home rail categories (always includes Websites).
 * @returns Ordered categories.
 */
export function listHomeLibraryCategories(): HomeLibraryCategoryDto[] {
  const rows = getLibraryDatabase()
    .prepare('SELECT id, position FROM categories ORDER BY position, id')
    .all() as LibraryRow[]
  const categories = rows.map((row) => ({
    id: asString(row.id),
    position: asInteger(row.position),
  }))
  if (categories.some((category) => category.id === WEBSITES_CATEGORY_ID)) {
    return categories
  }
  return [{ id: WEBSITES_CATEGORY_ID, position: 1 }, ...categories]
}

/**
 * Lists the current user's ordered websites for a category.
 * @param userId - Signed-in user id.
 * @param categoryId - Category identifier.
 * @returns Ordered apps.
 */
export function listHomeLibraryCategoryApps(
  userId: string,
  categoryId: string,
): HomeLibraryAppDto[] {
  const owner = requireUserId(userId)
  const category = requireCategoryId(categoryId)
  const rows = getLibraryDatabase()
    .prepare(
      `SELECT link.site_id AS id, link.position AS position, site.url AS url, site.name AS name
       FROM user_category_sites AS link
       INNER JOIN sites AS site ON site.id = link.site_id
       WHERE link.user_id = ? AND link.category_id = ?
       ORDER BY link.position, site.name`,
    )
    .all(owner, category) as LibraryRow[]
  return rows.map((row) => ({
    id: asString(row.id),
    categoryId: category,
    position: asInteger(row.position),
    url: asString(row.url),
    name: asString(row.name),
  }))
}

/**
 * Creates a new local site and appends it to the user's category list.
 * @param userId - Signed-in user id.
 * @param categoryId - Category identifier.
 * @param fields - New app fields.
 * @returns The category-facing app item.
 */
export function createHomeLibraryApp(
  userId: string,
  categoryId: string,
  fields: { url: string; name: string },
): HomeLibraryAppDto {
  const owner = requireUserId(userId)
  const category = requireCategoryId(categoryId)
  const url = normalizeSiteUrl(fields.url)
  if (!url) {
    throw new Error('INVALID_URL')
  }
  const name = fields.name.trim()
  if (!name || name.length > MAX_SITE_NAME_LENGTH) {
    throw new Error('INVALID_NAME')
  }
  if (findSiteByUrl(url)) {
    throw new Error('URL_EXISTS')
  }

  const siteId = randomUUID()
  const position = nextAppendPosition(owner, category)
  const database = getLibraryDatabase()
  const insertSite = database.prepare(
    'INSERT INTO sites (id, url, name, created_at) VALUES (?, ?, ?, ?)',
  )
  database.exec('BEGIN')
  try {
    insertSite.run(siteId, url, name, Date.now())
    insertLink(owner, category, siteId, position)
    database.exec('COMMIT')
  } catch (reason: unknown) {
    database.exec('ROLLBACK')
    throw reason
  }

  return { id: siteId, categoryId: category, position, url, name }
}

/**
 * Links an existing local site into the user's category list.
 * @param userId - Signed-in user id.
 * @param categoryId - Category identifier.
 * @param siteId - Existing site UUID.
 * @returns The linked app item.
 */
export function linkHomeLibrarySite(
  userId: string,
  categoryId: string,
  siteId: string,
): HomeLibraryAppDto {
  const owner = requireUserId(userId)
  const category = requireCategoryId(categoryId)
  const id = requireSiteId(siteId)
  const site = findSiteById(id)
  if (!site) {
    throw new Error(`Unknown site: ${id}`)
  }
  if (isAlreadyLinked(owner, category, id)) {
    throw new Error('Site is already in this category.')
  }
  const position = nextAppendPosition(owner, category)
  insertLink(owner, category, id, position)
  return { id, categoryId: category, position, url: site.url, name: site.name }
}

/**
 * Persists a category app order for the current user.
 * @param userId - Signed-in user id.
 * @param categoryId - Category identifier.
 * @param itemIds - Ordered site UUIDs.
 * @returns Nothing.
 */
export function saveHomeLibraryCategoryOrder(
  userId: string,
  categoryId: string,
  itemIds: string[],
): void {
  const owner = requireUserId(userId)
  const category = requireCategoryId(categoryId)
  const ids = itemIds.map((itemId) => requireSiteId(itemId)).slice(0, MAX_SITES_PER_CATEGORY)
  const database = getLibraryDatabase()
  const update = database.prepare(
    `UPDATE user_category_sites
     SET position = ?
     WHERE user_id = ? AND category_id = ? AND site_id = ?`,
  )
  database.exec('BEGIN')
  try {
    ids.forEach((siteId, position) => {
      update.run(position, owner, category, siteId)
    })
    database.exec('COMMIT')
  } catch (reason: unknown) {
    database.exec('ROLLBACK')
    throw reason
  }
}

/**
 * Removes an app from the user's category list without deleting the local site.
 * @param userId - Signed-in user id.
 * @param categoryId - Category identifier.
 * @param siteId - Site UUID to unlink.
 * @returns Remaining ordered apps in the category.
 */
export function removeHomeLibraryApp(
  userId: string,
  categoryId: string,
  siteId: string,
): HomeLibraryAppDto[] {
  const owner = requireUserId(userId)
  const category = requireCategoryId(categoryId)
  const id = requireSiteId(siteId)
  const database = getLibraryDatabase()
  database.exec('BEGIN')
  try {
    database
      .prepare(
        `DELETE FROM user_category_sites
         WHERE user_id = ? AND category_id = ? AND site_id = ?`,
      )
      .run(owner, category, id)
    const remaining = database
      .prepare(
        `SELECT site_id FROM user_category_sites
         WHERE user_id = ? AND category_id = ?
         ORDER BY position, site_id`,
      )
      .all(owner, category) as LibraryRow[]
    const update = database.prepare(
      `UPDATE user_category_sites
       SET position = ?
       WHERE user_id = ? AND category_id = ? AND site_id = ?`,
    )
    remaining.forEach((row, position) => {
      update.run(position, owner, category, asString(row.site_id))
    })
    database.exec('COMMIT')
  } catch (reason: unknown) {
    database.exec('ROLLBACK')
    throw reason
  }
  return listHomeLibraryCategoryApps(owner, category)
}

/**
 * Searches the local site catalog, excluding sites already in the user's category.
 * @param userId - Signed-in user id.
 * @param categoryId - Category identifier.
 * @param query - Search text.
 * @returns Up to 12 matching sites.
 */
export function searchHomeLibrarySites(
  userId: string,
  categoryId: string,
  query: string,
): HomeLibrarySiteHitDto[] {
  const owner = requireUserId(userId)
  const category = requireCategoryId(categoryId)
  const trimmed = query.trim()
  if (!trimmed || trimmed.length > MAX_SEARCH_QUERY_LENGTH) {
    return []
  }
  const like = `%${escapeLike(trimmed)}%`
  const rows = getLibraryDatabase()
    .prepare(
      `SELECT site.id AS id, site.url AS url, site.name AS name
       FROM sites AS site
       WHERE (site.url LIKE ? ESCAPE '\\' OR site.name LIKE ? ESCAPE '\\')
         AND site.id NOT IN (
           SELECT site_id FROM user_category_sites
           WHERE user_id = ? AND category_id = ?
         )
       ORDER BY site.name
       LIMIT ?`,
    )
    .all(like, like, owner, category, SEARCH_LIMIT) as LibraryRow[]
  return rows.map((row) => ({
    id: asString(row.id),
    url: asString(row.url),
    name: asString(row.name),
  }))
}
