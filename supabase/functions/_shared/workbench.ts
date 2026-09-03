const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,31}$/

/** Returns true when a value is a plain record. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Normalizes a Workbench username for comparisons and account creation. */
export function normalizeUsername(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

/** Returns true when a normalized Workbench username is valid. */
export function isValidUsername(username: string): boolean {
  return usernamePattern.test(username)
}

/** Maps a Workbench username to its internal Supabase Auth email address. */
export function usernameToEmail(username: string): string {
  const domain = Deno.env.get('WORKBENCH_ACCOUNT_EMAIL_DOMAIN')?.trim() || 'accounts.powersource.work'
  return `${username}@${domain}`
}

/** Generates a high-entropy invitation code suitable for one-time display. */
export function createInvitationCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

/** Hashes an invitation code before it is stored or queried. */
export async function hashInvitationCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Creates a consistent JSON error response. */
export function errorResponse(code: string, status: number): Response {
  return Response.json({ code }, { status })
}
