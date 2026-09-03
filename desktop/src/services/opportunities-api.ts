/**
 * Opportunities list + CRUD against Supabase `opportunities`.
 * Ported from geocrm-web `useOpportunities` (list / board / CRUD / attachments).
 * Collaborators and product lines stay web-only.
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { fromLoose } from '@/lib/supabase-loose'
import type {
  Opportunity,
  OpportunityAttachment,
  OpportunityFormInput,
  OpportunityLeadOption,
  OpportunityListResult,
} from '@/types/opportunity'

/** Default page size for the Admin Opportunities list (web parity). */
export const OPPORTUNITIES_PAGE_SIZE = 20

/** Storage bucket for opportunity files (web parity). */
export const OPPORTUNITY_ATTACHMENTS_BUCKET = 'opportunity-attachments'

/** Max attachment size: 20 MB per file (web parity). */
export const OPPORTUNITY_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024

const OPP_SELECT =
  'id, name, customer_id, amount, stage, expected_close_date, owner_id, sales_process, currency_code, exchange_rate, lead_id, notes, group_id, created_at, updated_at, customers(company_name)'

/**
 * Maps a raw `opportunities` row (with joined `customers.company_name`) to {@link Opportunity}.
 * @param row - Supabase row.
 * @returns Typed opportunity.
 */
function mapOpportunityRow(row: Record<string, unknown>): Opportunity {
  const customersJoin = row.customers as { company_name?: string } | null
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    customerId: (row.customer_id as string | null) ?? null,
    amount: row.amount != null ? Number(row.amount) : null,
    stage: String(row.stage ?? ''),
    expectedCloseDate: (row.expected_close_date as string | null) ?? null,
    ownerId: String(row.owner_id ?? ''),
    salesProcess: (row.sales_process as Opportunity['salesProcess']) ?? null,
    currencyCode: (row.currency_code as string | null) ?? 'USD',
    exchangeRate: row.exchange_rate != null ? Number(row.exchange_rate) : 1,
    leadId: (row.lead_id as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    groupId: (row.group_id as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
    companyName: customersJoin?.company_name ?? null,
  }
}

/**
 * Converts a form model to an `opportunities` write payload (core fields only).
 * @param input - Editable opportunity fields.
 * @returns snake_case payload.
 */
function formToPayload(input: OpportunityFormInput): Record<string, unknown> {
  return {
    name: input.name.trim(),
    customer_id: input.customerId,
    amount: input.amount,
    stage: input.stage,
    expected_close_date: input.expectedCloseDate,
    sales_process: input.salesProcess,
    currency_code: input.currencyCode,
    exchange_rate: input.exchangeRate ?? 1,
    lead_id: input.leadId,
    notes: input.notes,
  }
}

/**
 * Resolves the denormalized `group_id` for a new opportunity: prefer the
 * attached customer, then the source lead's customer (web parity).
 * @param customerId - Selected account id, or null.
 * @param leadId - Selected source lead id, or null.
 * @returns Resolved group id, or null when nothing resolves.
 */
async function resolveGroupId(
  customerId: string | null,
  leadId: string | null,
): Promise<string | null> {
  if (!supabase) {
    return null
  }
  if (customerId) {
    const { data } = await supabase
      .from('customers')
      .select('group_id')
      .eq('id', customerId)
      .maybeSingle()
    const groupId = (data as { group_id?: string | null } | null)?.group_id ?? null
    if (groupId) {
      return groupId
    }
  }
  if (leadId) {
    const { data: leadRow } = await fromLoose('leads')
      .select('customer_id')
      .eq('id', leadId)
      .maybeSingle()
    const leadCustomerId = (leadRow as { customer_id?: string | null } | null)?.customer_id ?? null
    if (leadCustomerId) {
      const { data } = await supabase
        .from('customers')
        .select('group_id')
        .eq('id', leadCustomerId)
        .maybeSingle()
      return (data as { group_id?: string | null } | null)?.group_id ?? null
    }
  }
  return null
}

/**
 * Lists opportunities for the Admin list with search, filters, and pagination.
 * @param options - Page, search, filters, and optional system-admin group scope.
 * @returns Rows plus total count.
 */
export async function listOpportunities(options: {
  page?: number
  pageSize?: number
  searchQuery?: string
  salesProcessFilter?: string
  stageFilter?: string
  groupFilter?: string | null
}): Promise<OpportunityListResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const pageSize = Math.max(1, options.pageSize ?? OPPORTUNITIES_PAGE_SIZE)
  const page = Math.max(1, options.page ?? 1)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = fromLoose('opportunities').select(OPP_SELECT, { count: 'exact' })
  const q = (options.searchQuery ?? '').trim()
  if (q) {
    query = query.ilike('name', `%${q}%`)
  }
  if (options.salesProcessFilter) {
    query = query.eq('sales_process', options.salesProcessFilter)
  }
  if (options.stageFilter) {
    query = query.eq('stage', options.stageFilter)
  }
  if (options.groupFilter) {
    query = query.eq('group_id', options.groupFilter)
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to)
  if (error) {
    console.error('[opportunities-api] listOpportunities:', error)
    throw error
  }
  return {
    rows: (data ?? []).map((row) => mapOpportunityRow(row)),
    totalCount: count ?? 0,
  }
}

