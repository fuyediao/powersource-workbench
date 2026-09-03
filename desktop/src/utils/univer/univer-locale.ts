import { LocaleType } from '@univerjs/core'

/**
 * Maps the app i18n language to a Univer locale enum.
 * @param language - Active i18next language (`en` / `zh-TW` / `zh-CN`).
 * @returns Univer locale.
 */
export function univerLocaleFromAppLanguage(language: string): LocaleType {
  const normalized = language.toLowerCase()
  if (normalized.startsWith('zh-tw') || normalized.startsWith('zh-hk')) {
    return LocaleType.ZH_TW
  }
  if (normalized.startsWith('zh')) {
    return LocaleType.ZH_CN
  }
  return LocaleType.EN_US
}
