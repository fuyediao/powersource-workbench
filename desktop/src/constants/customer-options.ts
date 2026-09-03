/**
 * Customer channel / source / attribute / market / currency option slugs.
 * Labels resolve via i18n (`admin.customers.*`).
 */

export const CUSTOMER_CHANNEL_VALUES = [
  'online_store_mixed',
  'online_ecommerce',
  'online_web_store',
  'online_wechat',
  'offline_ka_chain',
  'offline_supermarket',
  'offline_store',
  'end_user',
] as const

export type CustomerChannelSlug = (typeof CUSTOMER_CHANNEL_VALUES)[number]

/**
 * Type guard for channel slugs.
 * @param value - Raw value.
 * @returns Whether known.
 */
export function isCustomerChannelSlug(
  value: string | null | undefined,
): value is CustomerChannelSlug {
  return value != null && (CUSTOMER_CHANNEL_VALUES as readonly string[]).includes(value)
}

export const CUSTOMER_SOURCE_VALUES = [
  'exhibition',
  'email',
  'phone',
  'field_visit',
  'social',
  'ad',
  'kol',
  'referral',
  'proactive',
  'te_application_form',
  'sales_rep',
  'jordan_channel',
  'web_search',
  'staff_development',
  'other',
] as const

export type CustomerSourceSlug = (typeof CUSTOMER_SOURCE_VALUES)[number]

/**
 * Type guard for source slugs.
 * @param value - Raw value.
 * @returns Whether known.
 */
export function isCustomerSourceSlug(
  value: string | null | undefined,
): value is CustomerSourceSlug {
  return value != null && (CUSTOMER_SOURCE_VALUES as readonly string[]).includes(value)
}

export const CUSTOMER_ATTRIBUTE_VALUES = [
  'total_agent',
  'agent',
  'dealer',
  'retail',
  'wholesaler',
  'direct_import',
  'end_user',
  'custom',
] as const

export type CustomerAttributeSlug = (typeof CUSTOMER_ATTRIBUTE_VALUES)[number]

/**
 * Type guard for attribute slugs.
 * @param value - Raw value.
 * @returns Whether known.
 */
export function isCustomerAttributeSlug(
  value: string | null | undefined,
): value is CustomerAttributeSlug {
  return value != null && (CUSTOMER_ATTRIBUTE_VALUES as readonly string[]).includes(value)
}

/** Slugs shown in the customer Market Segment picker. */
export const MARKET_SEGMENT_VALUES = [
  'mil_police_fire',
  'public_equipment',
  'professional',
  'hardware_electrical',
  'furniture_daily',
  'gift_market',
  'comprehensive_wholesale_trade',
] as const

/** Retired slugs still stored on some rows; labels stay in i18n for display. */
const MARKET_SEGMENT_LEGACY_VALUES = ['consumer', 'industrial'] as const

export type MarketSegmentSlug =
  | (typeof MARKET_SEGMENT_VALUES)[number]
  | (typeof MARKET_SEGMENT_LEGACY_VALUES)[number]

/**
 * Type guard for current or legacy market segment slugs.
 * @param value - Raw value.
 * @returns Whether known.
 */
export function isMarketSegmentSlug(
  value: string | null | undefined,
): value is MarketSegmentSlug {
  if (value == null) return false
  return (
    (MARKET_SEGMENT_VALUES as readonly string[]).includes(value) ||
    (MARKET_SEGMENT_LEGACY_VALUES as readonly string[]).includes(value)
  )
}

export const CURRENCY_VALUES = ['USD', 'CNY', 'TWD', 'HKD', 'EUR', 'GBP', 'JPY'] as const

export type CurrencyCode = (typeof CURRENCY_VALUES)[number]

/**
 * Type guard for currency codes.
 * @param value - Raw value.
 * @returns Whether known.
 */
export function isCurrencyCode(value: string | null | undefined): value is CurrencyCode {
  return value != null && (CURRENCY_VALUES as readonly string[]).includes(value)
}

/** Payment method values stored on `customers.payment_method`. */
export const PAYMENT_METHOD_VALUES = [
  'Cash',
  'TransferAccounts',
  'Prepaid',
  'Net-30',
  'T/T',
  '現金',
  'Net-60',
  'Swift',
] as const

export type PaymentMethodValue = (typeof PAYMENT_METHOD_VALUES)[number]

/**
 * Type guard for known payment method values.
 * @param value - Raw value.
 * @returns Whether known.
 */
export function isPaymentMethodValue(
  value: string | null | undefined,
): value is PaymentMethodValue {
  return value != null && (PAYMENT_METHOD_VALUES as readonly string[]).includes(value)
}

/** Slugs shown in the customer Price Type picker. */
export const PRICE_TYPE_VALUES = [
  'msrp',
  'master_distribution',
  'distribution',
  'dealer',
  'wholesaler',
  'direct_import',
] as const

export type PriceTypeSlug = (typeof PRICE_TYPE_VALUES)[number]

/**
 * Type guard for known price type slugs.
 * @param value - Raw value.
 * @returns Whether known.
 */
export function isPriceTypeSlug(value: string | null | undefined): value is PriceTypeSlug {
  return value != null && (PRICE_TYPE_VALUES as readonly string[]).includes(value)
}
