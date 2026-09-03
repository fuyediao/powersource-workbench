import { LEAD_EXTENDED_OTHER_ENUM_KEYS, type LeadExtendedFieldKey } from '@/constants/lead-extended-form'
import type { LeadExtendedOtherEnumKey } from '@/constants/lead-extended-select-options'
import {
  isKnownLeadExtendedEnumValue,
  leadExtendedEnumOptionMessageKey,
} from '@/constants/lead-extended-select-options'

const enumKeySet = new Set<string>(LEAD_EXTENDED_OTHER_ENUM_KEYS)

/**
 * Resolves read-only label text for extended enum / IANA fields on the lead detail card.
 * Unknown or legacy free-text values are returned unchanged.
 *
 * @param key - Extended field key
 * @param raw - Stored value from `extended_fields`
 * @param t - Vue I18n translate function
 * @returns Display string (non-empty when `raw` is non-empty)
 */
export function formatLeadExtendedEnumDetailLabel(
  key: LeadExtendedFieldKey,
  raw: string,
  t: (key: string) => string,
): string {
  const v = raw.trim()
  if (!v) return ''
  if (!enumKeySet.has(key)) return v
  const enumKey = key as LeadExtendedOtherEnumKey
  if (!isKnownLeadExtendedEnumValue(enumKey, v)) return v
  return t(leadExtendedEnumOptionMessageKey(enumKey, v))
}
