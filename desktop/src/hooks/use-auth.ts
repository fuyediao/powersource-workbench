import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import i18n from '@/i18n'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { clearMailPrefs } from '@/utils/mail/mail-prefs'

export interface AuthState {
  session: Session | null
  user: User | null
  loading: boolean
  isActionLoading: boolean
  error: string | null
  configured: boolean
  signInWithGoogle: () => Promise<void>
  signInWithPassword: (email: string, password: string) => Promise<boolean>
  signInWithOtp: (email: string) => Promise<boolean>
  verifyEmailOtp: (email: string, token: string) => Promise<boolean>
  signOut: () => Promise<void>
  clearError: () => void
}

/**
 * Parses the frontend auth email allowlist from env.
 * @returns Lowercased emails; empty means no allowlist gate.
 */
function getAllowedAuthEmails(): string[] {
  const raw = import.meta.env.VITE_ALLOWED_AUTH_EMAILS ?? ''
  return raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Returns whether the signed-in user is on the frontend allowlist.
 * @param email - User email from the Supabase session.
 * @returns True when allowed (or when the allowlist is empty).
 */
function isEmailAllowed(email: string | undefined): boolean {
  const allowed = getAllowedAuthEmails()
  if (allowed.length === 0) {
    return true
  }
  if (!email) {
    return false
  }
  return allowed.includes(email.trim().toLowerCase())
}

/**
 * Rejects a session whose email is not on the frontend allowlist.
 * @param nextSession - Candidate Supabase session.
 * @returns The session when allowed; otherwise null after sign-out.
 */
async function enforceEmailAllowlist(nextSession: Session | null): Promise<Session | null> {
  if (!nextSession || !supabase) {
    return null
  }
  if (isEmailAllowed(nextSession.user.email)) {
    return nextSession
  }
  await supabase.auth.signOut()
  return null
}

/**
 * Manages Supabase auth for Electron (Google deep-link, password, email OTP).
 * Ensures `user_settings` via `ensure_user_library` when a session is present.
 * @returns Current session state and sign-in/sign-out actions.
 */
export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [isActionLoading, setIsActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      setError(i18n.t('auth.notConfigured'))
      return
    }

    let active = true
    const client = supabase

    void client.auth.getSession().then(async ({ data }) => {
      if (!active) {
        return
      }
      const allowedSession = await enforceEmailAllowlist(data.session)
      if (!active) {
        return
      }
      if (data.session && !allowedSession) {
        setError(i18n.t('auth.emailNotAllowed'))
      }
      setSession(allowedSession)
      setLoading(false)
    })

    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      void (async () => {
        if (!active) {
          return
        }
        const allowedSession = await enforceEmailAllowlist(nextSession)
        if (!active) {
          return
        }
        if (nextSession && !allowedSession) {
          setError(i18n.t('auth.emailNotAllowed'))
        }
        setSession(allowedSession)
        setLoading(false)
      })()
    })

    const unsubscribeDeepLink = window.geocrm?.auth?.onSession((payload) => {
      void (async () => {
        if (payload.error) {
          setError(payload.error)
          return
        }
        if (!payload.accessToken || !payload.refreshToken) {
          return
        }
        const { error: setErrorResult } = await client.auth.setSession({
          access_token: payload.accessToken,
          refresh_token: payload.refreshToken,
        })
        if (setErrorResult) {
          setError(setErrorResult.message)
        }
      })()
    }) ?? (() => undefined)

    return () => {
      active = false
      listener.subscription.unsubscribe()
      unsubscribeDeepLink()
    }
  }, [])

  useEffect(() => {
    const userId = session?.user.id
    if (!userId || !supabase) {
      return
    }

    void supabase
      .rpc('ensure_user_library')
      .then(({ error: rpcError }) => {
        if (rpcError) {
          console.warn('ensure_user_library failed', rpcError.message)
        }
      })
  }, [session?.user.id])

  /**
   * Clears the last auth error message.
   * @returns Nothing.
   */
  function clearError(): void {
    setError(null)
  }

  /**
   * Opens Google OAuth in the system browser.
   * @returns Nothing.
   */
  async function signInWithGoogle(): Promise<void> {
    setError(null)
    if (!isSupabaseConfigured) {
      setError(i18n.t('auth.notConfigured'))
      return
    }
    setIsActionLoading(true)
    try {
      const desktopAuth = window.geocrm?.auth
      if (!desktopAuth) {
        setError(i18n.t('auth.desktopBridgeUnavailable'))
        return
      }
      await desktopAuth.openGoogleSignIn()
    } finally {
      setIsActionLoading(false)
    }
  }

  /**
   * Signs in with email and password.
   * @param email - Account email.
   * @param password - Account password.
   * @returns True when a session was created.
   */
  async function signInWithPassword(email: string, password: string): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) {
      setError(i18n.t('auth.notConfigured'))
      return false
    }
    setError(null)
    setIsActionLoading(true)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })
      if (signInError) {
        setError(i18n.t('auth.passwordSignInFailed'))
        return false
      }
      return true
    } catch {
      setError(i18n.t('auth.passwordSignInFailed'))
      return false
    } finally {
      setIsActionLoading(false)
    }
  }

  /**
   * Sends a 6-digit email OTP code.
   * @param email - Destination email.
   * @returns True when the code was sent.
   */
  async function signInWithOtp(email: string): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) {
      setError(i18n.t('auth.notConfigured'))
      return false
    }
    setError(null)
    setIsActionLoading(true)
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
      })
      if (otpError) {
        setError(i18n.t('auth.errorOtp'))
        return false
      }
      return true
    } catch {
      setError(i18n.t('auth.errorOtp'))
      return false
    } finally {
      setIsActionLoading(false)
    }
  }

  /**
   * Verifies a 6-digit email OTP and establishes a session.
   * @param email - Email the code was sent to.
   * @param token - 6-digit code.
   * @returns True when verification succeeds.
   */
  async function verifyEmailOtp(email: string, token: string): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) {
      setError(i18n.t('auth.notConfigured'))
      return false
    }
    setError(null)
    setIsActionLoading(true)
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email',
      })
      if (verifyError) {
        setError(i18n.t('auth.errorOtpVerify'))
        return false
      }
      return true
    } catch {
      setError(i18n.t('auth.errorOtpVerify'))
      return false
    } finally {
      setIsActionLoading(false)
    }
  }

  /**
   * Signs out and clears the local Supabase session.
   * @returns Nothing.
   */
  async function signOut(): Promise<void> {
    setError(null)
    clearMailPrefs()
    if (!supabase) {
      setSession(null)
      return
    }
    await supabase.auth.signOut()
    setSession(null)
  }

  return {
    session,
    user: session?.user ?? null,
    loading,
    isActionLoading,
    error,
    configured: isSupabaseConfigured,
    signInWithGoogle,
    signInWithPassword,
    signInWithOtp,
    verifyEmailOtp,
    signOut,
    clearError,
  }
}
