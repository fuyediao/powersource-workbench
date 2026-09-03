import type { User } from '@supabase/supabase-js'

/**
 * Reads the first non-empty string from OAuth / user metadata candidates.
 *
 * @param values - Candidate values from metadata
 * @returns Trimmed string or null
 */
function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) {
        return trimmed
      }
    }
  }
  return null
}

/**
 * Resolves an https avatar URL from a Supabase user (Google OAuth metadata).
 *
 * @param user - Signed-in Supabase user
 * @returns Avatar URL or null when unavailable
 */
export function resolveUserAvatarUrl(user: User | null | undefined): string | null {
  if (!user) {
    return null
  }
  const meta = user.user_metadata as Record<string, unknown> | undefined
  const identityData = user.identities?.[0]?.identity_data as Record<string, unknown> | undefined
  const url = firstString(meta?.avatar_url, meta?.picture, identityData?.avatar_url, identityData?.picture)
  if (!url || !/^https?:\/\//i.test(url)) {
    return null
  }
  return url
}

/**
 * Resolves a display name from OAuth metadata, falling back to the email local-part.
 *
 * @param user - Signed-in Supabase user
 * @param fallbackEmail - Email string when metadata has no name
 * @returns Display name for the account panel
 */
export function resolveUserDisplayName(
  user: User | null | undefined,
  fallbackEmail = '',
): string {
  const meta = user?.user_metadata as Record<string, unknown> | undefined
  const identityData = user?.identities?.[0]?.identity_data as Record<string, unknown> | undefined
  const named = firstString(
    meta?.full_name,
    meta?.name,
    meta?.display_name,
    identityData?.full_name,
    identityData?.name,
  )
  if (named) {
    return named
  }
  const email = (user?.email ?? fallbackEmail).trim()
  if (email.includes('@')) {
    return email.split('@')[0] || email
  }
  return email || 'Workbench'
}
