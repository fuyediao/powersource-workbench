/**
 * Supabase CRUD for `customer_visit_log` (Vue `customerVisitLogRepository` parity).
 */

import { fromLoose } from '@/lib/supabase-loose'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { fetchProductCatalogIdLabelMap } from '@/services/orders-te-api'
import { fetchCurrentGroup } from '@/services/groups-api'
import type {
  CustomerVisitLog,
  CustomerVisitLogInput,
  CustomerVisitLogUpdateInput,
  VisitLogNewCustomerInput,
  VisitMeta,
} from '@/types/customer'
import { convertImageToWebP } from '@/utils/image-upload'
import { profileDisplayLabel } from '@/utils/profile-display-label'
import {
  allocateVisitLogCustomerCode,
  isCustomerCodeUniqueViolation,
} from '@/utils/customer-code-uniqueness'
import {
  isAllowedVisitLogDocument,
  mapVisitLogDocumentFiles,
  MAX_VISIT_LOG_DOCUMENTS,
  resolveVisitLogDocumentMime,
  serializeVisitLogDocumentFiles,
  VISIT_LOG_DOCUMENT_MAX_BYTES,
  VISIT_LOG_DOCUMENTS_BUCKET,
  visitLogDocumentExt,
  type VisitLogDocumentFile,
} from '@/utils/visit-log-documents'

const VISIT_LOG_IMAGES_BUCKET = 'visit-log-images'
const MAX_VISIT_LOG_IMAGES = 5
const VISIT_LOG_SELECT = '*, customers ( company_name ), kols ( name )'

/** Page size for the Admin visit-log list. */
export const VISIT_LOG_LIST_PAGE_SIZE = 20

/**
 * Maps a raw Supabase row to CustomerVisitLog.
 * @param row - Supabase row with optional joins.
 * @returns Typed visit log.
 */