/** Max rows for the Freeform board (PostgREST page cap). */
const BOARD_FETCH_LIMIT = 1000

/**
 * Lists opportunities for the Admin board canvas (no pagination).
 * @param options - Optional search and system-admin group scope.
 * @returns Opportunity rows (newest first).
 */
export async function listOpportunitiesBoard(options?: {
  searchQuery?: string
  groupFilter?: string | null
}): Promise<Opportunity[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  let query = fromLoose('opportunities').select(OPP_SELECT)
  const q = (options?.searchQuery ?? '').trim()
  if (q) {
    query = query.ilike('name', `%${q}%`)
  }
  if (options?.groupFilter) {
    query = query.eq('group_id', options.groupFilter)
  }
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .range(0, BOARD_FETCH_LIMIT - 1)
  if (error) {
    console.error('[opportunities-api] listOpportunitiesBoard:', error)
    throw error
  }
  return (data ?? []).map((row) => mapOpportunityRow(row))
}

/**
 * Loads one opportunity by id.
 * @param id - Opportunity uuid.
 * @returns Opportunity, or null when missing.
 */
export async function getOpportunityById(id: string): Promise<Opportunity | null> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { data, error } = await fromLoose('opportunities')
    .select(OPP_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('[opportunities-api] getOpportunityById:', error)
    throw error
  }
  return data ? mapOpportunityRow(data) : null
}

/**
 * Creates an opportunity owned by the given user (web parity: resolves `group_id`
 * from the account or source lead so the system-admin group filter can scope it).
 * @param ownerId - Auth user id of the creator (initial owner).
 * @param input - Editable opportunity fields.
 * @returns Created opportunity.
 */
export async function createOpportunity(
  ownerId: string,
  input: OpportunityFormInput,
): Promise<Opportunity> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  if (!input.name.trim()) {
    throw new Error('opportunity_name_required')
  }
  if (!input.customerId) {
    throw new Error('opportunity_account_required')
  }
  const groupId = await resolveGroupId(input.customerId, input.leadId)
  const { data, error } = await fromLoose('opportunities')
    .insert({ ...formToPayload(input), owner_id: ownerId, group_id: groupId })
    .select(OPP_SELECT)
    .single()
  if (error) {
    console.error('[opportunities-api] createOpportunity:', error)
    throw error
  }
  return mapOpportunityRow(data)
}

/**
 * Updates an opportunity (owner / edit-permission enforced by RLS).
 * @param id - Opportunity uuid.
 * @param input - Editable opportunity fields.
 * @returns Updated opportunity.
 */
export async function updateOpportunity(
  id: string,
  input: OpportunityFormInput,
): Promise<Opportunity> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  if (!input.name.trim()) {
    throw new Error('opportunity_name_required')
  }
  if (!input.customerId) {
    throw new Error('opportunity_account_required')
  }
  const { data, error } = await fromLoose('opportunities')
    .update(formToPayload(input))
    .eq('id', id)
    .select(OPP_SELECT)
    .single()
  if (error) {
    console.error('[opportunities-api] updateOpportunity:', error)
    throw error
  }
  return mapOpportunityRow(data)
}

/**
 * Deletes an opportunity (delete write grant enforced by RLS).
 * @param id - Opportunity uuid.
 * @returns Nothing.
 */
export async function deleteOpportunity(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { error } = await fromLoose('opportunities').delete().eq('id', id)
  if (error) {
    console.error('[opportunities-api] deleteOpportunity:', error)
    throw error
  }
}

/**
 * Lists source-lead options for one customer (opportunity form picker).
 * @param customerId - Selected account id.
 * @returns Lead options, best display label first (lead name, else company name).
 */
export async function listLeadOptionsForCustomer(
  customerId: string,
): Promise<OpportunityLeadOption[]> {
  if (!isSupabaseConfigured || !supabase) {
    return []
  }
  const { data, error } = await fromLoose('leads')
    .select('id, company_name, contact_name')
    .eq('customer_id', customerId)
    .order('company_name', { ascending: true })
  if (error) {
    console.error('[opportunities-api] listLeadOptionsForCustomer:', error)
    return []
  }
  return (data ?? []).map((row) => {
    const companyName = String(row.company_name ?? '')
    const contactName = (row.contact_name as string | null) ?? null
    return {
      id: String(row.id),
      displayLabel: contactName ? `${companyName} · ${contactName}` : companyName,
    }
  })
}

