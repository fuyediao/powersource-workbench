/**
 * KOL CRUD + channel management against Supabase `kols` / `kol_channels`.
 * Ported from workbench-web `useKols` / `useKolChannels`.
 */

import { fromLoose } from '@/lib/supabase-loose'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { CustomerInsightTrilingual } from '@/services/ai-api'
import {
  listVisitLogs,
  type ListVisitLogsResult,
} from '@/services/customer-visit-logs-api'
import {
  KOL_SUPABASE_DETAIL_SELECT,
  KOL_SUPABASE_LIST_SELECT,
  mapKolChannelRow,
  mapKolFromSupabaseRow,
} from '@/services/kol-supabase-mapping'
import type {
  KolChannel,
  KolChannelInput,
  KolCooperationStatus,
  KolCurrentStatus,
  KolDetail,
  KolFormInput,
  KolListFilters,
  KolListResult,
  KolListRow,
  KolTier,
} from '@/types/kol'
import { normalizeCrmCurrencyCode } from '@/types/opportunity'

/** Minimal KOL row for visit-log linking. */
export interface KolPickerOption {
  id: string
  name: string
  groupId: string | null
  /** System-generated KOL code (`kols.kol_code`). */
  kolCode: string | null
}

/** Page size when walking picker rows (PostgREST max-rows safe). */
const KOL_PICKER_PAGE_SIZE = 1000

/** Default page size for the Admin KOL list (web parity). */
export const KOLS_PAGE_SIZE = 20

/** Channel columns including enrichment metadata. */
const KOL_CHANNEL_SELECT =
  'id, kol_id, group_id, platform_key, platform_custom_name, channel_url, handle, followers, content_count, notes, enrichment_error, created_at, updated_at'

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
 * @returns Number, or null when absent / unparsable.
 */
function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Maps embedded `kol_channels` rows to primary platform / follower summary.
 * @param value - Raw embed value.
 * @returns Primary platform, primary followers, and extra channel count.
 */
function summarizeChannels(value: unknown): {
  primaryPlatformKey: string | null
  primaryChannelFollowers: number | null
  extraChannelCount: number
} {
  if (!Array.isArray(value) || value.length === 0) {
    return {
      primaryPlatformKey: null,
      primaryChannelFollowers: null,
      extraChannelCount: 0,
    }
  }
  const first = value[0] as Record<string, unknown>
  return {
    primaryPlatformKey: textOrNull(first.platform_key),
    primaryChannelFollowers: numberOrNull(first.followers),
    extraChannelCount: Math.max(0, value.length - 1),
  }
}

/**
 * Maps a raw `kols` row to a compact list row.
 * @param row - Supabase row.
 * @returns Typed list row.
 */
function mapListRow(row: Record<string, unknown>): KolListRow {
  const channels = summarizeChannels(row.kol_channels)
  return {
    id: String(row.id),
    groupId: (row.group_id as string | null) ?? null,
    kolCode: String(row.kol_code ?? ''),
    name: String(row.name ?? ''),
    accountName: textOrNull(row.account_name),
    avatarUrl: textOrNull(row.avatar_url),
    tier: (textOrNull(row.tier) as KolTier | null) ?? null,
    followers: numberOrNull(row.followers),
    currentStatus:
      (textOrNull(row.current_status) as KolCurrentStatus | null) ?? null,
    cooperationStatus:
      (textOrNull(row.cooperation_status) as KolCooperationStatus | null) ??
      null,
    lastContactAt: textOrNull(row.last_contact_at),
    createdAt: String(row.created_at ?? ''),
    ...channels,
  }
}

/**
 * Builds the full write payload for insert/update (Vue `toDbRow`).
 * @param input - Editable KOL fields.
 * @returns snake_case payload for `kols`.
 */
