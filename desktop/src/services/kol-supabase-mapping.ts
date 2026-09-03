/**
 * Maps Supabase `kols` (+ optional joins) rows to typed {@link KolDetail}.
 * Shared by Admin list/detail and channel CRUD.
 */
import type {
  KolChannel,
  KolCooperationStatus,
  KolCurrentStatus,
  KolCommunicationEntry,
  KolDetail,
  KolShipment,
  KolShippingInfo,
  KolTier,
} from '@/types/kol'
import { normalizeCrmCurrencyCode } from '@/types/opportunity'

/** Columns for list queries (includes `kol_channels` for primary platform display). */
export const KOL_SUPABASE_LIST_SELECT =
  'id, group_id, kol_code, name, account_name, avatar_url, tier, followers, current_status, cooperation_status, last_contact_at, created_at, kol_channels(id, platform_key, followers)' as const

/** Columns for detail queries (all `kols` columns; channels loaded separately). */
export const KOL_SUPABASE_DETAIL_SELECT = '*' as const

/**
 * Maps a raw `kol_channels` row to a typed {@link KolChannel}.
 * @param row - Raw database row from `kol_channels`.
 * @returns Typed channel.
 */
export function mapKolChannelRow(row: Record<string, unknown>): KolChannel {
  return {
    id: row.id as string,
    kolId: row.kol_id as string,
    groupId: (row.group_id as string | null) ?? null,
    platformKey: row.platform_key as string,
    platformCustomName: (row.platform_custom_name as string | null) ?? null,
    channelUrl: row.channel_url as string,
    handle: (row.handle as string | null) ?? null,
    followers: (row.followers as number | null) ?? null,
    contentCount: (row.content_count as number | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    enrichmentError: (row.enrichment_error as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/**
 * Allocates a client-side shipment row id.
 * @returns UUID when available, otherwise a timestamp-based fallback.
 */
function newShipmentRowId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `s-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

/**
 * Normalizes a jsonb shipment entry (camelCase or snake_case).
 * @param entry - Raw array element.
 * @returns Typed shipment row.
 */
function normalizeShipmentEntry(entry: unknown): KolShipment {
  if (entry && typeof entry === 'object') {
    const o = entry as Record<string, unknown>
    const idRaw = o.id
    const id =
      typeof idRaw === 'string' && idRaw.trim().length > 0
        ? idRaw.trim()
        : newShipmentRowId()
    const trackingNumber =
      typeof o.trackingNumber === 'string'
        ? o.trackingNumber
        : typeof o.tracking_number === 'string'
          ? o.tracking_number
          : ''
    const shippingStatus =
      typeof o.shippingStatus === 'string'
        ? o.shippingStatus
        : typeof o.shipping_status === 'string'
          ? o.shipping_status
          : ''
    return { id, trackingNumber, shippingStatus }
  }
  return { id: newShipmentRowId(), trackingNumber: '', shippingStatus: '' }
}

/**
 * Reads `shipments` jsonb, falling back to legacy tracking columns.
 * @param row - Raw `kols` row.
 * @returns Shipment rows.
 */
function shipmentsFromRow(row: Record<string, unknown>): KolShipment[] {
  const raw = row.shipments
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((entry) => normalizeShipmentEntry(entry))
  }
  const trackingNumber = (row.tracking_number as string | null) ?? ''
  const shippingStatus = (row.shipping_status as string | null) ?? ''
  if (trackingNumber.trim().length > 0 || shippingStatus.trim().length > 0) {
    return [
      {
        id: newShipmentRowId(),
        trackingNumber,
        shippingStatus,
      },
    ]
  }
  return []
}

/**
 * Maps a raw Supabase `kols` row to a typed {@link KolDetail}.
 * Embedded `kol_channels` are ignored (loaded separately on Electron).
 * @param row - Raw row (may include a `kol_channels` join).
 * @returns Typed detail record.
 */
export function mapKolFromSupabaseRow(row: Record<string, unknown>): KolDetail {
  return {
    id: row.id as string,
    groupId: (row.group_id as string | null) ?? null,
    kolCode: (row.kol_code as string | null) ?? null,
    name: row.name as string,
    accountName: (row.account_name as string | null) ?? null,
    tier: (row.tier as KolTier | null) ?? null,
    rating: (row.rating as number | null) ?? null,
    followers: (row.followers as number | null) ?? null,
    vertical: (row.vertical as string | null) ?? null,
    info: (row.info as string | null) ?? null,
    background: (row.background as string | null) ?? null,
    remarks: (row.remarks as string | null) ?? null,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    phoneCountry: (row.phone_country as string | null) ?? null,
    country: (row.country as string | null) ?? null,
    region: (row.region as string | null) ?? null,
    state: (row.state as string | null) ?? null,
    county: (row.county as string | null) ?? null,
    city: (row.city as string | null) ?? null,
    town: (row.town as string | null) ?? null,
    circle: (row.circle as string | null) ?? null,
    postalCode: (row.postal_code as string | null) ?? null,
    addressLine1: (row.address_line1 as string | null) ?? null,
    addressLine2: (row.address_line2 as string | null) ?? null,
    latitude: (row.latitude as number | null) ?? null,
    longitude: (row.longitude as number | null) ?? null,
    orderCount: (row.order_count as number) ?? 0,
    totalAmount: (row.total_amount as number) ?? 0,
    totalAmountCurrency: normalizeCrmCurrencyCode(
      row.total_amount_currency as string | null | undefined,
    ),
    cooperationYears: (row.cooperation_years as number[] | null) ?? null,
    promoCode: (row.promo_code as string | null) ?? null,
    viewCount: (row.view_count as number | null) ?? null,
    engagementRate: (row.engagement_rate as number | null) ?? null,
    historyLinks: (row.history_links as string[]) ?? [],
    currentStatus: (row.current_status as KolCurrentStatus | null) ?? null,
    cooperationStatus:
      (row.cooperation_status as KolCooperationStatus | null) ?? null,
    ownerId: (row.owner_id as string | null) ?? null,
    lastContactAt: (row.last_contact_at as string | null) ?? null,
    reconnectAt: (row.reconnect_at as string | null) ?? null,
    commission: (row.commission as number | null) ?? null,
    meetAt: (row.meet_at as string | null) ?? null,
    checkCycleDays: (row.check_cycle_days as number | null) ?? null,
    testedProducts: (row.tested_products as string[]) ?? [],
    communicationHistory:
      (row.communication_history as KolCommunicationEntry[]) ?? [],
    shippingInfo: (row.shipping_info as KolShippingInfo) ?? {},
    shipments: shipmentsFromRow(row),
    trackingNumber: (row.tracking_number as string | null) ?? null,
    shippingStatus: (row.shipping_status as string | null) ?? null,
    contractFiles: (row.contract_files as string[]) ?? [],
    contractImages: (row.contract_images as string[]) ?? [],
    contractLinks: (row.contract_links as string[]) ?? [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    aiSummary: (row.ai_summary as string | null) ?? null,
    aiSummaryEnUs: (row.ai_summary_en_us as string | null) ?? null,
    aiSummaryZhCn: (row.ai_summary_zh_cn as string | null) ?? null,
    aiSummaryZhTw: (row.ai_summary_zh_tw as string | null) ?? null,
    aiSummaryModel: (row.ai_summary_model as string | null) ?? null,
    aiSummaryGeneratedAt: (row.ai_summary_generated_at as string | null) ?? null,
  }
}
