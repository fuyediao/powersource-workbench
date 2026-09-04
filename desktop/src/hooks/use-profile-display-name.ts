import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { fetchProfile, fetchWorkProfileIdentity } from '@/services/profile-api'
import { personNameOrEmpty, resolveUserDisplayName } from '@/utils/shared/user-profile'

/**
 * Loads the signed-in user's person name from `profiles` and `work_profiles`.
 * Login usernames (employee ids such as `ps0000`) are never returned.
 *
 * @param user - Signed-in Supabase user
 * @returns Display name, or empty when only a login id exists
 */
export function useProfileDisplayName(user: User | null | undefined): string {
  const metadataName = resolveUserDisplayName(user, user?.email ?? '')
  const [profileName, setProfileName] = useState('')

  const userId = user?.id

  useEffect(() => {
    if (!userId || !user) {
      setProfileName('')
      return
    }
    const signedIn = user
    let cancelled = false
    void Promise.all([fetchWorkProfileIdentity(userId), fetchProfile(userId)]).then(
      ([work, row]) => {
        if (cancelled) {
          return
        }
        const fromProfile =
          personNameOrEmpty(row?.display_name, signedIn) ||
          personNameOrEmpty(row?.full_name, signedIn) ||
          personNameOrEmpty(work.displayName, signedIn)
        setProfileName(fromProfile)
      },
    )
    return () => {
      cancelled = true
    }
  }, [user, userId])

  return profileName || metadataName
}
