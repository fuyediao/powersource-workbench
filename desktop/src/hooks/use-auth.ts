import { useCallback, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import i18n from '@/i18n'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { loadSession, signIn as signInRequest, signOut as signOutRequest } from '@/services/auth-api'
import { persistAuthSession, readAuthSession } from '@/utils/workbench-session'
import { apiErrorMessage } from '@/utils/api-error'
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
 * Applies persisted Workbench tokens to the Supabase client.
 * @returns The active Supabase session or null when tokens are invalid.
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
  const { data, error } = await supabase.auth.setSession({
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken,
  })
  if (error || !data.session) {
    persistAuthSession(null)
    await supabase.auth.signOut()
    return null
  }
  return data.session
}

/**
 * Manages Workbench username/password auth and mirrors tokens into Supabase.
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
        if (readAuthSession()) {
          await loadSession()
          const nextSession = await applyStoredSession()
          if (active) {
            setSession(nextSession)
          }
        } else {
          await client.auth.signOut()
          if (active) {
            setSession(null)
          }
        }
      } catch {
        persistAuthSession(null)
        await client.auth.signOut()
        if (active) {
          setSession(null)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    })()

    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession)
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
   * Signs in with a Workbench username and password.
   * @param username - Workbench username.
   * @param password - Account password.
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
      await signInRequest(username, password)
      const nextSession = await applyStoredSession()
      if (!nextSession) {
        setError(i18n.t('errors.invalid_session'))
        return false
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
