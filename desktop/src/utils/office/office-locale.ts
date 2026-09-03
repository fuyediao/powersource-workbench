/**
 * Maps the app i18n language to an OnlyOffice `editorConfig.lang` value
 * (mirrors the Go backend's `supportedOfficeLangs` allowlist). Simplified
 * Chinese uses the two-letter code `zh` per OnlyOffice's `lang` parameter
 * docs — `zh-CN` is only valid for the unrelated `editorConfig.region`
 * parameter, not `lang`.
 * @param language - Active i18next language (`en` / `zh-TW` / `zh-CN`).
 * @returns OnlyOffice language code.
 */
export function officeLangFromAppLanguage(language: string): string {
  const normalized = language.toLowerCase()
  if (normalized.startsWith('zh-tw') || normalized.startsWith('zh-hk')) {
    return 'zh-TW'
  }
  if (normalized.startsWith('zh')) {
    return 'zh'
  }
  return 'en'
}
