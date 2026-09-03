import { usStateToPostalCode } from '@/constants/us-east-west-regions'
import { getAlpha2ForCountryName } from '@/utils/map/country-alpha2'

/** Shipping / identity fields used to build copyable address lines. */
export interface TeShippingAddressParts {
  street?: string | null
  apt?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
  agency?: string | null
}

/** Split copyable shipping lines for T&E admin detail. */
export interface TeShippingAddressCopyLines {
  /** `{countryAlpha2}{stateAbbr}{agencyInitials}` e.g. `USALAPD` */
  locationCode: string
  /** `{street}, {apt}, {city}, {state} {zip}` */
  fullAddress: string
  /** `{stateAbbr} {zip}` */
  postalLine: string
}

/** Small words skipped when building agency initials. */
const AGENCY_INITIAL_SKIP_WORDS = new Set([
  'a',
  'an',
  'and',
  'de',
  'del',
  'for',
  'la',
  'of',
  'the',
  'van',
])

/**
 * Join non-empty address fragments with `", "`.
 *
 * @param parts - Raw address fragments
 * @returns Comma-separated string, or empty when every part is blank
 */
function joinAddressParts(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => (part ?? '').trim())
    .filter((part) => part.length > 0)
    .join(', ')
}

/**
 * Build uppercase initials from an agency / department name.
 * Already-compact acronyms (e.g. `FBI`) are kept as-is; small words like
 * `of` / `the` / `and` are skipped.
 *
 * @param agency - Free-text agency name
 * @returns Uppercase initials, or empty when nothing usable
 */
export function agencyNameToInitials(agency: string | null | undefined): string {
  const trimmed = (agency ?? '').trim()
  if (!trimmed) return ''
  if (/^[A-Za-z0-9]{2,8}$/.test(trimmed)) return trimmed.toUpperCase()
  const words = trimmed
    .split(/[\s/,&.-]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0 && !AGENCY_INITIAL_SKIP_WORDS.has(word.toLowerCase()))
  return words
    .map((word) => {
      const letter = word.match(/[A-Za-z0-9]/)?.[0]
      return letter ? letter.toUpperCase() : ''
    })
    .join('')
}

/**
 * Build `{country}{state}{agency}` location code (e.g. US + AL + APD → USALAPD).
 * Returns empty unless country, state, and agency all resolve.
 *
 * @param country - Stored shipping country label or alpha-2
 * @param state - Stored shipping state (full name or postal code)
 * @param agency - Agency / department name
 * @returns Uppercase code, or empty when any segment is missing
 */
export function formatTeLocationCode(
  country: string | null | undefined,
  state: string | null | undefined,
  agency: string | null | undefined,
): string {
  const countryCode = getAlpha2ForCountryName(country) ?? ''
  const stateCode =
    usStateToPostalCode(state) ||
    (/^[A-Za-z]{2}$/.test((state ?? '').trim()) ? (state ?? '').trim().toUpperCase() : '')
  const agencyCode = agencyNameToInitials(agency)
  if (!countryCode || !stateCode || !agencyCode) return ''
  return `${countryCode}${stateCode}${agencyCode}`
}

/**
 * Build independently copyable shipping address lines for T&E admin detail:
 * location code, full address, and postal shorthand.
 *
 * @param parts - Shipping / agency fields from a T&E submission
 * @returns Line strings; any may be empty when that part has no usable data
 */
export function formatTeShippingAddressCopyLines(
  parts: TeShippingAddressParts,
): TeShippingAddressCopyLines {
  const street = (parts.street ?? '').trim()
  const apt = (parts.apt ?? '').trim()
  const city = (parts.city ?? '').trim()
  const state = (parts.state ?? '').trim()
  const zip = (parts.zip ?? '').trim()
  const stateZip = [state, zip].filter((part) => part.length > 0).join(' ')
  const locality = joinAddressParts([street, apt, city])
  const fullAddress = locality && stateZip ? `${locality}, ${stateZip}` : locality || stateZip
  const abbr = usStateToPostalCode(state) || (state.length === 2 ? state.toUpperCase() : '')
  const postalLine = [abbr, zip].filter((part) => part.length > 0).join(' ')
  const locationCode = formatTeLocationCode(parts.country, parts.state, parts.agency)
  return { locationCode, fullAddress, postalLine }
}
