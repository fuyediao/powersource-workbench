/**
 * Competitor shop CRUD plus picker helpers for Admin association forms.
 * Ported from geocrm-web `useCompetitorShops`.
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { fromLoose } from '@/lib/supabase-loose'
import { fetchProfileSnippets } from '@/services/groups-api'
import type {
  CompetitorImportanceFilter,
  CompetitorImportanceLevel,
  CompetitorShop,
  CompetitorShopInput,
  CompetitorShopListResult,
} from '@/types/competitor'
import { parseCompetitorPhotoUrls } from '@/utils/competitor-photo-urls'

/** Compact competitor shop row for follow-up / association pickers. */
export interface CompetitorShopPickerOption {
  id: string
  storeName: string
  groupId: string | null
}

/** Page size when walking picker rows (PostgREST max-rows safe). */
const COMPETITOR_PICKER_PAGE_SIZE = 1000

/** Default page size for the Admin competitor list (web parity). */
export const COMPETITOR_SHOPS_PAGE_SIZE = 20

const SHOP_LIST_SELECT = `*, customers(company_name, contact_name, primary_contact_name)`

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
 * Reads an optional numeric column.
 * @param value - Raw column value.
 * @returns Number, or null.
 */
function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Picks a display name from the embedded `customers` join.
 * @param nested - Embed payload (object or single-element array).
 * @returns Company or contact name, or null.
 */
function pickLinkedCustomerName(nested: unknown): string | null {
  if (nested == null || typeof nested !== 'object') {
    return null
  }
  const row = Array.isArray(nested) ? nested[0] : nested
  if (!row || typeof row !== 'object') {
    return null
  }
  const record = row as Record<string, unknown>
  return (
    textOrNull(record.company_name) ??
    textOrNull(record.primary_contact_name) ??
    textOrNull(record.contact_name)
  )
}

/**
 * Formats a profile snippet for the reporter column.
 * @param displayName - Profile display name.
 * @param fullName - Profile full name.
 * @param email - Profile email.
 * @returns First non-empty label, or null.
 */
function reporterLabelFromProfile(
  displayName: string | null | undefined,
  fullName: string | null | undefined,
  email: string | null | undefined,
): string | null {
  return displayName?.trim() || fullName?.trim() || email?.trim() || null
}

/**
 * Maps a raw `competitor_shops` row.
 * @param row - Supabase row.
 * @returns Typed shop.
 */
function mapShop(row: Record<string, unknown>): CompetitorShop {
  return {
    id: String(row.id),
    groupId: String(row.group_id ?? ''),
    storeName: String(row.store_name ?? ''),
    country: textOrNull(row.country),
    stateProvince: textOrNull(row.state_province),
    city: textOrNull(row.city),
    addressLine1: textOrNull(row.address_line1),
    addressLine2: textOrNull(row.address_line2),
    postalCode: textOrNull(row.postal_code),
    latitude: numberOrNull(row.latitude),
    longitude: numberOrNull(row.longitude),
    reporterUserId: (row.reporter_user_id as string | null) ?? null,
    reporterDisplayName: null,
    importanceLevel:
      (textOrNull(row.importance_level) as CompetitorImportanceLevel | null) ??
      null,
    customerId: (row.customer_id as string | null) ?? null,
    linkedCustomerName: pickLinkedCustomerName(row.customers),
    siteNotes: textOrNull(row.site_notes),
    sitePhotoUrls: parseCompetitorPhotoUrls(row.site_photo_urls),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  }
}

/**
 * Fills `reporterDisplayName` from `profiles` (list and detail parity).
 * @param rows - Mapped shops (mutated in place).
 * @returns Nothing.
 */