function mapVisitLogRow(row: Record<string, unknown>): CustomerVisitLog {
  const customers = row.customers as { company_name?: string } | null | undefined
  const kols = row.kols as { name?: string } | null | undefined
  const rawUrls = row.image_urls as string[] | null | undefined
  const rawProducts = row.interested_products as string[] | null | undefined
  const rawMeta = row.visit_meta as Record<string, unknown> | null | undefined
  return {
    id: String(row.id),
    customerId: (row.customer_id as string | null) ?? null,
    kolId: (row.kol_id as string | null) ?? null,
    groupId: (row.group_id as string | null) ?? null,
    subject: (row.subject as string | null) ?? null,
    visitDate: (row.visit_date as string | null) ?? null,
    content: (row.content as string | null) ?? null,
    imageUrls: Array.isArray(rawUrls) ? rawUrls : null,
    documentFiles: mapVisitLogDocumentFiles(row.document_files),
    createdByUserId: (row.created_by_user_id as string | null) ?? null,
    createdByEmail: (row.created_by_email as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
    companyName: customers?.company_name ?? null,
    kolName: kols?.name ?? null,
    customerNameText: (row.customer_name_text as string | null) ?? null,
    contactPerson: (row.contact_person as string | null) ?? null,
    interestedProducts: Array.isArray(rawProducts) ? rawProducts : null,
    interestedProductIds: Array.isArray(rawProducts) ? rawProducts : null,
    visitMeta: rawMeta
      ? {
          bossName: (rawMeta.boss_name as string | null) ?? null,
          staffCount: (rawMeta.staff_count as number | null) ?? null,
          shopType: (rawMeta.shop_type as string | null) ?? null,
          competitors: (rawMeta.competitors as string | null) ?? null,
        }
      : null,
  }
}

/**
 * Serializes VisitMeta to the JSONB shape expected by Postgres.
 * @param meta - Typed visit meta.
 * @returns Plain object or null.
 */
export function serializeVisitMeta(
  meta: Pick<VisitMeta, 'bossName' | 'staffCount' | 'shopType' | 'competitors'> | null | undefined,
): Record<string, unknown> | null {
  if (!meta) {
    return null
  }
  const result: Record<string, unknown> = {}
  if (meta.bossName != null) {
    result.boss_name = meta.bossName.trim() || null
  }
  if (meta.staffCount != null) {
    result.staff_count = meta.staffCount
  }
  if (meta.shopType != null) {
    result.shop_type = meta.shopType.trim() || null
  }
  if (meta.competitors != null) {
    result.competitors = meta.competitors.trim() || null
  }
  return Object.keys(result).length ? result : null
}

/**
 * Resolves stored catalog product IDs to display labels.
 * @param logs - Visit logs.
 * @returns Logs with label arrays in `interestedProducts`.
 */
async function enrichInterestedProductLabels(
  logs: CustomerVisitLog[],
): Promise<CustomerVisitLog[]> {
  if (!logs.some((log) => log.interestedProductIds?.length)) {
    return logs
  }
  try {
    const labelById = await fetchProductCatalogIdLabelMap()
    return logs.map((log) => ({
      ...log,
      interestedProducts:
        log.interestedProductIds?.map((id) => labelById[id] ?? id) ?? null,
    }))
  } catch {
    return logs
  }
}

/**
 * Batch-loads profile display names for creators.
 * @param logs - Visit logs.
 * @returns Logs with `createdByDisplayName` when available.
 */
async function enrichCreatorDisplayNames(
  logs: CustomerVisitLog[],
): Promise<CustomerVisitLog[]> {
  if (!logs.length || !isSupabaseConfigured || !supabase) {
    return logs
  }
  const userIds = [
    ...new Set(
      logs
        .map((log) => log.createdByUserId)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  if (userIds.length === 0) {
    return logs
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, full_name, email')
    .in('id', userIds)
  if (error || !data) {
    return logs
  }
  const labelByUserId = new Map<string, string>()
  for (const row of data as Array<{
    id: string
    display_name?: string | null
    full_name?: string | null
    email?: string | null
  }>) {
    const label = profileDisplayLabel(row)
    if (label) {
      labelByUserId.set(row.id, label)
    }
  }
  return logs.map((log) => {
    if (!log.createdByUserId) {
      return log
    }
    const displayName = labelByUserId.get(log.createdByUserId) ?? null
    if (!displayName) {
      return log
    }
    return { ...log, createdByDisplayName: displayName }
  })
}

/**
 * Uploads image files to the visit-log-images bucket as WebP.
 * @param userId - Auth user id.
 * @param visitLogId - Visit log id.
 * @param files - Image files.
 * @returns Public URLs.
 */
export async function uploadVisitLogImages(
  userId: string,
  visitLogId: string,
  files: File[],
): Promise<string[]> {
  if (!isSupabaseConfigured || !supabase || !files.length) {
    return []
  }
  const urls: string[] = []
  for (const file of files) {
    try {
      const webpFile = await convertImageToWebP(file)
      const safeName = `${crypto.randomUUID()}.webp`
      const storagePath = `${userId}/${visitLogId}/${safeName}`
      const { error: uploadError } = await supabase.storage
        .from(VISIT_LOG_IMAGES_BUCKET)
        .upload(storagePath, webpFile, { contentType: 'image/webp', upsert: false })
      if (uploadError) {
        console.error('[customer-visit-logs-api] upload:', uploadError)
        continue
      }
      const { data } = supabase.storage.from(VISIT_LOG_IMAGES_BUCKET).getPublicUrl(storagePath)
      urls.push(data.publicUrl)
    } catch (err) {
      console.warn('[customer-visit-logs-api] convert/upload failed:', file.name, err)
    }
  }
  return urls
}

/**
 * Uploads PDF/Office files to visit-log-documents.
 * @param visitLogId - Visit log id.
 * @param files - Document files.
 * @returns Typed attachments for successful uploads.
 */
export async function uploadVisitLogDocuments(
  visitLogId: string,
  files: File[],
): Promise<VisitLogDocumentFile[]> {
  if (!isSupabaseConfigured || !supabase || !files.length) {
    return []
  }
  const uploaded: VisitLogDocumentFile[] = []
  for (const file of files.slice(0, MAX_VISIT_LOG_DOCUMENTS)) {
    const mime = resolveVisitLogDocumentMime(file)
    if (!mime || !isAllowedVisitLogDocument(file)) {
      continue
    }
    if (file.size <= 0 || file.size > VISIT_LOG_DOCUMENT_MAX_BYTES) {
      continue
    }
    const storagePath = `${visitLogId}/${crypto.randomUUID()}.${visitLogDocumentExt(file)}`
    const { error: uploadError } = await supabase.storage
      .from(VISIT_LOG_DOCUMENTS_BUCKET)
      .upload(storagePath, file, { contentType: mime, upsert: false })
    if (uploadError) {
      console.error('[customer-visit-logs-api] upload document:', uploadError)
      continue
    }
    uploaded.push({
      storagePath,
      fileName: file.name,
      mimeType: mime,
      byteSize: file.size,
    })
  }
  return uploaded
}

/**
 * Creates a time-limited signed URL for a visit-log document.
 * @param storagePath - Object path in visit-log-documents.
 * @param expiresInSeconds - TTL (default 1 hour).
 * @returns Signed URL.
 */
export async function createVisitLogDocumentSignedUrl(
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { data, error } = await supabase.storage
    .from(VISIT_LOG_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds)
  if (error || !data?.signedUrl) {
    console.error('[customer-visit-logs-api] signedUrl:', error)
    throw error ?? new Error('signed_url_failed')
  }
  return data.signedUrl
}

/**
 * Removes visit-log document objects from Storage (best-effort).
 * @param files - Attachments whose storage objects should be deleted.
 * @returns Nothing.
 */
async function removeVisitLogDocumentObjects(
  files: VisitLogDocumentFile[],
): Promise<void> {
  if (!isSupabaseConfigured || !supabase || !files.length) {
    return
  }
  const paths = files.map((file) => file.storagePath).filter(Boolean)
  if (!paths.length) {
    return
  }
  const { error } = await supabase.storage.from(VISIT_LOG_DOCUMENTS_BUCKET).remove(paths)
  if (error) {
    console.warn('[customer-visit-logs-api] delete documents:', error)
  }
}

/**
 * Downloads visit-log document bytes from Storage.
 * @param storagePath - Object path in the visit-log documents bucket.
 * @returns File blob.
 */
export async function fetchVisitLogDocumentBlob(storagePath: string): Promise<Blob> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { data, error } = await supabase.storage
    .from(VISIT_LOG_DOCUMENTS_BUCKET)
    .download(storagePath)
  if (error || !data) {
    console.error('[customer-visit-logs-api] download blob:', error)
    throw error ?? new Error('download_failed')
  }
  return data
}


export interface ListVisitLogsOptions {
  customerId?: string
  kolId?: string
  page?: number
  pageSize?: number
  searchQuery?: string
  filterCreatedByEmail?: string
  filterGroupId?: string | null
}

export interface ListVisitLogsResult {
  rows: CustomerVisitLog[]
  totalCount: number
}

/**
 * Lists visit logs (global paginated or entity-scoped).
 * @param options - Filters and pagination.
 * @returns Rows and total count.
 */
export async function listVisitLogs(
  options: ListVisitLogsOptions = {},
): Promise<ListVisitLogsResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const {
    customerId,
    kolId,
    searchQuery,
    filterCreatedByEmail,
    filterGroupId,
  } = options
  const pageSize = Math.max(1, options.pageSize ?? VISIT_LOG_LIST_PAGE_SIZE)
  const page = Math.max(1, options.page ?? 1)
  const isEntityScoped = Boolean(customerId || kolId)

  let query = fromLoose('customer_visit_log')
    .select(VISIT_LOG_SELECT, { count: isEntityScoped ? undefined : 'exact' })
    .order('created_at', { ascending: false })

  if (customerId) {
    query = query.eq('customer_id', customerId).limit(200)
  } else if (kolId) {
    query = query.eq('kol_id', kolId).limit(200)
  } else {
    if (filterCreatedByEmail) {
      query = query.eq('created_by_email', filterCreatedByEmail)
    }
    if (filterGroupId) {
      query = query.eq('group_id', filterGroupId)
    }
    const q = (searchQuery ?? '').trim()
    if (q) {
      const pattern = `%${q}%`
      query = query.or(
        [
          `subject.ilike.${pattern}`,
          `content.ilike.${pattern}`,
          `customer_name_text.ilike.${pattern}`,
          `contact_person.ilike.${pattern}`,
        ].join(','),
      )
    }
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    query = query.range(from, to)
  }

  const { data, count, error } = await query
  if (error) {
    console.error('[customer-visit-logs-api] list:', error)
    throw error
  }
  const rows = (data ?? []).map((r) => mapVisitLogRow(r))
  const enrichedProducts = await enrichInterestedProductLabels(rows)
  const enriched = await enrichCreatorDisplayNames(enrichedProducts)
  return {
    rows: enriched,
    totalCount: isEntityScoped ? enriched.length : (count ?? 0),
  }
}

/**
 * Lists visit logs for one customer (newest first).
 * @param customerId - Parent customer id.
 * @returns Visit logs.
 */
export async function listCustomerVisitLogs(
  customerId: string,
): Promise<CustomerVisitLog[]> {
  const result = await listVisitLogs({ customerId })
  return result.rows
}

/**
 * Fetches one visit log by id.
 * @param id - Visit log UUID.
 * @returns Visit log or null.
 */
export async function getVisitLogById(id: string): Promise<CustomerVisitLog | null> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { data, error } = await fromLoose('customer_visit_log')
    .select(VISIT_LOG_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('[customer-visit-logs-api] getById:', error)
    throw error
  }
  if (!data) {
    return null
  }
  const withProducts = await enrichInterestedProductLabels([mapVisitLogRow(data)])
  const [enriched] = await enrichCreatorDisplayNames(withProducts)
  return enriched ?? null
}

/**
 * Resolves group_id for a new visit log.
 * @param opts - Linked customer and/or KOL.
 * @param userId - Auth user id for workspace fallback.
 * @returns Group id or null.
 */
async function resolveGroupId(
  opts: { customerId?: string | null; kolId?: string | null },
  userId: string,
): Promise<string | null> {
  if (opts.customerId) {
    const { data } = await fromLoose('customers')
      .select('group_id')
      .eq('id', opts.customerId)
      .maybeSingle()
    const gid = (data?.group_id as string | null | undefined) ?? null
    if (gid) {
      return gid
    }
  }
  if (opts.kolId) {
    const { data } = await fromLoose('kols')
      .select('group_id')
      .eq('id', opts.kolId)
      .maybeSingle()
    const gid = (data?.group_id as string | null | undefined) ?? null
    if (gid) {
      return gid
    }
  }
  const group = await fetchCurrentGroup(userId)
  return group?.id ?? null
}

/**
 * Creates a visit log entry, optionally uploading images.
 * @param input - Visit fields.
 * @param imageFiles - Optional images (max 5).
 * @param documentFiles - Optional PDF/Office files (max 5).
 * @returns Created visit log.
 */
export async function createVisitLog(
  input: CustomerVisitLogInput,
  imageFiles?: File[],
  documentFiles?: File[],
): Promise<CustomerVisitLog> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.id) {
    throw new Error('not_signed_in')
  }
  const groupId = await resolveGroupId(
    { customerId: input.customerId, kolId: input.kolId },
    user.id,
  )
  const { data, error: insertError } = await fromLoose('customer_visit_log')
    .insert({
      customer_id: input.customerId ?? null,
      kol_id: input.kolId ?? null,
      customer_name_text: input.customerNameText?.trim() ?? null,
      group_id: groupId,
      subject: input.subject,
      visit_date: input.visitDate ?? null,
      content: input.content ?? null,
      contact_person: input.contactPerson?.trim() ?? null,
      interested_products: input.interestedProductIds?.length
        ? input.interestedProductIds
        : input.interestedProducts?.length
          ? input.interestedProducts
          : null,
      visit_meta: serializeVisitMeta(input.visitMeta),
      created_by_user_id: user.id,
      created_by_email: user.email ?? null,
    })
    .select(VISIT_LOG_SELECT)
    .single()
  if (insertError) {
    console.error('[customer-visit-logs-api] create:', insertError)
    throw insertError
  }
  let newLog = mapVisitLogRow(data)
  const attachmentPatch: Record<string, unknown> = {}
  if (imageFiles?.length) {
    const urls = await uploadVisitLogImages(user.id, newLog.id, imageFiles.slice(0, MAX_VISIT_LOG_IMAGES))
    if (urls.length > 0) {
      attachmentPatch.image_urls = urls
    }
  }
  if (documentFiles?.length) {
    const docs = await uploadVisitLogDocuments(newLog.id, documentFiles)
    if (docs.length > 0) {
      attachmentPatch.document_files = serializeVisitLogDocumentFiles(docs)
    }
  }
  if (Object.keys(attachmentPatch).length > 0) {
    const { data: updated, error: updateError } = await fromLoose('customer_visit_log')
      .update(attachmentPatch)
      .eq('id', newLog.id)
      .select(VISIT_LOG_SELECT)
      .single()
    if (!updateError && updated) {
      newLog = mapVisitLogRow(updated)
    }
  }
  const withProducts = await enrichInterestedProductLabels([newLog])
  const [enriched] = await enrichCreatorDisplayNames(withProducts)
  return enriched ?? newLog
}

