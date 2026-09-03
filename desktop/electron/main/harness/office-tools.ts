/**
 * Local OOXML tools for Harness.
 *
 * These tools are implemented in-process and never install or modify an
 * external Office CLI. Source files are read in place; writes always target
 * an explicit path or the workspace `office-output` directory.
 */

import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from 'docx'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import PptxGenJS from 'pptxgenjs'

/** Supported OOXML extensions. */
const OOXML_EXTENSIONS = new Set(['.docx', '.xlsx', '.pptx'])

/** Maximum source size accepted by a local Office tool. */
const MAX_OFFICE_BYTES = 50 * 1024 * 1024

/** Maximum structural records returned to model context. */
const MAX_INSPECTION_ITEMS = 500

/** Local Office dynamic-tool names. */
export const LOCAL_OFFICE_TOOL_NAMES = [
  'inspect_local_office_file',
  'edit_local_office_file',
  'create_local_office_file',
] as const

/** One local Office dynamic-tool name. */
export type LocalOfficeToolName = (typeof LOCAL_OFFICE_TOOL_NAMES)[number]

/** Result returned to the Codex dynamic-tool bridge. */
export interface LocalOfficeToolResult {
  text: string
  isError: boolean
}

/** One generic Office edit operation. */
interface OfficeEditOperation {
  type: string
  search?: string
  replacement?: string
  all?: boolean
  text?: string
  style?: string
  sheet?: string
  cell?: string
  value?: unknown
  formula?: string
  name?: string
  newName?: string
}

/** Returns whether a name is handled by the local Office bridge. */
export function isLocalOfficeToolName(name: string): name is LocalOfficeToolName {
  return (LOCAL_OFFICE_TOOL_NAMES as readonly string[]).includes(name)
}

