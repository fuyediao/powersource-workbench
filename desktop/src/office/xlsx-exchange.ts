import ExcelJS from 'exceljs'
import * as SheetJS from '@e965/xlsx'
import type {
  ICellData,
  IColumnData,
  IObjectMatrixPrimitiveType,
  IStyleData,
  IWorkbookData,
} from '@univerjs/core'
import { BooleanNumber, CellValueType, LocaleType, mergeWorksheetSnapshotWithDefault } from '@univerjs/core'
import { randomOfficeId } from '@/office/office-ids'

/** Excel column width unit → pixels (Calibri 11 default, matches Excel's own approximation). */
const EXCEL_WIDTH_TO_PX = 7

/**
 * Interns a Univer cell style into the workbook style table, reusing an existing id
 * for identical styles so the exported `styles` map stays small.
 * @param styles - Mutable workbook style table.
 * @param cache - Map from a stable JSON key to an already-interned style id.
 * @param style - Style to intern.
 * @returns Style id, or undefined when the style is empty.
 */
function internStyle(
  styles: Record<string, IStyleData>,
  cache: Map<string, string>,
  style: IStyleData,
): string | undefined {
  if (Object.keys(style).length === 0) {
    return undefined
  }
  const key = JSON.stringify(style)
  const cached = cache.get(key)
  if (cached) {
    return cached
  }
  const id = randomOfficeId('style')
  cache.set(key, id)
  styles[id] = style
  return id
}

/**
 * Reads one ExcelJS cell's font/fill/number-format into a Univer style (bold, italic,
 * fill color, and number format — v1 scope; borders and rich per-run styling are not
 * carried over).
 * @param cell - Source ExcelJS cell.
 * @returns Style fields present on the cell, or an empty object.
 */
function styleFromCell(cell: ExcelJS.Cell): IStyleData {
  const style: IStyleData = {}
  const font = cell.font
  if (font?.bold) {
    style.bl = BooleanNumber.TRUE
  }
  if (font?.italic) {
    style.it = BooleanNumber.TRUE
  }
  if (typeof font?.size === 'number') {
    style.fs = font.size
  }
  if (font?.name) {
    style.ff = font.name
  }
  const fill = cell.fill
  if (fill?.type === 'pattern' && fill.pattern === 'solid') {
    const color = fill.fgColor?.argb
    if (color && color.length === 8) {
      style.bg = { rgb: `#${color.slice(2)}` }
    }
  }
  if (cell.numFmt && cell.numFmt !== 'General') {
    style.n = { pattern: cell.numFmt }
  }
  return style
}

/**
 * Applies a Univer style back onto an ExcelJS cell (inverse of {@link styleFromCell}).
 * @param cell - Target ExcelJS cell.
 * @param style - Univer style to apply.
 * @returns Nothing.
 */
