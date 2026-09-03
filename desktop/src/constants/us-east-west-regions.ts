/**
 * Custom US East / West sales territories for the customers list filter.
 * Codes cover all 50 states plus DC; lists do not overlap.
 */

/** Postal codes for the West territory (19 states). */
export const US_WEST_STATE_CODES = [
  'WA',
  'AK',
  'HI',
  'AZ',
  'CO',
  'UT',
  'ID',
  'MT',
  'WY',
  'ND',
  'SD',
  'TX',
  'OK',
  'NM',
  'AL',
  'LA',
  'CA',
  'NV',
  'OR',
] as const

/** Postal codes for the East territory (31 states + DC). */
export const US_EAST_STATE_CODES = [
  'NC',
  'SC',
  'GA',
  'FL',
  'MS',
  'TN',
  'VA',
  'WV',
  'MD',
  'DC',
  'NY',
  'NJ',
  'CT',
  'ME',
  'PA',
  'NH',
  'MA',
  'RI',
  'DE',
  'MO',
  'IA',
  'NE',
  'KS',
  'MI',
  'OH',
  'IN',
  'IL',
  'KY',
  'MN',
  'WI',
  'AR',
  'VT',
] as const

/** US region filter values stored in list state. */
export type UsRegionFilter = 'west' | 'east'

/** Canonical country label stored on `customers.company_country` / list filter. */
export const UNITED_STATES_COUNTRY = 'United States'

/** English full names keyed by postal code (including DC). */
export const US_STATE_CODE_TO_NAME: Readonly<Record<string, string>> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  DC: 'District of Columbia',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
}

/** All 50 states + DC as `{ code, name }`, sorted by English name. */
export const US_STATE_OPTIONS: readonly { code: string; name: string }[] = Object.entries(
  US_STATE_CODE_TO_NAME,
)
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))

/** Reverse lookup: English full name (lowercased) → postal code. */
const US_STATE_NAME_TO_CODE: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(US_STATE_CODE_TO_NAME).map(([code, name]) => [name.toLowerCase(), code]),
)

/**
 * Resolve a free-text US state to its two-letter postal code (or DC).
 *
 * @param raw - Full English name, abbreviation, or other stored state text
 * @returns Uppercase postal code when recognized; otherwise an empty string
 */
export function usStateToPostalCode(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return ''
  const upper = trimmed.toUpperCase()
  if (US_STATE_CODE_TO_NAME[upper]) return upper
  return US_STATE_NAME_TO_CODE[trimmed.toLowerCase()] ?? ''
}

/**
 * True when a free-text `company_state` matches a US state code (abbr or full name).
 *
 * @param raw - Stored company_state value
 * @param code - Two-letter postal code (or DC)
 */
export function companyStateMatchesUsCode(raw: string, code: string): boolean {
  const trimmed = raw.trim()
  if (!trimmed || !code) return false
  const upper = trimmed.toUpperCase()
  const codeUpper = code.trim().toUpperCase()
  if (upper === codeUpper) return true
  const name = US_STATE_CODE_TO_NAME[codeUpper]
  return Boolean(name && trimmed.toLowerCase() === name.toLowerCase())
}

/**
 * True when the country list filter is United States.
 *
 * @param value - Selected country filter value
 */
export function isUnitedStatesCountryFilter(value: string): boolean {
  return value.trim() === UNITED_STATES_COUNTRY
}

/**
 * Build `company_state.in(...)` match values for one US postal code.
 * Includes abbreviation and English name in common letter-case variants
 * (e.g. OH, oh, Ohio, OHIO, ohio) so stored casing still matches.
 *
 * @param code - Two-letter postal code (or DC).
 * @returns Deduplicated match values.
 */
export function companyStateValuesForUsCode(code: string): string[] {
  const codeUpper = code.trim().toUpperCase()
  if (!codeUpper || !US_STATE_CODE_TO_NAME[codeUpper]) {
    return []
  }
  const name = US_STATE_CODE_TO_NAME[codeUpper]
  const values: string[] = []
  const seen = new Set<string>()
  const add = (raw: string): void => {
    const v = raw.trim()
    if (!v || seen.has(v)) return
    seen.add(v)
    values.push(v)
  }
  add(codeUpper)
  add(codeUpper.toLowerCase())
  if (name) {
    add(name)
    add(name.toUpperCase())
    add(name.toLowerCase())
  }
  return values
}

/**
 * States belonging to a West/East territory, sorted by English name.
 * @param region - West or East.
 * @returns `{ code, name }` rows.
 */
export function usStateOptionsForRegion(
  region: UsRegionFilter,
): readonly { code: string; name: string }[] {
  const codes = region === 'west' ? US_WEST_STATE_CODES : US_EAST_STATE_CODES
  return [...codes]
    .map((code) => ({ code, name: US_STATE_CODE_TO_NAME[code] ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
}

/**
 * Build values for `company_state.in(...)` for a region
 * (codes + English names, including common letter-case variants).
 *
 * @param region - West or East territory
 * @returns Deduplicated list of abbreviations and full names
 */
export function companyStateValuesForUsRegion(region: UsRegionFilter): string[] {
  const codes = region === 'west' ? US_WEST_STATE_CODES : US_EAST_STATE_CODES
  const values: string[] = []
  const seen = new Set<string>()
  for (const code of codes) {
    for (const raw of companyStateValuesForUsCode(code)) {
      if (seen.has(raw)) continue
      seen.add(raw)
      values.push(raw)
    }
  }
  return values
}
