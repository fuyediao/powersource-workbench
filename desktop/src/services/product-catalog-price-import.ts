import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import {
  getProductPricePeriod,
  PRODUCT_PRICE_TEMPLATE_HEADERS,
  type ProductPricePeriod,
} from '@/office/product-price-template'

/** One validated product price row sent to the quarterly import RPC. */
export interface ProductPriceImportRow {
  product_code: string
  customer_price_usd: number | null
  te_price_usd: number | null
}

/** Result returned by the transactional product price import RPC. */
export interface ProductPriceImportResult extends ProductPricePeriod {
  imported: number
  updatedCurrentPrices: boolean
}

interface ProductPriceRpcClient {
  rpc: (
    name: 'import_product_catalog_prices',
    args: {
      p_year: number
      p_quarter: number
      p_rows: ProductPriceImportRow[]
    },
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>
}

/** Returns true when a value is a non-array record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Reads one raw Univer cell value from a sparse cell row.
 * @param row - Sparse worksheet row.
 * @param column - Zero-based column index.
 * @returns Raw cell value, or null for a missing cell.
 */
function readCellValue(row: Record<string, unknown>, column: number): unknown {
  const cell = row[String(column)]
  if (!isRecord(cell)) {
    return null
  }
  return cell.v ?? null
}

/** Returns whether a raw worksheet value should be treated as blank. */
function isBlank(value: unknown): boolean {
  return value == null || (typeof value === 'string' && value.trim().length === 0)
}

/**
 * Parses one nullable non-negative USD cell.
 * @param value - Raw worksheet cell value.
 * @param rowNumber - One-based row number used in validation errors.
 * @param columnName - Expected English header.
 * @returns Rounded price or null for an empty cell.
 */
function parsePriceCell(
  value: unknown,
  rowNumber: number,
  columnName: string,
): number | null {
  if (isBlank(value)) {
    return null
  }
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Row ${rowNumber}: ${columnName} must be a non-negative number.`)
  }
  return Math.round(parsed * 100) / 100
}

/**
 * Finds the first worksheet's sparse cell data in a Univer workbook snapshot.
 * @param snapshot - Persisted local workbook snapshot.
 * @returns Sparse cell matrix.
 */
function firstWorksheetCellData(
  snapshot: Record<string, unknown>,
): Record<string, unknown> {
  const sheets = snapshot.sheets
  if (!isRecord(sheets)) {
    throw new Error('The workbook has no worksheets.')
  }
  const sheetOrder = Array.isArray(snapshot.sheetOrder)
    ? snapshot.sheetOrder.filter((id): id is string => typeof id === 'string')
    : []
  const firstSheetId = sheetOrder.find((id) => isRecord(sheets[id])) ?? Object.keys(sheets)[0]
  const firstSheet = firstSheetId ? sheets[firstSheetId] : null
  if (!isRecord(firstSheet) || !isRecord(firstSheet.cellData)) {
    throw new Error('The first worksheet contains no cells.')
  }
  return firstSheet.cellData
}

/**
 * Parses the English three-column product price sheet stored by Univer.
 * @param snapshot - Persisted local workbook snapshot.
 * @returns Validated rows ready for the database RPC.
 */
export function parseProductPriceSnapshot(
  snapshot: Record<string, unknown>,
): ProductPriceImportRow[] {
  const cellData = firstWorksheetCellData(snapshot)
  const headerRow = cellData['0']
  if (!isRecord(headerRow)) {
    throw new Error(`The header row must be: ${PRODUCT_PRICE_TEMPLATE_HEADERS.join(' | ')}`)
  }
  const headerMatches = PRODUCT_PRICE_TEMPLATE_HEADERS.every(
    (expected, index) => String(readCellValue(headerRow, index) ?? '').trim() === expected,
  )
  const hasExtraHeader = Object.entries(headerRow).some(([column, cell]) => {
    const columnIndex = Number(column)
    return Number.isInteger(columnIndex) && columnIndex >= 3 && !isBlank(isRecord(cell) ? cell.v : null)
  })
  if (!headerMatches || hasExtraHeader) {
    throw new Error(`The header row must be: ${PRODUCT_PRICE_TEMPLATE_HEADERS.join(' | ')}`)
  }

  const rowNumbers = Object.keys(cellData)
    .map(Number)
    .filter((rowNumber) => Number.isInteger(rowNumber) && rowNumber > 0)
    .sort((left, right) => left - right)
  const parsedRows: ProductPriceImportRow[] = []
  for (const zeroBasedRow of rowNumbers) {
    const row = cellData[String(zeroBasedRow)]
    if (!isRecord(row)) {
      continue
    }
    const codeValue = readCellValue(row, 0)
    const customerValue = readCellValue(row, 1)
    const retailValue = readCellValue(row, 2)
    const productCode = String(codeValue ?? '').trim()
    const hasPrice = !isBlank(customerValue) || !isBlank(retailValue)
    if (!hasPrice) {
      continue
    }
    if (!productCode) {
      throw new Error(`Row ${zeroBasedRow + 1}: Product Code is required.`)
    }
    parsedRows.push({
      product_code: productCode,
      customer_price_usd: parsePriceCell(
        customerValue,
        zeroBasedRow + 1,
        PRODUCT_PRICE_TEMPLATE_HEADERS[1],
      ),
      te_price_usd: parsePriceCell(
        retailValue,
        zeroBasedRow + 1,
        PRODUCT_PRICE_TEMPLATE_HEADERS[2],
      ),
    })
  }

  if (parsedRows.length === 0) {
    throw new Error('The workbook contains no product price rows.')
  }
  const seenCodes = new Set<string>()
  for (const row of parsedRows) {
    const normalizedCode = row.product_code.toLocaleLowerCase('en-US')
    if (seenCodes.has(normalizedCode)) {
      throw new Error(`Duplicate Product Code: ${row.product_code}`)
    }
    seenCodes.add(normalizedCode)
  }
  return parsedRows
}

/**
 * Resolves the target quarter from a product price file or workbook title.
 * Falls back to the current local quarter for ordinary workbook names.
 * @param fileName - Local workspace file name.
 * @param snapshot - Persisted workbook snapshot.
 * @returns Target calendar year and quarter.
 */
export function resolveProductPricePeriod(
  fileName: string,
  snapshot?: Record<string, unknown>,
): ProductPricePeriod {
  const workbookName = typeof snapshot?.name === 'string' ? snapshot.name : ''
  const candidates = [fileName, workbookName]
  for (const candidate of candidates) {
    const match = /product[\s_-]*prices?[\s_-]*(20\d{2})[\s_-]*q([1-4])/i.exec(candidate)
    if (match) {
      return {
        year: Number(match[1]),
        quarter: Number(match[2]) as ProductPricePeriod['quarter'],
      }
    }
  }
  return getProductPricePeriod()
}

/**
 * Imports validated quarterly price rows through the database transaction.
 * @param period - Target year and quarter.
 * @param rows - Parsed workbook rows.
 * @returns Import count and current-price refresh status.
 */
export async function importProductPriceRows(
  period: ProductPricePeriod,
  rows: ProductPriceImportRow[],
): Promise<ProductPriceImportResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }
  const rpcClient = supabase as unknown as ProductPriceRpcClient
  const { data, error } = await rpcClient.rpc('import_product_catalog_prices', {
    p_year: period.year,
    p_quarter: period.quarter,
    p_rows: rows,
  })
  if (error) {
    throw new Error(error.message)
  }
  const result = isRecord(data) ? data : {}
  return {
    imported: Number(result.imported ?? 0),
    year: Number(result.year ?? period.year),
    quarter: Number(result.quarter ?? period.quarter) as ProductPricePeriod['quarter'],
    updatedCurrentPrices: result.updatedCurrentPrices === true,
  }
}
