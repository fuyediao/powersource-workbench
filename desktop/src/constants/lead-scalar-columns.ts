import type { LeadExtendedFieldKey } from '@/constants/lead-extended-form'

/**
 * Lead-level keys formerly stored in `extended_fields` (not contact-card keys).
 * Persisted as dedicated `leads.*` columns.
 */
export const LEAD_SCALAR_FIELD_KEYS = [
  'companyWebsite',
  'leadName',
  'countryRegion',
  'leadSource',
  'leadTags',
  'customerType',
  'purchaseIntent',
  'annualPurchaseVolume',
  'timezone',
  'searchKeywords',
  'leadNumber',
  'address',
  'imageUrl',
  'leadRemarks',
  'visitSource',
  'visitorIpLocation',
  'marketSegment',
  'customerLevel',
  'brand',
  'businessChannels',
  'performanceHistory',
  'performanceCurrentYear',
  'performanceCurrentYearGoal',
] as const satisfies readonly LeadExtendedFieldKey[]

export type LeadScalarFieldKey = (typeof LEAD_SCALAR_FIELD_KEYS)[number]

/** camelCase form key → Postgres column name on `leads`. */
export const LEAD_SCALAR_DB_COLUMN: Record<LeadScalarFieldKey, string> = {
  companyWebsite: 'company_website',
  leadName: 'lead_name',
  countryRegion: 'country_region',
  leadSource: 'lead_source',
  leadTags: 'lead_tags',
  customerType: 'customer_type',
  purchaseIntent: 'purchase_intent',
  annualPurchaseVolume: 'annual_purchase_volume',
  timezone: 'timezone',
  searchKeywords: 'search_keywords',
  leadNumber: 'lead_number',
  address: 'address',
  imageUrl: 'image_url',
  leadRemarks: 'lead_remarks',
  visitSource: 'visit_source',
  visitorIpLocation: 'visitor_ip_location',
  marketSegment: 'market_segment',
  customerLevel: 'customer_level',
  brand: 'brand',
  businessChannels: 'business_channels',
  performanceHistory: 'performance_history',
  performanceCurrentYear: 'performance_current_year',
  performanceCurrentYearGoal: 'performance_current_year_goal',
}

/**
 * Reads scalar lead columns from a Supabase row into a camelCase map.
 *
 * @param row - Raw `leads` row
 * @returns Non-empty string fields only
 */
export function parseLeadScalarsFromRow(
  row: Record<string, unknown>,
): Partial<Record<LeadScalarFieldKey, string>> {
  const out: Partial<Record<LeadScalarFieldKey, string>> = {}
  for (const key of LEAD_SCALAR_FIELD_KEYS) {
    const col = LEAD_SCALAR_DB_COLUMN[key]
    const v = row[col]
    if (typeof v === 'string' && v.trim()) out[key] = v.trim()
  }
  return out
}

/**
 * Builds a Supabase patch object for lead scalar columns from form strings.
 *
 * @param formStrings - Extended form map (contact keys ignored)
 * @returns Snake_case column patch (empty string → null)
 */
export function leadScalarsToDbPatch(
  formStrings: Partial<Record<LeadExtendedFieldKey, string>> | undefined,
): Record<string, string | null> {
  const patch: Record<string, string | null> = {}
  if (!formStrings) return patch
  for (const key of LEAD_SCALAR_FIELD_KEYS) {
    const col = LEAD_SCALAR_DB_COLUMN[key]
    const v = formStrings[key]?.trim() ?? ''
    patch[col] = v || null
  }
  return patch
}