/** Converts an unknown value to a non-empty trimmed string. */
function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required.`)
  }
  return value.trim()
}

/** Resolves a source path relative to the Harness work folder. */
function resolveSourcePath(workFolder: string, value: unknown): string {
  const source = requiredString(value, 'path')
  return path.resolve(path.isAbsolute(source) ? source : path.join(workFolder, source))
}

/** Resolves a safe output path inside the Harness work folder. */
function resolveOutputPath(
  workFolder: string,
  value: unknown,
  defaultName: string,
  extension: string,
): string {
  const root = path.resolve(workFolder)
  const requested = typeof value === 'string' && value.trim()
    ? value.trim()
    : path.join('office-output', defaultName)
  const withExtension = path.extname(requested) ? requested : `${requested}${extension}`
  const resolved = path.resolve(path.isAbsolute(withExtension) ? withExtension : path.join(root, withExtension))
  const relative = path.relative(root, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('outputPath must stay inside the Harness work folder.')
  }
  if (path.extname(resolved).toLowerCase() !== extension) {
    throw new Error(`outputPath must use the ${extension} extension.`)
  }
  return resolved
}

/** Reads and size-checks one OOXML source file. */
async function readOfficeSource(filePath: string): Promise<Buffer> {
  if (!existsSync(filePath)) {
    throw new Error('Office file was not found.')
  }
  const stat = await fs.stat(filePath)
  if (!stat.isFile()) {
    throw new Error('Office path must point to a file.')
  }
  if (stat.size > MAX_OFFICE_BYTES) {
    throw new Error('Office file exceeds the 50 MiB limit.')
  }
  const extension = path.extname(filePath).toLowerCase()
  if (!OOXML_EXTENSIONS.has(extension)) {
    throw new Error('Only .docx, .xlsx, and .pptx OOXML files are supported.')
  }
  return fs.readFile(filePath)
}

/** Decodes the XML entities used in OOXML text nodes. */
function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Escapes text for an OOXML text node. */
function encodeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Extracts all visible text from one OOXML fragment. */
function extractXmlText(fragment: string, tagPattern: string): string[] {
  const pattern = new RegExp(`<${tagPattern}[^>]*>([\\s\\S]*?)<\\/${tagPattern}>`, 'g')
  return Array.from(fragment.matchAll(pattern), (match) => decodeXmlText(match[1] ?? ''))
}

/** Inspects a Word OOXML package. */
async function inspectDocx(bytes: Buffer): Promise<Record<string, unknown>> {
  const zip = await JSZip.loadAsync(bytes)
  const documentFile = zip.file('word/document.xml')
  if (!documentFile) {
    throw new Error('The Word package has no document.xml part.')
  }
  const xml = await documentFile.async('text')
  const paragraphPattern = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g
  const paragraphs = Array.from(xml.matchAll(paragraphPattern), (match, index) => {
    const body = match[1] ?? ''
    const style = body.match(/<w:pStyle[^>]*w:val="([^"]+)"/)?.[1] ?? null
    return { index, style, text: extractXmlText(body, 'w:t').join('') }
  }).filter((entry) => entry.text || entry.style)
  return {
    kind: 'docx',
    paragraphCount: paragraphs.length,
    paragraphs: paragraphs.slice(0, MAX_INSPECTION_ITEMS),
    truncated: paragraphs.length > MAX_INSPECTION_ITEMS,
  }
}

/** Converts one ExcelJS cell value to a JSON-safe structural value. */
function inspectCellValue(cell: ExcelJS.Cell): Record<string, unknown> {
  const raw = cell.value
  if (raw && typeof raw === 'object' && 'formula' in raw) {
    return {
      formula: String(raw.formula),
      result: 'result' in raw ? raw.result ?? null : null,
    }
  }
  if (raw instanceof Date) {
    return { value: raw.toISOString() }
  }
  if (raw && typeof raw === 'object' && 'richText' in raw) {
    return { value: raw.richText.map((run) => run.text).join('') }
  }
  return { value: raw ?? null }
}

/** Inspects an Excel OOXML package. */
async function inspectXlsx(bytes: Buffer, requestedSheet: unknown): Promise<Record<string, unknown>> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes)
  const sheetName = typeof requestedSheet === 'string' ? requestedSheet.trim() : ''
  const selected = sheetName ? workbook.getWorksheet(sheetName) : undefined
  if (sheetName && !selected) {
    throw new Error(`Worksheet not found: ${sheetName}`)
  }
  let itemCount = 0
  const sheets = workbook.worksheets.map((sheet) => {
    const cells: Record<string, unknown>[] = []
    if (!selected || selected.id === sheet.id) {
      sheet.eachRow({ includeEmpty: false }, (row) => {
        row.eachCell({ includeEmpty: false }, (cell) => {
          if (itemCount >= MAX_INSPECTION_ITEMS) return
          cells.push({ address: cell.address, ...inspectCellValue(cell) })
          itemCount += 1
        })
      })
    }
    return {
      name: sheet.name,
      rowCount: sheet.actualRowCount,
      columnCount: sheet.actualColumnCount,
      ...(cells.length ? { cells } : {}),
    }
  })
  return {
    kind: 'xlsx',
    sheets,
    truncated: itemCount >= MAX_INSPECTION_ITEMS,
  }
}

/** Inspects a PowerPoint OOXML package. */
async function inspectPptx(bytes: Buffer): Promise<Record<string, unknown>> {
  const zip = await JSZip.loadAsync(bytes)
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]))
  const slides = await Promise.all(slideNames.slice(0, MAX_INSPECTION_ITEMS).map(async (name, index) => {
    const xml = await zip.file(name)!.async('text')
    return { index: index + 1, text: extractXmlText(xml, 'a:t').join('\n') }
  }))
  return {
    kind: 'pptx',
    slideCount: slideNames.length,
    slides,
    truncated: slideNames.length > MAX_INSPECTION_ITEMS,
  }
}

/** Replaces visible OOXML text across adjacent matching text nodes. */
function replaceAcrossTextNodes(
  xml: string,
  tag: string,
  search: string,
  replacement: string,
  replaceAll: boolean,
): { xml: string; count: number } {
  if (!search) {
    throw new Error('replaceText requires a non-empty search value.')
  }
  const pattern = new RegExp(`<${tag}([^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'g')
  const nodes = Array.from(xml.matchAll(pattern)).map((match) => ({
    start: match.index,
    end: (match.index ?? 0) + match[0].length,
    attrs: match[1] ?? '',
    text: decodeXmlText(match[2] ?? ''),
  }))
  const visible = nodes.map((node) => node.text).join('')
  const ranges: Array<{ start: number; end: number }> = []
  let cursor = 0
  while (cursor <= visible.length - search.length) {
    const found = visible.indexOf(search, cursor)
    if (found < 0) break
    ranges.push({ start: found, end: found + search.length })
    if (!replaceAll) break
    cursor = found + Math.max(search.length, 1)
  }
  if (ranges.length === 0) {
    return { xml, count: 0 }
  }
  const textOffsets: number[] = []
  let textCursor = 0
  for (const node of nodes) {
    textOffsets.push(textCursor)
    textCursor += node.text.length
  }
  const updated = nodes.map((node) => node.text)
  for (const range of ranges.reverse()) {
    const startNode = textOffsets.findLastIndex((offset) => offset <= range.start)
    const endNode = textOffsets.findLastIndex((offset) => offset < range.end)
    if (startNode < 0 || endNode < 0) continue
    const startOffset = range.start - textOffsets[startNode]
    const endOffset = range.end - textOffsets[endNode]
    const prefix = updated[startNode].slice(0, startOffset)
    const suffix = updated[endNode].slice(endOffset)
    updated[startNode] = prefix + replacement + (startNode === endNode ? suffix : '')
    for (let index = startNode + 1; index < endNode; index += 1) updated[index] = ''
    if (startNode !== endNode) updated[endNode] = suffix
  }
  let output = xml
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index]
    const next = `<${tag}${node.attrs}>${encodeXmlText(updated[index])}</${tag}>`
    output = output.slice(0, node.start) + next + output.slice(node.end)
  }
  return { xml: output, count: ranges.length }
}

