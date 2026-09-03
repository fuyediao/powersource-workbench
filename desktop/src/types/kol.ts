/**
 * KOL (Key Opinion Leader) types aligned with geocrm-web Admin KOL models.
 */

/** Tier grade stored in `kols.tier`. */
export type KolTier = 'A' | 'B' | 'C' | 'D'

/** Current engagement state stored in `kols.current_status`. */
export type KolCurrentStatus =
  | 'received_review'
  | 'product_sent'
  | 'abnormal'
  | 'active_cooperation'
  | 'other'

/** Long-term relationship state stored in `kols.cooperation_status`. */
export type KolCooperationStatus =
  | 'core_partner'
  | 'normal_maintenance'
  | 'contacted'
  | 'low_frequency'
  | 'long_no_reply'
  | 'pending_contact'
  | 'handled_by_others'
  | 'used_by_ecommerce'

/** A single entry in KOL communication history (`kols.communication_history`). */
export interface KolCommunicationEntry {
  at: string
  content: string
  by?: string
}

/** Shipping / delivery info embedded in `kols.shipping_info`. */
export interface KolShippingInfo {
  recipient?: string
  address?: string
  phone?: string
}

/** One shipment / logistics row stored in `kols.shipments` jsonb. */
export interface KolShipment {
  id: string
  trackingNumber: string
  shippingStatus: string
}

/** Social channel attached to a KOL (`kol_channels`). */
export interface KolChannel {
  id: string
  kolId: string
  groupId: string | null
  platformKey: string
  platformCustomName: string | null
  channelUrl: string
  handle: string | null
  followers: number | null
  contentCount: number | null
  notes: string | null
  /** Last enrichment failure text; null when last run succeeded or never failed. */
  enrichmentError: string | null
  createdAt: string
  updatedAt: string
}

/** Create / update payload for a KOL channel. */
export interface KolChannelInput {
  platformKey: string
  platformCustomName: string | null
  channelUrl: string
  handle: string | null
  followers: number | null
  notes: string | null
  contentCount?: number | null
  /** When set (including null), written to `enrichment_error`; omit to leave the column unchanged on update. */
  enrichmentError?: string | null
}

/** Compact KOL row for the Admin list. */
export interface KolListRow {
  id: string
  groupId: string | null
  kolCode: string
  name: string
  accountName: string | null
  avatarUrl: string | null
  tier: KolTier | null
  followers: number | null
  currentStatus: KolCurrentStatus | null
  cooperationStatus: KolCooperationStatus | null
  lastContactAt: string | null
  createdAt: string
  /** Primary channel platform key (first `kol_channels` row). */
  primaryPlatformKey: string | null
  /** Followers from the primary channel when present. */
  primaryChannelFollowers: number | null
  /** Channel count beyond the primary one. */
  extraChannelCount: number
}

/**
 * Full KOL record for the detail pane (Vue `Kol` minus optional `channels`;
 * channels are loaded separately via `kol_channels`).
 */
