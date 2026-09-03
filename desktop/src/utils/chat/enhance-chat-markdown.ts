/**
 * Post-process chat assistant HTML so Aura visual fences (highlight.js,
 * Mermaid, ECharts, …) and KaTeX math match the Markdown Editor preview.
 */

import { abcRender } from '@/lib/mdcore/render/abcRender'
import { chartRender } from '@/lib/mdcore/render/chartRender'
import { flowchartRender } from '@/lib/mdcore/render/flowchartRender'
import { graphvizRender } from '@/lib/mdcore/render/graphvizRender'
import { highlightRender } from '@/lib/mdcore/render/highlightRender'
import { lilypondRender } from '@/lib/mdcore/render/lilypondRender'
import { markmapRender } from '@/lib/mdcore/render/markmapRender'
import { mathRender } from '@/lib/mdcore/render/mathRender'
import { mindmapRender } from '@/lib/mdcore/render/mindmapRender'
import { plantumlRender } from '@/lib/mdcore/render/plantumlRender'
import { SMILESRender } from '@/lib/mdcore/render/SMILESRender'
import { svgRender } from '@/lib/mdcore/render/svgRender'
import { installEditorVendors } from '@/lib/mdcore/util/vendor-preload'
import zenuml from '@mermaid-js/mermaid-zenuml'
import mermaid from 'mermaid'

let chatMermaidInstallPromise: Promise<void> | null = null

/**
 * Resolve chat chrome theme for diagram / highlight.js styling.
 *
 * @returns `"dark"` when the document root has class `dark`
 */
function chatPreviewTheme(): 'dark' | 'light' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/**
 * Rewrite remark-math HTML (`code.language-math`) into elements that
 * {@link mathRender} expects (`span` / `div.language-math`).
 *
 * @param root - Chat markdown host
 */
function normalizeMathElements(root: HTMLElement): void {
  root.querySelectorAll('[data-type="math-block"]').forEach((math) => {
    if (math.classList.contains('language-math')) return
    const replacement = document.createElement('div')
    replacement.className = 'language-math'
    replacement.textContent = math.textContent ?? ''
    math.closest('pre')?.replaceWith(replacement)
  })
  root.querySelectorAll('code.language-math').forEach((code) => {
    const isDisplay =
      code.classList.contains('math-display') ||
      code.parentElement?.tagName === 'PRE'
    const replacement = document.createElement(isDisplay ? 'div' : 'span')
    replacement.className = 'language-math'
    replacement.textContent = code.textContent ?? ''
    const pre = code.closest('pre')
    if (isDisplay && pre) {
      pre.replaceWith(replacement)
    } else {
      code.replaceWith(replacement)
    }
  })
}

/**
 * Runs one preview renderer without preventing the remaining renderer types.
 *
 * @param label - Renderer name used in diagnostics
 * @param render - Renderer invocation
 */
function runPreviewRenderer(label: string, render: () => void): void {
  try {
    render()
  } catch (error) {
    console.warn(`[chat] ${label} failed:`, error)
  }
}

/**
 * Render Mermaid fences as an awaited chat lifecycle operation.
 *
 * @param root - Chat markdown host
 * @param theme - Active chat theme
 * @returns Resolves after every connected Mermaid node finishes rendering
 */
async function renderMermaidFences(
  root: HTMLElement,
  theme: 'dark' | 'light',
): Promise<void> {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.language-mermaid'))
  if (nodes.length === 0) return

  mermaid.initialize({
    securityLevel: 'loose',
    startOnLoad: false,
    theme: theme === 'dark' ? 'dark' : 'default',
    fontFamily: 'sans-serif',
    altFontFamily: 'sans-serif',
    flowchart: { htmlLabels: true, useMaxWidth: true },
    sequence: {
      useMaxWidth: true,
      diagramMarginX: 8,
      diagramMarginY: 8,
      boxMargin: 8,
      showSequenceNumbers: true,
    },
    gantt: { leftPadding: 75, rightPadding: 20 },
    treeView: { showIcons: true },
  })

  for (const [index, node] of nodes.entries()) {
    if (!node.isConnected || node.dataset.processed === 'true') continue
    const source = node.textContent?.trim() ?? ''
    if (!source) continue
    node.dataset.processed = 'pending'
    try {
      if (/^zenuml\b/i.test(source)) {
        if (!chatMermaidInstallPromise) {
          chatMermaidInstallPromise = mermaid.registerExternalDiagrams([zenuml])
        }
        await chatMermaidInstallPromise
      }
      const id = `chat-mermaid-${index}-${crypto.randomUUID()}`
      const { svg } = await mermaid.render(id, source)
      if (!node.isConnected) continue
      node.innerHTML = svg
      node.dataset.processed = 'true'
    } catch (error) {
      if (!node.isConnected) continue
      node.dataset.processed = 'error'
      node.classList.add('aura-reset--error')
      node.textContent = error instanceof Error ? error.message : String(error)
      console.warn('[chat] Mermaid failed:', error)
    }
  }
}

