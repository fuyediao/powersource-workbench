import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { AUTH_DEEP_LINK_URI } from '@/shared/ipc'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { openExternalUrl } from '@/utils/shared/api'

const PASSWORD_MIN_LENGTH = 8

/**
 * Privacy settings: password and Google account link.
 * @param user - Signed-in Supabase user.
 * @returns Privacy state and actions.
 */
export function usePrivacy(user: User | null | undefined) {
  const [hasPasswordSet, setHasPasswordSet] = useState(false)
  const [hasGoogleLinked, setHasGoogleLinked] = useState(false)
  const [googleEmail, setGoogleEmail] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)
  const [isPasswordSaving, setIsPasswordSaving] = useState(false)
  const [googleLinkError, setGoogleLinkError] = useState<string | null>(null)
  const [isLinkingGoogle, setIsLinkingGoogle] = useState(false)

  const refreshIdentities = useCallback(() => {
    if (!user) {
      setHasPasswordSet(false)
      setHasGoogleLinked(false)
      setGoogleEmail('')
      return
    }
    const meta = user.user_metadata as Record<string, unknown> | undefined
    setHasPasswordSet(Boolean(meta?.password_set) || user.app_metadata?.provider === 'email')
    const google = user.identities?.find((identity) => identity.provider === 'google') as
      | { identity_data?: Record<string, unknown> | null }
      | undefined
    setHasGoogleLinked(Boolean(google))
    const gEmail = google?.identity_data?.email
    setGoogleEmail(typeof gEmail === 'string' ? gEmail : '')
    if (user.identities?.some((identity) => identity.provider === 'email')) {
      setHasPasswordSet(true)
    }
  }, [user])

  useEffect(() => {
    refreshIdentities()
  }, [refreshIdentities])

  /**
   * Sets a password for the first time (or after verify).
   * @param newPassword - New password.
   * @returns True on success.
   */
  async function setPassword(newPassword: string): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) {
      setPasswordError('not_configured')
      return false
    }
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setPasswordError('too_short')
      return false
    }
    setIsPasswordSaving(true)
    setPasswordError(null)
    setPasswordSuccess(null)
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        data: { password_set: true },
      })
      if (error) {
        setPasswordError('update_failed')
        return false
      }
      setHasPasswordSet(true)
      setPasswordSuccess('set')
      return true
    } finally {
      setIsPasswordSaving(false)
    }
  }

  /**
   * Changes password after verifying the current one.
   * @param currentPassword - Existing password.
   * @param newPassword - New password.
   * @returns True on success.
   */
  async function changePassword(currentPassword: string, newPassword: string): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase || !user?.email) {
      setPasswordError('not_configured')
      return false
    }
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setPasswordError('too_short')
      return false
    }
    setIsPasswordSaving(true)
    setPasswordError(null)
    setPasswordSuccess(null)
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email.trim().toLowerCase(),
        password: currentPassword,
      })
      if (verifyError) {
        setPasswordError('current_invalid')
        return false
      }
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        data: { password_set: true },
      })
      if (error) {
        setPasswordError('update_failed')
        return false
      }
      setHasPasswordSet(true)
      setPasswordSuccess('updated')
      return true
    } finally {
      setIsPasswordSaving(false)
    }
  }

  /**
   * Starts Google identity linking via system browser + deep link.
   * @returns Nothing.
   */
  async function linkGoogleAccount(): Promise<void> {
    if (!isSupabaseConfigured || !supabase) {
      setGoogleLinkError('not_configured')
      return
    }
    setIsLinkingGoogle(true)
    setGoogleLinkError(null)
    try {
      const { data, error } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: {
          redirectTo: AUTH_DEEP_LINK_URI,
          skipBrowserRedirect: true,
        },
      })
      if (error) {
        setGoogleLinkError(error.message)
        return
      }
      const url = data?.url
      if (!url) {
        setGoogleLinkError('link_failed')
        return
      }
      await openExternalUrl(url)
    } catch (err) {
      setGoogleLinkError(err instanceof Error ? err.message : 'link_failed')
    } finally {
      setIsLinkingGoogle(false)
    }
  }

  return {
    hasPasswordSet,
    hasGoogleLinked,
    googleEmail,
    passwordError,
    passwordSuccess,
    isPasswordSaving,
    googleLinkError,
    isLinkingGoogle,
    passwordMinLength: PASSWORD_MIN_LENGTH,
    setPassword,
    changePassword,
    linkGoogleAccount,
  }
}