export interface KolDetail {
  id: string
  groupId: string | null
  /**
   * System-generated, human-readable code (e.g. "KOL-000123").
   * Assigned by the database via a sequence; read-only on the client.
   */
  kolCode: string | null
  name: string
  /** Social media account / channel name. */
  accountName: string | null
  tier: KolTier | null
  rating: number | null
  followers: number | null
  /** Content vertical / niche (e.g. "Beauty & Skincare"). */
  vertical: string | null
  info: string | null
  background: string | null
  /** Free-form remarks captured on the Overview tab. */
  remarks: string | null
  avatarUrl: string | null
  email: string | null
  phone: string | null
  /** ISO 3166-1 alpha-2 for {@link phone} (PhoneInput selection). */
  phoneCountry: string | null
  country: string | null
  region: string | null
  state: string | null
  county: string | null
  city: string | null
  town: string | null
  circle: string | null
  postalCode: string | null
  addressLine1: string | null
  addressLine2: string | null
  latitude: number | null
  longitude: number | null
  orderCount: number
  totalAmount: number
  /** Currency for {@link totalAmount} (same CRM list as opportunities). */
  totalAmountCurrency: string
  cooperationYears: number[] | null
  promoCode: string | null
  viewCount: number | null
  engagementRate: number | null
  historyLinks: string[]
  currentStatus: KolCurrentStatus | null
  cooperationStatus: KolCooperationStatus | null
  ownerId: string | null
  lastContactAt: string | null
  reconnectAt: string | null
  commission: number | null
  meetAt: string | null
  checkCycleDays: number | null
  /** Catalog product ids (`product_catalog.id`); legacy free-text names still display as-is. */
  testedProducts: string[]
  communicationHistory: KolCommunicationEntry[]
  shippingInfo: KolShippingInfo
  /** Multiple tracking rows; first row mirrors legacy columns when present. */
  shipments: KolShipment[]
  trackingNumber: string | null
  shippingStatus: string | null
  /** Uploaded non-image contract file URLs (`kol-contract-files` bucket). */
  contractFiles: string[]
  /** Uploaded contract image URLs, WebP-encoded (`kol-contract-images` bucket). */
  contractImages: string[]
  /** Externally pasted contract links (Google Drive, Dropbox, etc.). */
  contractLinks: string[]
  createdAt: string
  updatedAt: string
  /** AI-generated KOL analysis summary (plain-text legacy fallback; mirrors zh_tw). */
  aiSummary: string | null
  /** AI KOL analysis summary in English (US). */
  aiSummaryEnUs: string | null
  /** AI KOL analysis summary in Simplified Chinese. */
  aiSummaryZhCn: string | null
  /** AI KOL analysis summary in Traditional Chinese. */
  aiSummaryZhTw: string | null
  /** The AI model used to generate the summary (`gemini` | `chatgpt` | `claude` | `grok`). */
  aiSummaryModel: string | null
  /** ISO timestamp when the AI summary was last generated. */
  aiSummaryGeneratedAt: string | null
}

/**
 * Editable KOL fields shared by create and update (Vue `KolInput`: name required;
 * remaining save columns optional or nullable).
 */
export interface KolFormInput {
  name: string
  accountName?: string | null
  tier?: KolTier | null
  rating?: number | null
  followers?: number | null
  vertical?: string | null
  info?: string | null
  background?: string | null
  remarks?: string | null
  avatarUrl?: string | null
  email?: string | null
  phone?: string | null
  /** ISO 3166-1 alpha-2 for {@link phone} (PhoneInput selection). */
  phoneCountry?: string | null
  country?: string | null
  region?: string | null
  state?: string | null
  county?: string | null
  city?: string | null
  town?: string | null
  circle?: string | null
  postalCode?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  latitude?: number | null
  longitude?: number | null
  orderCount?: number
  totalAmount?: number
  totalAmountCurrency?: string
  cooperationYears?: number[] | null
  promoCode?: string | null
  viewCount?: number | null
  engagementRate?: number | null
  historyLinks?: string[]
  currentStatus?: KolCurrentStatus | null
  cooperationStatus?: KolCooperationStatus | null
  ownerId?: string | null
  lastContactAt?: string | null
  reconnectAt?: string | null
  commission?: number | null
  meetAt?: string | null
  checkCycleDays?: number | null
  /** Catalog product ids (`product_catalog.id`); legacy free-text names still display as-is. */
  testedProducts?: string[]
  communicationHistory?: KolCommunicationEntry[]
  shippingInfo?: KolShippingInfo
  shipments?: KolShipment[]
  trackingNumber?: string | null
  shippingStatus?: string | null
  contractFiles?: string[]
  contractImages?: string[]
  contractLinks?: string[]
}

/** Optional filters for the Admin KOL list. */
export interface KolListFilters {
  tier: KolTier | null
  cooperationStatus: KolCooperationStatus | null
  filterGroupId: string | null
}

/** Paginated list result. */
export interface KolListResult {
  rows: KolListRow[]
  totalCount: number
}
