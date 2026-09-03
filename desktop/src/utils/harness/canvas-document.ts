/** Supported preview kind for one Harness Canvas file. */
export type HarnessCanvasKind = 'html' | 'markdown'

const CANVAS_PREVIEW_POLICY = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  'media-src data: blob:',
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

/**
 * Classifies a Canvas file from its extension.
 * @param name - File name or relative path.
 * @returns Preview kind, or null when unsupported.
 */
export function harnessCanvasKind(name: string): HarnessCanvasKind | null {
  const lower = name.toLowerCase()
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html'
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown'
  return null
}

/**
 * Injects an element at the beginning of an HTML document head.
 * @param source - Full or partial HTML source.
 * @param headContent - Markup that must run before generated scripts.
 * @returns Full HTML document with the injected head content.
 */
function injectHead(source: string, headContent: string): string {
  if (/<head[\s>]/i.test(source)) {
    return source.replace(/<head([^>]*)>/i, `<head$1>${headContent}`)
  }
  if (/<html[\s>]/i.test(source)) {
    return source.replace(/<html([^>]*)>/i, `<html$1><head>${headContent}</head>`)
  }
  return `<!DOCTYPE html><html><head>${headContent}<meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:system-ui,sans-serif;margin:16px;color:#111;}</style></head><body>${source}</body></html>`
}

/**
 * Creates an isolated HTML preview document for the native Canvas view.
 * @param source - Generated Canvas HTML.
 * @returns Complete HTML for iframe srcDoc.
 */
export function createHarnessCanvasPreviewDocument(source: string): string {
  const policy = `<meta http-equiv="Content-Security-Policy" content="${CANVAS_PREVIEW_POLICY}">`
  return injectHead(source, policy)
}
