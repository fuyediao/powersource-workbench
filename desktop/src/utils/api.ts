import axios from 'axios'
import { resolveSupabasePublishableKey, resolveSupabaseUrl } from '@/config/deployment-urls'

const sessionStorageKey = 'powersource-workbench-supabase-session'
const supabaseUrl = resolveSupabaseUrl()
const publishableKey = resolveSupabasePublishableKey()

export interface StoredAuthSession {
  accessToken: string
  expiresAt: number
  refreshToken: string
}

const commonHeaders = {
  apikey: publishableKey,
  'Content-Type': 'application/json',
}

export const supabaseAuthApi = axios.create({
  baseURL: `${supabaseUrl}/auth/v1`,
  timeout: 15_000,
  headers: commonHeaders,
})

export const supabaseFunctionsApi = axios.create({
  baseURL: `${supabaseUrl}/functions/v1`,
  timeout: 20_000,
  headers: commonHeaders,
})

/** Reads and validates the locally persisted Supabase session. */
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

/** Persists or removes the current Supabase session. */
export function persistAuthSession(session: StoredAuthSession | null): void {
  if (session) {
    localStorage.setItem(sessionStorageKey, JSON.stringify(session))
  } else {
    localStorage.removeItem(sessionStorageKey)
  }
}
