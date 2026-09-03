import { describe, expect, it } from 'vitest'
import {
  createHarnessCanvasPreviewDocument,
  harnessCanvasKind,
} from './canvas-document'

describe('Harness Canvas document helpers', () => {
  it('classifies supported Canvas files', () => {
    expect(harnessCanvasKind('canvas/index.HTML')).toBe('html')
    expect(harnessCanvasKind('canvas/report.markdown')).toBe('markdown')
    expect(harnessCanvasKind('canvas/data.json')).toBeNull()
  })

  it('injects preview isolation before generated scripts', () => {
    const document = createHarnessCanvasPreviewDocument(
      '<html><body><script>console.log("ready")</script></body></html>',
    )
    expect(document).toContain('Content-Security-Policy')
    expect(document).toContain("connect-src 'none'")
    expect(document.indexOf('Content-Security-Policy')).toBeLessThan(
      document.indexOf('console.log("ready")'),
    )
  })
})
