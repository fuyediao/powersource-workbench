import { createInstance } from 'i18next'

/**
 * Dedicated Clash i18n instance. Do not call `initReactI18next` on this instance:
 * that plugin registers itself as react-i18next's global default and would replace
 * Workbench Home / title-bar translations with Clash keys. Clash UI is wrapped in
 * `I18nextProvider` instead.
 */
const i18n = createInstance()

export const supportedLanguages = ['en', 'zh', 'zhtw']

export const FALLBACK_LANGUAGE = 'zh'
const LANGUAGE_STORAGE_KEY = 'verge-language'

const normalizeLanguage = (language?: string) =>
  language?.toLowerCase().replace(/_/g, '-')

export const resolveLanguage = (language?: string) => {
  const normalized = normalizeLanguage(language)
  if (!normalized) {
    return FALLBACK_LANGUAGE
  }

  if (normalized === 'zh-tw') return 'zhtw'
  if (normalized === 'zh-cn') return 'zh'

  if (supportedLanguages.includes(normalized)) {
    return normalized
  }

  const baseLanguage = normalized.split('-')[0]
  if (supportedLanguages.includes(baseLanguage)) {
    return baseLanguage
  }

  return FALLBACK_LANGUAGE
}

const getLanguageStorage = () => {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export const cacheLanguage = (language: string) => {
  const storage = getLanguageStorage()
  if (!storage) return

  try {
    storage.setItem(LANGUAGE_STORAGE_KEY, resolveLanguage(language))
  } catch (error) {
    console.warn('[i18n] Failed to cache language:', error)
  }
}

export const getCachedLanguage = () => {
  const storage = getLanguageStorage()
  if (!storage) return undefined

  try {
    const cached = storage.getItem(LANGUAGE_STORAGE_KEY)
    return cached ? resolveLanguage(cached) : undefined
  } catch (error) {
    console.warn('[i18n] Failed to read cached language:', error)
    return undefined
  }
}

type LocaleModule = {
  default: Record<string, unknown>
}

/**
 * Fallback list when the locale glob has not registered yet (tests / empty bundle).
 * Keep in sync with files under `src/i18n/locales/{en-us,zh-tw,zh-cn}/clash/`.
 */
const FALLBACK_LANGUAGE_SECTIONS = [
  'connections',
  'home',
  'layout',
  'logs',
  'profiles',
  'proxies',
  'rules',
  'settings',
  'shared',
  'tests',
] as const

/**
 * Language folders under `locales/` mapped to Clash i18next codes
 * (`en` / `zh` / `zhtw`).
 */
const LOCALE_FOLDERS: Record<string, string> = {
  'en-us': 'en',
  'zh-cn': 'zh',
  'zh-tw': 'zhtw',
}

const localeModules = import.meta.glob<LocaleModule>(
  '../../i18n/locales/*/clash/*.json',
)

const localeLoaders = Object.entries(localeModules).reduce<
  Record<string, Record<string, () => Promise<LocaleModule>>>
>((acc, [path, loader]) => {
  const match = path.match(
    /[/\\]locales[/\\]([^/\\]+)[/\\]clash[/\\]([^/\\]+)\.json$/,
  )
  if (!match) {
    return acc
  }
  const [, folder, section] = match
  const language = LOCALE_FOLDERS[folder]
  if (!language) {
    return acc
  }
  acc[language] ??= {}
  acc[language][section] = loader
  return acc
}, {})

/**
 * Every Clash locale JSON stem (`layout`, `home`, `profiles`, …).
 * Pages, chrome, toasts, and Workbench Settings dialogs cross-reference these
 * files, so they all load together instead of per route.
 * @returns Sorted section names.
 */
export function allClashLanguageSections(): string[] {
  const fromGlob = Object.keys(localeLoaders[FALLBACK_LANGUAGE] ?? {}).sort()
  return fromGlob.length > 0 ? fromGlob : [...FALLBACK_LANGUAGE_SECTIONS]
}

const CLASH_LANGUAGE_SECTIONS = allClashLanguageSections()

const loadLanguageSections = async (
  language: string,
  sections: readonly string[],
) => {
  try {
    const entries = await Promise.all(
      sections.map(async (section) => {
        const loader = localeLoaders[language]?.[section]
        if (!loader) {
          throw new Error(
            `Locale loader not found for language "${language}" section "${section}"`,
          )
        }

        const module = await loader()
        return [section, module.default] as const
      }),
    )

    return Object.fromEntries(entries)
  } catch (error) {
    if (language !== FALLBACK_LANGUAGE) {
      console.warn(
        `Failed to load language ${language}, fallback to ${FALLBACK_LANGUAGE}, ${error}`,
      )
      return loadLanguageSections(FALLBACK_LANGUAGE, sections)
    }
    throw error
  }
}

const getLoadedLanguageSections = (language: string) =>
  Object.keys(i18n.getResourceBundle(language, 'translation') ?? {})

const i18nReady = i18n.init({
  resources: {},
  lng: FALLBACK_LANGUAGE,
  fallbackLng: FALLBACK_LANGUAGE,
  partialBundledLanguages: true,
  interpolation: {
    escapeValue: false,
  },
})

/**
 * Clash locale sections for a memory-router pathname.
 * @param _pathname - Clash route (unused; every page shares one bundle).
 * @returns Every Clash JSON stem.
 */
export function clashSectionsForPath(_pathname: string): string[] {
  return [...CLASH_LANGUAGE_SECTIONS]
}

/**
 * Returns whether every Clash section is already in the language bundle.
 * @param sections - Clash JSON stems (`layout`, `proxies`, …).
 * @param language - Clash or Workbench locale code.
 * @returns True when no extra load is needed.
 */
export function areLanguageSectionsLoaded(
  sections: readonly string[],
  language: string = i18n.language || FALLBACK_LANGUAGE,
): boolean {
  const loaded = new Set(getLoadedLanguageSections(resolveLanguage(language)))
  return sections.every((section) => loaded.has(section))
}

/**
 * Ensures Clash locale JSON for the given sections is in memory.
 * @param sections - One section or a list of stems.
 * @param language - Clash or Workbench locale code.
 * @returns Nothing.
 */
export const ensureLanguageSections = async (
  sections: string | readonly string[],
  language: string = i18n.language || FALLBACK_LANGUAGE,
) => {
  await i18nReady
  const targetLanguage = resolveLanguage(language)
  const sectionList = Array.isArray(sections) ? sections : [sections]
  const loadedSections = new Set(getLoadedLanguageSections(targetLanguage))
  const missingSections = sectionList.filter(
    (section) => !loadedSections.has(section),
  )

  if (!missingSections.length) {
    return
  }

  const resources = await loadLanguageSections(targetLanguage, missingSections)
  i18n.addResourceBundle(targetLanguage, 'translation', resources, true, true)
}

/**
 * Loads locale sections and switches the Clash i18n instance.
 * @param language - Requested locale (Workbench or Clash codes).
 * @returns Nothing.
 */
export const changeLanguage = async (language: string) => {
  await i18nReady
  const targetLanguage = resolveLanguage(language)
  const loadedSections = getLoadedLanguageSections(
    i18n.language || FALLBACK_LANGUAGE,
  )

  await ensureLanguageSections(
    [...new Set([...loadedSections, ...CLASH_LANGUAGE_SECTIONS])],
    targetLanguage,
  )

  await i18n.changeLanguage(targetLanguage)
  cacheLanguage(targetLanguage)
}

/**
 * Loads startup locale sections for the Clash UI.
 * @param initialLanguage - Locale to activate.
 * @returns Nothing.
 */
export const initializeLanguage = async (
  initialLanguage: string = FALLBACK_LANGUAGE,
) => {
  await changeLanguage(initialLanguage)
}

/**
 * Loads Clash locale JSON for Workbench Settings dialogs (TUN, DNS, backup,
 * runtime config). Same full bundle as the island so EditorViewer copy resolves.
 * @param initialLanguage - Locale to activate.
 * @returns Nothing.
 */
export const initializeDialogLanguage = async (
  initialLanguage: string = FALLBACK_LANGUAGE,
) => {
  await i18nReady
  const targetLanguage = resolveLanguage(initialLanguage)
  await ensureLanguageSections(CLASH_LANGUAGE_SECTIONS, targetLanguage)
  await i18n.changeLanguage(targetLanguage)
  cacheLanguage(targetLanguage)
}

export default i18n