/**
 * Maps a raw `opportunity_attachments` row.
 * @param row - Supabase row.
 * @returns Typed attachment.
 */
function mapAttachmentRow(row: Record<string, unknown>): OpportunityAttachment {
  return {
    id: String(row.id),
    opportunityId: String(row.opportunity_id),
    storagePath: String(row.storage_path ?? ''),
    fileName: String(row.file_name ?? ''),
    byteSize: row.byte_size != null ? Number(row.byte_size) : null,
    mimeType: (row.mime_type as string | null) ?? null,
    uploadedBy: (row.uploaded_by as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
  }
}

/**
 * Lists attachment metadata for one opportunity (oldest first).
 * @param opportunityId - Opportunity uuid.
 * @returns Attachment rows.
 */
export async function listOpportunityAttachments(
  opportunityId: string,
): Promise<OpportunityAttachment[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { data, error } = await fromLoose('opportunity_attachments')
    .select(
      'id, opportunity_id, storage_path, file_name, byte_size, mime_type, uploaded_by, created_at',
    )
    .eq('opportunity_id', opportunityId)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[opportunities-api] listOpportunityAttachments:', error)
    throw error
  }
  return (data ?? []).map((row) => mapAttachmentRow(row))
}

/**
 * Uploads a file to Storage and inserts `opportunity_attachments` (max 20 MB).
 * @param opportunityId - Opportunity uuid.
 * @param file - Browser File to upload.
 * @param uploadedBy - Auth user id of the uploader.
 * @returns Created attachment row.
 */
export async function uploadOpportunityAttachment(
  opportunityId: string,
  file: File,
  uploadedBy: string,
): Promise<OpportunityAttachment> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  if (file.size > OPPORTUNITY_ATTACHMENT_MAX_BYTES) {
    throw new Error('opportunity_attachment_too_large')
  }
  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${opportunityId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  const { error: upErr } = await supabase.storage
    .from(OPPORTUNITY_ATTACHMENTS_BUCKET)
    .upload(path, file, { upsert: false })
  if (upErr) {
    console.error('[opportunities-api] uploadOpportunityAttachment storage:', upErr)
    throw upErr
  }
  const { data: inserted, error: insErr } = await fromLoose('opportunity_attachments')
    .insert({
      opportunity_id: opportunityId,
      storage_path: path,
      file_name: file.name,
      byte_size: file.size,
      mime_type: file.type || null,
      uploaded_by: uploadedBy,
    })
    .select(
      'id, opportunity_id, storage_path, file_name, byte_size, mime_type, uploaded_by, created_at',
    )
    .single()
  if (insErr || !inserted) {
    console.error('[opportunities-api] uploadOpportunityAttachment insert:', insErr)
    throw insErr ?? new Error('opportunity_attachment_insert_failed')
  }
  return mapAttachmentRow(inserted)
}

/**
 * Deletes an attachment from Storage and removes the metadata row.
 * @param attachment - Attachment to remove.
 * @returns Nothing.
 */
export async function deleteOpportunityAttachment(
  attachment: OpportunityAttachment,
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { error: storageError } = await supabase.storage
    .from(OPPORTUNITY_ATTACHMENTS_BUCKET)
    .remove([attachment.storagePath])
  if (storageError) {
    console.error('[opportunities-api] deleteOpportunityAttachment storage:', storageError)
  }
  const { error } = await fromLoose('opportunity_attachments').delete().eq('id', attachment.id)
  if (error) {
    console.error('[opportunities-api] deleteOpportunityAttachment row:', error)
    throw error
  }
}

/**
 * Returns a signed URL (60 minutes) for downloading an opportunity attachment.
 * @param storagePath - Object path in the `opportunity-attachments` bucket.
 * @returns Signed URL.
 */
export async function getOpportunityAttachmentUrl(storagePath: string): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { data, error } = await supabase.storage
    .from(OPPORTUNITY_ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, 3600)
  if (error || !data?.signedUrl) {
    console.error('[opportunities-api] getOpportunityAttachmentUrl:', error)
    throw error ?? new Error('opportunity_attachment_url_failed')
  }
  return data.signedUrl
}

/**
 * Downloads opportunity attachment bytes from Storage.
 * @param storagePath - Object path in the opportunity attachments bucket.
 * @returns File blob.
 */
export async function fetchOpportunityAttachmentBlob(storagePath: string): Promise<Blob> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { data, error } = await supabase.storage
    .from(OPPORTUNITY_ATTACHMENTS_BUCKET)
    .download(storagePath)
  if (error || !data) {
    console.error('[opportunities-api] download blob:', error)
    throw error ?? new Error('download_failed')
  }
  return data
}

