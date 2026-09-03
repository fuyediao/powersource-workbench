import type { LeadLinkedCustomer } from '@/types/lead'
import type { LeadExtendedFieldKey } from '@/constants/lead-extended-form'

/**
 * Returns the company website from a customer record (trimmed).
 *
 * @param customer - Customer row from the CRM
 * @returns Website URL or empty string
 */
export function companyWebsiteFromCustomer(customer: LeadLinkedCustomer): string {
  return (customer.website ?? '').trim()
}

/**
 * Returns the **company address** country from the customer (trimmed).
 * Billing and shipping countries are intentionally excluded for the lead's country/region field.
 *
 * @param customer - Customer row from the CRM
 * @returns `companyCountry` or empty string
 */
export function countryRegionFromCustomer(customer: LeadLinkedCustomer): string {
  return (customer.companyCountry ?? '').trim()
}

/**
 * Overwrites customer-sourced extended keys on the lead form map; clears them when `customer` is null.
 *
 * @param extended - Current full extended-field string map
 * @param customer - Linked customer, or `null` if unlinked
 * @returns New map (immutable copy)
 */
export function applyCustomerImportedExtendedFields(
  extended: Record<LeadExtendedFieldKey, string>,
  customer: LeadLinkedCustomer | null,
): Record<LeadExtendedFieldKey, string> {
  const next = { ...extended }
  if (!customer) {
    next.companyWebsite = ''
    next.countryRegion = ''
    return next
  }
  next.companyWebsite = companyWebsiteFromCustomer(customer)
  next.countryRegion = countryRegionFromCustomer(customer)
  return next
}
