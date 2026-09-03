/**
 * Formats the digit suffix as a PS#### employee id (uppercase PS).
 * @param digitPart - Up to four digits.
 * @returns Formatted id such as `PS0001`, or empty when blank.
 */
export function formatEmployeeIdDisplay(digitPart: string): string {
  if (!digitPart) {
    return ''
  }
  return `PS${digitPart.padStart(4, '0')}`
}

/**
 * Extracts the digit suffix from raw field input (optional PS prefix, no padding).
 * @param raw - Raw field value as typed.
 * @returns Digit part for formatting.
 */
export function parseEmployeeIdDigitPart(raw: string): string {
  const stripped = raw.trim().replace(/^ps/i, '')
  const allDigits = stripped.replace(/\D/g, '').slice(0, 4)
  if (!allDigits) {
    return ''
  }
  if (/^0+$/.test(allDigits)) {
    return '0'
  }
  return allDigits.replace(/^0+/, '').slice(0, 4)
}

/**
 * Normalizes raw employee-id field input to PS#### on submit.
 * @param raw - Raw field value.
 * @returns PS#### id.
 */
export function normalizeEmployeeIdForSubmit(raw: string): string {
  return formatEmployeeIdDisplay(parseEmployeeIdDigitPart(raw))
}
