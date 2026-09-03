/**
 * Layout metadata for the lead create/edit extended form (OKKI-style optional fields).
 * Core CRM columns (company, contact name, phone, email, status) stay on the parent form.
 */

/** Every optional key stored in `leads.extended_fields` JSONB (camelCase). */
export const LEAD_EXTENDED_FIELD_KEYS = [
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
  'contactNickname',
  'socialPlatform',
  'socialPlatformCustom',
  'gender',
  'jobTitle',
  'contactRemarks',
  'contactImageUrl',
] as const

/** Union type of extended-field keys. */
export type LeadExtendedFieldKey = (typeof LEAD_EXTENDED_FIELD_KEYS)[number]

/**
 * "Other" keys rendered as dropdowns (8 enum / IANA + `visitorIpLocation` country combobox).
 * Order follows UX grouping; option lists match the lead checklist markdown in `docs/`.
 */
export const LEAD_EXTENDED_OTHER_SELECT_KEYS = [
  'customerType',
  'purchaseIntent',
  'annualPurchaseVolume',
  'timezone',
  'visitSource',
  'visitorIpLocation',
  'marketSegment',
  'customerLevel',
  'businessChannels',
] as const satisfies readonly LeadExtendedFieldKey[]

export type LeadExtendedOtherSelectKey = (typeof LEAD_EXTENDED_OTHER_SELECT_KEYS)[number]

/**
 * Keys using `LeadExtendedEnumSelect` (slug or IANA storage). Excludes **`visitorIpLocation`** (country combobox).
 */
export const LEAD_EXTENDED_OTHER_ENUM_KEYS = [
  'customerType',
  'purchaseIntent',
  'annualPurchaseVolume',
  'timezone',
  'visitSource',
  'marketSegment',
  'customerLevel',
  'businessChannels',
] as const satisfies readonly LeadExtendedFieldKey[]

/**
 * Extended keys populated only from the CRM (`Customer`); the lead form shows them read-only.
 * Maps: `companyWebsite` ← `customer.website`, `countryRegion` ← **`customer.companyCountry`** only (company address).
 */
export const LEAD_CUSTOMER_SOURCED_FIELD_KEYS = ['companyWebsite', 'countryRegion'] as const satisfies readonly LeadExtendedFieldKey[]

/** Keys shown under each section heading (i18n `admin.leadsTable.form.section.*`). */
export const LEAD_EXTENDED_SECTIONS: {
  id: 'commonInfo' | 'other' | 'contactCommon' | 'contactOther'
  keys: readonly LeadExtendedFieldKey[]
}[] = [
  {
    id: 'commonInfo',
    keys: ['companyWebsite', 'leadName', 'countryRegion', 'leadSource', 'leadTags'],
  },
  {
    id: 'other',
    keys: [
      'customerType',
      'purchaseIntent',
      'annualPurchaseVolume',
      'timezone',
      'searchKeywords',
      'leadNumber',
      'address',
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
    ],
  },
  {
    id: 'contactCommon',
    /** Social rows (**platform + account**, multiple) use **`LeadSocialAccountsEditor`** below the nickname field. */
    keys: ['contactNickname'],
  },
  {
    id: 'contactOther',
    keys: ['gender', 'jobTitle', 'contactRemarks'],
  },
]

/**
 * Returns a fresh string map with every extended key set to an empty string.
 *
 * @returns Record suitable for v-model on the extended-fields form
 */
export function emptyLeadExtendedForm(): Record<LeadExtendedFieldKey, string> {
  return Object.fromEntries(LEAD_EXTENDED_FIELD_KEYS.map((k) => [k, ''])) as Record<
    LeadExtendedFieldKey,
    string
  >
}
