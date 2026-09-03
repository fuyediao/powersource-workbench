/**
 * Desktop-only AI model allowlist (Settings → AI → Models) — device SQLite.
 * Stores explicit enable/disable overrides only; models with no row fall back
 * to the renderer's default-enabled set (see `src/utils/settings/ai-model-allowlist.ts`).
 * Website `GET /ai/models?client=web` and workbench-web pickers never read this file.
 */

import { DatabaseSync, type SQLOutputValue } from 'node:sqlite'
import path from 'node:path'
import { app } from 'electron'

const MAX_PROVIDER_LENGTH = 64
const MAX_MODEL_ID_LENGTH = 128

/** One explicit enable/disable override row. */
export interface AiModelAllowlistRow {
  provider: string
  modelId: string
  enabled: boolean
}

type AiModelAllowlistSqlRow = Record<string, SQLOutputValue>

let allowlistDatabase: DatabaseSync | null = null

/**
 * Returns the lazily opened AI model allowlist database.
 * @returns Initialized SQLite database.
 */
function getAllowlistDatabase(): DatabaseSync {
  if (allowlistDatabase) {
    return allowlistDatabase
  }

  const databasePath = path.join(app.getPath('userData'), 'ai-models.sqlite')
  const database = new DatabaseSync(databasePath)
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS enabled_models (
      provider TEXT NOT NULL,
      model_id TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (provider, model_id)
    );
  `)
  allowlistDatabase = database
  return database
}

/**
 * Validates a provider or model id received over IPC.
 * @param value - Candidate id.
 * @param label - Field label used in errors.
 * @param maxLength - Maximum accepted length.
 * @returns Trimmed id.
 */
function requireId(value: string, label: string, maxLength: number): string {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    throw new Error(`AI model allowlist ${label} is invalid.`)
  }
  return trimmed
}

/**
 * Lists every explicit enable/disable override.
 * @returns All stored rows (does not include the whole catalog).
 */
export function listAiModelAllowlist(): AiModelAllowlistRow[] {
  const rows = getAllowlistDatabase()
    .prepare('SELECT provider, model_id, enabled FROM enabled_models')
    .all() as AiModelAllowlistSqlRow[]
  return rows
    .filter((row) => typeof row.provider === 'string' && typeof row.model_id === 'string')
    .map((row) => ({
      provider: row.provider as string,
      modelId: row.model_id as string,
      enabled: Number(row.enabled) !== 0,
    }))
}

/**
 * Reads one explicit override.
 * @param provider - Catalog provider id.
 * @param modelId - Vendor or local runtime model id.
 * @returns Stored enabled flag, or null when no override exists (caller applies the default).
 */
export function getAiModelAllowlistOverride(provider: string, modelId: string): boolean | null {
  const row = getAllowlistDatabase()
    .prepare('SELECT enabled FROM enabled_models WHERE provider = ? AND model_id = ?')
    .get(
      requireId(provider, 'provider', MAX_PROVIDER_LENGTH),
      requireId(modelId, 'model id', MAX_MODEL_ID_LENGTH),
    ) as AiModelAllowlistSqlRow | undefined
  if (!row) {
    return null
  }
  return Number(row.enabled) !== 0
}

/**
 * Upserts one explicit enable/disable override.
 * @param provider - Catalog provider id.
 * @param modelId - Vendor or local runtime model id.
 * @param enabled - Whether the model should appear in desktop pickers.
 * @returns Nothing.
 */
export function setAiModelAllowlistOverride(
  provider: string,
  modelId: string,
  enabled: boolean,
): void {
  const providerId = requireId(provider, 'provider', MAX_PROVIDER_LENGTH)
  const modelIdValue = requireId(modelId, 'model id', MAX_MODEL_ID_LENGTH)
  getAllowlistDatabase()
    .prepare(
      `INSERT INTO enabled_models (provider, model_id, enabled, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(provider, model_id) DO UPDATE SET
         enabled = excluded.enabled,
         updated_at = excluded.updated_at`,
    )
    .run(providerId, modelIdValue, enabled ? 1 : 0, Date.now())
}
