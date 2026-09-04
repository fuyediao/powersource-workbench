/**
 * Ask and Harness conversation transcripts — machine SQLite, not Supabase.
 */

import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite'
import { app } from 'electron'
import {
  parseChatHistoryKind,
  type ChatHistoryCreateInput,
  type ChatHistoryKind,
  type ChatHistoryRowDto,
  type ChatHistoryUpdateInput,
} from '../shared/chat-history'

const MAX_USER_ID_LENGTH = 64
const MAX_QUERY_LENGTH = 8000
const MAX_JSON_BYTES = 8 * 1024 * 1024
const MAX_SEARCH_RESULTS = 20

type StoreRow = Record<string, SQLOutputValue>

let historyDatabase: DatabaseSync | null = null

/**
 * Returns the lazily opened chat-history database.
 * @returns Initialized SQLite database.
 */
function getHistoryDatabase(): DatabaseSync {
  if (historyDatabase) {
    return historyDatabase
  }
  const databasePath = path.join(app.getPath('userData'), 'chat-history.sqlite')
  const database = new DatabaseSync(databasePath)
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      assistant_kind TEXT NOT NULL,
      query TEXT NOT NULL,
      messages_json TEXT NOT NULL,
      harness_thread_id TEXT,
      harness_items_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS conversations_user_kind_updated
      ON conversations (user_id, assistant_kind, updated_at DESC);
  `)
  historyDatabase = database
  return database
}

/**
 * Validates an auth user id received over IPC.
 * @param value - Candidate id.
 * @returns Trimmed user id.
 */
function requireUserId(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_USER_ID_LENGTH) {
    throw new Error('Chat history user id is invalid.')
  }
  return trimmed
}

/**
 * Validates a row id received over IPC.
 * @param value - Candidate id.
 * @returns Trimmed id.
 */
function requireRowId(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 80) {
    throw new Error('Chat history id is invalid.')
  }
  return trimmed
}

/**
 * Serializes a JSON-safe array for SQLite.
 * @param value - Array payload.
 * @param label - Field label used in errors.
 * @returns JSON string.
 */
function stringifyJsonArray(value: unknown, label: string): string {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`)
  }
  const encoded = JSON.stringify(value)
  if (Buffer.byteLength(encoded, 'utf8') > MAX_JSON_BYTES) {
    throw new Error(`${label} is too large.`)
  }
  return encoded
}

/**
 * Parses a JSON array column.
 * @param raw - Stored text.
 * @returns Array, or empty when malformed.
 */
