import { useCallback, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import i18n from '@/i18n'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { loadSession, signIn as signInRequest, signOut as signOutRequest } from '@/services/auth-api'
import { seedOaErpCredentialsFromLogin } from '@/services/oa-erp-api'
import type { WorkbenchUser } from '@/types/auth'
import { sessionFromRemoteOaUser } from '@/utils/auth/oa-session'
import { isRemoteOaUserId } from '@/utils/auth/workbench-username'
import {
  hydrateAuthSession,
  persistAuthSession,
  readAuthSession,
} from '@/utils/workbench-session'
import { apiErrorMessage } from '@/utils/api-error'
import { isInvalidSessionError } from '@/utils/session-error'
import { clearMailPrefs } from '@/utils/mail/mail-prefs'

export interface AuthState {
  session: Session | null
  user: User | null
  loading: boolean
  isActionLoading: boolean
  error: string | null
  configured: boolean
  login: (username: string, password: string) => Promise<boolean>
  signOut: () => Promise<void>
  clearError: () => void
}

/**
 * Writes refreshed Supabase tokens back to the machine cache.
 * @param nextSession - Active Supabase session.
 * @returns Nothing.
 */
async function persistSupabaseSession(nextSession: Session): Promise<void> {
  await persistAuthSession({
    accessToken: nextSession.access_token,
    refreshToken: nextSession.refresh_token,
    expiresAt: nextSession.expires_at
      ? nextSession.expires_at * 1000
      : Date.now() + 3_600_000,
  })
}

/**
 * Applies persisted Workbench tokens to the Supabase client.
 * OA employee tokens are not Supabase JWTs; those fail here and stay in the machine cache.
 * @returns The active Supabase session or null when tokens are not a Supabase session.
 */
async function applyStoredSession(): Promise<Session | null> {
  if (!supabase) {
    return null
  }
  const stored = readAuthSession()
  if (!stored) {
    await supabase.auth.signOut()
    return null
  }
  const { data } = await supabase.auth.setSession({
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken,
  })
  return data.session ?? null
}

/**
 * Restores a renderer session from a validated Workbench user and cached tokens.
 * @param user - Public user from /auth/me or /auth/login.
 * @returns A Supabase session, or a synthetic OA session.
 */
function sessionForWorkbenchUser(user: WorkbenchUser): Session | null {
  const stored = readAuthSession()
  if (!stored) {
    return null
  }
  if (isRemoteOaUserId(user.id)) {
    return sessionFromRemoteOaUser(user, stored)
  }
  return null
}

/**
 * Manages Workbench employee-id auth and mirrors admin tokens into Supabase.
 * @returns Current session state and sign-in/sign-out actions.
 */
export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [isActionLoading, setIsActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false)
      setError(i18n.t('auth.notConfigured'))
      return
    }

    let active = true
    const client = supabase

    void (async () => {
      try {
        const stored = await hydrateAuthSession()
        if (!stored) {
          await client.auth.signOut()
          if (active) {
            setSession(null)
          }
          return
        }
        let workbenchUser: WorkbenchUser | null = null
        try {
          workbenchUser = await loadSession()
        } catch (restoreError) {
          if (isInvalidSessionError(restoreError)) {
            await persistAuthSession(null)
            await client.auth.signOut()
            if (active) {
              setSession(null)
            }
            return
          }
        }
        const nextSession = await applyStoredSession()
          ?? (workbenchUser ? sessionForWorkbenchUser(workbenchUser) : null)
        if (active) {
          setSession(nextSession)
        }
      } catch (restoreError) {
        if (isInvalidSessionError(restoreError)) {
          await persistAuthSession(null)
          await client.auth.signOut()
          if (active) {
            setSession(null)
          }
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    })()

    const { data: listener } = client.auth.onAuthStateChange((event, nextSession) => {
      if (!active) {
        return
      }
      if (nextSession) {
        setSession(nextSession)
        setLoading(false)
        void persistSupabaseSession(nextSession)
        return
      }
      if (event === 'SIGNED_OUT' && !readAuthSession()) {
        setSession(null)
        setLoading(false)
      }
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  /**
   * Clears the last auth error message.
   * @returns Nothing.
   */
  const clearError = useCallback((): void => {
    setError(null)
  }, [])

  /**
   * Signs in with an employee id and password.
   * @param username - Employee id (ps####).
   * @param password - OA password, or the stored admin password.
   * @returns True when a session was created.
   */
  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    if (!isSupabaseConfigured || !supabase) {
      setError(i18n.t('auth.notConfigured'))
      return false
    }
    setError(null)
    setIsActionLoading(true)
    try {
      const user = await signInRequest(username, password)
      const nextSession = await applyStoredSession() ?? sessionForWorkbenchUser(user)
      if (!nextSession) {
        setError(i18n.t('errors.invalid_session'))
        return false
      }
      if (isRemoteOaUserId(user.id)) {
        await seedOaErpCredentialsFromLogin(user.id, user.username || username, password)
      }
      setSession(nextSession)
      return true
    } catch (signInError) {
      setError(apiErrorMessage(signInError))
      return false
    } finally {
      setIsActionLoading(false)
    }
  }, [])

  /**
   * Signs out and clears the local Supabase session.
   * @returns Nothing.
   */
  const signOut = useCallback(async (): Promise<void> => {
    setError(null)
    clearMailPrefs()
    try {
      await signOutRequest()
    } finally {
      if (supabase) {
        await supabase.auth.signOut()
      }
      setSession(null)
    }
  }, [])

  return {
    session,
    user: session?.user ?? null,
    loading,
    isActionLoading,
    error,
    configured: isSupabaseConfigured,
    login,
    signOut,
    clearError,
  }
}
