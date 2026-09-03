/**
 * Customer code format helpers (web Admin validation parity).
 */

/** Allowed characters in customer_code: ASCII letters, digits, and hyphen. */
const CUSTOMER_CODE_FORMAT_RE = /^[A-Za-z0-9-]+$/

/**
 * Returns true when customer code is non-empty and only uses letters, digits, and hyphens.
 * @param value - Customer code string.
 * @returns Whether format is valid.
 */
export function isValidCustomerCodeFormat(value: string): boolean {
  const trimmed = value.trim()
  return trimmed !== '' && CUSTOMER_CODE_FORMAT_RE.test(trimmed)
}

/**
 * Strip disallowed characters from customer code input.
 * @param value - Raw input value.
 * @returns Sanitized fragment.
 */
export function sanitizeCustomerCodeInput(value: string): string {
  return value.replace(/[^A-Za-z0-9-]/g, '')
}
