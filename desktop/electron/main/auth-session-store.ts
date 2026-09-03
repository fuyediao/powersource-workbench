/**
 * Signed-in session cache for this machine — main-process SQLite, not renderer
 * localStorage (the login window is destroyed after sign-in and can drop writes).
 */

import { app, safeStorage } from 'electron'
import path from 'node:path'
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite'
import type { StoredAuthSessionPayload } from '../shared/ipc'

const MAX_TOKEN_LENGTH = 16 * 1024
const MAX_USERNAME_LENGTH = 64

/** Tokens needed to restore a Workbench session after restart. */
export type StoredAuthSessionRecord = StoredAuthSessionPayload

type StoreRow = Record<string, SQLOutputValue>

let sessionDatabase: DatabaseSync | null = null

/**
 * Returns the lazily opened auth-session database.
 * @returns Initialized SQLite database.
 */
function getSessionDatabase(): DatabaseSync {
  if (sessionDatabase) {
    return sessionDatabase
  }

  const databasePath = path.join(app.getPath('userData'), 'auth-session.sqlite')
  const database = new DatabaseSync(databasePath)
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS auth_session (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      sealed INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_prefs (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_username TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO auth_prefs (id, last_username, updated_at) VALUES (1, '', 0);
  `)
  sessionDatabase = database
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
 * Seals a secret with OS keychain encryption when Chromium safeStorage is ready.
 * @param plain - Token text.
 * @returns Ciphertext or plaintext, plus whether it was sealed.
 */
function sealSecret(plain: string): { value: string; sealed: boolean } {
  if (plain.length === 0 || plain.length > MAX_TOKEN_LENGTH) {
    throw new Error('Auth session token is invalid.')
  }
  if (safeStorage.isEncryptionAvailable()) {
    return {
      value: safeStorage.encryptString(plain).toString('base64'),
      sealed: true,
    }
  }
  return { value: plain, sealed: false }
}

/**
 * Opens a secret stored by {@link sealSecret}.
 * @param value - Stored cell.
 * @param sealed - Whether the cell is encrypted.
 * @returns Plain token, or empty when decryption fails.
 */
function openSecret(value: string, sealed: boolean): string {
  if (!sealed) {
    return value
  }
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  } catch {
    return ''
  }
}

/**
 * Loads the cached session for this machine.
 * @returns Stored tokens, or null when none exist / cannot be opened.
 */
export function getStoredAuthSession(): StoredAuthSessionRecord | null {
  const row = getSessionDatabase()
    .prepare(
      'SELECT access_token, refresh_token, expires_at, sealed FROM auth_session WHERE id = 1',
    )
    .get() as StoreRow | undefined
  if (!row) {
    return null
  }
  const sealed = asInteger(row.sealed) === 1
  const accessToken = openSecret(asString(row.access_token), sealed)
  const refreshToken = openSecret(asString(row.refresh_token), sealed)
  const expiresAt = asInteger(row.expires_at)
  if (!accessToken || !refreshToken || expiresAt <= 0) {
    return null
  }
  return { accessToken, expiresAt, refreshToken }
}

/**
 * Writes the cached session for this machine.
 * @param session - Tokens to keep across restarts.
 * @returns Nothing.
 */
export function setStoredAuthSession(session: StoredAuthSessionRecord): void {
  if (!Number.isFinite(session.expiresAt) || session.expiresAt <= 0) {
    throw new Error('Auth session expiry is invalid.')
  }
  const access = sealSecret(session.accessToken)
  const refresh = sealSecret(session.refreshToken)
  const sealed = access.sealed && refresh.sealed ? 1 : 0
  getSessionDatabase()
    .prepare(
      `INSERT INTO auth_session (id, access_token, refresh_token, expires_at, sealed, updated_at)
       VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         access_token = excluded.access_token,
         refresh_token = excluded.refresh_token,
         expires_at = excluded.expires_at,
         sealed = excluded.sealed,
         updated_at = excluded.updated_at`,
    )
    .run(access.value, refresh.value, Math.round(session.expiresAt), sealed, Date.now())
}

/**
 * Clears cached tokens. Last username is kept for the login form.
 * @returns Nothing.
 */
export function clearStoredAuthSession(): void {
  getSessionDatabase().prepare('DELETE FROM auth_session WHERE id = 1').run()
}

/**
 * Loads the last successful username for the login form.
 * @returns Username, or an empty string.
 */
export function getLastUsername(): string {
  const row = getSessionDatabase()
    .prepare('SELECT last_username FROM auth_prefs WHERE id = 1')
    .get() as StoreRow | undefined
  return asString(row?.last_username)
}

/**
 * Remembers the last successful username.
 * @param username - Workbench username.
 * @returns Nothing.
 */
export function setLastUsername(username: string): void {
  const trimmed = username.trim()
  if (trimmed.length > MAX_USERNAME_LENGTH) {
    throw new Error('Auth username is too long.')
  }
  getSessionDatabase()
    .prepare(
      `INSERT INTO auth_prefs (id, last_username, updated_at)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         last_username = excluded.last_username,
         updated_at = excluded.updated_at`,
    )
    .run(trimmed, Date.now())
}
