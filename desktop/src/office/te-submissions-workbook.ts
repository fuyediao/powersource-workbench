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

const HEADER_STYLE_ID = 'te-submissions-header'
const DEFAULT_COLUMN_WIDTH = 140
const MAX_COLUMN_WIDTH = 240

/**
 * Builds the native file name used by the spreadsheet Save action.
 * @param date - Date stamped into the file name.
 * @returns English `.xlsx` file name.
 */
export function teSubmissionsWorkbookFileName(date = new Date()): string {
  return `te-submissions-${date.toISOString().slice(0, 10)}.xlsx`
}

/**
 * Picks a column width from the header label.
 * @param header - Column title.
 * @returns Width in pixels.
 */
function columnWidthForHeader(header: string): number {
  return Math.min(MAX_COLUMN_WIDTH, Math.max(DEFAULT_COLUMN_WIDTH, header.length * 8 + 24))
}

/**
 * Creates a Univer workbook from T&E application rows (operator names, no raw handler UUID).
 * @param headers - Column titles.
 * @param rows - Cell values aligned with `headers`.
 * @param locale - Active Univer locale.
 * @returns Univer workbook snapshot for the built-in spreadsheet editor.
 */
export function createTeSubmissionsWorkbook(
  headers: readonly string[],
  rows: string[][],
  locale: LocaleType,
): IWorkbookData {
  const sheetId = randomOfficeId('sheet')
  const headerRow: Record<number, ICellData> = {}
  const columnData: Record<number, { w: number }> = {}
  headers.forEach((header, col) => {
    headerRow[col] = { v: header, t: CellValueType.STRING, s: HEADER_STYLE_ID }
    columnData[col] = { w: columnWidthForHeader(header) }
  })

  const cellData: IObjectMatrixPrimitiveType<ICellData> = { 0: headerRow }
  rows.forEach((values, index) => {
    const row: Record<number, ICellData> = {}
    values.forEach((value, col) => {
      row[col] = { v: value, t: CellValueType.STRING }
    })
    cellData[index + 1] = row
  })

  const name = `T&E Applications ${new Date().toISOString().slice(0, 10)}`
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
    },
    sheetOrder: [sheetId],
    sheets: {
      [sheetId]: mergeWorksheetSnapshotWithDefault({
        id: sheetId,
        name: 'Applications',
        rowCount: Math.max(rows.length + 1, 100),
        columnCount: Math.max(headers.length, 26),
        freeze: {
          xSplit: 0,
          ySplit: 1,
          startRow: 1,
          startColumn: -1,
        },
        cellData,
        rowData: { 0: { h: 30 } },
        columnData,
      }),
    },
    resources: [],
  }
}