/**
 * Creates a minimal customer then a linked visit log.
 * @param customerInput - New customer fields.
 * @param visitInput - Visit fields without customerId.
 * @param imageFiles - Optional images.
 * @param documentFiles - Optional PDF/Office files.
 * @returns Created visit log.
 */
export async function createVisitLogWithNewCustomer(
  customerInput: VisitLogNewCustomerInput,
  visitInput: Omit<CustomerVisitLogInput, 'customerId'>,
  imageFiles?: File[],
  documentFiles?: File[],
): Promise<CustomerVisitLog> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.id) {
    throw new Error('not_signed_in')
  }
  const group = await fetchCurrentGroup(user.id)
  const companyName = customerInput.companyName.trim()
  if (!companyName) {
    throw new Error('company_name_required')
  }

  /**
   * Inserts one customers row with the given unique code.
   *
   * @param customerCode - Non-null unique customer_code.
   */
  const insertCustomer = async (customerCode: string) =>
    fromLoose('customers')
      .insert({
        company_name: companyName,
        contact_name: customerInput.contactName?.trim() || null,
        address: customerInput.address?.trim() || null,
        employee_count:
          customerInput.employeeCount != null && !Number.isNaN(Number(customerInput.employeeCount))
            ? Number(customerInput.employeeCount)
            : null,
        created_by_user_id: user.id,
        group_id: group?.id ?? null,
        customer_code: customerCode,
      })
      .select('id')
      .single()

  let customerCode = await allocateVisitLogCustomerCode()
  if (!customerCode) {
    throw new Error('customer_code_allocate_failed')
  }

  let { data: customerRow, error: customerError } = await insertCustomer(customerCode)
  if (customerError && isCustomerCodeUniqueViolation(customerError)) {
    customerCode = await allocateVisitLogCustomerCode()
    if (!customerCode) {
      throw new Error('customer_code_allocate_failed')
    }
    ;({ data: customerRow, error: customerError } = await insertCustomer(customerCode))
  }

  if (customerError || !customerRow?.id) {
    console.error('[customer-visit-logs-api] createCustomer:', customerError)
    throw customerError ?? new Error('customer_create_failed')
  }
  return createVisitLog(
    { ...visitInput, customerId: String(customerRow.id) },
    imageFiles,
    documentFiles,
  )
}

