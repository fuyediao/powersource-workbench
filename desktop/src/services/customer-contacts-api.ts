/**
 * Supabase CRUD for customer_contacts under a customer.
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type {
  CustomerContact,
  CustomerContactInput,
  CustomerContactListRow,
} from '@/types/customer'

/** Page size for the Admin contacts list (web LIST_PAGE_SIZE parity). */
export const CONTACTS_LIST_PAGE_SIZE = 20

/**
 * Maps a raw row to CustomerContact.
 * @param row - Supabase row.
 * @returns Contact.
 */
function mapRow(row: Record<string, unknown>): CustomerContact {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    groupId: (row.group_id as string | null) ?? null,
    name: String(row.name ?? ''),
    title: (row.title as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    phoneCountry: (row.phone_country as string | null) ?? null,
    mobile: (row.mobile as string | null) ?? null,
    mobileCountry: (row.mobile_country as string | null) ?? null,
    remarks: (row.remarks as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  }
}

/**
 * Maps a joined contacts + customers row to a list row.
 * @param row - Supabase row with optional `customers` embed.
 * @returns List row with company name.
 */
function mapListRow(row: Record<string, unknown>): CustomerContactListRow {
  const base = mapRow(row)
  const customers = row.customers as { company_name?: string } | null | undefined
  return {
    ...base,
    companyName: customers?.company_name ?? null,
  }
}

/**
 * Trims empty strings to null.
 * @param value - Optional string.
 * @returns Trimmed or null.
 */
function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Lists contacts for a customer.
 * @param customerId - Parent customer id.
 * @returns Contacts ordered by created_at.
 */
export async function listCustomerContacts(customerId: string): Promise<CustomerContact[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { data, error } = await supabase
    .from('customer_contacts')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: true })
    .limit(500)
  if (error) {
    console.error('[customer-contacts-api] list:', error)
    throw error
  }
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>))
}

export interface ListAllCustomerContactsOptions {
  page: number
  pageSize?: number
  searchQuery?: string
  filterGroupId?: string | null
  isSystemAdmin?: boolean
}

export interface ListAllCustomerContactsResult {
  rows: CustomerContactListRow[]
  totalCount: number
}

/**
 * Lists all contacts visible to the current user (RLS), with parent company name.
 * Used by the Admin contacts list page.
 * @param options - Pagination, search, and system-admin group filter.
 * @returns Page of contacts and total count.
 */
export async function listAllCustomerContacts(
  options: ListAllCustomerContactsOptions,
): Promise<ListAllCustomerContactsResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const pageSize = Math.max(1, options.pageSize ?? CONTACTS_LIST_PAGE_SIZE)
  const page = Math.max(1, options.page)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('customer_contacts')
    .select('*, customers ( company_name )', { count: 'exact' })
    .order('updated_at', { ascending: false })

  if (options.isSystemAdmin && options.filterGroupId) {
    query = query.eq('group_id', options.filterGroupId)
  }

  const q = (options.searchQuery ?? '').trim()
  if (q) {
    const pattern = `%${q}%`
    query = query.or(`name.ilike.${pattern},email.ilike.${pattern}`)
  }

  const { data, count, error } = await query.range(from, to)
  if (error) {
    console.error('[customer-contacts-api] listAll:', error)
    throw error
  }
  return {
    rows: (data ?? []).map((row) => mapListRow(row as Record<string, unknown>)),
    totalCount: count ?? 0,
  }
}

/**
 * Lists contacts that belong to the given customers (RLS-scoped), with company name.
 * Used when a company-code / company-name search should also surface contact emails.
 * @param customerIds - Parent customer ids.
 * @param limit - Max rows to return.
 * @returns Contacts ordered by updated_at (newest first).
 */
export async function listContactsByCustomerIds(
  customerIds: readonly string[],
  limit = 40,
): Promise<CustomerContactListRow[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const ids = [...new Set(customerIds.map((id) => id.trim()).filter((id) => id.length > 0))]
  if (ids.length === 0) {
    return []
  }
  const pageSize = Math.max(1, Math.min(limit, 100))
  const { data, error } = await supabase
    .from('customer_contacts')
    .select('*, customers ( company_name )')
    .in('customer_id', ids)
    .order('updated_at', { ascending: false })
    .limit(pageSize)
  if (error) {
    console.error('[customer-contacts-api] listByCustomerIds:', error)
    throw error
  }
  return (data ?? []).map((row) => mapListRow(row as Record<string, unknown>))
}

/**
 * Creates a contact under a customer.
 * @param customerId - Parent customer id.
 * @param groupId - Workspace group id.
 * @param input - Contact fields.
 * @returns Created contact.
 */
export async function createCustomerContact(
  customerId: string,
  groupId: string | null,
  input: CustomerContactInput,
): Promise<CustomerContact> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const name = input.name.trim()
  if (!name) {
    throw new Error('name_required')
  }
  const { data, error } = await supabase
    .from('customer_contacts')
    .insert({
      customer_id: customerId,
      group_id: groupId,
      name,
      title: emptyToNull(input.title),
      email: emptyToNull(input.email),
      phone: emptyToNull(input.phone),
      phone_country: emptyToNull(input.phoneCountry),
      mobile: emptyToNull(input.mobile),
      mobile_country: emptyToNull(input.mobileCountry),
      remarks: emptyToNull(input.remarks),
    })
    .select('*')
    .single()
  if (error) {
    console.error('[customer-contacts-api] create:', error)
    throw error
  }
  return mapRow(data as Record<string, unknown>)
}

/**
 * Updates a contact.
 * @param id - Contact id.
 * @param input - Contact fields.
 * @returns Updated contact.
 */
export async function updateCustomerContact(
  id: string,
  input: CustomerContactInput,
): Promise<CustomerContact> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const name = input.name.trim()
  if (!name) {
    throw new Error('name_required')
  }
  const { data, error } = await supabase
    .from('customer_contacts')
    .update({
      name,
      title: emptyToNull(input.title),
      email: emptyToNull(input.email),
      phone: emptyToNull(input.phone),
      phone_country: emptyToNull(input.phoneCountry),
      mobile: emptyToNull(input.mobile),
      mobile_country: emptyToNull(input.mobileCountry),
      remarks: emptyToNull(input.remarks),
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error) {
    console.error('[customer-contacts-api] update:', error)
    throw error
  }
  return mapRow(data as Record<string, unknown>)
}

/**
 * Deletes a contact.
 * @param id - Contact id.
 * @returns Nothing.
 */
export async function deleteCustomerContact(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { error } = await supabase.from('customer_contacts').delete().eq('id', id)
  if (error) {
    console.error('[customer-contacts-api] delete:', error)
    throw error
  }
}
