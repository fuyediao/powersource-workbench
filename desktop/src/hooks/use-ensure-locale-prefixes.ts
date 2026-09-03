import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  localePrefixesForScreen,
  uniqueLocalePrefixes,
} from '@/constants/locale-prefixes'
import { isAppLanguage } from '@/i18n/app-language'
import {
  areLocalePrefixesLoaded,
  ensureLocalePrefixes,
  setActiveLocalePrefixes,
} from '@/i18n/load-locales'

/**
 * On each title-bar change, loads locale JSON that is not yet in memory and
 * skips folders already merged for the current language.
 * @param screen - Active title-bar screen id (`home`, `admin`, `docs`, …).
 * @param extraScreens - Other open tab ids whose strings should stay loaded.
 * @returns True when prefixes for the active screen and language are in memory.
 */
export function useEnsureLocalePrefixes(
  screen: string,
  extraScreens: readonly string[] = [],
): boolean {
  const { i18n } = useTranslation()
  const language = isAppLanguage(i18n.language) ? i18n.language : 'en'
  const extraKey = extraScreens.join('\0')
  const currentPrefixes = localePrefixesForScreen(screen)
  const [, setGeneration] = useState(0)

  useEffect(() => {
    const extras = extraKey.length === 0 ? [] : extraKey.split('\0')
    const allPrefixes = uniqueLocalePrefixes([
      ...localePrefixesForScreen(screen),
      ...extras.flatMap((id) => localePrefixesForScreen(id)),
    ])
    setActiveLocalePrefixes(allPrefixes)
    if (areLocalePrefixesLoaded(allPrefixes, language)) {
      return
    }
    let cancelled = false
    void ensureLocalePrefixes(allPrefixes, language).then(() => {
      if (!cancelled) {
        setGeneration((value) => value + 1)
      }
    })
    return () => {
      cancelled = true
    }
  }, [extraKey, language, screen])

  return areLocalePrefixesLoaded(currentPrefixes, language)
}
