import axios from 'axios'
import { resolveSupabasePublishableKey, resolveSupabaseUrl, resolveWorkbenchApiUrl } from '@/config/deployment-urls'

const legacySessionStorageKey = 'powersource-workbench-supabase-session'
const supabaseUrl = resolveSupabaseUrl()
const publishableKey = resolveSupabasePublishableKey()

export interface StoredAuthSession {
  accessToken: string
  expiresAt: number
  refreshToken: string
}

const jsonHeaders = {
  'Content-Type': 'application/json',
}

export const workbenchApi = axios.create({
  baseURL: resolveWorkbenchApiUrl(),
  timeout: 20_000,
  headers: jsonHeaders,
})

export const supabaseDataApi = axios.create({
  baseURL: `${supabaseUrl}/rest/v1`,
  timeout: 15_000,
  headers: {
    apikey: publishableKey,
    'Content-Type': 'application/json',
  },
})

let memorySession: StoredAuthSession | null = null
let sessionHydrated = false

/**
 * Returns the Workbench auth IPC bridge when this renderer is inside Electron.
 * @returns Auth bridge, or null in tests / non-desktop pages.
 */
function authBridge(): Window['workbench']['auth'] | null {
  return window.workbench?.auth ?? null
}

/**
 * Validates a cached session payload.
 * @param value - Unknown JSON or IPC payload.
 * @returns Tokens, or null when the shape is invalid.
 */
export function parseStoredAuthSession(value: unknown): StoredAuthSession | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const session = value as Record<string, unknown>
  if (
    typeof session.accessToken !== 'string'
    || typeof session.refreshToken !== 'string'
    || typeof session.expiresAt !== 'number'
    || !Number.isFinite(session.expiresAt)
    || session.expiresAt <= 0
    || session.accessToken.length === 0
    || session.refreshToken.length === 0
  ) {
    return null
  }
  return {
    accessToken: session.accessToken,
    expiresAt: session.expiresAt,
    refreshToken: session.refreshToken,
  }
}

/**
 * Reads a leftover renderer localStorage session from before the main-process cache.
 * @returns Stored session, or null.
 */
function readLegacyLocalStorage(): StoredAuthSession | null {
  try {
    const stored = localStorage.getItem(legacySessionStorageKey)
    if (!stored) {
      return null
    }
    return parseStoredAuthSession(JSON.parse(stored) as unknown)
  } catch {
    return null
  }
}

/**
 * Writes or clears the leftover renderer localStorage key.
 * @param session - Session to persist, or null to remove.
 * @returns Nothing.
 */
function writeLegacyLocalStorage(session: StoredAuthSession | null): void {
  try {
    if (session) {
      localStorage.setItem(legacySessionStorageKey, JSON.stringify(session))
    } else {
      localStorage.removeItem(legacySessionStorageKey)
    }
  } catch {
    // Quota or private-mode failures must not break sign-in.
  }
}

/**
 * Reads the in-memory session, or leftover localStorage before the first hydrate.
 * @returns The stored session or null when none is valid.
 */
export function readAuthSession(): StoredAuthSession | null {
  if (sessionHydrated) {
    return memorySession
  }
  return readLegacyLocalStorage()
}

/**
 * Loads the machine-local session cache and migrates leftover renderer storage once.
 * @returns The stored session or null when none is valid.
 */
export async function hydrateAuthSession(): Promise<StoredAuthSession | null> {
  const bridge = authBridge()
  if (bridge?.getStoredSession) {
    const stored = parseStoredAuthSession(await bridge.getStoredSession())
    if (stored) {
      memorySession = stored
      sessionHydrated = true
      writeLegacyLocalStorage(null)
      return stored
    }
    const legacy = readLegacyLocalStorage()
    if (legacy) {
      await bridge.setStoredSession(legacy)
      writeLegacyLocalStorage(null)
      memorySession = legacy
      sessionHydrated = true
      return legacy
    }
    memorySession = null
    sessionHydrated = true
    return null
  }
  memorySession = readLegacyLocalStorage()
  sessionHydrated = true
  return memorySession
}

/**
 * Persists or removes the current Workbench session on this machine.
 * @param session - Session to persist, or null to clear tokens.
 * @returns Nothing.
 */
export async function persistAuthSession(session: StoredAuthSession | null): Promise<void> {
  memorySession = session
  sessionHydrated = true
  const bridge = authBridge()
  if (bridge?.setStoredSession && bridge.clearStoredSession) {
    if (session) {
      await bridge.setStoredSession(session)
    } else {
      await bridge.clearStoredSession()
    }
    writeLegacyLocalStorage(null)
    return
  }
  writeLegacyLocalStorage(session)
}

/**
 * Loads the last successful username for the login form.
 * @returns Username, or an empty string.
 */
export async function readLastUsername(): Promise<string> {
  const bridge = authBridge()
  if (!bridge?.getLastUsername) {
    return ''
  }
  return (await bridge.getLastUsername()).trim()
}

/**
 * Remembers the last successful username after sign-in.
 * @param username - Workbench username.
 * @returns Nothing.
 */
export async function persistLastUsername(username: string): Promise<void> {
  const trimmed = username.trim()
  const bridge = authBridge()
  if (!trimmed || !bridge?.setLastUsername) {
    return
  }
  await bridge.setLastUsername(trimmed)
}
