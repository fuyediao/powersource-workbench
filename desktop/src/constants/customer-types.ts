/**
 * Customer type slugs stored in customers.customer_type.
 */

export const CUSTOMER_TYPE_VALUES = [
  'key_account',
  'general',
  'core',
  'potential',
  'suspended',
  'risk',
] as const

export type CustomerTypeSlug = (typeof CUSTOMER_TYPE_VALUES)[number]

/**
 * Type guard for customer type slugs.
 * @param value - Raw value.
 * @returns Whether the value is a known slug.
 */
export function isCustomerTypeSlug(
  value: string | null | undefined,
): value is CustomerTypeSlug {
  return value != null && (CUSTOMER_TYPE_VALUES as readonly string[]).includes(value)
}