/**
 * Updates an existing visit log.
 * @param id - Visit log id.
 * @param input - Fields to update.
 * @returns Updated visit log.
 */
export async function updateVisitLog(
  id: string,
  input: CustomerVisitLogUpdateInput,
): Promise<CustomerVisitLog> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const payload: Record<string, unknown> = {}
  if (input.subject !== undefined) {
    payload.subject = input.subject
  }
  if (input.visitDate !== undefined) {
    payload.visit_date = input.visitDate
  }
  if (input.content !== undefined) {
    payload.content = input.content
  }
  if (input.customerNameText !== undefined) {
    payload.customer_name_text = input.customerNameText?.trim() || null
  }
  if (input.contactPerson !== undefined) {
    payload.contact_person = input.contactPerson?.trim() || null
  }
  if (input.interestedProductIds !== undefined) {
    payload.interested_products = input.interestedProductIds?.length
      ? input.interestedProductIds
      : null
  } else if (input.interestedProducts !== undefined) {
    payload.interested_products = input.interestedProducts?.length
      ? input.interestedProducts
      : null
  }
  if (input.visitMeta !== undefined) {
    payload.visit_meta = serializeVisitMeta(input.visitMeta)
  }
  if (input.customerId !== undefined) {
    payload.customer_id = input.customerId || null
    if (input.customerId) {
      const { data: custData } = await fromLoose('customers')
        .select('group_id')
        .eq('id', input.customerId)
        .maybeSingle()
      if (custData) {
        payload.group_id = (custData.group_id as string | null) ?? null
      }
    }
  }
  if (input.kolId !== undefined) {
    payload.kol_id = input.kolId || null
    if (input.kolId) {
      const { data: kolData } = await fromLoose('kols')
        .select('group_id')
        .eq('id', input.kolId)
        .maybeSingle()
      if (kolData) {
        payload.group_id = (kolData.group_id as string | null) ?? null
      }
    }
  }
  if (Object.keys(payload).length === 0) {
    const existing = await getVisitLogById(id)
    if (!existing) {
      throw new Error('not_found')
    }
    return existing
  }
  const { data, error } = await fromLoose('customer_visit_log')
    .update(payload)
    .eq('id', id)
    .select(VISIT_LOG_SELECT)
    .single()
  if (error) {
    console.error('[customer-visit-logs-api] update:', error)
    throw error
  }
  const withProducts = await enrichInterestedProductLabels([mapVisitLogRow(data)])
  const [enriched] = await enrichCreatorDisplayNames(withProducts)
  if (!enriched) {
    throw new Error('update_failed')
  }
  return enriched
}

