import type { AppLanguage } from './app-language'

/** Nested locale object written into i18next. */
export type LocaleTree = Record<string, unknown>

/**
 * Folder names under `locales/` mapped to i18next language codes.
 */
export const LOCALE_FOLDERS: Record<string, AppLanguage> = {
  'en-us': 'en',
  'zh-tw': 'zh-TW',
  'zh-cn': 'zh-CN',
}

/**
 * Locale bundles whose object keys merge into the parent namespace (not nested
 * under the file stem). Keeps existing `t('mail.to')` / `t('auth.logIn')`
 * keys stable while grouping leaf files.
 *
 * - `mail`: thematic flat bundles
 * - any other namespace: optional `ui.json` flat bundle for leftover string leaves
 */
const FLAT_LOCALE_BUNDLES: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['mail', new Set(['compose', 'reader', 'account', 'labels', 'list'])],
])

/**
 * Converts kebab-case locale path segments to i18next keys.
 * @param stem - Filename or folder segment without `.json`.
 * @returns Camel-case key.
 */
export function namespaceFromFileStem(stem: string): string {
  return stem.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

/**
 * Converts monorepo-style `{'@'}` escapes to a literal `@`.
 * @param value - Locale tree node (string, array, or object).
 * @returns Tree with `{'@'}` sequences replaced by `@`.
 */
export function unescapeAtSigns(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replaceAll("{'@'}", '@')
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => unescapeAtSigns(item))
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        unescapeAtSigns(nested),
      ]),
    )
  }
  return value
}

/**
 * Returns whether a value is a plain object (locale tree node).
 * @param value - Candidate.
 * @returns True for non-null plain objects.
 */
function isPlainObject(value: unknown): value is LocaleTree {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Returns whether a locale path should flatten its object into the parent key.
 * @param segments - Camel-case path segments for the file.
 * @param value - Parsed JSON value.
 * @returns True when keys merge into the parent namespace.
 */
function shouldMergeIntoParent(segments: string[], value: unknown): boolean {
  if (segments.length !== 2 || !isPlainObject(value)) {
    return false
  }
  const namespace = segments[0]
  const stem = segments[1]
  if (!namespace || !stem) {
    return false
  }
  const allowed = FLAT_LOCALE_BUNDLES.get(namespace)
  if (allowed) {
    return allowed.has(stem)
  }
  return stem === 'ui'
}

/**
 * Writes a nested locale object at `segments` on `bundle`.
 * Flat bundles merge into the parent namespace so existing `t()` keys stay stable.
 * @param bundle - Language bundle being built.
 * @param segments - Camel-case path segments.
 * @param value - Unescaped JSON tree for the leaf file.
 * @returns Nothing.
 */
export function assignNested(
  bundle: LocaleTree,
  segments: string[],
  value: unknown,
): void {
  let cursor: LocaleTree = bundle
  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index]
    const existing = cursor[key]
    if (existing === null || typeof existing !== 'object' || Array.isArray(existing)) {
      cursor[key] = {}
    }
    cursor = cursor[key] as LocaleTree
  }
  const last = segments[segments.length - 1]
  if (!last) {
    return
  }
  if (shouldMergeIntoParent(segments, value)) {
    Object.assign(cursor, value)
    return
  }
  cursor[last] = value
}

/**
 * Empty translation trees for every supported UI language.
 * @returns Fresh trees keyed by i18next language code.
 */
export function emptyLocaleTrees(): Record<AppLanguage, LocaleTree> {
  return {
    en: {},
    'zh-TW': {},
    'zh-CN': {},
  }
}

/**
 * Merges one locale JSON file into the language trees.
 * Clash files are skipped (separate i18n instance).
 * @param trees - Per-language trees being built.
 * @param folder - Locale folder (`en-us`, `zh-tw`, `zh-cn`).
 * @param rest - Path under the folder without `.json` (`settings/updates`).
 * @param jsonValue - Parsed JSON value.
 * @returns Nothing.
 */
export function mergeLocaleFile(
  trees: Record<AppLanguage, LocaleTree>,
  folder: string,
  rest: string,
  jsonValue: unknown,
): void {
  const language = LOCALE_FOLDERS[folder]
  if (!language || rest.startsWith('clash/')) {
    return
  }
  const segments = rest.split('/').map((segment) => namespaceFromFileStem(segment))
  assignNested(trees[language], segments, unescapeAtSigns(jsonValue))
}