function parseJsonArray(raw: unknown): unknown[] {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Maps a SQLite row to a DTO.
 * @param row - Database row.
 * @returns History DTO, or null when required columns are missing.
 */
function mapRow(row: StoreRow): ChatHistoryRowDto | null {
  if (typeof row.id !== 'string' || typeof row.user_id !== 'string') {
    return null
  }
  const itemsRaw = row.harness_items_json
  const items = typeof itemsRaw === 'string' && itemsRaw.trim() ? parseJsonArray(itemsRaw) : null
  return {
    id: row.id,
    userId: row.user_id,
    query: typeof row.query === 'string' ? row.query : '',
    messages: parseJsonArray(row.messages_json),
    assistantKind: parseChatHistoryKind(row.assistant_kind),
    harnessThreadId: typeof row.harness_thread_id === 'string' ? row.harness_thread_id : null,
    harnessItems: items && items.length > 0 ? items : null,
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date(0).toISOString(),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : new Date(0).toISOString(),
  }
}

/**
 * Lists conversations for one signed-in user and assistant kind.
 * @param userId - Auth user id.
 * @param kind - Ask or Harness.
 * @returns Newest-first rows.
 */
export function listChatHistory(userId: string, kind: ChatHistoryKind): ChatHistoryRowDto[] {
  const uid = requireUserId(userId)
  const rows = getHistoryDatabase()
    .prepare(
      `SELECT id, user_id, assistant_kind, query, messages_json, harness_thread_id,
              harness_items_json, created_at, updated_at
       FROM conversations
       WHERE user_id = ? AND assistant_kind = ?
       ORDER BY updated_at DESC`,
    )
    .all(uid, kind) as StoreRow[]
  return rows.flatMap((row) => {
    const mapped = mapRow(row)
    return mapped ? [mapped] : []
  })
}

/**
 * Inserts one conversation.
 * @param userId - Auth user id.
 * @param input - Create payload.
 * @returns Stored row.
 */
export function addChatHistory(userId: string, input: ChatHistoryCreateInput): ChatHistoryRowDto {
  const uid = requireUserId(userId)
  const now = new Date().toISOString()
  const id = input.id?.trim() ? requireRowId(input.id) : randomUUID()
  const query = input.query.trim().slice(0, MAX_QUERY_LENGTH) || 'Conversation'
  const kind = parseChatHistoryKind(input.assistantKind)
  const createdAt = input.createdAt?.trim() || now
  const updatedAt = input.updatedAt?.trim() || now
  const messagesJson = stringifyJsonArray(input.messages, 'Messages')
  const itemsJson =
    input.harnessItems && input.harnessItems.length > 0
      ? stringifyJsonArray(input.harnessItems, 'Harness items')
      : null
  const threadId = input.harnessThreadId?.trim() || null
  getHistoryDatabase()
    .prepare(
      `INSERT INTO conversations (
         id, user_id, assistant_kind, query, messages_json, harness_thread_id,
         harness_items_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         query = excluded.query,
         messages_json = excluded.messages_json,
         harness_thread_id = excluded.harness_thread_id,
         harness_items_json = excluded.harness_items_json,
         updated_at = excluded.updated_at
       WHERE conversations.user_id = excluded.user_id`,
    )
    .run(id, uid, kind, query, messagesJson, threadId, itemsJson, createdAt, updatedAt)
  const stored = getChatHistoryRow(uid, id)
  if (!stored) {
    throw new Error('Chat history row was not saved.')
  }
  return stored
}

/**
 * Updates one conversation owned by the user.
 * @param userId - Auth user id.
 * @param historyId - Row id.
 * @param updates - Patch.
 * @returns Updated row, or null when missing.
 */
export function updateChatHistory(
  userId: string,
  historyId: string,
  updates: ChatHistoryUpdateInput,
): ChatHistoryRowDto | null {
  const uid = requireUserId(userId)
  const id = requireRowId(historyId)
  const existing = getChatHistoryRow(uid, id)
  if (!existing) {
    return null
  }
  const query =
    updates.query !== undefined ? updates.query.trim().slice(0, MAX_QUERY_LENGTH) || existing.query : existing.query
  const messagesJson =
    updates.messages !== undefined ? stringifyJsonArray(updates.messages, 'Messages') : JSON.stringify(existing.messages)
  const threadId =
    updates.harnessThreadId !== undefined ? updates.harnessThreadId?.trim() || null : existing.harnessThreadId
  let itemsJson: string | null
  if (updates.harnessItems !== undefined) {
    itemsJson =
      updates.harnessItems && updates.harnessItems.length > 0
        ? stringifyJsonArray(updates.harnessItems, 'Harness items')
        : null
  } else {
    itemsJson = existing.harnessItems ? JSON.stringify(existing.harnessItems) : null
  }
  const updatedAt = new Date().toISOString()
  getHistoryDatabase()
    .prepare(
      `UPDATE conversations
       SET query = ?, messages_json = ?, harness_thread_id = ?, harness_items_json = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .run(query, messagesJson, threadId, itemsJson, updatedAt, id, uid)
  return getChatHistoryRow(uid, id)
}

/**
 * Deletes one conversation owned by the user.
 * @param userId - Auth user id.
 * @param historyId - Row id.
 * @returns True when a row was removed.
 */
export function removeChatHistory(userId: string, historyId: string): boolean {
  const uid = requireUserId(userId)
  const id = requireRowId(historyId)
  const result = getHistoryDatabase()
    .prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?')
    .run(id, uid)
  return Number(result.changes) > 0
}

/**
 * Searches this user's Harness transcripts on this machine.
 * @param userId - Auth user id.
 * @param query - Optional case-insensitive substring.
 * @param limit - Maximum results (1–20).
 * @returns Matching session summaries.
 */
export function searchHarnessSessions(
  userId: string,
  query: string,
  limit: number,
): Array<{ id: string; query: string; created_at: string; harness_items: unknown }> {
  const uid = requireUserId(userId)
  const cap = Number.isFinite(limit) ? Math.min(MAX_SEARCH_RESULTS, Math.max(1, Math.floor(limit))) : 10
  const term = query.trim().toLowerCase()
  const rows = listChatHistory(uid, 'agent')
  const out: Array<{ id: string; query: string; created_at: string; harness_items: unknown }> = []
  for (const row of rows) {
    const haystack = `${row.query}\n${JSON.stringify(row.messages)}\n${JSON.stringify(row.harnessItems ?? [])}`.toLowerCase()
    if (term && !haystack.includes(term)) {
      continue
    }
    out.push({
      id: row.id,
      query: row.query,
      created_at: row.createdAt,
      harness_items: row.harnessItems,
    })
    if (out.length >= cap) {
      break
    }
  }
  return out
}

/**
 * Loads one row owned by the user.
 * @param userId - Auth user id.
 * @param historyId - Row id.
 * @returns DTO, or null.
 */
function getChatHistoryRow(userId: string, historyId: string): ChatHistoryRowDto | null {
  const row = getHistoryDatabase()
    .prepare(
      `SELECT id, user_id, assistant_kind, query, messages_json, harness_thread_id,
              harness_items_json, created_at, updated_at
       FROM conversations WHERE id = ? AND user_id = ?`,
    )
    .get(historyId, userId) as StoreRow | undefined
  return row ? mapRow(row) : null
}
