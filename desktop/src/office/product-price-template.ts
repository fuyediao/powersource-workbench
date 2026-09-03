import type { ICellData, IObjectMatrixPrimitiveType, IWorkbookData, LocaleType } from '@univerjs/core'
import {
  BooleanNumber,
  CellValueType,
  HorizontalAlign,
  mergeWorksheetSnapshotWithDefault,
  VerticalAlign,
  WrapStrategy,
} from '@univerjs/core'
import { randomOfficeId } from '@/office/office-ids'

export const PRODUCT_PRICE_TEMPLATE_HEADERS = [
  'Product Code',
  'Customer Purchase Price (USD)',
  'T&E Retail Price (USD)',
] as const

const HEADER_STYLE_ID = 'product-price-header'
const PRICE_STYLE_ID = 'product-price-usd'

/** Year and quarter represented by a price workbook. */
export interface ProductPricePeriod {
  year: number
  quarter: 1 | 2 | 3 | 4
}

/**
 * Resolves the calendar price period for a date.
 * @param date - Date used to determine the year and quarter.
 * @returns Calendar year and quarter.
 */
export function getProductPricePeriod(date = new Date()): ProductPricePeriod {
  return {
    year: date.getFullYear(),
    quarter: (Math.floor(date.getMonth() / 3) + 1) as ProductPricePeriod['quarter'],
  }
}

/**
 * Builds the native file name used by the spreadsheet Save action.
 * @param period - Workbook year and quarter.
 * @returns English `.xlsx` file name.
 */
export function productPriceTemplateFileName(period: ProductPricePeriod): string {
  return `product-prices-${period.year}-q${period.quarter}.xlsx`
}

/**
 * Normalizes, deduplicates, and naturally sorts product codes.
 * @param productCodes - Product codes from active and inactive catalog rows.
 * @returns Sorted unique product codes.
 */
function normalizeProductCodes(productCodes: string[]): string[] {
  return [...new Set(productCodes.map((code) => code.trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right, 'en-US', { numeric: true }),
  )
}

/**
 * Creates an editable Univer workbook for quarterly product price entry.
 * @param productCodes - Product codes from active and inactive catalog rows.
 * @param locale - Active Univer locale.
 * @param period - Workbook year and quarter.
 * @returns Univer workbook snapshot ready for the built-in spreadsheet editor.
 */
export function createProductPriceTemplateWorkbook(
  productCodes: string[],
  locale: LocaleType,
  period: ProductPricePeriod = getProductPricePeriod(),
): IWorkbookData {
  const codes = normalizeProductCodes(productCodes)
  if (codes.length === 0) {
    throw new Error('No product codes are available for the price template.')
  }

  const sheetId = randomOfficeId('sheet')
  const cellData: IObjectMatrixPrimitiveType<ICellData> = {
    0: {
      0: { v: PRODUCT_PRICE_TEMPLATE_HEADERS[0], t: CellValueType.STRING, s: HEADER_STYLE_ID },
      1: { v: PRODUCT_PRICE_TEMPLATE_HEADERS[1], t: CellValueType.STRING, s: HEADER_STYLE_ID },
      2: { v: PRODUCT_PRICE_TEMPLATE_HEADERS[2], t: CellValueType.STRING, s: HEADER_STYLE_ID },
    },
  }

  codes.forEach((code, index) => {
    cellData[index + 1] = {
      0: { v: code, t: CellValueType.STRING },
      1: { t: CellValueType.NUMBER, s: PRICE_STYLE_ID },
      2: { t: CellValueType.NUMBER, s: PRICE_STYLE_ID },
    }
  })

  const name = `Product Prices ${period.year} Q${period.quarter}`
  return {
    id: randomOfficeId('workbook'),
    name,
    appVersion: '0.25.1',
    locale,
    styles: {
      [HEADER_STYLE_ID]: {
        bl: BooleanNumber.TRUE,
        bg: { rgb: '#0F766E' },
        cl: { rgb: '#FFFFFF' },
        ht: HorizontalAlign.CENTER,
        vt: VerticalAlign.MIDDLE,
        tb: WrapStrategy.WRAP,
      },
      [PRICE_STYLE_ID]: {
        n: { pattern: '[$$-409]#,##0.00' },
      },
    },
    sheetOrder: [sheetId],
    sheets: {
      [sheetId]: mergeWorksheetSnapshotWithDefault({
        id: sheetId,
        name: 'Product Prices',
        rowCount: Math.max(codes.length + 1, 100),
      columnCount: 26,
        freeze: {
          xSplit: 0,
          ySplit: 1,
          startRow: 1,
          startColumn: -1,
        },
        cellData,
        rowData: { 0: { h: 30 } },
        columnData: {
          0: { w: 180 },
          1: { w: 250 },
          2: { w: 220 },
        },
      }),
    },
    resources: [],
  }
}
