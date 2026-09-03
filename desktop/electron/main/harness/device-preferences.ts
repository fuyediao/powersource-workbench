import { app } from 'electron'
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite'
import path from 'node:path'
import {
  isHarnessApprovalMode,
  sanitizeMcpServers,
  type HarnessDevicePreferences,
} from '../../shared/harness'

const DATABASE_NAME = 'harness-device.sqlite'
const PREFERENCE_ID = 1

let database: DatabaseSync | null = null

/** Returns the default device-local Harness preferences. */
function defaultPreferences(): HarnessDevicePreferences {
  return {
    approvalMode: 'askIfUnsafe',
    computerUseEnabled: false,
    webSearchEnabled: false,
    computerUseTarget: null,
    sidebarVisible: true,
    utilitySidebarVisible: false,
    utilitySidebarWidth: 360,
    workFolder: '',
    mcpServers: [],
  }
}

/** Opens the device-local Harness SQLite database and initializes its schema. */
function getDatabase(): DatabaseSync {
  if (database) return database
  database = new DatabaseSync(path.join(app.getPath('userData'), DATABASE_NAME))
  database.exec(`
    CREATE TABLE IF NOT EXISTS harness_preferences (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      value_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)
  return database
}

/** Converts an unknown payload into safe device-local preferences. */
export function sanitizeHarnessDevicePreferences(value: unknown): HarnessDevicePreferences {
  const fallback = defaultPreferences()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback
  const record = value as Record<string, unknown>
  const rawTarget = record.computerUseTarget
  const target = rawTarget && typeof rawTarget === 'object' && !Array.isArray(rawTarget)
    ? rawTarget as Record<string, unknown>
    : null
  return {
    approvalMode: isHarnessApprovalMode(record.approvalMode)
      ? record.approvalMode
      : fallback.approvalMode,
    computerUseEnabled: record.computerUseEnabled === true,
    webSearchEnabled: record.webSearchEnabled === true,
    computerUseTarget:
      target &&
      typeof target.id === 'string' &&
      typeof target.label === 'string' &&
      (target.kind === 'display' || target.kind === 'window')
        ? { id: target.id, label: target.label, kind: target.kind }
        : null,
    sidebarVisible: record.sidebarVisible !== false,
    utilitySidebarVisible: record.utilitySidebarVisible === true,
    utilitySidebarWidth:
      typeof record.utilitySidebarWidth === 'number' && Number.isFinite(record.utilitySidebarWidth)
        ? Math.min(720, Math.max(280, Math.round(record.utilitySidebarWidth)))
        : fallback.utilitySidebarWidth,
    workFolder: typeof record.workFolder === 'string' ? record.workFolder.trim() : '',
    mcpServers: sanitizeMcpServers(record.mcpServers),
  }
}

/** Reads preferences, optionally importing a legacy renderer snapshot once. */
export function readHarnessDevicePreferences(legacyValue?: unknown): HarnessDevicePreferences {
  const row = getDatabase()
    .prepare('SELECT value_json FROM harness_preferences WHERE id = ?')
    .get(PREFERENCE_ID) as Record<string, SQLOutputValue> | undefined
  if (typeof row?.value_json === 'string') {
    try {
      return sanitizeHarnessDevicePreferences(JSON.parse(row.value_json) as unknown)
    } catch {
      return defaultPreferences()
    }
  }
  const imported = sanitizeHarnessDevicePreferences(legacyValue)
  writeHarnessDevicePreferences(imported)
  return imported
}

/** Replaces the complete device-local Harness preference document. */
export function writeHarnessDevicePreferences(value: unknown): HarnessDevicePreferences {
  const preferences = sanitizeHarnessDevicePreferences(value)
  getDatabase().prepare(`
    INSERT INTO harness_preferences (id, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = excluded.updated_at
  `).run(PREFERENCE_ID, JSON.stringify(preferences), Date.now())
  return preferences
}
