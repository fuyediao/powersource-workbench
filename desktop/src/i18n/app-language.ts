/** Supported GeoCRM UI languages (persisted in localStorage). */
export type AppLanguage = 'en' | 'zh-TW' | 'zh-CN'

/**
 * Returns whether a value is a supported UI language.
 * @param value - Candidate locale.
 * @returns True when supported.
 */
export function isAppLanguage(value: string | null | undefined): value is AppLanguage {
  return value === 'en' || value === 'zh-TW' || value === 'zh-CN'
}

/**
 * Maps an i18next language tag onto a supported Settings locale.
 * @param value - Active or requested language string.
 * @returns Supported locale identifier.
 */
export function resolveAppLanguage(value: string | null | undefined): AppLanguage {
  if (isAppLanguage(value)) {
    return value
  }
  if (!value) {
    return 'en'
  }
  if (value.startsWith('zh-CN') || value.toLowerCase().startsWith('zh-cn')) {
    return 'zh-CN'
  }
  if (value.startsWith('zh')) {
    return 'zh-TW'
  }
  if (value.startsWith('en')) {
    return 'en'
  }
  return 'en'
}
