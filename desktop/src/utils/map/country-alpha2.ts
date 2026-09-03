/**
 * Resolve ISO alpha-2 from stored English country labels (CRM map filters).
 */

import { COUNTRY_NAME_TO_ALPHA2 } from '@/constants/country-name-to-alpha2'

const LEGACY_NAME_TO_ALPHA2: Readonly<Record<string, string>> = {
  'Taiwan, Province of China': 'TW',
  Taiwan: 'TW',
}

/**
 * Resolve ISO alpha-2 from a country list / DB label.
 * @param countryName - Canonical English name or legacy label.
 * @returns Lowercase alpha-2 for {@link getFlagSvg}, or null.
 */
export function getAlpha2ForCountryName(countryName: string | null | undefined): string | null {
  if (!countryName || !countryName.trim()) {
    return null
  }
  const trimmed = countryName.trim()
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    return trimmed.toLowerCase()
  }
  const paren = trimmed.match(/^(.+?)\s*\(([A-Za-z]{2})\)\s*$/)
  if (paren) {
    const fromName = COUNTRY_NAME_TO_ALPHA2[paren[1].trim()]
    return (fromName ?? paren[2]).toLowerCase()
  }
  const direct = COUNTRY_NAME_TO_ALPHA2[trimmed]
  if (direct) {
    return direct.toLowerCase()
  }
  const legacy = LEGACY_NAME_TO_ALPHA2[trimmed]
  return legacy ? legacy.toLowerCase() : null
}

/**
 * Localized country label for UI via Intl.DisplayNames when alpha-2 is known.
 * @param countryName - Stored English or legacy label.
 * @param locale - BCP 47 tag (e.g. zh-TW).
 * @returns Display label; falls back to countryName.
 */
export function getCountryDisplayName(
  countryName: string | null | undefined,
  locale: string,
): string {
  if (countryName == null || countryName === '') {
    return ''
  }
  const alpha2 = getAlpha2ForCountryName(countryName)
  if (!alpha2) {
    return countryName
  }
  if (alpha2 === 'tw') {
    if (locale.toLowerCase().startsWith('zh-tw')) {
      return '台灣'
    }
    if (locale.toLowerCase().startsWith('zh-cn')) {
      return '台湾'
    }
    return 'Taiwan'
  }
  try {
    const tag = locale.replace('_', '-')
    const names = new Intl.DisplayNames([tag], { type: 'region' })
    const of = names.of(alpha2.toUpperCase())
    if (of) {
      return of
    }
  } catch {
    // Intl unsupported or invalid tag.
  }
  return countryName
}

/**
 * Whether a COUNTRY_OPTIONS English name matches a search query.
 * Matches ISO alpha-2 (e.g. us → United States), English name, and localized names.
 * @param englishName - Entry from COUNTRY_OPTIONS.
 * @param queryRaw - User input; empty matches all.
 * @returns True when the row should appear in filtered results.
 */
export function countryMatchesSearch(englishName: string, queryRaw: string): boolean {
  const q = queryRaw.trim()
  if (!q) {
    return true
  }
  const alpha2 = COUNTRY_NAME_TO_ALPHA2[englishName] ?? ''
  const qLower = q.toLowerCase()
  if (alpha2 && alpha2.toLowerCase().includes(qLower)) {
    return true
  }
  if (englishName.toLowerCase().includes(qLower)) {
    return true
  }
  const zhTW = getCountryDisplayName(englishName, 'zh-TW')
  if (zhTW && zhTW.includes(q)) {
    return true
  }
  const zhCN = getCountryDisplayName(englishName, 'zh-CN')
  if (zhCN && zhCN.includes(q)) {
    return true
  }
  const enUS = getCountryDisplayName(englishName, 'en-US')
  if (enUS && enUS.toLowerCase().includes(qLower)) {
    return true
  }
  return false
}