/**
 * Mindmap renderer reads URI-encoded JSON from `data-code` (Aura DOM). Bridge
 * plain fenced HTML by copying the fence body into that attribute.
 *
 * @param root - Chat markdown host
 */
function normalizeMindmapElements(root: HTMLElement): void {
  root.querySelectorAll('.language-mindmap').forEach((el) => {
    if (el.getAttribute('data-code')) return
    const body = el.textContent ?? ''
    if (!body.trim()) return
    el.setAttribute('data-code', encodeURIComponent(body.trim()))
  })
}

/**
 * Render fenced SVG blocks (Aura's {@link svgRender} expects a preview pane).
 *
 * @param root - Chat markdown host
 */
function renderSvgFences(root: HTMLElement): void {
  root.querySelectorAll('code.language-svg').forEach((code) => {
    const pre = code.parentElement
    if (!(pre instanceof HTMLElement) || pre.tagName !== 'PRE') return
    if (pre.getAttribute('data-processed') === 'true') return
    svgRender(pre)
    pre.setAttribute('data-processed', 'true')
  })
}

/**
 * Ensure media elements can play (controls visible; remote/data src intact).
 *
 * @param root - Chat markdown host
 */
function normalizeMediaElements(root: HTMLElement): void {
  root.querySelectorAll('audio, video').forEach((el) => {
    if (!el.hasAttribute('controls')) {
      el.setAttribute('controls', '')
    }
    if (el instanceof HTMLVideoElement) {
      el.setAttribute('playsinline', '')
    }
  })
}

/**
 * Run Aura preview renderers on a mounted chat markdown root.
 *
 * Safe to call repeatedly after React replaces `innerHTML`; diagram renderers
 * skip nodes already marked `data-processed`.
 *
 * @param root - Element that holds sanitized chat HTML
 * @returns Resolves when vendors are loaded and renders are scheduled
 */
export async function enhanceChatMarkdown(root: HTMLElement): Promise<void> {
  if (!root.isConnected) return

  const theme = chatPreviewTheme()
  await renderMermaidFences(root, theme)
  if (!root.isConnected) return

  try {
    await installEditorVendors()
  } catch (error) {
    console.warn('[chat] Editor vendors failed; math/highlight may be incomplete:', error)
  }
  if (!root.isConnected) return

  normalizeMathElements(root)
  normalizeMindmapElements(root)
  normalizeMediaElements(root)

  const hljsStyle = theme === 'dark' ? 'github-dark' : 'github'

  try {
    highlightRender(
      { enable: true, style: hljsStyle, lineNumber: false },
      root,
    )
  } catch (error) {
    console.warn('[chat] highlight.js failed:', error)
  }

  try {
    mathRender(root, {
      math: { engine: 'KaTeX', inlineDigit: false, macros: {} },
    })
  } catch (error) {
    console.warn('[chat] KaTeX failed:', error)
  }

  runPreviewRenderer('ECharts', () => chartRender(root, theme))
  runPreviewRenderer('mind map', () => mindmapRender(root, theme))
  runPreviewRenderer('PlantUML', () => plantumlRender(root, theme))
  runPreviewRenderer('SMILES', () => SMILESRender(root, theme))
  runPreviewRenderer('flowchart', () => flowchartRender(root))
  runPreviewRenderer('Graphviz', () => graphvizRender(root))
  runPreviewRenderer('markmap', () => markmapRender(root))
  runPreviewRenderer('ABC notation', () => abcRender(root))
  runPreviewRenderer('LilyPond', () => lilypondRender(root))
  runPreviewRenderer('SVG', () => renderSvgFences(root))
}
