import type { User } from '@supabase/supabase-js'
import {
  isLoginUsernameNotPersonName,
  publicContactEmail,
} from '@/utils/auth/workbench-username'

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
 * Returns a personal name, or empty when the value is missing or a login username.
 *
 * @param value - Stored or metadata name
 * @param user - Signed-in user, used to reject the employee-id username
 * @returns Trimmed person name, or empty
 */
export function personNameOrEmpty(
  value: string | null | undefined,
  user?: User | null | undefined,
): string {
  const trimmed = value?.trim() ?? ''
  if (!trimmed || isLoginUsernameNotPersonName(trimmed, user)) {
    return ''
  }
  return trimmed
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
 * Resolves a personal display name from OAuth metadata or a real contact email local-part.
 * Never uses the Workbench login username (employee id).
 *
 * @param user - Signed-in Supabase user
 * @param fallbackEmail - Email string when metadata has no name
 * @returns Person name, or empty when only a login id is available
 */
export function resolveUserDisplayName(
  user: User | null | undefined,
  fallbackEmail = '',
): string {
  const meta = user?.user_metadata as Record<string, unknown> | undefined
  const identityData = user?.identities?.[0]?.identity_data as Record<string, unknown> | undefined
  const named = personNameOrEmpty(
    firstString(meta?.display_name, meta?.full_name, meta?.name, identityData?.full_name, identityData?.name),
    user,
  )
  if (named) {
    return named
  }
  const email = publicContactEmail(user?.email ?? fallbackEmail)
  if (email.includes('@')) {
    return personNameOrEmpty(email.split('@')[0] || '', user)
  }
  return ''
}

/**
 * Returns the first whitespace token of a person name for welcome copy.
 *
 * @param fullName - Profile or metadata display name
 * @param user - Signed-in user, used to reject the employee-id username
 * @returns Given name, or empty
 */
export function givenNameForGreeting(
  fullName: string | undefined,
  user?: User | null | undefined,
): string {
  const person = personNameOrEmpty(fullName, user)
  if (!person) {
    return ''
  }
  return person.split(/\s+/)[0] ?? ''
}
