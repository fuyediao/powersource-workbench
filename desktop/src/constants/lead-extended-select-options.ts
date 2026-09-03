/**
 * Ordered enum slugs for lead extended "Other" dropdowns.
 * Source: lead checklist markdown under `docs/` (section order and bullet order must match).
 */

import {
  LEAD_EXTENDED_OTHER_ENUM_KEYS,
  type LeadExtendedFieldKey,
} from '@/constants/lead-extended-form'

/** IANA timezone identifiers for `extended_fields.timezone` (storage = same string). Source: doc § Timezone. */
export const LEAD_TIMEZONE_IANA_VALUES = [
  'UTC',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Warsaw',
  'Europe/Istanbul',
  'Europe/Moscow',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Singapore',
  'Asia/Kuala_Lumpur',
  'Asia/Manila',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Taipei',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Ho_Chi_Minh',
  'Australia/Perth',
  'Australia/Sydney',
  'Pacific/Auckland',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Vancouver',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'Pacific/Honolulu',
  'America/Anchorage',
] as const

export type LeadTimezoneIana = (typeof LEAD_TIMEZONE_IANA_VALUES)[number]

/** Keys that use slug storage + `admin.leadsTable.form.leadOption.*` labels (excludes `visitorIpLocation`). */
export type LeadExtendedOtherEnumKey = (typeof LEAD_EXTENDED_OTHER_ENUM_KEYS)[number]

/** `customerType` — source: doc § Customer Type. */
export const LEAD_CUSTOMER_TYPE_SLUGS = [
  'a4',
  'a2',
  'raw_material_supplier',
  'manufacturer',
  'franchisee',
  'channel_distributor',
  'trader',
  'agent',
  'wholesaler',
  'distributor',
  'consignment_seller',
  'retailer',
  'procurement_office',
  'procurement_consulting_company',
  'exporter',
  'importer',
  'individual_consumer',
  'institutional_consumer',
  'engineering_contractor',
  'other',
] as const

/** `purchaseIntent` — source: doc § Purchase Intent. */
export const LEAD_PURCHASE_INTENT_SLUGS = ['unknown', 'low', 'medium', 'high'] as const

/** `annualPurchaseVolume` — source: doc § Annual Purchase Volume. */
export const LEAD_ANNUAL_PURCHASE_VOLUME_SLUGS = [
  'none',
  'usd_0_1k',
  'usd_1k_5k',
  'usd_5k_10k',
  'usd_10k_30k',
  'usd_30k_50k',
  'usd_50k_100k',
  'usd_100k_300k',
  'usd_300k_500k',
  'usd_500k_1m',
  'usd_1m_5m',
  'usd_5m_plus',
] as const

/** `visitSource` — source: doc § Visit Source. */
export const LEAD_VISIT_SOURCE_SLUGS = ['other', 'paid_ads', 'organic', 'social', 'direct'] as const

/** `marketSegment` — source: doc § Market Segment. */
export const LEAD_MARKET_SEGMENT_SLUGS = [
  'law_enforcement_fire',
  'public_equipment',
  'industry_market',
  'hardware_electrical',
  'furniture_daily',
  'gift_market',
  'comprehensive_wholesale_trade',
  'unknown_other',
] as const

/** `customerLevel` — source: doc § Customer Level. */
export const LEAD_CUSTOMER_LEVEL_SLUGS = [
  'a0_million',
  'a1_hundred_thousand',
  'a2_ten_thousand',
  'a3_below_ten_thousand',
  'a4_dormant',
  'b_new',
  'c_high_potential',
  'd_low_potential',
] as const

/** `businessChannels` — source: doc § Business Channels. */
export const LEAD_BUSINESS_CHANNELS_SLUGS = [
  'own_website',
  'alibaba_international',
  'amazon',
  'aliexpress',
  'vertical_ecommerce',
  'agent_distributor',
  'ka_chain',
  'retail_store',
  'trader',
  'end_consumer',
  'unknown_other',
] as const

const ENUM_SLUGS_BY_FIELD: Record<LeadExtendedOtherEnumKey, readonly string[]> = {
  customerType: LEAD_CUSTOMER_TYPE_SLUGS,
  purchaseIntent: LEAD_PURCHASE_INTENT_SLUGS,
  annualPurchaseVolume: LEAD_ANNUAL_PURCHASE_VOLUME_SLUGS,
  timezone: LEAD_TIMEZONE_IANA_VALUES,
  visitSource: LEAD_VISIT_SOURCE_SLUGS,
  marketSegment: LEAD_MARKET_SEGMENT_SLUGS,
  customerLevel: LEAD_CUSTOMER_LEVEL_SLUGS,
  businessChannels: LEAD_BUSINESS_CHANNELS_SLUGS,
}

/**
 * Whether `value` is a known option slug for the given extended enum field (including IANA for `timezone`).
 *
 * @param fieldKey - Extended field key (enum dropdown keys only)
 * @param value - Stored string from `extended_fields`
 * @returns True when the value matches a defined option
 */
export function isKnownLeadExtendedEnumValue(fieldKey: LeadExtendedFieldKey, value: string): boolean {
  const slugs = ENUM_SLUGS_BY_FIELD[fieldKey as LeadExtendedOtherEnumKey]
  if (!slugs) return false
  const v = value.trim()
  return slugs.includes(v)
}

/**
 * Vue i18n path for one enum option (caller passes `t(...)`).
 *
 * @param fieldKey - Enum field key
 * @param slug - Stored slug or IANA id
 * @returns Message path under `admin.leadsTable.form.leadOption`
 */
export function leadExtendedEnumOptionMessageKey(
  fieldKey: LeadExtendedOtherEnumKey,
  slug: string,
): `admin.leadsTable.form.leadOption.${LeadExtendedOtherEnumKey}.${string}` {
  return `admin.leadsTable.form.leadOption.${fieldKey}.${slug}`
}

/**
 * Option list for `LeadExtendedEnumSelect` (value = slug / IANA).
 *
 * @param fieldKey - Enum field key
 * @returns Ordered values for the dropdown
 */
export function leadExtendedEnumValuesForField(fieldKey: LeadExtendedOtherEnumKey): readonly string[] {
  return ENUM_SLUGS_BY_FIELD[fieldKey]
}

/** When option count is at or above this, show a search row in `LeadExtendedEnumSelect`. */
export const LEAD_EXTENDED_ENUM_SEARCH_THRESHOLD = 12
