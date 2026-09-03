import { apiGetJson } from './api-client'

export interface CurrencyCatalogEntry {
  code: string
  name: string
  kind: 'fiat' | 'crypto'
}

export interface CurrencyConvertDto {
  amount: number
  from: string
  to: string
  rate: number
  result: number
  date: string
}

/**
 * Loads the FX catalog via workbench-api GET /start/currency/catalog.
 * @returns Catalog entries sorted by code.
 */
export async function fetchCurrencyCatalog(): Promise<CurrencyCatalogEntry[]> {
  const data = await apiGetJson<{ currencies?: CurrencyCatalogEntry[] }>(
    '/start/currency/catalog',
  )
  return Array.isArray(data.currencies) ? data.currencies : []
}

/**
 * Converts an amount via workbench-api GET /start/currency/convert.
 * @param amount - Source amount.
 * @param from - Source currency code.
 * @param to - Target currency code.
 * @returns Conversion result.
 */
export async function fetchCurrencyConvert(
  amount: number,
  from: string,
  to: string,
): Promise<CurrencyConvertDto> {
  const params = new URLSearchParams({
    amount: String(amount),
    from,
    to,
  })
  return apiGetJson<CurrencyConvertDto>(`/start/currency/convert?${params.toString()}`)
}
