import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { isAppLanguage, type AppLanguage } from '@/i18n/app-language'
import { localePrefixesForPersistedScreen } from '@/constants/locale-prefixes'
import {
  ensureLocalePrefixes,
  getActiveLocalePrefixes,
  getBundledLocaleResources,
  loadAllLocaleBundles,
  setActiveLocalePrefixes,
} from '@/i18n/load-locales'

export type { AppLanguage } from '@/i18n/app-language'
export { isAppLanguage, resolveAppLanguage } from '@/i18n/app-language'
export { ensureLocalePrefixes, loadAllLocaleBundles, setActiveLocalePrefixes } from '@/i18n/load-locales'

const LANGUAGE_KEY = 'workbench-language'

/**
 * Reads the Windows installer language via the desktop bridge.
 * @returns Supported locale, or null when unset or not running in Electron.
 */
function readInstallerLanguage(): AppLanguage | null {
  if (typeof window === 'undefined') {
    return null
  }
  const raw = window.workbench?.app?.getInstallLanguage?.()
  return isAppLanguage(raw) ? raw : null
}

/**
 * Resolves the initial UI language from Settings storage, then the installer choice.
 * @returns Supported locale identifier.
 */
function resolveInitialLanguage(): AppLanguage {
  if (typeof localStorage === 'undefined') {
    return 'en'
  }
  const saved = localStorage.getItem(LANGUAGE_KEY)
  if (isAppLanguage(saved)) {
    return saved
  }
  const fromInstaller = readInstallerLanguage()
  if (fromInstaller) {
    localStorage.setItem(LANGUAGE_KEY, fromInstaller)
    return fromInstaller
  }
  return 'en'
}

/**
 * Synchronizes document metadata with the active language.
 * @param language - Active locale identifier.
 * @returns Nothing.
 */
function updateDocumentLanguage(language: string): void {
  document.documentElement.lang = language
  document.title = i18n.t('desktopMenu.productName', { defaultValue: 'Workbench' })
}

const initialLanguage = resolveInitialLanguage()

/**
 * Initializes i18next and eagerly merges every locale JSON (all languages)
 * before the first paint. App render waits on this promise.
 */
export const i18nReady = i18n
  .use(initReactI18next)
  .init({
    resources: getBundledLocaleResources(),
    lng: initialLanguage,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })
  .then(() => {
    loadAllLocaleBundles()
    setActiveLocalePrefixes(localePrefixesForPersistedScreen())
    updateDocumentLanguage(initialLanguage)
  })

const originalChangeLanguage = i18n.changeLanguage.bind(i18n)

/**
 * Switches UI language after loading the prefixes the current screen needs.
 * @param language - Target locale.
 * @returns Nothing.
 */
export async function changeAppLanguage(language: AppLanguage): Promise<void> {
  await ensureLocalePrefixes(getActiveLocalePrefixes(), language)
  await originalChangeLanguage(language)
}

i18n.changeLanguage = ((lng?: string, callback?: (error: Error | null, t?: typeof i18n.t) => void) => {
  const run = async (): Promise<typeof i18n.t> => {
    if (isAppLanguage(lng)) {
      await ensureLocalePrefixes(getActiveLocalePrefixes(), lng)
    }
    return originalChangeLanguage(lng, callback)
  }
  return run()
}) as typeof i18n.changeLanguage

i18n.on('languageChanged', (language) => {
  localStorage.setItem(LANGUAGE_KEY, language)
  updateDocumentLanguage(language)
})

export default i18n
