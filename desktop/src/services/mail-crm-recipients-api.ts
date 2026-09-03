/**
 * CRM customer / contact lookup for the mail composer recipient picker.
 * Visibility follows Supabase RLS plus the caller's group scope.
 */

import {
  listAllCustomerContacts,
  listContactsByCustomerIds,
  listCustomerContacts,
} from '@/services/customer-contacts-api'
import { listCustomers } from '@/services/customers-api'

/** Company row with an email suitable for To / Cc. */
export interface CrmMailCompanyHit {
  kind: 'company'
  customerId: string
  companyName: string
  customerCode: string | null
  email: string
}

/** Contact row with an email suitable for To / Cc. */
export interface CrmMailContactHit {
  kind: 'contact'
  customerId: string
  companyName: string
  contactId: string
  name: string
  title: string | null
  email: string
}

export type CrmMailRecipientHit = CrmMailCompanyHit | CrmMailContactHit

export interface SearchCrmMailRecipientsOptions {
  isSystemAdmin: boolean
  groupId: string | null
  /** Max hits per source (customers / contacts). */
  limit?: number
}

/**
 * Formats a display name and email for a recipient chip field.
 * @param name - Optional display name.
 * @param email - Address.
 * @returns `Name <email>` or bare email.
 */
export function formatCrmMailRecipient(name: string | null | undefined, email: string): string {
  const trimmedEmail = email.trim()
  const trimmedName = (name ?? '').trim()
  if (trimmedName.length > 0) {
    return `${trimmedName} <${trimmedEmail}>`
  }
  return trimmedEmail
}

/**
 * Normalizes an email for dedupe comparisons.
 * @param email - Raw address.
 * @returns Lowercase trimmed email.
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Searches CRM customers (company email) and contacts by name / email / code.
 * Only rows with a non-empty email are returned.
 * When the query matches a company (name / code / email), contacts under those
 * companies are included even if the contact name/email does not contain the query.
 * @param query - Free-text query (company, contact, email, or customer code).
 * @param options - Group / admin scope for listCustomers.
 * @returns Deduped hits (companies first, then contacts).
 */
export async function searchCrmMailRecipients(
  query: string,
  options: SearchCrmMailRecipientsOptions,
): Promise<CrmMailRecipientHit[]> {
  const q = query.trim()
  if (q.length === 0) {
    return []
  }
  if (!options.isSystemAdmin && !options.groupId) {
    return []
  }

  const limit = Math.max(1, Math.min(options.limit ?? 12, 30))

  const [customersResult, contactsResult] = await Promise.all([
    listCustomers({
      page: 1,
      pageSize: limit,
      searchQuery: q,
      isSystemAdmin: options.isSystemAdmin,
      groupId: options.groupId,
    }),
    listAllCustomerContacts({
      page: 1,
      pageSize: limit,
      searchQuery: q,
      isSystemAdmin: options.isSystemAdmin,
      filterGroupId: options.isSystemAdmin ? options.groupId : null,
    }),
  ])

  const matchedCustomerIds = customersResult.rows.map((row) => row.id)
  const contactsUnderMatchedCompanies =
    matchedCustomerIds.length > 0
      ? await listContactsByCustomerIds(matchedCustomerIds, Math.max(limit * 2, 24))
      : []

  const seenEmails = new Set<string>()
  const seenContactIds = new Set<string>()
  const hits: CrmMailRecipientHit[] = []

  for (const row of customersResult.rows) {
    const email = row.email?.trim()
    if (!email) {
      continue
    }
    const key = normalizeEmail(email)
    if (seenEmails.has(key)) {
      continue
    }
    seenEmails.add(key)
    hits.push({
      kind: 'company',
      customerId: row.id,
      companyName: row.companyName,
      customerCode: row.customerCode,
      email,
    })
  }

  /**
   * Appends a contact hit when it has an email and is not already listed.
   * @param row - Contact list row.
   */
  function pushContact(row: {
    id: string
    customerId: string
    companyName: string | null
    name: string
    title: string | null
    email: string | null
  }): void {
    const email = row.email?.trim()
    if (!email) {
      return
    }
    if (seenContactIds.has(row.id)) {
      return
    }
    const key = normalizeEmail(email)
    if (seenEmails.has(key)) {
      return
    }
    seenContactIds.add(row.id)
    seenEmails.add(key)
    hits.push({
      kind: 'contact',
      customerId: row.customerId,
      companyName: row.companyName ?? '',
      contactId: row.id,
      name: row.name,
      title: row.title,
      email,
    })
  }

  for (const row of contactsUnderMatchedCompanies) {
    pushContact(row)
  }
  for (const row of contactsResult.rows) {
    pushContact(row)
  }

  return hits
}

/** Customer detail for the compose “pick contacts under company” step. */
export interface CrmMailCustomerRecipients {
  customerId: string
  companyName: string
  companyEmail: string | null
  contacts: CrmMailContactHit[]
}

/**
 * Loads a customer's company email and contacts that have addresses.
 * @param customerId - Customer id.
 * @param companyName - Display name (from search row).
 * @param companyEmail - Company email from search when already known.
 * @returns Company + contact recipients with email.
 */
export async function loadCrmMailCustomerRecipients(
  customerId: string,
  companyName: string,
  companyEmail: string | null,
): Promise<CrmMailCustomerRecipients> {
  const contacts = await listCustomerContacts(customerId)
  const withEmail: CrmMailContactHit[] = []
  const seen = new Set<string>()

  const company = companyEmail?.trim() || null
  if (company) {
    seen.add(normalizeEmail(company))
  }

  for (const row of contacts) {
    const email = row.email?.trim()
    if (!email) {
      continue
    }
    const key = normalizeEmail(email)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    withEmail.push({
      kind: 'contact',
      customerId,
      companyName,
      contactId: row.id,
      name: row.name,
      title: row.title,
      email,
    })
  }

  return {
    customerId,
    companyName,
    companyEmail: company,
    contacts: withEmail,
  }
}

/**
 * Searches customers by name / code / email for the compose company picker
 * (includes companies without email so the user can still open contacts).
 * @param query - Free-text query.
 * @param options - Group / admin scope.
 * @returns Compact customer rows.
 */
export async function searchCrmMailCustomers(
  query: string,
  options: SearchCrmMailRecipientsOptions,
): Promise<Array<{
  customerId: string
  companyName: string
  customerCode: string | null
  email: string | null
}>> {
  const q = query.trim()
  if (q.length === 0) {
    return []
  }
  if (!options.isSystemAdmin && !options.groupId) {
    return []
  }

  const limit = Math.max(1, Math.min(options.limit ?? 15, 30))
  const result = await listCustomers({
    page: 1,
    pageSize: limit,
    searchQuery: q,
    isSystemAdmin: options.isSystemAdmin,
    groupId: options.groupId,
  })

  return result.rows.map((row) => ({
    customerId: row.id,
    companyName: row.companyName,
    customerCode: row.customerCode,
    email: row.email?.trim() || null,
  }))
}
