import { DatabaseSync, type SQLOutputValue } from 'node:sqlite'
import path from 'node:path'
import { app } from 'electron'

const MAX_APP_IDS = 64
const MAX_APP_ID_LENGTH = 128
const MAX_USER_ID_LENGTH = 64

type HomeAppOrderRow = Record<string, SQLOutputValue>

let orderDatabase: DatabaseSync | null = null

/**
 * Returns the lazily opened Home Apps order database.
 * @returns Initialized SQLite database.
 */
function getOrderDatabase(): DatabaseSync {
  if (orderDatabase) {
    return orderDatabase
  }

  const databasePath = path.join(app.getPath('userData'), 'home-app-order.sqlite')
  const database = new DatabaseSync(databasePath)
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS home_app_order (
      user_id TEXT PRIMARY KEY,
      app_ids_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)
  orderDatabase = database
  return database
}

/**
 * Parses a stored Home Apps id list.
 * @param value - JSON text from SQLite.
 * @returns Sanitized app ids.
 */
function parseAppIds(value: SQLOutputValue): string[] {
  if (typeof value !== 'string' || value.length === 0) {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) {
      return []
    }
    const ids: string[] = []
    const seen = new Set<string>()
    for (const item of parsed) {
      if (typeof item !== 'string') {
        continue
      }
      const id = item.trim()
      if (id.length === 0 || id.length > MAX_APP_ID_LENGTH || seen.has(id)) {
        continue
      }
      seen.add(id)
      ids.push(id)
      if (ids.length >= MAX_APP_IDS) {
        break
      }
    }
    return ids
  } catch {
    return []
  }
}

/**
 * Loads the persisted Home Apps tile order for one signed-in user.
 * @param userId - Auth user id.
 * @returns Saved app ids, or an empty list when none exist.
 */
export function getHomeAppOrder(userId: string): string[] {
  const row = getOrderDatabase()
    .prepare('SELECT app_ids_json FROM home_app_order WHERE user_id = ?')
    .get(userId) as HomeAppOrderRow | undefined
  if (!row) {
    return []
  }
  return parseAppIds(row.app_ids_json)
}

/**
 * Saves the Home Apps tile order for one signed-in user.
 * @param userId - Auth user id.
 * @param appIds - Ordered feature tile ids.
 * @returns Nothing.
 */
export function setHomeAppOrder(userId: string, appIds: string[]): void {
  if (userId.length === 0 || userId.length > MAX_USER_ID_LENGTH) {
    throw new Error('Home app order user id is invalid.')
  }
  const sanitized = parseAppIds(JSON.stringify(appIds))
  getOrderDatabase()
    .prepare(
      `INSERT INTO home_app_order (user_id, app_ids_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         app_ids_json = excluded.app_ids_json,
         updated_at = excluded.updated_at`,
    )
    .run(userId, JSON.stringify(sanitized), Date.now())
}
