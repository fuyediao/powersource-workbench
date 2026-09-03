/**
 * Lightweight form validation helpers (web `utils/validation` parity).
 */

const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Returns true when the string looks like a basic email address.
 * @param value - Candidate email.
 * @returns Whether format is valid.
 */
export function isValidEmailFormat(value: string): boolean {
  return EMAIL_FORMAT_RE.test(value.trim())
}

/**
 * Empty email is allowed; non-empty values must pass {@link isValidEmailFormat}.
 * @param value - Optional email.
 * @returns Whether the value is empty or a valid email.
 */
export function isEmailOptionalOrValid(value: string | null | undefined): boolean {
  if (value == null || String(value).trim() === '') {
    return true
  }
  return isValidEmailFormat(String(value))
}
