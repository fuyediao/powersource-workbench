import i18n from 'i18next'
import { localePrefixesForScreen } from '@/constants/locale-prefixes'
import { isAppLanguage } from '@/i18n/app-language'
import { ensureLocalePrefixes } from '@/i18n/load-locales'

/**
 * Starts Calendar JS chunks and locale JSON in parallel so opening the tab
 * does not wait for FeaturePage → CalendarPage → Schedule-X in series.
 * @returns Nothing.
 */
export function preloadCalendarFeature(): void {
  const language = isAppLanguage(i18n.language) ? i18n.language : 'en'
  void ensureLocalePrefixes(localePrefixesForScreen('calendar'), language)
  void import('@/pages/feature-page')
  void import('@/pages/calendar-page')
  void import('@/components/calendar/calendar-schedule-host')
}
