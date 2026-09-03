/**
 * Blank OOXML bytes for the OnlyOffice "New" action. Builds real
 * `.docx` / `.xlsx` / `.pptx` packages with the same libraries used by the
 * Office exchange exporters — no Univer snapshot round-trip (the in-tree
 * `DEFAULT_SLIDE` is only an empty shell and cannot serialize to a
 * presentation).
 */

import { Document, Packer, Paragraph } from 'docx'
import ExcelJS from 'exceljs'
import PptxGenJS from 'pptxgenjs'
import type { OfficeFeatureId } from '@/constants/office-folder'

/** Widescreen 16:9 layout used by the slides exporter (inches). */
const SLIDE_WIDTH_IN = 10
const SLIDE_HEIGHT_IN = 5.625

/**
 * Builds a minimal blank Word document.
 * @returns OOXML `.docx` bytes.
 */
async function createBlankDocxBytes(): Promise<Uint8Array> {
  const document = new Document({
    sections: [{ children: [new Paragraph({ children: [] })] }],
  })
  // Prefer Blob (browser/Electron renderer); Packer.toBuffer needs Node Buffer.
  const blob = await Packer.toBlob(document)
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * Builds a minimal blank workbook with one empty "Sheet1".
 * @returns OOXML `.xlsx` bytes.
 */
async function createBlankXlsxBytes(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook()
  workbook.addWorksheet('Sheet1')
  const buffer = await workbook.xlsx.writeBuffer()
  return new Uint8Array(buffer)
}

/**
 * Builds a minimal blank presentation with one empty widescreen slide.
 * @returns OOXML `.pptx` bytes.
 */
async function createBlankPptxBytes(): Promise<Uint8Array> {
  const pptx = new PptxGenJS()
  pptx.defineLayout({
    name: 'WORKBENCH_16x9',
    width: SLIDE_WIDTH_IN,
    height: SLIDE_HEIGHT_IN,
  })
  pptx.layout = 'WORKBENCH_16x9'
  pptx.addSlide()
  const output = await pptx.write({ outputType: 'arraybuffer' })
  return new Uint8Array(output as ArrayBuffer)
}

/**
 * Returns blank OOXML bytes for one Office editor kind (Docs / Sheets / Slides).
 * @param kind - Docs, Sheets, or Slides.
 * @returns Native OOXML file bytes ready for `createOfficeFile`.
 */
export async function createBlankOfficeBytes(kind: OfficeFeatureId): Promise<Uint8Array> {
  if (kind === 'docs') {
    return createBlankDocxBytes()
  }
  if (kind === 'sheets') {
    return createBlankXlsxBytes()
  }
  return createBlankPptxBytes()
}