/** Applies supported Word edits and writes a new OOXML package. */
async function editDocx(bytes: Buffer, operations: OfficeEditOperation[]): Promise<Buffer> {
  const zip = await JSZip.loadAsync(bytes)
  const documentFile = zip.file('word/document.xml')
  if (!documentFile) throw new Error('The Word package has no document.xml part.')
  let xml = await documentFile.async('text')
  for (const operation of operations) {
    if (operation.type === 'replaceText') {
      xml = replaceAcrossTextNodes(
        xml,
        'w:t',
        requiredString(operation.search, 'search'),
        typeof operation.replacement === 'string' ? operation.replacement : '',
        operation.all !== false,
      ).xml
      continue
    }
    if (operation.type === 'appendParagraph') {
      const text = requiredString(operation.text, 'text')
      const style = typeof operation.style === 'string' && operation.style.trim()
        ? `<w:pPr><w:pStyle w:val="${encodeXmlText(operation.style.trim())}"/></w:pPr>`
        : ''
      const paragraph = `<w:p>${style}<w:r><w:t xml:space="preserve">${encodeXmlText(text)}</w:t></w:r></w:p>`
      xml = xml.replace('</w:body>', `${paragraph}</w:body>`)
      continue
    }
    throw new Error(`Unsupported Word operation: ${operation.type}`)
  }
  zip.file('word/document.xml', xml)
  return zip.generateAsync({ type: 'nodebuffer' })
}

/** Resolves a worksheet by name or creates the requested default sheet. */
function requireWorksheet(workbook: ExcelJS.Workbook, name: unknown): ExcelJS.Worksheet {
  const sheetName = typeof name === 'string' && name.trim() ? name.trim() : workbook.worksheets[0]?.name
  if (!sheetName) return workbook.addWorksheet('Sheet1')
  const sheet = workbook.getWorksheet(sheetName)
  if (!sheet) throw new Error(`Worksheet not found: ${sheetName}`)
  return sheet
}

