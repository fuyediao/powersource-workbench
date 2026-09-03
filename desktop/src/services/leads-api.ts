/**
 * Lead pool + CRUD against Supabase `leads` (web `useCrmMap` parity:
 * list / CRUD / claim / release / group directory, scalar columns, and
 * `lead_contacts` cards).
 */

import { emptyLeadExtendedForm, type LeadExtendedFieldKey } from '@/constants/lead-extended-form'
import { leadScalarsToDbPatch, parseLeadScalarsFromRow } from '@/constants/lead-scalar-columns'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { fromLoose, type LooseFilterBuilder } from '@/lib/supabase-loose'
import {
  LEAD_SELECT_WITH_CONTACTS,
  mapLeadContactRowsToProfiles,
  replaceLeadContacts,
} from '@/services/lead-contacts-repository'
import type {
  Lead,
  LeadFormInput,
  LeadListResult,
  LeadListScopeFilter,
} from '@/types/lead'
import { omitLeadContactProfileStringKeys } from '@/utils/lead-contact-profiles'

/** Default page size for the Admin Leads list (web parity). */
export const LEADS_PAGE_SIZE = 20

/**
 * Builds a full extended form string map from lead scalars (for create/update patches).
 * @param fields - Partial extended fields from the form.
 * @returns Full string map with contact-card keys omitted.
 */
function formStringsFromExtended(
  fields: LeadFormInput['extendedFields'],
): Record<LeadExtendedFieldKey, string> {
  const base = emptyLeadExtendedForm()
  if (!fields) {
    return base
  }
  for (const key of Object.keys(base) as LeadExtendedFieldKey[]) {
    const value = fields[key]
    if (typeof value === 'string') {
      base[key] = value
    }
  }
  return omitLeadContactProfileStringKeys(base)
}

/**
 * Reads an optional string column.
 * @param value - Raw column value.
 * @returns Trimmed string, or null.
 */
function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/**
 * Maps a raw `leads` row (optionally with nested contacts) to {@link Lead}.
 * @param row - Supabase row.
 * @returns Typed lead.
 */
function mapLeadRow(row: Record<string, unknown>): Lead {
  const scalars = parseLeadScalarsFromRow(row)
  const contactRows = row.lead_contacts as Parameters<typeof mapLeadContactRowsToProfiles>[0]
  return {
    id: String(row.id),
    companyName: String(row.company_name ?? ''),
    contactName: textOrNull(row.contact_name),
    phone: textOrNull(row.phone),
    phoneCountry: textOrNull(row.phone_country),
    email: textOrNull(row.email),
    status: (row.status as Lead['status']) ?? 'unhandled',
    lat: row.lat != null ? Number(row.lat) : null,
    lng: row.lng != null ? Number(row.lng) : null,
    ownerId: (row.owner_id as string | null) ?? null,
    claimedAt: textOrNull(row.claimed_at),
    customerId: (row.customer_id as string | null) ?? null,
    lastContactDate: textOrNull(row.last_contact_date),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
    extendedFields: { ...scalars },
    contactProfiles: mapLeadContactRowsToProfiles(contactRows),
  }
}

/**
 * Converts a form model to a `leads` write payload (core + scalar columns).
 * @param input - Editable lead fields.
 * @returns snake_case payload.
 */
function formToPayload(input: LeadFormInput): Record<string, unknown> {
  const scalarPatch = leadScalarsToDbPatch(formStringsFromExtended(input.extendedFields))
  return {
    company_name: input.companyName.trim(),
    contact_name: input.contactName,
    phone: input.phone,
    phone_country: input.phoneCountry?.trim() || null,
    email: input.email,
    status: input.status,
    customer_id: input.customerId,
    last_contact_date: input.lastContactDate,
    extended_fields: {},
    ...scalarPatch,
  }
}

/**
 * Reloads one lead with nested contact cards.
 * @param id - Lead uuid.
 * @returns Typed lead.
 */
async function fetchLeadWithContacts(id: string): Promise<Lead> {
  const { data, error } = await fromLoose('leads')
    .select(LEAD_SELECT_WITH_CONTACTS)
    .eq('id', id)
    .single()
  if (error) {
    throw error
  }
  return mapLeadRow(data as Record<string, unknown>)
}

/**
 * Applies the sidebar scope filter (pool view or pipeline status) and search
 * to a `leads` list query.
 * @param query - Base Supabase query builder.
 * @param scope - Pool scope or status filter.
 * @param uid - Current user id.
 * @param searchQuery - Optional company-name search.
 * @returns Query with filters applied.
 */
function applyLeadsListFilters(
  query: LooseFilterBuilder,
  scope: LeadListScopeFilter,
  uid: string,
  searchQuery: string,
): LooseFilterBuilder {
  let next = query
  if (scope === 'public') {
    next = next.is('owner_id', null)
  } else if (scope === 'mine') {
    next = next.eq('owner_id', uid)
  } else if (scope !== 'all') {
    next = next.eq('status', scope)
  } else {
    next = next.or(`owner_id.is.null,owner_id.eq.${uid}`)
  }

  const q = searchQuery.trim()
  if (q) {
    next = next.ilike('company_name', `%${q}%`)
  }
  return next
}

/**
 * Lists leads for the Admin list with pool scope, search, and pagination.
 * @param options - Page, search, scope, and current user id.
 * @returns Rows plus total count.
 */
