import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite'
import { app } from 'electron'
import type { LegacyOfficeWorkspaceFile, OfficeWorkspaceKind } from '../shared/ipc'

type LegacyOfficeWorkspaceRow = Record<string, SQLOutputValue>

/**
 * Resolves the retired Univer-era workspace database path
 * (`{userData}/office-workspace.sqlite`).
 * @returns Absolute database path.
 */
function legacyDatabasePath(): string {
  return path.join(app.getPath('userData'), 'office-workspace.sqlite')
}

/**
 * Parses a stored Univer snapshot, tolerating rows corrupted by a previous
 * crash (skipped rather than thrown, since this is a best-effort export).
 * @param value - JSON text stored in SQLite.
 * @returns Parsed snapshot record, or null when invalid.
 */
function parseLegacySnapshot(value: SQLOutputValue): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(String(value))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Reads every row from the retired local Office workspace database, once,
 * so the renderer can upload each as a personal `office_files` Supabase row.
 * Never writes to the database; {@link retireLegacyOfficeWorkspace} deletes
 * it after a successful export.
 * @returns Legacy rows, or an empty array when the database never existed.
 */
export function exportLegacyOfficeWorkspaceFiles(): LegacyOfficeWorkspaceFile[] {
  const databasePath = legacyDatabasePath()
  if (!fs.existsSync(databasePath)) {
    return []
  }
  const database = new DatabaseSync(databasePath, { readOnly: true })
  try {
    const rows = database
      .prepare('SELECT id, kind, name, snapshot_json, created_at, updated_at FROM office_files')
      .all() as LegacyOfficeWorkspaceRow[]
    const files: LegacyOfficeWorkspaceFile[] = []
    for (const row of rows) {
      const snapshot = parseLegacySnapshot(row.snapshot_json)
      if (!snapshot) {
        continue
      }
      files.push({
        id: String(row.id),
        kind: String(row.kind) as OfficeWorkspaceKind,
        name: String(row.name),
        snapshot,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
      })
    }
    return files
  } finally {
    database.close()
  }
}

/**
 * Deletes the retired local Office workspace database (and its WAL/SHM
 * siblings) after the renderer has migrated every row to Supabase.
 * @returns Nothing.
 */
export function retireLegacyOfficeWorkspace(): void {
  const databasePath = legacyDatabasePath()
  for (const candidate of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    if (fs.existsSync(candidate)) {
      fs.rmSync(candidate, { force: true })
    }
  }
}
