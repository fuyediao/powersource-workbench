import { describe, expect, it } from 'vitest'
import { parseHarnessOfficeOpenResult } from './office-tool-result'

describe('Harness Office tool result parsing', () => {
  it('accepts an accessible Office file result', () => {
    expect(parseHarnessOfficeOpenResult('{"id":"file-1","kind":"sheets","download_url":"https://example.test"}'))
      .toEqual({ fileId: 'file-1', kind: 'sheets' })
  })

  it('rejects errors and unknown kinds', () => {
    expect(parseHarnessOfficeOpenResult('{"error":"Forbidden"}')).toBeNull()
    expect(parseHarnessOfficeOpenResult('{"id":"file-1","kind":"pdf"}')).toBeNull()
  })
})
