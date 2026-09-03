import type { CustomerContact } from '@/types/customer'
import type { LeadLinkedCustomer } from '@/types/lead'

/** One row in the lead drawer’s contact multi-select (name + optional phone/email hints). */
export interface LeadFormContactOption {
  name: string
  phone: string | null
  email: string | null
}

/**
 * Returns a trimmed phone string for a contact dropdown row, or empty when absent.
 *
 * @param phone - Phone or mobile from the customer / contact row
 * @returns Non-empty display text, or **`''`** to hide the suffix
 */
export function leadContactRowPhoneLabel(phone: string | null | undefined): string {
  if (typeof phone !== 'string') return ''
  return phone.trim()
}

/** Max contact names on the **closed** multi-select trigger before a localized “+N …” suffix. */
export const LEAD_CONTACT_TRIGGER_MAX_NAMES = 3

/**
 * Builds the closed-trigger label: up to {@link LEAD_CONTACT_TRIGGER_MAX_NAMES} names joined by **`joiner`**, then **`moreSuffix(extra)`** when more are selected.
 *
 * @param names - Selected display names in order
 * @param joiner - Separator (e.g. ideographic comma)
 * @param moreSuffix - Localized tail for **`extra > 0`** contacts not shown (e.g. from i18n **`{count}`**)
 * @returns Single-line summary for the trigger button
 */
export function formatLeadContactTriggerLabel(
  names: readonly string[],
  joiner: string,
  moreSuffix: (extra: number) => string,
): string {
  if (names.length <= LEAD_CONTACT_TRIGGER_MAX_NAMES) return names.join(joiner)
  const head = names.slice(0, LEAD_CONTACT_TRIGGER_MAX_NAMES).join(joiner)
  return `${head}${moreSuffix(names.length - LEAD_CONTACT_TRIGGER_MAX_NAMES)}`
}

/**
 * Normalizes a display name for duplicate detection (trim + ASCII lower-case).
 *
 * @param name - Raw contact name
 * @returns Key string, or empty if only whitespace
 */
function contactOptionDedupeKey(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * Builds lead-drawer contact picker rows: the customer’s **primary** contact first, then
 * **`customer_contacts`**. If the same person appears on the customer row and again in the
 * contacts table (same trimmed name), only **one** row is kept (primary row wins for order).
 *
 * @param customer - Linked customer (main name + phone/email from the customer row)
 * @param contactsFromTable - `customer_contacts` rows for that customer
 * @returns Options for the multi-select, stable order
 */
export function buildLeadFormContactOptions(
  customer: LeadLinkedCustomer,
  contactsFromTable: readonly CustomerContact[],
): LeadFormContactOption[] {
  const mainNameRaw = customer.contactName ?? customer.primaryContactName ?? ''
  const main: LeadFormContactOption = {
    name: mainNameRaw,
    phone: customer.phone ?? null,
    email: customer.email ?? null,
  }
  const fromTable: LeadFormContactOption[] = contactsFromTable.map((c) => ({
    name: c.name,
    phone: c.phone ?? c.mobile ?? null,
    email: c.email ?? null,
  }))
  const out: LeadFormContactOption[] = []
  const seen = new Set<string>()
  const pushUnique = (o: LeadFormContactOption): void => {
    const key = contactOptionDedupeKey(o.name)
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push(o)
  }
  if (contactOptionDedupeKey(main.name)) pushUnique(main)
  for (const o of fromTable) pushUnique(o)
  return out
}
