import axios from 'axios'

const TERMINAL_SESSION_CODES = new Set([
  'account_disabled',
  'invalid_grant',
  'invalid_session',
])

/**
 * Returns whether an error means the stored refresh token must be discarded.
 * Network and 5xx failures are not terminal — keep the machine cache.
 * @param error - Unknown thrown request or auth error.
 * @returns True when the user must sign in again.
 */
export function isInvalidSessionError(error: unknown): boolean {
  if (axios.isAxiosError<{ code?: number | string; error?: string; error_code?: string }>(error)) {
    if (!error.response) {
      return false
    }
    const payload = error.response.data
    const code = [payload?.code, payload?.error, payload?.error_code]
      .find((value): value is string => typeof value === 'string' && value.length > 0)
    if (code && TERMINAL_SESSION_CODES.has(code)) {
      return true
    }
    return error.response.status === 401
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      TERMINAL_SESSION_CODES.has(error.message)
      || message.includes('invalid refresh token')
      || message.includes('refresh_token_not_found')
    )
  }
  return false
}
