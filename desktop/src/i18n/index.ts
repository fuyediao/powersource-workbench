import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import zhTw from './locales/zh-tw.json'

const languageStorageKey = 'powersource-workbench-language'

/**
 * Resolves the initial application language from preference and system locale.
 * @returns A supported locale identifier.
 */
function resolveInitialLanguage(): 'en' | 'zh-TW' {
  const stored = localStorage.getItem(languageStorageKey)
  if (stored === 'en' || stored === 'zh-TW') {
    return stored
  }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-TW' : 'en'
}

export const i18nReady = i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'zh-TW': { translation: zhTw },
  },
  lng: resolveInitialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

i18n.on('languageChanged', (language) => {
  const supported = language === 'zh-TW' ? 'zh-TW' : 'en'
  localStorage.setItem(languageStorageKey, supported)
  document.documentElement.lang = supported
})

export { i18n, languageStorageKey }
