import { suggestEngineFor, type SearchEngine } from '@/types/search'
import type { MarketAssetDto } from '@/utils/home/library-api'

export interface MarketQuoteDto {
  id: string
  symbol: string
  name: string
  kind: 'crypto' | 'stock'
  price: number
  change: number
}

export interface MarketSearchHitDto {
  id: string
  symbol: string
  name: string
  kind: 'crypto' | 'stock'
  thumb: string | null
}

export interface NewsBriefingDto {
  title: string
  description: string
  url: string
  source: string
}

export interface WeatherDto {
  temperatureC: number
  humidity: number
  windSpeedKmh: number
  weatherCode: number
  timezone: string
}

/**
 * Invokes a network proxy method in the Electron main process.
 * @param method - Handler name.
 * @param args - Arguments.
 * @returns Typed result.
 */
async function netCall<T>(method: string, ...args: unknown[]): Promise<T> {
  if (!window.workbench?.net?.invoke) {
    throw new Error('PowerSource Workbench net bridge is unavailable.')
  }
  return window.workbench.net.invoke(method, ...args) as Promise<T>
}

/**
 * Opens an http(s) URL in the system browser (Electron shell).
 * @param url - Absolute URL.
 * @returns Nothing.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (!window.workbench?.shell?.openExternal) {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  await window.workbench.shell.openExternal(url)
}

/**
 * Loads current weather for a coordinate via workbench-api.
 * @param latitude - Degrees north.
 * @param longitude - Degrees east.
 * @returns Current conditions.
 */
export async function fetchWeather(latitude: number, longitude: number): Promise<WeatherDto> {
  return netCall<WeatherDto>('fetchWeather', latitude, longitude)
}

/**
 * Resolves a human-readable place name for coordinates via workbench-api.
 * @param latitude - Degrees north.
 * @param longitude - Degrees east.
 * @param language - App UI language for localized names.
 * @returns City / locality label, or null when unavailable.
 */
export async function fetchPlaceName(
  latitude: number,
  longitude: number,
  language: string,
): Promise<string | null> {
  const place = await netCall<string | null>('fetchPlaceName', latitude, longitude, language)
  return typeof place === 'string' && place.trim() ? place : null
}

export interface PlaceSearchHitDto {
  id: string
  name: string
  detail: string
  latitude: number
  longitude: number
}

/**
 * Searches cities / places via workbench-api.
 * @param query - Free-text place name.
 * @param language - App UI language for localized names.
 * @returns Matching places.
 */
export async function searchPlaces(
  query: string,
  language: string,
): Promise<PlaceSearchHitDto[]> {
  const trimmed = query.trim()
  if (!trimmed) {
    return []
  }
  return netCall<PlaceSearchHitDto[]>('searchPlaces', trimmed, language)
}

/**
 * Loads autocomplete suggestions via the Electron main-process proxy.
 * @param engine - Active search engine.
 * @param query - Search text.
 * @returns Suggestion strings.
 */
export async function fetchSuggestions(engine: SearchEngine, query: string): Promise<string[]> {
  try {
    return await netCall<string[]>('fetchSuggestions', suggestEngineFor(engine), query)
  } catch {
    return []
  }
}

/**
 * Loads live quotes for selected market assets via the main-process proxy.
 * @param assets - Selected market assets.
 * @returns Live quotes in request order.
 */
export async function fetchMarketQuotes(assets: MarketAssetDto[]): Promise<MarketQuoteDto[]> {
  if (assets.length === 0) {
    return []
  }
  try {
    return await netCall<MarketQuoteDto[]>('fetchMarketQuotes', assets)
  } catch {
    return []
  }
}

/**
 * Searches stocks and cryptocurrencies via the main-process proxy.
 * @param query - Search text.
 * @returns Search hits.
 */
export async function searchMarketAssets(query: string): Promise<MarketSearchHitDto[]> {
  try {
    return await netCall<MarketSearchHitDto[]>('searchMarketAssets', query)
  } catch {
    return []
  }
}

/**
 * Loads the latest RSS briefing item via the main-process proxy.
 * @returns Briefing items.
 */
export async function fetchNewsBriefing(): Promise<NewsBriefingDto[]> {
  try {
    return await netCall<NewsBriefingDto[]>('fetchNewsBriefing')
  } catch {
    return []
  }
}

export interface CurrencyConvertDto {
  amount: number
  from: string
  to: string
  rate: number
  result: number
  date: string
}

/** Currency code used by the converter (fiat or crypto). */
export type CurrencyCode = string

/** One entry from the public FX catalog. */
export interface CurrencyCatalogEntry {
  code: CurrencyCode
  name: string
  kind: 'fiat' | 'crypto'
}

let currencyCatalogPromise: Promise<CurrencyCatalogEntry[]> | null = null

/**
 * Returns whether a code is an ISO 4217 fiat currency.
 * @param code - Currency code.
 * @returns True when the runtime treats it as fiat.
 */
export function isFiatCurrencyCode(code: string): boolean {
  const upper = code.toUpperCase()
  try {
    return Intl.supportedValuesOf('currency').includes(upper)
  } catch {
    return /^[A-Z]{3}$/.test(upper)
  }
}

/**
 * Normalizes a currency code for storage and display.
 * @param code - Raw code.
 * @returns Uppercase trimmed code, or null when invalid.
 */
export function normalizeCurrencyCode(code: string): CurrencyCode | null {
  const next = code.trim().toUpperCase()
  if (!/^[A-Z0-9]{2,16}$/.test(next)) {
    return null
  }
  return next
}

/**
 * Loads the full fiat + crypto catalog via workbench-api (cached).
 * @returns Catalog entries sorted by code.
 */
export async function fetchCurrencyCatalog(): Promise<CurrencyCatalogEntry[]> {
  if (!currencyCatalogPromise) {
    currencyCatalogPromise = netCall<CurrencyCatalogEntry[]>('fetchCurrencyCatalog')
      .then((entries) => (Array.isArray(entries) ? entries : []))
      .catch((error: unknown) => {
        currencyCatalogPromise = null
        throw error
      })
  }
  return currencyCatalogPromise
}

/**
 * Filters the currency catalog by code or name.
 * @param catalog - Full catalog.
 * @param query - User search text.
 * @returns Matching entries (capped).
 */
export function filterCurrencyCatalog(
  catalog: CurrencyCatalogEntry[],
  query: string,
): CurrencyCatalogEntry[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) {
    return []
  }
  return catalog
    .filter(
      (entry) =>
        entry.code.toLowerCase().includes(normalized) ||
        entry.name.toLowerCase().includes(normalized),
    )
    .slice(0, 40)
}

/**
 * Converts an amount between two currencies via workbench-api.
 * @param amount - Source amount.
 * @param from - Source currency code.
 * @param to - Target currency code.
 * @returns Conversion result.
 */
export async function fetchCurrencyConvert(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
): Promise<CurrencyConvertDto> {
  const source = normalizeCurrencyCode(from)
  const target = normalizeCurrencyCode(to)
  if (!source || !target) {
    throw new Error('Invalid currency code')
  }
  if (source === target) {
    return {
      amount,
      from: source,
      to: target,
      rate: 1,
      result: amount,
      date: new Date().toISOString().slice(0, 10),
    }
  }
  return netCall<CurrencyConvertDto>('fetchCurrencyConvert', amount, source, target)
}