/** Applies supported Excel edits and writes a new OOXML package. */
async function editXlsx(bytes: Buffer, operations: OfficeEditOperation[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes)
  for (const operation of operations) {
    if (operation.type === 'addSheet') {
      workbook.addWorksheet(requiredString(operation.name, 'name'))
      continue
    }
    if (operation.type === 'renameSheet') {
      requireWorksheet(workbook, operation.sheet).name = requiredString(operation.newName, 'newName')
      continue
    }
    const sheet = requireWorksheet(workbook, operation.sheet)
    const address = requiredString(operation.cell, 'cell')
    const cell = sheet.getCell(address)
    if (operation.type === 'clearCell') {
      cell.value = null
    } else if (operation.type === 'setFormula') {
      cell.value = { formula: requiredString(operation.formula, 'formula') }
    } else if (operation.type === 'setCell') {
      if (typeof operation.formula === 'string' && operation.formula.trim()) {
        cell.value = { formula: operation.formula.trim() }
      } else if (
        operation.value === null
        || typeof operation.value === 'string'
        || typeof operation.value === 'number'
        || typeof operation.value === 'boolean'
      ) {
        cell.value = operation.value
      } else {
        throw new Error('setCell value must be a string, number, boolean, or null.')
      }
    } else {
      throw new Error(`Unsupported Excel operation: ${operation.type}`)
    }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

/** Applies supported PowerPoint edits and writes a new OOXML package. */
async function editPptx(bytes: Buffer, operations: OfficeEditOperation[]): Promise<Buffer> {
  const zip = await JSZip.loadAsync(bytes)
  const slideNames = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
  for (const operation of operations) {
    if (operation.type !== 'replaceText') {
      throw new Error(`Unsupported PowerPoint operation: ${operation.type}`)
    }
    const search = requiredString(operation.search, 'search')
    const replacement = typeof operation.replacement === 'string' ? operation.replacement : ''
    let remaining = operation.all === false ? 1 : Number.POSITIVE_INFINITY
    for (const slideName of slideNames) {
      if (remaining <= 0) break
      const file = zip.file(slideName)!
      const xml = await file.async('text')
      const result = replaceAcrossTextNodes(xml, 'a:t', search, replacement, remaining !== 1)
      if (result.count > 0) {
        zip.file(slideName, result.xml)
        remaining -= result.count
      }
    }
  }
  return zip.generateAsync({ type: 'nodebuffer' })
}

/** Converts a heading token into the docx package heading enum. */
function docxHeading(value: unknown): (typeof HeadingLevel)[keyof typeof HeadingLevel] | undefined {
  const key = typeof value === 'string' ? value.toUpperCase().replace(/\s+/g, '_') : ''
  return key && key in HeadingLevel
    ? HeadingLevel[key as keyof typeof HeadingLevel]
    : undefined
}

/** Creates a Word OOXML file from structured content. */
async function createDocx(content: Record<string, unknown>): Promise<Buffer> {
  const children: Array<Paragraph | Table> = []
  const paragraphs = Array.isArray(content.paragraphs) ? content.paragraphs : []
  for (const value of paragraphs) {
    const row = value && typeof value === 'object' ? value as Record<string, unknown> : { text: value }
    children.push(new Paragraph({
      heading: docxHeading(row.heading),
      children: [new TextRun({
        text: typeof row.text === 'string' ? row.text : String(row.text ?? ''),
        bold: row.bold === true,
        italics: row.italic === true,
      })],
    }))
  }
  const tables = Array.isArray(content.tables) ? content.tables : []
  for (const value of tables) {
    const table = value && typeof value === 'object' ? value as Record<string, unknown> : {}
    const rows = Array.isArray(table.rows) ? table.rows : []
    children.push(new Table({
      rows: rows.map((cells) => new TableRow({
        children: (Array.isArray(cells) ? cells : []).map((cell) => new TableCell({
          children: [new Paragraph(String(cell ?? ''))],
        })),
      })),
    }))
  }
  if (children.length === 0) children.push(new Paragraph(''))
  return Packer.toBuffer(new Document({ sections: [{ children }] }))
}

/** Creates an Excel OOXML file from structured content. */
async function createXlsx(content: Record<string, unknown>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheets = Array.isArray(content.sheets) ? content.sheets : []
  for (const value of sheets) {
    const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
    const sheet = workbook.addWorksheet(typeof source.name === 'string' && source.name.trim() ? source.name.trim() : 'Sheet')
    const rows = Array.isArray(source.rows) ? source.rows : []
    rows.forEach((row) => sheet.addRow(Array.isArray(row) ? row : []))
    const formulas = source.formulas && typeof source.formulas === 'object' && !Array.isArray(source.formulas)
      ? source.formulas as Record<string, unknown>
      : {}
    for (const [address, formula] of Object.entries(formulas)) {
      if (typeof formula === 'string' && formula.trim()) sheet.getCell(address).value = { formula: formula.trim() }
    }
    if (source.header === true && sheet.rowCount > 0) {
      const header = sheet.getRow(1)
      header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } }
    }
    sheet.columns.forEach((column) => {
      let width = 10
      column.eachCell?.({ includeEmpty: false }, (cell) => { width = Math.max(width, String(cell.value ?? '').length + 2) })
      column.width = Math.min(width, 50)
    })
  }
  if (workbook.worksheets.length === 0) workbook.addWorksheet('Sheet1')
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

/** Creates a PowerPoint OOXML file from structured content. */
async function createPptx(content: Record<string, unknown>): Promise<Buffer> {
  const presentation = new PptxGenJS()
  presentation.layout = 'LAYOUT_WIDE'
  presentation.author = 'PowerSource Workbench Harness'
  presentation.subject = typeof content.subject === 'string' ? content.subject : ''
  presentation.title = typeof content.title === 'string' ? content.title : ''
  presentation.company = 'PowerSource Workbench'
  presentation.lang = 'en-US'
  presentation.theme = {
    headFontFace: 'Aptos Display',
    bodyFontFace: 'Aptos',
    lang: 'en-US',
  }
  const slides = Array.isArray(content.slides) ? content.slides : []
  for (const value of slides) {
    const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
    const slide = presentation.addSlide()
    slide.background = { color: typeof source.background === 'string' ? source.background.replace('#', '') : 'F7F9FC' }
    const title = typeof source.title === 'string' ? source.title : ''
    const body = typeof source.body === 'string' ? source.body : ''
    slide.addText(title, { x: 0.65, y: 0.45, w: 11.9, h: 0.65, fontSize: 28, bold: true, color: '172033', margin: 0 })
    slide.addShape(presentation.ShapeType.line, { x: 0.65, y: 1.22, w: 1.4, h: 0, line: { color: '2F6FED', width: 3 } })
    slide.addText(body, { x: 0.75, y: 1.55, w: 11.7, h: 5.25, fontSize: 18, color: '334155', breakLine: false, valign: 'top', margin: 0.08 })
  }
  if (slides.length === 0) presentation.addSlide()
  const output = await presentation.write({ outputType: 'nodebuffer' })
  return Buffer.from(output as Uint8Array)
}

/** Executes one local Office dynamic tool. */
export async function runLocalOfficeTool(
  tool: LocalOfficeToolName,
  args: Record<string, unknown>,
  workFolder: string,
): Promise<LocalOfficeToolResult> {
  try {
    if (tool === 'inspect_local_office_file') {
      const filePath = resolveSourcePath(workFolder, args.path)
      const bytes = await readOfficeSource(filePath)
      const extension = path.extname(filePath).toLowerCase()
      const result = extension === '.docx'
        ? await inspectDocx(bytes)
        : extension === '.xlsx'
          ? await inspectXlsx(bytes, args.sheet)
          : await inspectPptx(bytes)
      return { text: JSON.stringify({ path: filePath, ...result }), isError: false }
    }

    if (tool === 'edit_local_office_file') {
      const filePath = resolveSourcePath(workFolder, args.path)
      const bytes = await readOfficeSource(filePath)
      const extension = path.extname(filePath).toLowerCase()
      const operations = Array.isArray(args.operations)
        ? args.operations.filter((value): value is OfficeEditOperation => Boolean(value) && typeof value === 'object')
        : []
      if (operations.length === 0) throw new Error('operations must contain at least one edit.')
      const baseName = `${path.basename(filePath, extension)}-edited${extension}`
      const outputPath = resolveOutputPath(workFolder, args.outputPath, baseName, extension)
      const output = extension === '.docx'
        ? await editDocx(bytes, operations)
        : extension === '.xlsx'
          ? await editXlsx(bytes, operations)
          : await editPptx(bytes, operations)
      await fs.mkdir(path.dirname(outputPath), { recursive: true })
      await fs.writeFile(outputPath, output)
      return { text: JSON.stringify({ path: outputPath, kind: extension.slice(1), operations: operations.length }), isError: false }
    }

    const kind = requiredString(args.kind, 'kind').toLowerCase()
    const extension = `.${kind}`
    if (!OOXML_EXTENSIONS.has(extension)) throw new Error('kind must be docx, xlsx, or pptx.')
    const name = typeof args.name === 'string' && args.name.trim() ? args.name.trim() : `untitled${extension}`
    const outputPath = resolveOutputPath(workFolder, args.outputPath, name, extension)
    const content = args.content && typeof args.content === 'object' && !Array.isArray(args.content)
      ? args.content as Record<string, unknown>
      : {}
    const output = kind === 'docx'
      ? await createDocx(content)
      : kind === 'xlsx'
        ? await createXlsx(content)
        : await createPptx(content)
    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, output)
    return { text: JSON.stringify({ path: outputPath, kind, created: true }), isError: false }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { text: JSON.stringify({ error: message }), isError: true }
  }
}
