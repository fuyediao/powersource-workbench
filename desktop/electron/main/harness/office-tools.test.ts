import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { runLocalOfficeTool } from './office-tools'

/** Parses one successful tool result. */
function resultPayload(text: string): Record<string, unknown> {
  return JSON.parse(text) as Record<string, unknown>
}

describe('Harness local Office tools', () => {
  it('creates, inspects, and edits a Word document', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'harness-office-'))
    const created = await runLocalOfficeTool('create_local_office_file', {
      kind: 'docx',
      name: 'brief.docx',
      content: { paragraphs: [{ text: 'Quarterly brief', heading: 'heading_1' }, { text: 'Draft body' }] },
    }, root)
    expect(created.isError).toBe(false)
    const createdPath = String(resultPayload(created.text).path)

    const inspected = await runLocalOfficeTool('inspect_local_office_file', { path: createdPath }, root)
    expect(inspected.text).toContain('Quarterly brief')

    const edited = await runLocalOfficeTool('edit_local_office_file', {
      path: createdPath,
      operations: [
        { type: 'replaceText', search: 'Draft body', replacement: 'Approved body' },
        { type: 'appendParagraph', text: 'Next action' },
      ],
    }, root)
    expect(edited.isError).toBe(false)
    const verified = await runLocalOfficeTool(
      'inspect_local_office_file',
      { path: String(resultPayload(edited.text).path) },
      root,
    )
    expect(verified.text).toContain('Approved body')
    expect(verified.text).toContain('Next action')
  })

  it('preserves Excel formulas through structured editing', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'harness-office-'))
    const created = await runLocalOfficeTool('create_local_office_file', {
      kind: 'xlsx',
      name: 'forecast.xlsx',
      content: {
        sheets: [{ name: 'Forecast', header: true, rows: [['Month', 'Revenue'], ['Jan', 10]], formulas: { B3: 'SUM(B2:B2)' } }],
      },
    }, root)
    const edited = await runLocalOfficeTool('edit_local_office_file', {
      path: String(resultPayload(created.text).path),
      operations: [{ type: 'setFormula', sheet: 'Forecast', cell: 'B3', formula: 'SUM(B2:B2)*2' }],
    }, root)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await readFile(String(resultPayload(edited.text).path)))
    expect(workbook.getWorksheet('Forecast')?.getCell('B3').formula).toBe('SUM(B2:B2)*2')
  })

  it('creates and inspects a PowerPoint presentation', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'harness-office-'))
    const created = await runLocalOfficeTool('create_local_office_file', {
      kind: 'pptx',
      name: 'plan.pptx',
      content: { title: 'Plan', slides: [{ title: 'Launch plan', body: 'Validate the market.' }] },
    }, root)
    expect(created.isError).toBe(false)
    const inspected = await runLocalOfficeTool(
      'inspect_local_office_file',
      { path: String(resultPayload(created.text).path) },
      root,
    )
    expect(inspected.text).toContain('Launch plan')
    expect(inspected.text).toContain('Validate the market.')
  })

  it('refuses outputs outside the Harness work folder', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'harness-office-'))
    const result = await runLocalOfficeTool('create_local_office_file', {
      kind: 'docx',
      outputPath: path.resolve(root, '..', 'escaped.docx'),
      content: {},
    }, root)
    expect(result.isError).toBe(true)
    expect(result.text).toContain('must stay inside')
  })
})