function formToPayload(input: KolFormInput): Record<string, unknown> {
  return {
    name: input.name.trim(),
    account_name: input.accountName ?? null,
    tier: input.tier ?? null,
    rating: input.rating ?? null,
    followers: input.followers ?? null,
    vertical: input.vertical ?? null,
    info: input.info ?? null,
    background: input.background ?? null,
    remarks: input.remarks ?? null,
    avatar_url: input.avatarUrl ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    phone_country: input.phoneCountry ?? null,
    country: input.country ?? null,
    region: input.region ?? null,
    state: input.state ?? null,
    county: input.county ?? null,
    city: input.city ?? null,
    town: input.town ?? null,
    circle: input.circle ?? null,
    postal_code: input.postalCode ?? null,
    address_line1: input.addressLine1 ?? null,
    address_line2: input.addressLine2 ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    order_count: input.orderCount ?? 0,
    total_amount: input.totalAmount ?? 0,
    total_amount_currency: normalizeCrmCurrencyCode(input.totalAmountCurrency),
    cooperation_years: input.cooperationYears ?? null,
    promo_code: input.promoCode ?? null,
    view_count: input.viewCount ?? null,
    engagement_rate: input.engagementRate ?? null,
    history_links: input.historyLinks ?? [],
    current_status: input.currentStatus ?? null,
    cooperation_status: input.cooperationStatus ?? null,
    owner_id: input.ownerId ?? null,
    last_contact_at: input.lastContactAt ?? null,
    reconnect_at: input.reconnectAt ?? null,
    commission: input.commission ?? null,
    meet_at: input.meetAt ?? null,
    check_cycle_days: input.checkCycleDays ?? null,
    tested_products: input.testedProducts ?? [],
    communication_history: input.communicationHistory ?? [],
    shipping_info: input.shippingInfo ?? {},
    shipments: input.shipments ?? [],
    tracking_number: input.shipments?.[0]?.trackingNumber?.trim()
      ? input.shipments[0].trackingNumber.trim()
      : (input.trackingNumber ?? null),
    shipping_status: input.shipments?.[0]?.shippingStatus?.trim()
      ? input.shipments[0].shippingStatus.trim()
      : (input.shippingStatus ?? null),
    contract_files: input.contractFiles ?? [],
    contract_images: input.contractImages ?? [],
    contract_links: input.contractLinks ?? [],
  }
}

/**
 * Lists KOLs visible to the current user (RLS), all pages, newest first.
 * @param search - Optional name/code filter.
 * @returns KOL options newest-first.
 */
export async function listKolPickerOptions(search = ''): Promise<KolPickerOption[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }

  const q = search.trim()
  if (q) {
    const pattern = `%${q}%`
    const { data, error } = await fromLoose('kols')
      .select('id, name, group_id, kol_code')
      .or(`name.ilike.${pattern},kol_code.ilike.${pattern}`)
      .order('created_at', { ascending: false })
      .limit(KOL_PICKER_PAGE_SIZE)
    if (error) {
      console.error('[kols-api] listKolPickerOptions:', error)
      throw error
    }
    return (data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name ?? ''),
      groupId: (row.group_id as string | null) ?? null,
      kolCode: (row.kol_code as string | null) ?? null,
    }))
  }

  const rows: KolPickerOption[] = []
  let from = 0
  for (;;) {
    const { data, error } = await fromLoose('kols')
      .select('id, name, group_id, kol_code')
      .order('created_at', { ascending: false })
      .range(from, from + KOL_PICKER_PAGE_SIZE - 1)
    if (error) {
      console.error('[kols-api] listKolPickerOptions:', error)
      throw error
    }
    const batch = data ?? []
    for (const row of batch) {
      rows.push({
        id: String(row.id),
        name: String(row.name ?? ''),
        groupId: (row.group_id as string | null) ?? null,
        kolCode: (row.kol_code as string | null) ?? null,
      })
    }
    if (batch.length < KOL_PICKER_PAGE_SIZE) {
      break
    }
    from += KOL_PICKER_PAGE_SIZE
  }
  return rows
}

/**
 * Lists KOLs for the Admin list with filters, search, and pagination.
 * @param options - Page, search, and filters.
 * @returns Rows plus total count.
 */