/**
 * Deletes a visit log and best-effort removes storage images.
 * @param id - Visit log id.
 * @returns Nothing.
 */
export async function deleteVisitLog(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { data: existing } = await fromLoose('customer_visit_log')
    .select('image_urls, document_files')
    .eq('id', id)
    .maybeSingle()
  const imageUrls = (existing?.image_urls as string[] | null | undefined) ?? []
  const documentFiles = mapVisitLogDocumentFiles(existing?.document_files)
  const { error } = await fromLoose('customer_visit_log').delete().eq('id', id)
  if (error) {
    console.error('[customer-visit-logs-api] delete:', error)
    throw error
  }
  const marker = `/storage/v1/object/public/${VISIT_LOG_IMAGES_BUCKET}/`
  const storagePaths = imageUrls.flatMap((imageUrl) => {
    try {
      const pathname = new URL(imageUrl).pathname
      const markerIndex = pathname.indexOf(marker)
      if (markerIndex < 0) {
        return []
      }
      return [decodeURIComponent(pathname.slice(markerIndex + marker.length))]
    } catch {
      return []
    }
  })
  if (storagePaths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from(VISIT_LOG_IMAGES_BUCKET)
      .remove(storagePaths)
    if (storageError) {
      console.warn('[customer-visit-logs-api] delete images:', storageError)
    }
  }
  await removeVisitLogDocumentObjects(documentFiles)
}

