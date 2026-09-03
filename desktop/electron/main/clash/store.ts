import { app } from 'electron'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import type { ClashProfilesIndex, ClashVergeStore } from './types'

const DEFAULT_VERGE: ClashVergeStore = {
  language: 'en',
  theme_mode: 'system',
  enable_system_proxy: false,
  clash_core: 'verge-mihomo',
  verge_mixed_port: 17890,
  traffic_graph: true,
  enable_memory_usage: true,
  enable_group_icon: true,
  collapse_navbar: false,
  auto_close_connection: false,
}

/**
 * Root directory for Clash profiles, runtime YAML, and logs.
 * @returns Absolute userData/clash path.
 */
export function clashDataDir(): string {
  return path.join(app.getPath('userData'), 'clash')
}

/**
 * Ensures Clash data directories exist.
 * @returns Paths used by the host.
 */
export function ensureClashDirs(): {
  root: string
  profiles: string
  logs: string
  runtimeFile: string
  secretFile: string
  indexFile: string
  vergeFile: string
} {
  const root = clashDataDir()
  const profiles = path.join(root, 'profiles')
  const logs = path.join(root, 'logs')
  fs.mkdirSync(profiles, { recursive: true })
  fs.mkdirSync(logs, { recursive: true })
  return {
    root,
    profiles,
    logs,
    runtimeFile: path.join(root, 'runtime.yaml'),
    secretFile: path.join(root, 'secret.txt'),
    indexFile: path.join(root, 'profiles.json'),
    vergeFile: path.join(root, 'verge.json'),
  }
}

/**
 * Mihomo controller IPC path (unix socket or Windows named pipe).
 * Clash Verge talks to the core this way instead of a TCP controller port.
 * @returns Socket or pipe path.
 */
export function controllerSocketPath(): string {
  if (process.platform === 'win32') {
    return String.raw`\\.\pipe\workbench-verge-mihomo`
  }
  return path.join(clashDataDir(), 'verge-mihomo.sock')
}

/**
 * Reads or creates the Mihomo API secret.
 * @returns Secret string.
 */
export function readClashSecret(): string {
  const { secretFile } = ensureClashDirs()
  if (fs.existsSync(secretFile)) {
    const existing = fs.readFileSync(secretFile, 'utf8').trim()
    if (existing.length > 0) {
      return existing
    }
  }
  const secret = randomBytes(16).toString('hex')
  fs.writeFileSync(secretFile, `${secret}\n`, 'utf8')
  return secret
}

/**
 * Loads the profiles index, creating an empty one when missing.
 * @returns Profiles index.
 */
export function loadProfilesIndex(): ClashProfilesIndex {
  const { indexFile } = ensureClashDirs()
  if (!fs.existsSync(indexFile)) {
    const empty: ClashProfilesIndex = { items: [] }
    fs.writeFileSync(indexFile, `${JSON.stringify(empty, null, 2)}\n`, 'utf8')
    return empty
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(indexFile, 'utf8')) as ClashProfilesIndex
    return {
      current: typeof parsed.current === 'string' ? parsed.current : undefined,
      items: Array.isArray(parsed.items) ? parsed.items : [],
    }
  } catch {
    return { items: [] }
  }
}

/**
 * Writes the profiles index.
 * @param index - Profiles index.
 */
export function saveProfilesIndex(index: ClashProfilesIndex): void {
  const { indexFile } = ensureClashDirs()
  fs.writeFileSync(indexFile, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
}

/**
 * Loads persisted Verge settings.
 * @returns Store with defaults applied.
 */
export function loadVergeStore(): ClashVergeStore {
  const { vergeFile } = ensureClashDirs()
  if (!fs.existsSync(vergeFile)) {
    return { ...DEFAULT_VERGE }
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(vergeFile, 'utf8')) as ClashVergeStore
    return { ...DEFAULT_VERGE, ...parsed }
  } catch {
    return { ...DEFAULT_VERGE }
  }
}

/**
 * Merges and writes Verge settings.
 * @param patch - Partial settings (unknown keys are stored).
 * @returns Updated store.
 */
export function patchVergeStore(patch: Record<string, unknown>): ClashVergeStore {
  const next = { ...loadVergeStore(), ...patch } as ClashVergeStore
  const { vergeFile } = ensureClashDirs()
  fs.writeFileSync(vergeFile, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return next
}

/**
 * Absolute path for a profile YAML file.
 * @param fileName - File name under profiles/.
 * @returns Absolute path.
 */
export function profilePath(fileName: string): string {
  return path.join(ensureClashDirs().profiles, fileName)
}
