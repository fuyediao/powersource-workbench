/**
 * Local OA/ERP credentials (Settings autofill) — machine SQLite, not Supabase.
 */

import { DatabaseSync, type SQLOutputValue } from 'node:sqlite'
import path from 'node:path'
import { app } from 'electron'

const MAX_USER_ID_LENGTH = 64
const MAX_FIELD_LENGTH = 512

/** Persisted OA/ERP usernames and passwords for one signed-in user. */
export interface OaErpCredentialsRecord {
  oaUsername: string
  oaPassword: string
  erpUsername: string
  erpPassword: string
}

type OaErpCredentialsRow = Record<string, SQLOutputValue>

let credentialsDatabase: DatabaseSync | null = null

/**
 * Returns the lazily opened OA/ERP credentials database.
 * @returns Initialized SQLite database.
 */
function getCredentialsDatabase(): DatabaseSync {
  if (credentialsDatabase) {
    return credentialsDatabase
  }

  const databasePath = path.join(app.getPath('userData'), 'oa-erp-credentials.sqlite')
  const database = new DatabaseSync(databasePath)
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS oa_erp_credentials (
      user_id TEXT PRIMARY KEY,
      oa_username TEXT NOT NULL DEFAULT '',
      oa_password TEXT NOT NULL DEFAULT '',
      erp_username TEXT NOT NULL DEFAULT '',
      erp_password TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
    );
  `)
  credentialsDatabase = database
  return database
}

/**
 * Validates a signed-in user id for SQLite storage.
 * @param userId - Auth user id.
 * @returns Trimmed user id.
 */
function requireUserId(userId: string): string {
  const trimmed = userId.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_USER_ID_LENGTH) {
    throw new Error('OA/ERP credentials user id is invalid.')
  }
  return trimmed
}

/**
 * Clamps a credential text field.
 * @param value - Raw field value.
 * @param label - Field label for errors.
 * @returns Trimmed value (passwords keep internal spaces; only ends trimmed for usernames via callers).
 */
function requireField(value: string, label: string): string {
  if (value.length > MAX_FIELD_LENGTH) {
    throw new Error(`OA/ERP ${label} is too long.`)
  }
  return value
}

/**
 * Loads OA/ERP credentials for one signed-in user from local SQLite.
 * @param userId - Auth user id.
 * @returns Stored record, or null when none exist.
 */
export function getOaErpCredentials(userId: string): OaErpCredentialsRecord | null {
  const row = getCredentialsDatabase()
    .prepare(
      `SELECT oa_username, oa_password, erp_username, erp_password
       FROM oa_erp_credentials WHERE user_id = ?`,
    )
    .get(requireUserId(userId)) as OaErpCredentialsRow | undefined
  if (!row) {
    return null
  }
  return {
    oaUsername: typeof row.oa_username === 'string' ? row.oa_username : '',
    oaPassword: typeof row.oa_password === 'string' ? row.oa_password : '',
    erpUsername: typeof row.erp_username === 'string' ? row.erp_username : '',
    erpPassword: typeof row.erp_password === 'string' ? row.erp_password : '',
  }
}

/**
 * Upserts OA/ERP credentials for one signed-in user in local SQLite.
 * @param userId - Auth user id.
 * @param record - Fields to persist.
 * @returns Nothing.
 */
export function setOaErpCredentials(userId: string, record: OaErpCredentialsRecord): void {
  const id = requireUserId(userId)
  getCredentialsDatabase()
    .prepare(
      `INSERT INTO oa_erp_credentials (
         user_id, oa_username, oa_password, erp_username, erp_password, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         oa_username = excluded.oa_username,
         oa_password = excluded.oa_password,
         erp_username = excluded.erp_username,
         erp_password = excluded.erp_password,
         updated_at = excluded.updated_at`,
    )
    .run(
      id,
      requireField(record.oaUsername, 'OA username'),
      requireField(record.oaPassword, 'OA password'),
      requireField(record.erpUsername, 'ERP username'),
      requireField(record.erpPassword, 'ERP password'),
      Date.now(),
    )
}
