import { DatabaseSync, type SQLOutputValue } from 'node:sqlite'
import path from 'node:path'
import { app } from 'electron'

const MAX_USER_ID_LENGTH = 64
const MAX_LAYOUT_JSON_LENGTH = 64 * 1024

type OpportunityBoardLayoutRow = Record<string, SQLOutputValue>

let layoutDatabase: DatabaseSync | null = null

/**
 * Returns the lazily opened Opportunities board layout database.
 * @returns Initialized SQLite database.
 */
function getLayoutDatabase(): DatabaseSync {
  if (layoutDatabase) {
    return layoutDatabase
  }

  const databasePath = path.join(
    app.getPath('userData'),
    'opportunity-board-layout.sqlite',
  )
  const database = new DatabaseSync(databasePath)
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS opportunity_board_layout (
      user_id TEXT PRIMARY KEY,
      layout_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)
  layoutDatabase = database
  return database
}

/**
 * Loads the persisted Freeform board layout JSON for one signed-in user.
 * @param userId - Auth user id.
 * @returns Layout JSON text, or null when none exist.
 */
export function getOpportunityBoardLayout(userId: string): string | null {
  const row = getLayoutDatabase()
    .prepare(
      'SELECT layout_json FROM opportunity_board_layout WHERE user_id = ?',
    )
    .get(userId) as OpportunityBoardLayoutRow | undefined
  const raw = row?.layout_json
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

/**
 * Saves the Freeform board layout JSON for one signed-in user.
 * @param userId - Auth user id.
 * @param layoutJson - Serialized layout payload.
 * @returns Nothing.
 */
export function setOpportunityBoardLayout(userId: string, layoutJson: string): void {
  if (userId.length === 0 || userId.length > MAX_USER_ID_LENGTH) {
    throw new Error('Opportunity board layout user id is invalid.')
  }
  if (layoutJson.length === 0 || layoutJson.length > MAX_LAYOUT_JSON_LENGTH) {
    throw new Error('Opportunity board layout payload is invalid.')
  }
  getLayoutDatabase()
    .prepare(
      `INSERT INTO opportunity_board_layout (user_id, layout_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         layout_json = excluded.layout_json,
         updated_at = excluded.updated_at`,
    )
    .run(userId, layoutJson, Date.now())
}

/**
 * Deletes the saved Freeform board layout for one signed-in user.
 * @param userId - Auth user id.
 * @returns Nothing.
 */
export function clearOpportunityBoardLayout(userId: string): void {
  if (userId.length === 0 || userId.length > MAX_USER_ID_LENGTH) {
    throw new Error('Opportunity board layout user id is invalid.')
  }
  getLayoutDatabase()
    .prepare('DELETE FROM opportunity_board_layout WHERE user_id = ?')
    .run(userId)
}
