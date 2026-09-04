import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

const PASSWORD_MIN_LENGTH = 8

/**
 * Privacy settings: login password.
 * @param user - Signed-in Supabase user.
 * @returns Privacy state and actions.
 */
export function usePrivacy(user: User | null | undefined) {
  const [hasPasswordSet, setHasPasswordSet] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)
  const [isPasswordSaving, setIsPasswordSaving] = useState(false)

  const refreshIdentities = useCallback(() => {
    if (!user) {
      setHasPasswordSet(false)
      return
    }
    const meta = user.user_metadata as Record<string, unknown> | undefined
    setHasPasswordSet(Boolean(meta?.password_set) || user.app_metadata?.provider === 'email')
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

  return {
    hasPasswordSet,
    passwordError,
    passwordSuccess,
    isPasswordSaving,
    passwordMinLength: PASSWORD_MIN_LENGTH,
    setPassword,
    changePassword,
  }
}
