import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import zhCn from './locales/zh-cn.json'

const languageStorageKey = 'powersource-workbench-language'

/**
 * Resolves the initial application language from preference and system locale.
 * @returns A supported locale identifier.
 */
function resolveInitialLanguage(): 'en' | 'zh-CN' {
  const stored = localStorage.getItem(languageStorageKey)
  if (stored === 'en' || stored === 'zh-CN') {
    return stored
  }
  if (stored === 'zh-TW') {
    return 'zh-CN'
  }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}

export const i18nReady = i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'zh-CN': { translation: zhCn },
  },
  lng: resolveInitialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

i18n.on('languageChanged', (language) => {
  const supported = language === 'zh-CN' ? 'zh-CN' : 'en'
  localStorage.setItem(languageStorageKey, supported)
  document.documentElement.lang = supported
})

export { i18n }
