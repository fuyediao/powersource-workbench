import axios from 'axios'
import { resolveSupabasePublishableKey, resolveSupabaseUrl, resolveWorkbenchApiUrl } from '@/config/deployment-urls'

const sessionStorageKey = 'powersource-workbench-supabase-session'
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

/**
 * Reads and validates the locally persisted Supabase session.
 * @returns The stored session or null when none is valid.
 */
export function readAuthSession(): StoredAuthSession | null {
  const stored = localStorage.getItem(sessionStorageKey)
  if (!stored) return null
  try {
    const value: unknown = JSON.parse(stored)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const session = value as Record<string, unknown>
    if (typeof session.accessToken !== 'string' || typeof session.refreshToken !== 'string'
      || typeof session.expiresAt !== 'number') return null
    return {
      accessToken: session.accessToken,
      expiresAt: session.expiresAt,
      refreshToken: session.refreshToken,
    }
  } catch {
    return null
  }
}

/**
 * Persists or removes the current Supabase session.
 * @param session - Session to persist, or null to clear it.
 * @returns Nothing.
 */
export function persistAuthSession(session: StoredAuthSession | null): void {
  if (session) {
    localStorage.setItem(sessionStorageKey, JSON.stringify(session))
  } else {
    localStorage.removeItem(sessionStorageKey)
  }
}
