import type { IDocumentData, IWorkbookData, LocaleType } from '@univerjs/core'
import type { ISlideData } from '@univerjs/slides'
import type { OfficeFeatureId } from '@/constants/office-folder'
import { exportDocx, importDoc, importDocx } from '@/office/docx-exchange'
import { stripExtension } from '@/office/office-file-io'
import { exportPptx, importPpt, importPptx } from '@/office/pptx-exchange'
import { exportXlsx, importXls, importXlsx } from '@/office/xlsx-exchange'

/** File extension (without dot) GeoCRM reads/writes for each Univer office kind. */
const OFFICE_EXTENSION: Record<OfficeFeatureId, string> = {
  docs: 'docx',
  sheets: 'xlsx',
  slides: 'pptx',
}

const OFFICE_INPUT_EXTENSIONS = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']

/**
 * Default download file name for a Univer office kind.
 * @param kind - Docs / Sheets / Slides.
 * @returns File name including extension.
 */
export function defaultOfficeFileName(kind: OfficeFeatureId): string {
  return `untitled.${OFFICE_EXTENSION[kind]}`
}

/**
 * Ensures a save target name carries the correct native extension for its kind.
 * @param title - Current in-editor file title.
 * @param kind - Docs / Sheets / Slides.
 * @returns File name with the right extension.
 */
export function officeSaveFileName(title: string, kind: OfficeFeatureId): string {
  const extension = OFFICE_EXTENSION[kind]
  const base = stripExtension(title, OFFICE_INPUT_EXTENSIONS)
  return `${base}.${extension}`
}

/**
 * Parses supplied Office bytes into the matching built-in editor snapshot.
 * @param kind - Docs, Sheets, or Slides.
 * @param fileName - Source file name including extension.
 * @param buffer - Source file bytes.
 * @param locale - Active Univer locale.
 * @returns File name and parsed Univer snapshot.
 */
export async function parseOfficeFile(
  kind: OfficeFeatureId,
  fileName: string,
  buffer: ArrayBuffer,
  locale: LocaleType,
): Promise<{ name: string; snapshot: Record<string, unknown> }> {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  const name = stripExtension(fileName, OFFICE_INPUT_EXTENSIONS)
  if (kind === 'docs') {
    const snapshot = extension === 'doc'
      ? await importDoc(buffer, name, locale)
      : await importDocx(buffer, name, locale)
    return { name: fileName, snapshot: snapshot as unknown as Record<string, unknown> }
  }
  if (kind === 'sheets') {
    const snapshot = extension === 'xls'
      ? await importXls(buffer, name, locale)
      : await importXlsx(buffer, name, locale)
    return { name: fileName, snapshot: snapshot as unknown as Record<string, unknown> }
  }
  const snapshot = extension === 'ppt'
    ? await importPpt(buffer, name, locale)
    : await importPptx(buffer, name, locale)
  return { name: fileName, snapshot: snapshot as unknown as Record<string, unknown> }
}

/**
 * Serializes a Univer unit snapshot back to its native office file bytes. The
 * snapshot is a plain record (rather than a kind-specific Univer data type)
 * because callers only know the office kind at runtime.
 * @param kind - Docs / Sheets / Slides.
 * @param snapshot - Current Univer unit snapshot (from `unit.getSnapshot()`).
 * @returns Native office file blob (`.docx` / `.xlsx` / `.pptx`).
 */
export async function serializeOfficeFile(
  kind: OfficeFeatureId,
  snapshot: Record<string, unknown>,
): Promise<Blob> {
  if (kind === 'docs') {
    return exportDocx(snapshot as unknown as IDocumentData)
  }
  if (kind === 'sheets') {
    return exportXlsx(snapshot as unknown as IWorkbookData)
  }
  return exportPptx(snapshot as unknown as ISlideData)
}
