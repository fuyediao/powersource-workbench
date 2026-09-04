import type { User } from '@supabase/supabase-js'

/** Host used for GoTrue-only emails. Not a contact address. */
export const SYNTHETIC_AUTH_EMAIL_HOST = 'users.invalid'

/**
 * Returns whether an email is the Auth placeholder (`name@users.invalid`).
 * @param email - Candidate address.
 * @returns True for synthetic Auth emails.
 */
export function isSyntheticAuthEmail(email: string | null | undefined): boolean {
  const trimmed = email?.trim().toLowerCase() ?? ''
  return trimmed.endsWith(`@${SYNTHETIC_AUTH_EMAIL_HOST}`)
}

/**
 * Reads the username encoded in a synthetic Auth email.
 * @param email - Auth email.
 * @returns Username, or empty when the address is not synthetic.
 */
export function usernameFromSyntheticAuthEmail(email: string | null | undefined): string {
  if (!isSyntheticAuthEmail(email) || !email) {
    return ''
  }
  return email.trim().toLowerCase().split('@')[0] ?? ''
}

/**
 * Returns a real contact email, or empty for missing / synthetic Auth emails.
 * @param email - Stored or Auth email.
 * @returns Contact email, or empty.
 */
export function publicContactEmail(email: string | null | undefined): string {
  const trimmed = email?.trim() ?? ''
  if (!trimmed || isSyntheticAuthEmail(trimmed)) {
    return ''
  }
  return trimmed
}

/** Workbench employee-id usernames (`ps0000`, `ps1234`). */
const WORKBENCH_EMPLOYEE_ID_RE = /^ps\d+$/i

/**
 * Returns whether a string is a Workbench employee-id username, not a personal name.
 * @param value - Candidate display name or username.
 * @returns True for `ps` plus digits.
 */
export function isWorkbenchEmployeeId(value: string | null | undefined): boolean {
  return Boolean(value && WORKBENCH_EMPLOYEE_ID_RE.test(value.trim()))
}

/**
 * Returns whether a string is this user's login username (employee id).
 * Used so greetings and profile name fields never treat `ps0000` as a person name.
 * @param value - Candidate display name.
 * @param user - Signed-in Supabase user, when known.
 * @returns True when the value is the login id.
 */
export function isLoginUsernameNotPersonName(
  value: string | null | undefined,
  user?: User | null | undefined,
): boolean {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) {
    return false
  }
  if (isWorkbenchEmployeeId(trimmed)) {
    return true
  }
  const login = usernameFromAuthUser(user)
  return Boolean(login) && trimmed.toLowerCase() === login
}

/**
 * Resolves the Workbench login username from Auth metadata or the placeholder email.
 * @param user - Signed-in Supabase user.
 * @returns Lowercase username, or empty.
 */
export function usernameFromAuthUser(user: User | null | undefined): string {
  const fromUser = readUsernameField(user?.user_metadata)
  if (fromUser) {
    return fromUser
  }
  const fromApp = readUsernameField(user?.app_metadata)
  if (fromApp) {
    return fromApp
  }
  return usernameFromSyntheticAuthEmail(user?.email)
}

/**
 * Reads a username string from Auth metadata.
 * @param metadata - user_metadata or app_metadata.
 * @returns Lowercase username, or empty.
 */
function readUsernameField(metadata: User['user_metadata'] | User['app_metadata'] | undefined): string {
  if (!metadata || typeof metadata !== 'object') {
    return ''
  }
  const raw = (metadata as Record<string, unknown>).username
  return typeof raw === 'string' ? raw.trim().toLowerCase() : ''
}
