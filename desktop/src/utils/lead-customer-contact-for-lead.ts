import type { CustomerContact } from '@/types/customer'
import type { LeadLinkedCustomer } from '@/types/lead'

/**
 * Read-only summary of the linked customer’s contact person for the lead UI.
 */
export interface LeadImportedContactSummary {
  name: string
  email: string
  /** Landline / office number from **`customer_contacts.phone`** */
  phone: string
  /** Mobile number from **`customer_contacts.mobile`** */
  mobile: string
  /** Job title from **`customer_contacts.title`** (same semantics as the lead's job-title field when pinned). */
  title: string
}

/**
 * If **`selected`** is a UUID present under the linked customer, returns it; otherwise **`undefined`** (omit on save).
 *
 * @param customerId - Linked **`customers.id`**
 * @param contacts - Loaded **`customer_contacts`** for that customer
 * @param selected - Raw value from the lead form (may be empty for “auto”)
 * @returns Trimmed id or **`undefined`**
 */
export function normalizedLeadCustomerContactId(
  customerId: string | null | undefined,
  contacts: readonly CustomerContact[],
  selected: string,
): string | undefined {
  const id = selected.trim()
  if (!id || !customerId) return undefined
  return contacts.some((c) => c.id === id) ? id : undefined
}

/**
 * Picks the **`customer_contacts`** row: explicit **`selectedContactId`**, else **primary name** match, else first row.
 *
 * @param customer - Linked customer (may be **`undefined`**)
 * @param contacts - Rows loaded for **`customer.id`**
 * @param selectedContactId - Optional **`customer_contacts.id`** from **`extended_fields.customerContactId`**
 * @returns Best-matching contact or **`null`**
 */
export function resolveCustomerContactForLead(
  customer: LeadLinkedCustomer | null | undefined,
  contacts: readonly CustomerContact[],
  selectedContactId?: string | null,
): CustomerContact | null {
  if (!customer?.id || !contacts.length) return null
  const pick = typeof selectedContactId === 'string' ? selectedContactId.trim() : ''
  if (pick) {
    const chosen = contacts.find((c) => c.id === pick)
    if (chosen) return chosen
  }
  const primary = (customer.primaryContactName ?? '').trim()
  if (primary) {
    const exact = contacts.find((c) => c.name.trim() === primary)
    if (exact) return exact
    const lower = primary.toLowerCase()
    const ci = contacts.find((c) => c.name.trim().toLowerCase() === lower)
    if (ci) return ci
  }
  return contacts[0] ?? null
}

/**
 * Builds a display summary for the lead drawer / detail (name, email, title, phone lines from the CRM).
 *
 * @param customer - Linked customer, or **`null`**
 * @param contacts - **`customer_contacts`** for that customer
 * @param selectedContactId - Optional pinned **`customer_contacts.id`**
 * @returns **`null`** when there is no customer or nothing to show
 */
export function buildLeadImportedContactSummary(
  customer: LeadLinkedCustomer | null | undefined,
  contacts: readonly CustomerContact[],
  selectedContactId?: string | null,
): LeadImportedContactSummary | null {
  if (!customer) return null
  const row = resolveCustomerContactForLead(customer, contacts, selectedContactId)
  const name = (row?.name ?? customer.primaryContactName ?? '').trim()
  const email = (row?.email ?? '').trim()
  const phone = (row?.phone ?? '').trim()
  const mobile = (row?.mobile ?? '').trim()
  const title = (row?.title ?? '').trim()
  if (!name && !email && !phone && !mobile && !title) return null
  return { name, email, phone, mobile, title }
}

/**
 * **`leads.contact_name`** when the identity is sourced from the linked customer.
 *
 * @param customer - Linked customer, or **`null`**
 * @param contacts - **`customer_contacts`** for that customer
 * @param selectedContactId - Optional pinned **`customer_contacts.id`**
 * @returns Trimmed display name or empty string
 */
export function leadContactNameFromCustomer(
  customer: LeadLinkedCustomer | null | undefined,
  contacts: readonly CustomerContact[],
  selectedContactId?: string | null,
): string {
  return (buildLeadImportedContactSummary(customer, contacts, selectedContactId)?.name ?? '').trim()
}
