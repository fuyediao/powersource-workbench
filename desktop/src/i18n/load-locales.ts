import i18n from 'i18next'
import bundledResources from 'virtual:geocrm-i18n-resources'
import { isAppLanguage, type AppLanguage } from '@/i18n/app-language'
import {
  localePrefixesForScreen,
  uniqueLocalePrefixes,
} from '@/constants/locale-prefixes'

export { LOCALE_FOLDERS, namespaceFromFileStem, unescapeAtSigns } from '@/i18n/merge-locale-tree'

/**
 * Marker that every non-Clash prefix for a language is already in i18next.
 */
const ALL_PREFIXES_MARKER = '*'

const loadedPrefixes = new Map<AppLanguage, Set<string>>()

let allBundlesLoaded = false
let activePrefixes: string[] = []

/**
 * Resolves the language used for locale bundle lookups.
 * @param language - Optional explicit language.
 * @returns Supported app language.
 */
function resolveLocaleLanguage(language?: AppLanguage): AppLanguage {
  if (language) {
    return language
  }
  return isAppLanguage(i18n.language) ? i18n.language : 'en'
}

/**
 * Returns whether `prefix` is already in memory, including when a parent
 * folder was loaded (for example `admin` covers `admin/sidebar`).
 * @param loaded - Prefixes merged for one language.
 * @param prefix - Folder prefix to check.
 * @returns True when no JSON fetch is needed for this prefix.
 */
function isPrefixCovered(loaded: Set<string>, prefix: string): boolean {
  if (loaded.has(ALL_PREFIXES_MARKER) || loaded.has(prefix)) {
    return true
  }
  for (const item of loaded) {
    if (prefix.startsWith(`${item}/`)) {
      return true
    }
  }
  return false
}

/**
 * Unions prefixes into the session set so a later language switch reloads
 * every folder this window has already visited (not only the current tab).
 * @param prefixes - Locale prefixes to remember.
 * @returns Nothing.
 */
export function setActiveLocalePrefixes(prefixes: readonly string[]): void {
  activePrefixes = uniqueLocalePrefixes([...activePrefixes, ...prefixes])
}

/**
 * Prefixes requested this session (plus shell from the first screen).
 * @returns Active prefix list.
 */
export function getActiveLocalePrefixes(): string[] {
  return activePrefixes.length > 0
    ? activePrefixes
    : localePrefixesForScreen('home')
}

/**
 * Prefixes that are not yet merged for the given language.
 * @param prefixes - Folder prefixes to check.
 * @param language - Language to check; defaults to the active i18n language.
 * @returns Prefixes that still need a JSON load.
 */
export function getMissingLocalePrefixes(
  prefixes: readonly string[],
  language?: AppLanguage,
): string[] {
  if (allBundlesLoaded) {
    return []
  }
  const resolved = resolveLocaleLanguage(language)
  const loaded = loadedPrefixes.get(resolved)
  if (!loaded) {
    return uniqueLocalePrefixes(prefixes)
  }
  return uniqueLocalePrefixes(prefixes).filter((prefix) => !isPrefixCovered(loaded, prefix))
}

/**
 * Returns whether every prefix is already merged into the language bundle.
 * @param prefixes - Locale folder prefixes.
 * @param language - Language to check; defaults to the active i18n language.
 * @returns True when no network/chunk load is needed.
 */
export function areLocalePrefixesLoaded(
  prefixes: readonly string[],
  language?: AppLanguage,
): boolean {
  return getMissingLocalePrefixes(prefixes, language).length === 0
}

/**
 * Marks every supported language as fully loaded so prefix hooks skip fetches.
 * @returns Nothing.
 */
function markAllLanguagesLoaded(): void {
  loadedPrefixes.set('en', new Set([ALL_PREFIXES_MARKER]))
  loadedPrefixes.set('zh-TW', new Set([ALL_PREFIXES_MARKER]))
  loadedPrefixes.set('zh-CN', new Set([ALL_PREFIXES_MARKER]))
  allBundlesLoaded = true
}

/**
 * Merges the compile-time locale bundle (all languages) into i18next.
 * Idempotent after the first successful call.
 * @returns Nothing.
 */
export function loadAllLocaleBundles(): void {
  for (const language of ['en', 'zh-TW', 'zh-CN'] as const) {
    i18n.addResourceBundle(
      language,
      'translation',
      bundledResources[language].translation,
      true,
      true,
    )
  }
  markAllLanguagesLoaded()
}

/**
 * Compile-time i18next `resources` (every non-Clash locale JSON, all languages).
 * @returns Resource object for `i18n.init`.
 */
export function getBundledLocaleResources(): typeof bundledResources {
  return bundledResources
}

/**
 * Ensures locale JSON is in memory. After boot this is a no-op because every
 * language is already merged; kept so screen hooks stay compatible.
 * @param prefixes - Folder prefixes (ignored after the eager boot load).
 * @param language - Language to load (ignored after the eager boot load).
 * @returns Nothing.
 */
export async function ensureLocalePrefixes(
  prefixes: readonly string[] = [],
  language?: AppLanguage,
): Promise<void> {
  void prefixes
  void language
  loadAllLocaleBundles()
}

if (import.meta.hot) {
  import.meta.hot.accept('virtual:geocrm-i18n-resources', () => {
    loadedPrefixes.clear()
    allBundlesLoaded = false
    loadAllLocaleBundles()
  })
}
