/**
 * Phone number helpers for the profile edit form (country code + local number).
 * Storage format matches T&E / te: "+{country} {local}" with one space.
 * Mirrors the Android `ProfilePhone.kt` helpers.
 * ISO alpha-2 for the PhoneInput selection is stored separately (`phone_country`).
 */

import { PHONE_COUNTRY_CODES } from '@/constants/phone-country-codes'

export interface PhoneParts {
  /** Dial prefix, e.g. `+886` (not ISO). */
  countryCode: string
  localNumber: string
}

/**
 * Splits a stored phone value into dial prefix and local digits.
 * Expects T&E format: `+86 15807618471` (single space after the dial code).
 * When [raw] is empty or malformed, both parts are empty (no locale default).
 *
 * @param raw Value from `profiles.phone_number`.
 */
export function parsePhoneParts(raw: string): PhoneParts {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { countryCode: '', localNumber: '' }
  }

  const match = trimmed.match(/^(\+\d+)\s+(\d[\d\s]*)$/)
  if (match) {
    return {
      countryCode: match[1],
      localNumber: match[2].replace(/\D/g, ''),
    }
  }

  return { countryCode: '', localNumber: '' }
}

/**
 * Combines dial prefix and local digits into the storage format.
 * Example: +86 + 15807618471 ??"+86 15807618471".
 *
 * @param countryCode - Dial prefix (e.g. `+86`)
 * @param localNumber - National digits
 */
export function combinePhoneParts(countryCode: string, localNumber: string): string {
  const local = localNumber.replace(/\D/g, '')
  if (!local) return ''
  const cc = countryCode.trim().replace(/^\+/, '').replace(/\D/g, '')
  if (!cc) return local
  return `+${cc} ${local}`
}

/**
 * Resolve ISO alpha-2 for PhoneInput: prefer stored ISO; else infer from dial (+1 ??US).
 *
 * @param iso - Stored `phone_country` (may be empty)
 * @param dialString - Stored phone dial string
 * @returns Uppercase ISO or empty
 */
export function resolvePhoneCountryIso(
  iso: string | null | undefined,
  dialString: string,
): string {
  const trimmedIso = (iso ?? '').trim().toUpperCase()
  if (trimmedIso && /^[A-Z]{2}$/.test(trimmedIso)) {
    const known = PHONE_COUNTRY_CODES.find((c) => c.code === trimmedIso)
    if (known) return known.code
  }
  const dial = dialString.trim()
  if (!dial) return ''
  if (/^\+1(\s|$)/.test(dial)) return 'US'
  const parts = parsePhoneParts(dial)
  if (!parts.countryCode) return ''
  const match = PHONE_COUNTRY_CODES.find((c) => c.dialCode === parts.countryCode)
  return match?.code ?? ''
}

/**
 * Normalizes a country-code field while the user types.
 *
 * @param value - Raw input
 */
export function normalizeCountryCodeInput(value: string): string {
  const filtered = value.replace(/[^\d+]/g, '')
  if (!filtered) return ''
  return filtered.startsWith('+') ? filtered : `+${filtered}`
}

/**
 * Keeps only digits in the local-number field.
 *
 * @param value - Raw input
 */
export function normalizeLocalNumberInput(value: string): string {
  return value.replace(/\D/g, '')
}

