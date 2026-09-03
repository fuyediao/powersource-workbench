/**
 * Generates a short random id for a Univer unit / sheet / style.
 * @param prefix - Id prefix (e.g. `sheet`, `style`).
 * @returns Prefixed random id.
 */
export function randomOfficeId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(36).slice(2, 12)
  return `${prefix}-${random}`
}