async function hydrateReporterNames(rows: CompetitorShop[]): Promise<void> {
  const reporterIds = [
    ...new Set(
      rows
        .map((shop) => shop.reporterUserId)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  if (reporterIds.length === 0) {
    return
  }
  const profiles = await fetchProfileSnippets(reporterIds)
  for (const shop of rows) {
    if (!shop.reporterUserId) {
      continue
    }
    const profile = profiles.get(shop.reporterUserId)
    shop.reporterDisplayName =
      reporterLabelFromProfile(
        profile?.display_name,
        profile?.full_name,
        profile?.email,
      ) ?? `${shop.reporterUserId.slice(0, 8)}…`
  }
}

/**
 * Converts a shop form model to a write payload.
 * @param input - Editable fields.
 * @returns snake_case payload.
 */
function formToPayload(input: CompetitorShopInput): Record<string, unknown> {
  return {
    store_name: input.storeName.trim(),
    country: input.country,
    state_province: input.stateProvince,
    city: input.city,
    address_line1: input.addressLine1,
    address_line2: input.addressLine2,
    postal_code: input.postalCode,
    latitude: input.latitude,
    longitude: input.longitude,
    reporter_user_id: input.reporterUserId,
    importance_level: input.importanceLevel,
    customer_id: input.customerId,
    site_notes: input.siteNotes,
    site_photo_urls: input.sitePhotoUrls,
  }
}

/**
 * Lists competitor shops for pickers (newest first; all pages).
 * System admins are not scoped to the current workspace group; other users are.
 * @param options - Auth scope.
 * @returns Options newest-first.
 */
export async function listCompetitorShopPickerOptions(options: {
  isSystemAdmin: boolean
  groupId: string | null
}): Promise<CompetitorShopPickerOption[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  if (!options.isSystemAdmin && !options.groupId) {
    return []
  }

  const rows: CompetitorShopPickerOption[] = []
  let from = 0
  for (;;) {
    let query = supabase
      .from('competitor_shops')
      .select('id, store_name, group_id')
      .order('created_at', { ascending: false })
      .range(from, from + COMPETITOR_PICKER_PAGE_SIZE - 1)

    if (!options.isSystemAdmin && options.groupId) {
      query = query.eq('group_id', options.groupId)
    }

    const { data, error } = await query
    if (error) {
      console.error('[competitor-shops-api] listCompetitorShopPickerOptions:', error)
      throw error
    }
    const batch = data ?? []
    for (const row of batch) {
      rows.push({
        id: String(row.id),
        storeName: String(row.store_name ?? ''),
        groupId: (row.group_id as string | null) ?? null,
      })
    }
    if (batch.length < COMPETITOR_PICKER_PAGE_SIZE) {
      break
    }
    from += COMPETITOR_PICKER_PAGE_SIZE
  }
  return rows
}

/**
 * Lists competitor shops for the Admin list with search, filter, and pagination.
 * @param options - Page, search, importance filter, and auth scope.
 * @returns Rows plus total count.
 */
export async function listCompetitorShops(options: {
  page?: number
  pageSize?: number
  searchQuery?: string
  importanceFilter?: CompetitorImportanceFilter
  filterGroupId?: string | null
  isSystemAdmin?: boolean
  groupId?: string | null
}): Promise<CompetitorShopListResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const pageSize = Math.max(1, options.pageSize ?? COMPETITOR_SHOPS_PAGE_SIZE)
  const page = Math.max(1, options.page ?? 1)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = fromLoose('competitor_shops')
    .select(SHOP_LIST_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })

  if (options.isSystemAdmin) {
    if (options.filterGroupId) {
      query = query.eq('group_id', options.filterGroupId)
    }
  } else if (options.groupId) {
    query = query.eq('group_id', options.groupId)
  }

  const importance = options.importanceFilter ?? 'all'
  if (importance === 'unset') {
    query = query.is('importance_level', null)
  } else if (importance !== 'all') {
    query = query.eq('importance_level', importance)
  }

  const raw = options.searchQuery?.trim().slice(0, 100) ?? ''
  if (raw) {
    // Commas break PostgREST `or=(...)` parsing; `%` / `_` are LIKE wildcards.
    const term = raw.replace(/,/g, ' ').replace(/%/g, '').replace(/_/g, '')
    if (term) {
      const pattern = `%${term}%`
      query = query.or(
        `store_name.ilike.${pattern},customers.company_name.ilike.${pattern},customers.contact_name.ilike.${pattern},customers.primary_contact_name.ilike.${pattern}`,
      )
    }
  }

  const { data, count, error } = await query.range(from, to)
  if (error) {
    console.error('[competitor-shops-api] listCompetitorShops:', error)
    throw error
  }

  const rows = (data ?? []).map((row) => mapShop(row))
  await hydrateReporterNames(rows)
  return { rows, totalCount: count ?? rows.length }
}

/**
 * Loads one competitor shop by id.
 * @param id - Shop uuid.
 * @returns Shop, or null when missing.
 */
export async function getCompetitorShop(
  id: string,
): Promise<CompetitorShop | null> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { data, error } = await fromLoose('competitor_shops')
    .select(SHOP_LIST_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('[competitor-shops-api] getCompetitorShop:', error)
    throw error
  }
  if (!data) {
    return null
  }
  const shop = mapShop(data)
  await hydrateReporterNames([shop])
  return shop
}

/**
 * Creates a competitor shop in the given workspace group.
 * @param groupId - Target `groups.id`.
 * @param input - Shop fields.
 * @returns Created shop.
 */
export async function createCompetitorShop(
  groupId: string | null,
  input: CompetitorShopInput,
): Promise<CompetitorShop> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  if (!input.storeName.trim()) {
    throw new Error('competitor_store_name_required')
  }
  if (!groupId) {
    throw new Error('competitor_group_required')
  }
  const { data, error } = await fromLoose('competitor_shops')
    .insert({ ...formToPayload(input), group_id: groupId })
    .select(SHOP_LIST_SELECT)
    .single()
  if (error) {
    console.error('[competitor-shops-api] createCompetitorShop:', error)
    throw error
  }
  const shop = mapShop(data)
  await hydrateReporterNames([shop])
  return shop
}

/**
 * Updates a competitor shop.
 * @param id - Shop uuid.
 * @param input - Shop fields.
 * @returns Updated shop.
 */
export async function updateCompetitorShop(
  id: string,
  input: CompetitorShopInput,
): Promise<CompetitorShop> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  if (!input.storeName.trim()) {
    throw new Error('competitor_store_name_required')
  }
  const { data, error } = await fromLoose('competitor_shops')
    .update(formToPayload(input))
    .eq('id', id)
    .select(SHOP_LIST_SELECT)
    .single()
  if (error) {
    console.error('[competitor-shops-api] updateCompetitorShop:', error)
    throw error
  }
  const shop = mapShop(data)
  await hydrateReporterNames([shop])
  return shop
}

/**
 * Deletes a competitor shop (lines cascade in the database).
 * @param id - Shop uuid.
 * @returns Nothing.
 */
export async function deleteCompetitorShop(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { error } = await fromLoose('competitor_shops').delete().eq('id', id)
  if (error) {
    console.error('[competitor-shops-api] deleteCompetitorShop:', error)
    throw error
  }
}
