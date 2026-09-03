/**
 * Customer level slugs and map pin colors (web Admin Customer Map parity).
 */

export const CUSTOMER_LEVEL_VALUES = ['A0', 'A1', 'A2', 'A3', 'A4', 'B', 'C', 'D'] as const

export type CustomerLevelSlug = (typeof CUSTOMER_LEVEL_VALUES)[number]

/** Level filter key including customers with no known level. */
export type CustomerLevelFilterKey = CustomerLevelSlug | 'none'

export const ALL_CUSTOMER_LEVEL_FILTER_KEYS: readonly CustomerLevelFilterKey[] = [
  ...CUSTOMER_LEVEL_VALUES,
  'none',
]

/** Solid pin colours per customer level for Leaflet markers. */
export const CUSTOMER_LEVEL_PIN_COLOR: Record<CustomerLevelSlug, string> = {
  A0: '#34d399',
  A1: '#4ade80',
  A2: '#2dd4bf',
  A3: '#22d3ee',
  A4: '#38bdf8',
  B: '#818cf8',
  C: '#fbbf24',
  D: '#fb7185',
}

/** Grey pin colour when level is missing/unknown. */
export const CUSTOMER_LEVEL_PIN_FALLBACK = '#6b7280'

/** Tailwind badge classes per level (list parity with web Admin). */
export const CUSTOMER_LEVEL_BADGE_CLASS: Record<CustomerLevelSlug, string> = {
  A0: 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  A1: 'border border-green-500/40 bg-green-500/15 text-green-700 dark:text-green-300',
  A2: 'border border-teal-500/40 bg-teal-500/15 text-teal-700 dark:text-teal-300',
  A3: 'border border-cyan-500/40 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
  A4: 'border border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-300',
  B: 'border border-indigo-500/40 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
  C: 'border border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300',
  D: 'border border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300',
}

const CUSTOMER_LEVEL_BADGE_FALLBACK =
  'border border-zinc-400/40 bg-zinc-500/10 text-muted'

/**
 * Type guard for known customer level slugs.
 * @param value - Raw level string.
 * @returns Whether the value is a known slug.
 */
export function isCustomerLevelSlug(value: string | null | undefined): value is CustomerLevelSlug {
  return value != null && (CUSTOMER_LEVEL_VALUES as readonly string[]).includes(value)
}

/**
 * Badge utility classes for a customer level slug in admin lists.
 * @param level - Customer level slug or raw value.
 * @returns Tailwind class string.
 */
export function getCustomerLevelBadgeClass(level: string | null | undefined): string {
  if (!level || !isCustomerLevelSlug(level)) {
    return CUSTOMER_LEVEL_BADGE_FALLBACK
  }
  return CUSTOMER_LEVEL_BADGE_CLASS[level]
}

/**
 * Pin color for a customer level slug.
 * @param level - Customer level or null.
 * @returns Hex color.
 */
export function getCustomerLevelPinColor(level: string | null | undefined): string {
  if (!level || !isCustomerLevelSlug(level)) {
    return CUSTOMER_LEVEL_PIN_FALLBACK
  }
  return CUSTOMER_LEVEL_PIN_COLOR[level]
}

/**
 * Resolves a customer level to a filter key.
 * @param level - Stored customer_level.
 * @returns Level slug or `none`.
 */
export function customerLevelFilterKey(level: string | null | undefined): CustomerLevelFilterKey {
  return level && isCustomerLevelSlug(level) ? level : 'none'
}