export async function listLeads(options: {
  page?: number
  pageSize?: number
  searchQuery?: string
  scope?: LeadListScopeFilter
  userId: string
}): Promise<LeadListResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const pageSize = Math.max(1, options.pageSize ?? LEADS_PAGE_SIZE)
  const page = Math.max(1, options.page ?? 1)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = fromLoose('leads').select(LEAD_SELECT_WITH_CONTACTS, { count: 'exact' })
  query = applyLeadsListFilters(
    query,
    options.scope ?? 'all',
    options.userId,
    options.searchQuery ?? '',
  )

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to)
  if (error) {
    console.error('[leads-api] listLeads:', error)
    throw error
  }
  return {
    rows: (data ?? []).map((row) => mapLeadRow(row as Record<string, unknown>)),
    totalCount: count ?? 0,
  }
}

/**
 * Lists leads whose `owner_id` is in the given group-member user ids
 * (Admin group-directory tab; requires the `leads_group_directory_select`
 * RLS policy).
 * @param memberUserIds - Group member auth.users uuids.
 * @returns Leads owned by any of the given members, newest first.
 */
export async function listLeadsForGroupMemberOwners(
  memberUserIds: string[],
): Promise<Lead[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  if (memberUserIds.length === 0) {
    return []
  }
  const { data, error } = await fromLoose('leads')
    .select(LEAD_SELECT_WITH_CONTACTS)
    .in('owner_id', memberUserIds)
    .not('owner_id', 'is', null)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[leads-api] listLeadsForGroupMemberOwners:', error)
    throw error
  }
  return (data ?? []).map((row) => mapLeadRow(row as Record<string, unknown>))
}

/**
 * Loads one lead by id.
 * @param id - Lead uuid.
 * @returns Lead, or null when missing.
 */
export async function getLeadById(id: string): Promise<Lead | null> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { data, error } = await fromLoose('leads')
    .select(LEAD_SELECT_WITH_CONTACTS)
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('[leads-api] getLeadById:', error)
    throw error
  }
  return data ? mapLeadRow(data as Record<string, unknown>) : null
}

/**
 * Creates a lead owned by the current user.
 * @param ownerId - Auth user id of the creator (initial owner).
 * @param input - Editable lead fields.
 * @returns Created lead.
 */
export async function createLead(
  ownerId: string,
  input: LeadFormInput,
): Promise<Lead> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  if (!input.companyName.trim()) {
    throw new Error('lead_company_name_required')
  }
  const { data, error } = await fromLoose('leads')
    .insert({ ...formToPayload(input), owner_id: ownerId })
    .select(LEAD_SELECT_WITH_CONTACTS)
    .single()
  if (error) {
    console.error('[leads-api] createLead:', error)
    throw error
  }
  const created = mapLeadRow(data as Record<string, unknown>)
  if (input.contactProfiles?.length) {
    await replaceLeadContacts(created.id, input.contactProfiles)
    return fetchLeadWithContacts(created.id)
  }
  return created
}

/**
 * Updates a lead owned by the given user (RLS guard mirrors web: only the
 * owner may edit).
 * @param id - Lead uuid.
 * @param ownerId - Current user id (must match `leads.owner_id`).
 * @param input - Editable lead fields.
 * @returns Updated lead.
 */
export async function updateLead(
  id: string,
  ownerId: string,
  input: LeadFormInput,
): Promise<Lead> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  if (!input.companyName.trim()) {
    throw new Error('lead_company_name_required')
  }
  const { error } = await fromLoose('leads')
    .update(formToPayload(input))
    .eq('id', id)
    .eq('owner_id', ownerId)
  if (error) {
    console.error('[leads-api] updateLead:', error)
    throw error
  }
  await replaceLeadContacts(id, input.contactProfiles)
  return fetchLeadWithContacts(id)
}

/**
 * Deletes a lead owned by the given user.
 * @param id - Lead uuid.
 * @param ownerId - Current user id (must match `leads.owner_id`).
 * @returns Nothing.
 */
export async function deleteLead(id: string, ownerId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { error } = await fromLoose('leads')
    .delete()
    .eq('id', id)
    .eq('owner_id', ownerId)
  if (error) {
    console.error('[leads-api] deleteLead:', error)
    throw error
  }
}

/**
 * Claims a public-pool lead for the current user.
 * @param leadId - Lead uuid.
 * @param userId - Current user id.
 * @returns Updated lead.
 */
export async function claimLead(leadId: string, userId: string): Promise<Lead> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { error } = await fromLoose('leads')
    .update({ owner_id: userId, claimed_at: new Date().toISOString() })
    .eq('id', leadId)
    .is('owner_id', null)
  if (error) {
    console.error('[leads-api] claimLead:', error)
    throw error
  }
  return fetchLeadWithContacts(leadId)
}

/**
 * Links or unlinks a CRM customer on an owned lead (list-row action).
 * Does not rewrite contact cards or scalar columns.
 * @param id - Lead uuid.
 * @param ownerId - Current user id (must match `leads.owner_id`).
 * @param customerId - Customer uuid, or null to unlink.
 * @returns Updated lead.
 */
export async function updateLeadCustomerId(
  id: string,
  ownerId: string,
  customerId: string | null,
): Promise<Lead> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { error } = await fromLoose('leads')
    .update({ customer_id: customerId })
    .eq('id', id)
    .eq('owner_id', ownerId)
  if (error) {
    console.error('[leads-api] updateLeadCustomerId:', error)
    throw error
  }
  return fetchLeadWithContacts(id)
}

/**
 * Releases an owned lead back to the public pool.
 * @param leadId - Lead uuid.
 * @param userId - Current user id (must match `leads.owner_id`).
 * @returns Updated lead.
 */
export async function releaseLead(leadId: string, userId: string): Promise<Lead> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { error } = await fromLoose('leads')
    .update({ owner_id: null, claimed_at: null })
    .eq('id', leadId)
    .eq('owner_id', userId)
  if (error) {
    console.error('[leads-api] releaseLead:', error)
    throw error
  }
  return fetchLeadWithContacts(leadId)
}
