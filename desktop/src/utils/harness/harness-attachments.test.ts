import { describe, expect, it } from 'vitest'
import {
  isHarnessAttachmentFileName,
  isHarnessAttachmentImageName,
  isHarnessAttachmentMimeType,
  isHarnessAttachmentOfficeName,
} from '@/utils/harness/harness-attachments'

describe('Harness composer attachment types', () => {
  it('accepts documents, Office files, and images', () => {
    expect(isHarnessAttachmentFileName('brief.pdf')).toBe(true)
    expect(isHarnessAttachmentFileName('notes.md')).toBe(true)
    expect(isHarnessAttachmentFileName('C:\\\\docs\\\\report.docx')).toBe(true)
    expect(isHarnessAttachmentFileName('sheet.xlsx')).toBe(true)
    expect(isHarnessAttachmentFileName('deck.pptx')).toBe(true)
    expect(isHarnessAttachmentFileName('photo.png')).toBe(true)
    expect(isHarnessAttachmentFileName('app.ts')).toBe(false)
  })

  it('classifies Office files and images', () => {
    expect(isHarnessAttachmentOfficeName('quote.xlsx')).toBe(true)
    expect(isHarnessAttachmentOfficeName('photo.png')).toBe(false)
    expect(isHarnessAttachmentImageName('photo.WEBP')).toBe(true)
    expect(isHarnessAttachmentImageName('brief.pdf')).toBe(false)
  })

  it('accepts document and Office MIME types from drops', () => {
    expect(isHarnessAttachmentMimeType('image/png')).toBe(true)
    expect(isHarnessAttachmentMimeType('application/pdf')).toBe(true)
    expect(
      isHarnessAttachmentMimeType(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe(true)
    expect(isHarnessAttachmentMimeType('application/javascript')).toBe(false)
  })
})