export async function listKols(options: {
  page?: number
  pageSize?: number
  searchQuery?: string
  filters?: Partial<KolListFilters>
  isSystemAdmin?: boolean
}): Promise<KolListResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const pageSize = Math.max(1, options.pageSize ?? KOLS_PAGE_SIZE)
  const page = Math.max(1, options.page ?? 1)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  const filters = options.filters ?? {}

  let query = fromLoose('kols')
    .select(KOL_SUPABASE_LIST_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })

  if (filters.tier) {
    query = query.eq('tier', filters.tier)
  }
  if (filters.cooperationStatus) {
    query = query.eq('cooperation_status', filters.cooperationStatus)
  }
  if (options.isSystemAdmin && filters.filterGroupId) {
    query = query.eq('group_id', filters.filterGroupId)
  }
  const q = options.searchQuery?.trim()
  if (q) {
    const pattern = `%${q}%`
    query = query.or(
      `name.ilike.${pattern},email.ilike.${pattern},kol_code.ilike.${pattern}`,
    )
  }

  const { data, count, error } = await query.range(from, to)
  if (error) {
    console.error('[kols-api] listKols:', error)
    throw error
  }
  return {
    rows: (data ?? []).map((row) => mapListRow(row)),
    totalCount: count ?? 0,
  }
}

/**
 * Loads one KOL by id (all columns; channels loaded separately).
 * @param id - KOL uuid.
 * @returns Detail row, or null when missing.
 */
export async function getKolById(id: string): Promise<KolDetail | null> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { data, error } = await fromLoose('kols')
    .select(KOL_SUPABASE_DETAIL_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('[kols-api] getKolById:', error)
    throw error
  }
  return data ? mapKolFromSupabaseRow(data) : null
}

/**
 * Creates a KOL in the given workspace group.
 * @param groupId - Target `groups.id`.
 * @param input - Editable KOL fields.
 * @returns Created detail row.
 */
export async function createKol(
  groupId: string | null,
  input: KolFormInput,
): Promise<KolDetail> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  if (!input.name.trim()) {
    throw new Error('kol_name_required')
  }
  if (!groupId) {
    throw new Error('kol_group_required')
  }
  const { data, error } = await fromLoose('kols')
    .insert({ ...formToPayload(input), group_id: groupId })
    .select(KOL_SUPABASE_DETAIL_SELECT)
    .single()
  if (error) {
    console.error('[kols-api] createKol:', error)
    throw error
  }
  return mapKolFromSupabaseRow(data)
}

/**
 * Updates an existing KOL.
 * @param id - KOL uuid.
 * @param input - Editable KOL fields.
 * @returns Updated detail row.
 */
export async function updateKol(
  id: string,
  input: KolFormInput,
): Promise<KolDetail> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  if (!input.name.trim()) {
    throw new Error('kol_name_required')
  }
  const { data, error } = await fromLoose('kols')
    .update(formToPayload(input))
    .eq('id', id)
    .select(KOL_SUPABASE_DETAIL_SELECT)
    .single()
  if (error) {
    console.error('[kols-api] updateKol:', error)
    throw error
  }
  return mapKolFromSupabaseRow(data)
}

/**
 * Deletes a KOL row.
 * @param id - KOL uuid.
 * @returns Nothing.
 */
export async function deleteKol(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { error } = await fromLoose('kols').delete().eq('id', id)
  if (error) {
    console.error('[kols-api] deleteKol:', error)
    throw error
  }
}

/**
 * Persist trilingual AI insight summaries for a KOL.
 * Updates only the six AI columns; does not touch any other KOL field.
 * @param id - KOL UUID.
 * @param summaries - Trilingual prose from the AI model (`enUs` / `zhCn` / `zhTw`).
 * @param model - Provider slug (`gemini` | `chatgpt` | `claude` | `grok`).
 * @returns Updated detail row.
 */