/**
 * Appends images to an existing visit log (max 5 total).
 * @param visitLogId - Visit log id.
 * @param files - Image files.
 * @returns Updated image URL list.
 */
export async function appendVisitLogImages(
  visitLogId: string,
  files: File[],
): Promise<string[]> {
  if (!isSupabaseConfigured || !supabase || !files.length) {
    throw new Error('upload_unavailable')
  }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.id) {
    throw new Error('not_signed_in')
  }
  const { data: row, error: fetchError } = await fromLoose('customer_visit_log')
    .select('image_urls')
    .eq('id', visitLogId)
    .single()
  if (fetchError || !row) {
    throw new Error('not_found')
  }
  const existing = (row.image_urls as string[] | null) ?? []
  const remaining = MAX_VISIT_LOG_IMAGES - existing.length
  if (remaining <= 0) {
    throw new Error('max_images')
  }
  const urls = await uploadVisitLogImages(user.id, visitLogId, files.slice(0, remaining))
  if (urls.length === 0) {
    throw new Error('upload_failed')
  }
  const merged = [...existing, ...urls]
  const { error: updateError } = await fromLoose('customer_visit_log')
    .update({ image_urls: merged })
    .eq('id', visitLogId)
  if (updateError) {
    throw updateError
  }
  return merged
}

