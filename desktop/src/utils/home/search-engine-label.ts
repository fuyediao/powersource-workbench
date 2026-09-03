import type { TFunction } from 'i18next'
import type { SearchEngine } from '@/types/search'

/**
 * Localized name for a search engine (Ask is not the English word "Ask").
 * @param t - i18next translator.
 * @param engine - Engine id.
 * @returns Display name for placeholders and suggestion rows.
 */
export function searchEngineLabel(t: TFunction, engine: SearchEngine): string {
  return engine === 'Ask' ? t('search.engineAsk') : engine
}