export async function saveKolAiSummary(
  id: string,
  summaries: CustomerInsightTrilingual,
  model: string,
): Promise<KolDetail> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const now = new Date().toISOString()
  const { data, error } = await fromLoose('kols')
    .update({
      ai_summary_en_us: summaries.enUs,
      ai_summary_zh_cn: summaries.zhCn,
      ai_summary_zh_tw: summaries.zhTw,
      ai_summary: summaries.zhTw,
      ai_summary_model: model,
      ai_summary_generated_at: now,
    })
    .eq('id', id)
    .select(KOL_SUPABASE_DETAIL_SELECT)
    .single()
  if (error) {
    console.error('[kols-api] saveKolAiSummary:', error)
    throw error
  }
  return mapKolFromSupabaseRow(data)
}

/**
 * Lists visit logs linked to one KOL.
 * @param kolId - KOL uuid.
 * @returns Visit-log rows and total count.
 */
export async function listKolVisitLogs(kolId: string): Promise<ListVisitLogsResult> {
  return listVisitLogs({ kolId })
}

/**
 * Lists channels for one KOL (oldest first, matching web ordering).
 * @param kolId - KOL uuid.
 * @returns Channel rows.
 */
export async function listKolChannels(kolId: string): Promise<KolChannel[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { data, error } = await fromLoose('kol_channels')
    .select(KOL_CHANNEL_SELECT)
    .eq('kol_id', kolId)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[kols-api] listKolChannels:', error)
    throw error
  }
  return (data ?? []).map((row) => mapKolChannelRow(row))
}

/**
 * Adds a channel to a KOL.
 * @param kolId - Parent KOL uuid.
 * @param groupId - Workspace group of the parent KOL.
 * @param input - Channel fields.
 * @returns Created channel.
 */
export async function createKolChannel(
  kolId: string,
  groupId: string | null,
  input: KolChannelInput,
): Promise<KolChannel> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  if (!input.channelUrl.trim()) {
    throw new Error('kol_channel_url_required')
  }
  const { data, error } = await fromLoose('kol_channels')
    .insert({
      kol_id: kolId,
      group_id: groupId,
      platform_key: input.platformKey,
      platform_custom_name: input.platformCustomName,
      channel_url: input.channelUrl.trim(),
      handle: input.handle,
      followers: input.followers,
      content_count: input.contentCount ?? null,
      notes: input.notes,
      enrichment_error: input.enrichmentError ?? null,
    })
    .select(KOL_CHANNEL_SELECT)
    .single()
  if (error) {
    console.error('[kols-api] createKolChannel:', error)
    throw error
  }
  return mapKolChannelRow(data)
}

/**
 * Updates one KOL channel.
 * @param channelId - Channel uuid.
 * @param input - Channel fields.
 * @returns Updated channel.
 */
export async function updateKolChannel(
  channelId: string,
  input: KolChannelInput,
): Promise<KolChannel> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  if (!input.channelUrl.trim()) {
    throw new Error('kol_channel_url_required')
  }
  const basePatch = {
    platform_key: input.platformKey,
    platform_custom_name: input.platformCustomName,
    channel_url: input.channelUrl.trim(),
    handle: input.handle,
    followers: input.followers,
    content_count: input.contentCount ?? null,
    notes: input.notes,
  }
  const patch =
    input.enrichmentError !== undefined
      ? { ...basePatch, enrichment_error: input.enrichmentError }
      : basePatch
  const { data, error } = await fromLoose('kol_channels')
    .update(patch)
    .eq('id', channelId)
    .select(KOL_CHANNEL_SELECT)
    .single()
  if (error) {
    console.error('[kols-api] updateKolChannel:', error)
    throw error
  }
  return mapKolChannelRow(data)
}

/**
 * Deletes one KOL channel.
 * @param channelId - Channel uuid.
 * @returns Nothing.
 */
export async function deleteKolChannel(channelId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { error } = await fromLoose('kol_channels').delete().eq('id', channelId)
  if (error) {
    console.error('[kols-api] deleteKolChannel:', error)
    throw error
  }
}
