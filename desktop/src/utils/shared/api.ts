import axios from 'axios'
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

interface OpenMeteoForecastResponse {
  timezone?: string
  current?: {
    temperature_2m?: number
    relative_humidity_2m?: number
    weather_code?: number
    wind_speed_10m?: number
  }
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
 * Loads current weather for a coordinate via Open-Meteo (no API key).
 * @param latitude - Degrees north.
 * @param longitude - Degrees east.
 * @returns Current conditions.
 */
export async function fetchWeather(latitude: number, longitude: number): Promise<WeatherDto> {
  const response = await axios.get<OpenMeteoForecastResponse>(
    'https://api.open-meteo.com/v1/forecast',
    {
      params: {
        latitude,
        longitude,
        current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m',
        timezone: 'auto',
        wind_speed_unit: 'kmh',
      },
      timeout: 8000,
      headers: { Accept: 'application/json' },
    },
  )
  const current = response.data.current
  if (
    !current ||
    typeof current.temperature_2m !== 'number' ||
    typeof current.weather_code !== 'number'
  ) {
    throw new Error('Weather response incomplete')
  }
  return {
    temperatureC: current.temperature_2m,
    humidity: typeof current.relative_humidity_2m === 'number' ? current.relative_humidity_2m : 0,
    windSpeedKmh: typeof current.wind_speed_10m === 'number' ? current.wind_speed_10m : 0,
    weatherCode: current.weather_code,
    timezone: response.data.timezone ?? 'auto',
  }
}

interface BigDataCloudReverseResponse {
  city?: string
  locality?: string
  principalSubdivision?: string
  countryName?: string
}

/**
 * Maps an app locale to a BigDataCloud locality language code.
 * @param language - App UI language.
 * @returns Provider language tag.
 */
function placeLanguage(language: string): string {
  if (language === 'zh-TW') {
    return 'zh-TW'
  }
  if (language === 'zh-CN') {
    return 'zh'
  }
  return 'en'
}

/**
 * Resolves a human-readable place name for coordinates (no API key).
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
  const response = await axios.get<BigDataCloudReverseResponse>(
    'https://api.bigdatacloud.net/data/reverse-geocode-client',
    {
      params: {
        latitude,
        longitude,
        localityLanguage: placeLanguage(language),
      },
      timeout: 8000,
      headers: { Accept: 'application/json' },
    },
  )
  const city = response.data.city?.trim() || response.data.locality?.trim()
  const region = response.data.principalSubdivision?.trim()
  if (city && region && city !== region) {
    return `${city}, ${region}`
  }
  if (city) {
    return city
  }
  if (region) {
    return region
  }
  const country = response.data.countryName?.trim()
  return country || null
}

export interface PlaceSearchHitDto {
  id: string
  name: string
  detail: string
  latitude: number
  longitude: number
}

interface OpenMeteoGeocodeResult {
  id?: number
  name?: string
  latitude?: number
  longitude?: number
  admin1?: string
  country?: string
}

interface OpenMeteoGeocodeResponse {
  results?: OpenMeteoGeocodeResult[]
}

/**
 * Maps an app locale to an Open-Meteo geocoding language code.
 * @param language - App UI language.
 * @returns Provider language tag.
 */
function geocodeLanguage(language: string): string {
  if (language === 'zh-TW') {
    return 'zh_tw'
  }
  if (language === 'zh-CN') {
    return 'zh'
  }
  return 'en'
}

/**
 * Searches cities / places via Open-Meteo geocoding (no API key).
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
  const response = await axios.get<OpenMeteoGeocodeResponse>(
    'https://geocoding-api.open-meteo.com/v1/search',
    {
      params: {
        name: trimmed,
        count: 8,
        language: geocodeLanguage(language),
        format: 'json',
      },
      timeout: 8000,
      headers: { Accept: 'application/json' },
    },
  )
  return (response.data.results ?? [])
    .filter(
      (row): row is OpenMeteoGeocodeResult & { name: string; latitude: number; longitude: number } =>
        typeof row.name === 'string' &&
        typeof row.latitude === 'number' &&
        typeof row.longitude === 'number',
    )
    .map((row) => {
      const region = row.admin1?.trim()
      const country = row.country?.trim()
      const detailParts = [region, country].filter(
        (part): part is string => Boolean(part) && part !== row.name,
      )
      return {
        id: String(row.id ?? `${row.latitude},${row.longitude}`),
        name: row.name.trim(),
        detail: detailParts.join(', '),
        latitude: row.latitude,
        longitude: row.longitude,
      }
    })
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

const CURRENCY_API_BASE =
  'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1'

interface CurrencyApiResponse {
  date?: string
  [base: string]: string | Record<string, number> | undefined
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
 * Loads the full fiat + crypto catalog from the public FX feed (cached).
 * @returns Catalog entries sorted by code.
 */
export async function fetchCurrencyCatalog(): Promise<CurrencyCatalogEntry[]> {
  if (!currencyCatalogPromise) {
    currencyCatalogPromise = axios
      .get<Record<string, string>>(`${CURRENCY_API_BASE}/currencies.json`, {
        timeout: 10_000,
        headers: { Accept: 'application/json' },
      })
      .then((response) =>
        Object.entries(response.data)
          .map(([raw, name]) => {
            const code = normalizeCurrencyCode(raw)
            if (!code) {
              return null
            }
            return {
              code,
              name: typeof name === 'string' && name.trim() ? name.trim() : code,
              kind: isFiatCurrencyCode(code) ? ('fiat' as const) : ('crypto' as const),
            }
          })
          .filter((entry): entry is CurrencyCatalogEntry => entry !== null)
          .sort((a, b) => a.code.localeCompare(b.code)),
      )
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
 * Converts an amount between two currencies via a free public FX feed.
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
  const base = source.toLowerCase()
  const quote = target.toLowerCase()
  const response = await axios.get<CurrencyApiResponse>(
    `${CURRENCY_API_BASE}/currencies/${base}.json`,
    {
      timeout: 8000,
      headers: { Accept: 'application/json' },
    },
  )
  const table = response.data[base]
  const unitRate =
    table && typeof table === 'object' && typeof table[quote] === 'number'
      ? table[quote]
      : null
  if (unitRate === null) {
    throw new Error('Currency response incomplete')
  }
  return {
    amount,
    from: source,
    to: target,
    rate: unitRate,
    result: amount * unitRate,
    date:
      typeof response.data.date === 'string'
        ? response.data.date
        : new Date().toISOString().slice(0, 10),
  }
}