function applyStyleToCell(cell: ExcelJS.Cell, style: IStyleData): void {
  if (style.bl === BooleanNumber.TRUE || style.it === BooleanNumber.TRUE || style.fs || style.ff) {
    cell.font = {
      ...cell.font,
      bold: style.bl === BooleanNumber.TRUE,
      italic: style.it === BooleanNumber.TRUE,
      size: style.fs,
      name: style.ff ?? cell.font?.name,
    }
  }
  if (style.bg?.rgb) {
    const hex = style.bg.rgb.replace('#', '').toUpperCase()
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex}` } }
  }
  if (style.n?.pattern) {
    cell.numFmt = style.n.pattern
  }
}

/**
 * Reads an ExcelJS cell value into a Univer `ICellData` value + type pair.
 * @param cell - Source ExcelJS cell.
 * @returns Cell value fields, or an empty object for a blank cell.
 */
function valueFromCell(cell: ExcelJS.Cell): Pick<ICellData, 'v' | 't' | 'f'> {
  const raw = cell.value
  if (raw === null || raw === undefined) {
    return {}
  }
  if (typeof raw === 'object' && 'formula' in raw) {
    const result = 'result' in raw ? raw.result : undefined
    return {
      f: `=${raw.formula}`,
      v: typeof result === 'number' || typeof result === 'string' ? result : undefined,
      t: typeof result === 'number' ? CellValueType.NUMBER : CellValueType.STRING,
    }
  }
  if (typeof raw === 'object' && 'richText' in raw) {
    return { v: raw.richText.map((run) => run.text).join(''), t: CellValueType.STRING }
  }
  if (raw instanceof Date) {
    return { v: raw.toISOString(), t: CellValueType.STRING }
  }
  if (typeof raw === 'boolean') {
    return { v: raw, t: CellValueType.BOOLEAN }
  }
  if (typeof raw === 'number') {
    return { v: raw, t: CellValueType.NUMBER }
  }
  return { v: String(raw), t: CellValueType.STRING }
}

/**
 * Parses an `.xlsx` file into a Univer `IWorkbookData` snapshot.
 * V1 scope: cell values/formulas, bold/italic/fill/number-format, column widths.
 * Charts, pivot tables, and cell borders are not imported.
 * @param buffer - Raw `.xlsx` file bytes.
 * @param name - Display name for the workbook (usually the file name without extension).
 * @param locale - Active Univer locale for the new workbook.
 * @returns Univer workbook snapshot.
 */
export async function importXlsx(
  buffer: ArrayBuffer,
  name: string,
  locale: LocaleType,
): Promise<IWorkbookData> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  const styles: Record<string, IStyleData> = {}
  const styleCache = new Map<string, string>()
  const sheets: IWorkbookData['sheets'] = {}
  const sheetOrder: string[] = []

  workbook.eachSheet((sheet) => {
    const sheetId = randomOfficeId('sheet')
    sheetOrder.push(sheetId)
    const cellData: IObjectMatrixPrimitiveType<ICellData> = {}
    const columnData: IObjectMatrixPrimitiveType<Partial<IColumnData>>[number] = {}
    let maxRow = 0
    let maxCol = 0

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const rowIndex = rowNumber - 1
      maxRow = Math.max(maxRow, rowIndex)
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const colIndex = colNumber - 1
        maxCol = Math.max(maxCol, colIndex)
        const cellDatum: ICellData = { ...valueFromCell(cell) }
        const styleId = internStyle(styles, styleCache, styleFromCell(cell))
        if (styleId) {
          cellDatum.s = styleId
        }
        cellData[rowIndex] ??= {}
        cellData[rowIndex][colIndex] = cellDatum
      })
    })

    sheet.columns.forEach((column, index) => {
      if (typeof column.width === 'number') {
        columnData[index] = { w: Math.round(column.width * EXCEL_WIDTH_TO_PX) }
      }
    })

    sheets[sheetId] = mergeWorksheetSnapshotWithDefault({
      id: sheetId,
      name: sheet.name,
      rowCount: Math.max(maxRow + 1, 100),
      columnCount: Math.max(maxCol + 1, 26),
      cellData,
      columnData,
    })
  })

  return {
    id: randomOfficeId('workbook'),
    name,
    appVersion: '0.25.1',
    locale,
    styles,
    sheetOrder,
    sheets,
    resources: [],
  }
}

/**
 * Parses a legacy binary `.xls` workbook into a Univer workbook snapshot.
 * This compatibility path preserves cell values, formulas, number formats,
 * sheet names, and column widths. New `.xlsx` files continue to use ExcelJS.
 * @param buffer - Raw `.xls` file bytes.
 * @param name - Display name for the workbook.
 * @param locale - Active Univer locale for the new workbook.
 * @returns Univer workbook snapshot.
 */
export async function importXls(
  buffer: ArrayBuffer,
  name: string,
  locale: LocaleType,
): Promise<IWorkbookData> {
  const workbook = SheetJS.read(buffer, {
    type: 'array',
    cellDates: true,
    cellFormula: true,
    cellNF: true,
    cellStyles: true,
  })
  const sheets: IWorkbookData['sheets'] = {}
  const sheetOrder: string[] = []

  for (const sheetName of workbook.SheetNames) {
    const source = workbook.Sheets[sheetName]
    if (!source) {
      continue
    }
    const sheetId = randomOfficeId('sheet')
    const range = source['!ref']
      ? SheetJS.utils.decode_range(source['!ref'])
      : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } }
    const cellData: IObjectMatrixPrimitiveType<ICellData> = {}
    const columnData: IObjectMatrixPrimitiveType<Partial<IColumnData>>[number] = {}

    for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
      for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
        const sourceCell = source[SheetJS.utils.encode_cell({ r: rowIndex, c: columnIndex })]
        if (!sourceCell) {
          continue
        }
        const targetCell: ICellData = {}
        if (sourceCell.f) {
          targetCell.f = `=${sourceCell.f}`
        }
        if (sourceCell.t === 'n' && typeof sourceCell.v === 'number') {
          targetCell.v = sourceCell.v
          targetCell.t = CellValueType.NUMBER
        } else if (sourceCell.t === 'b' && typeof sourceCell.v === 'boolean') {
          targetCell.v = sourceCell.v ? 1 : 0
          targetCell.t = CellValueType.BOOLEAN
        } else if (sourceCell.v instanceof Date) {
          targetCell.v = sourceCell.v.toISOString()
          targetCell.t = CellValueType.STRING
        } else if (sourceCell.v !== undefined && sourceCell.v !== null) {
          targetCell.v = String(sourceCell.v)
          targetCell.t = CellValueType.STRING
        }
        if (typeof sourceCell.z === 'string' && sourceCell.z !== 'General') {
          targetCell.s = { n: { pattern: sourceCell.z } }
        }
        cellData[rowIndex] ??= {}
        cellData[rowIndex][columnIndex] = targetCell
      }
    }

    for (const [index, column] of (source['!cols'] ?? []).entries()) {
      if (typeof column?.wpx === 'number') {
        columnData[index] = { w: Math.round(column.wpx) }
      } else if (typeof column?.wch === 'number') {
        columnData[index] = { w: Math.round(column.wch * EXCEL_WIDTH_TO_PX) }
      }
    }

    sheetOrder.push(sheetId)
    sheets[sheetId] = mergeWorksheetSnapshotWithDefault({
      id: sheetId,
      name: sheetName,
      rowCount: Math.max(range.e.r + 1, 100),
      columnCount: Math.max(range.e.c + 1, 26),
      cellData,
      columnData,
    })
  }

  return {
    id: randomOfficeId('workbook'),
    name,
    appVersion: '0.25.1',
    locale,
    styles: {},
    sheetOrder,
    sheets,
    resources: [],
  }
}

/**
 * Serializes a Univer `IWorkbookData` snapshot into `.xlsx` bytes (inverse of
 * {@link importXlsx}, same v1 scope).
 * @param workbookData - Univer workbook snapshot.
 * @returns `.xlsx` file blob.
 */
export async function exportXlsx(workbookData: IWorkbookData): Promise<Blob> {
  const workbook = new ExcelJS.Workbook()
  const styles = workbookData.styles

  for (const sheetId of workbookData.sheetOrder) {
    const sheetData = workbookData.sheets[sheetId]
    if (!sheetData) {
      continue
    }
    const sheet = workbook.addWorksheet(sheetData.name ?? 'Sheet1')
    const cellData = sheetData.cellData ?? {}
    for (const rowKey of Object.keys(cellData)) {
      const row = cellData[Number(rowKey)]
      if (!row) {
        continue
      }
      for (const colKey of Object.keys(row)) {
        const cellDatum = row[Number(colKey)]
        if (!cellDatum) {
          continue
        }
        const cell = sheet.getCell(Number(rowKey) + 1, Number(colKey) + 1)
        if (cellDatum.f) {
          cell.value = { formula: cellDatum.f.replace(/^=/, ''), result: cellDatum.v ?? undefined }
        } else if (cellDatum.v !== undefined && cellDatum.v !== null) {
          cell.value = cellDatum.v
        }
        const styleRef = cellDatum.s
        const style = typeof styleRef === 'string' ? styles[styleRef] : styleRef
        if (style) {
          applyStyleToCell(cell, style)
        }
      }
    }
    const columnData = sheetData.columnData ?? {}
    for (const colKey of Object.keys(columnData)) {
      const column = columnData[Number(colKey)]
      if (column?.w) {
        sheet.getColumn(Number(colKey) + 1).width = column.w / EXCEL_WIDTH_TO_PX
      }
    }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