/**
 * Removes one image URL from a visit log.
 * @param visitLogId - Visit log id.
 * @param imageUrl - Public URL to remove.
 * @returns Remaining image URLs.
 */
export async function removeVisitLogImage(
  visitLogId: string,
  imageUrl: string,
): Promise<string[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { data: row, error: fetchError } = await fromLoose('customer_visit_log')
    .select('image_urls')
    .eq('id', visitLogId)
    .single()
  if (fetchError || !row) {
    throw new Error('not_found')
  }
  const existing = (row.image_urls as string[] | null) ?? []
  const next = existing.filter((url) => url !== imageUrl)
  const { error: updateError } = await fromLoose('customer_visit_log')
    .update({ image_urls: next.length ? next : null })
    .eq('id', visitLogId)
  if (updateError) {
    throw updateError
  }
  return next
}

/**
 * Appends documents to an existing visit log (max 5 total).
 * @param visitLogId - Visit log id.
 * @param files - Document files.
 * @returns Updated document list.
 */
export async function appendVisitLogDocuments(
  visitLogId: string,
  files: File[],
): Promise<VisitLogDocumentFile[]> {
  if (!isSupabaseConfigured || !supabase || !files.length) {
    throw new Error('upload_unavailable')
  }
  const { data: row, error: fetchError } = await fromLoose('customer_visit_log')
    .select('document_files')
    .eq('id', visitLogId)
    .single()
  if (fetchError || !row) {
    throw new Error('not_found')
  }
  const existing = mapVisitLogDocumentFiles(row.document_files)
  const remaining = MAX_VISIT_LOG_DOCUMENTS - existing.length
  if (remaining <= 0) {
    throw new Error('max_documents')
  }
  const toUpload = files
    .filter((file) => isAllowedVisitLogDocument(file) && file.size > 0 && file.size <= VISIT_LOG_DOCUMENT_MAX_BYTES)
    .slice(0, remaining)
  if (!toUpload.length) {
    throw new Error('invalid_file_type')
  }
  const uploaded = await uploadVisitLogDocuments(visitLogId, toUpload)
  if (!uploaded.length) {
    throw new Error('upload_failed')
  }
  const merged = [...existing, ...uploaded]
  const { error: updateError } = await fromLoose('customer_visit_log')
    .update({ document_files: serializeVisitLogDocumentFiles(merged) })
    .eq('id', visitLogId)
  if (updateError) {
    throw updateError
  }
  return merged
}

/**
 * Removes one document from a visit log and deletes its Storage object.
 * @param visitLogId - Visit log id.
 * @param storagePath - Object path to remove.
 * @returns Remaining documents.
 */
export async function removeVisitLogDocument(
  visitLogId: string,
  storagePath: string,
): Promise<VisitLogDocumentFile[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { data: row, error: fetchError } = await fromLoose('customer_visit_log')
    .select('document_files')
    .eq('id', visitLogId)
    .single()
  if (fetchError || !row) {
    throw new Error('not_found')
  }
  const existing = mapVisitLogDocumentFiles(row.document_files)
  const next = existing.filter((file) => file.storagePath !== storagePath)
  const { error: updateError } = await fromLoose('customer_visit_log')
    .update({ document_files: serializeVisitLogDocumentFiles(next) })
    .eq('id', visitLogId)
  if (updateError) {
    throw updateError
  }
  await removeVisitLogDocumentObjects(existing.filter((file) => file.storagePath === storagePath))
  return next
}

/** Max images per visit log record. */
export { MAX_VISIT_LOG_IMAGES, MAX_VISIT_LOG_DOCUMENTS }
