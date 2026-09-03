import abcjs from 'abcjs'
import * as echarts from 'echarts'
import flowchart from 'flowchart.js'
import hljs from 'highlight.js'
import katex from 'katex'
import 'katex/contrib/mhchem'
import { Transformer } from 'markmap-lib'
import { Markmap, deriveOptions, loadCSS, loadJS } from 'markmap-view'
import zenuml from '@mermaid-js/mermaid-zenuml'
import mermaid from 'mermaid'
import SmilesDrawer from 'smiles-drawer'
import { instance as vizInstance } from '@viz-js/viz'
import vizGlobalUrl from '@plantuml/core/viz-global.js?url'

import 'katex/dist/katex.min.css'
import githubCss from 'highlight.js/styles/github.css?url'
import githubDarkCss from 'highlight.js/styles/github-dark.css?url'
import atomOneLightCss from 'highlight.js/styles/atom-one-light.css?url'
import atomOneDarkCss from 'highlight.js/styles/atom-one-dark.css?url'
import vsCss from 'highlight.js/styles/vs.css?url'
import vs2015Css from 'highlight.js/styles/vs2015.css?url'
import xcodeCss from 'highlight.js/styles/xcode.css?url'
import monokaiCss from 'highlight.js/styles/monokai.css?url'

/**
 * Script id markers for vendors Aura installs from npm (no CDN fetch).
 */
const SCRIPT_MARKERS = [
  'auraMermaidScript',
  'auraHljsScript',
  'auraHljsThirdScript',
  'auraKatexScript',
  'auraKatexChemScript',
  'auraEchartsScript',
  'auraFlowchartScript',
  'auraGraphVizScript',
  'auraPlantumlScript',
  'auraAbcjsScript',
  'auraMarkerScript',
] as const

let installPromise: Promise<void> | null = null

/**
 * Insert empty script tags so Aura treats vendors as already loaded.
 */
function markScriptsLoaded(): void {
  for (const id of SCRIPT_MARKERS) {
    if (!document.getElementById(id)) {
      const marker = document.createElement('script')
      marker.id = id
      document.head.appendChild(marker)
    }
  }
}

/**
 * Load `@plantuml/core`'s Viz.js UMD bundle as a classic script (required
 * before the TeaVM PlantUML module can call `Viz.instance()`).
 *
 * @returns Resolves when `window.Viz` is available.
 */
function loadPlantumlVizGlobal(): Promise<void> {
  const g = window as unknown as { Viz?: unknown }
  if (g.Viz) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[data-aura-plantuml-viz="1"]',
    )
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener(
        'error',
        () => reject(new Error('Failed to load PlantUML Viz.js')),
        { once: true },
      )
      return
    }
    const script = document.createElement('script')
    script.src = vizGlobalUrl
    script.async = false
    script.dataset.auraPlantumlViz = '1'
    script.onload = () => resolve()
    script.onerror = () =>
      reject(new Error('Failed to load PlantUML Viz.js (@plantuml/core)'))
    document.head.appendChild(script)
  })
}

/**
 * Memoized PlantUML API factory (loads Viz + TeaVM on first use).
 */
let plantumlApiPromise: Promise<{
  renderToSvg: (
    source: string,
    options?: { dark?: boolean },
  ) => Promise<string>
}> | null = null

/**
 * Build a serialized PlantUML renderer. The TeaVM engine shares internal
 * state, so concurrent `renderToString` calls must not overlap.
 *
 * @returns API exposed on `window.__AURA_PLANTUML__`.
 */
function createPlantumlApi(): Promise<{
  renderToSvg: (
    source: string,
    options?: { dark?: boolean },
  ) => Promise<string>
}> {
  if (!plantumlApiPromise) {
    plantumlApiPromise = (async () => {
      await loadPlantumlVizGlobal()
      const { render, renderToString } = await import('@plantuml/core')

      let queue: Promise<unknown> = Promise.resolve()

      /**
       * Run a render job after previous PlantUML jobs finish.
       *
       * @param job - Async render work.
       * @returns Job result.
       */
      function enqueue<T>(job: () => Promise<T>): Promise<T> {
        const next = queue.then(job, job)
        queue = next.then(
          () => undefined,
          () => undefined,
        )
        return next
      }

      /**
       * Render via `render()` into a temporary DOM node (supports dark mode).
       *
       * @param lines - Source lines.
       * @param dark - Dark theme flag.
       * @returns SVG markup.
       */
      function renderViaDom(lines: string[], dark: boolean): Promise<string> {
        return new Promise((resolve, reject) => {
          const id = `aura-plantuml-${Date.now().toString(36)}-${Math.random()
            .toString(36)
            .slice(2, 8)}`
          const host = document.createElement('div')
          host.id = id
          host.setAttribute('aria-hidden', 'true')
          host.style.cssText =
            'position:absolute;left:-99999px;top:0;width:1px;height:1px;overflow:hidden;'
          document.body.appendChild(host)

          const timeout = window.setTimeout(() => {
            observer.disconnect()
            host.remove()
            reject(new Error('PlantUML render timed out'))
          }, 30000)

          const observer = new MutationObserver(() => {
            const svg = host.querySelector('svg')
            if (!svg) {
              return
            }
            window.clearTimeout(timeout)
            observer.disconnect()
            const html = host.innerHTML
            host.remove()
            resolve(html)
          })
          observer.observe(host, { childList: true, subtree: true })

          try {
            render(lines, id, dark ? { dark: true } : undefined)
          } catch (error) {
            window.clearTimeout(timeout)
            observer.disconnect()
            host.remove()
            reject(error instanceof Error ? error : new Error(String(error)))
          }
        })
      }

      return {
        renderToSvg(source, options = {}) {
          const lines = source.split(/\r\n|\r|\n/)
          const dark = options.dark === true
          return enqueue(() => {
            if (dark) {
              return renderViaDom(lines, true)
            }
            return new Promise<string>((resolve, reject) => {
              renderToString(
                lines,
                (svg) => resolve(svg),
                (message) => reject(new Error(String(message))),
              )
            })
          })
        },
      }
    })()
  }
  return plantumlApiPromise
}

/**
 * Preload editor vendors from npm onto `window`.
 *
 * @returns Resolves when globals are ready for the editor core.
 */
export function installEditorVendors(): Promise<void> {
  if (!installPromise) {
    installPromise = (async () => {
      // Assign through a loose Record — Window typings are Aura-shaped, not full npm module types.
      const g = window as unknown as Record<string, unknown>
      g.hljs = hljs
      g.katex = katex
      g.echarts = echarts
      g.flowchart = flowchart
      g.ABCJS = abcjs

      const smilesCtor =
        (SmilesDrawer as unknown as { SmiDrawer?: new (...args: unknown[]) => unknown })
          .SmiDrawer ??
        (SmilesDrawer as unknown as { Drawer?: new (...args: unknown[]) => unknown }).Drawer ??
        SmilesDrawer
      g.SmiDrawer = smilesCtor

      g.markmap = {
        Transformer,
        Markmap,
        deriveOptions,
        loadCSS,
        loadJS,
        globalCSS: '',
      }

      // Register highlight / KaTeX assets before optional WASM / Mermaid plugins
      // so chat markdown enhancement still works if those loaders fail.
      g.__AURA_PRELOADED_STYLE_IDS__ = new Set(['auraKatexStyle'])
      g.__AURA_HLJS_STYLE_URLS__ = {
        github: githubCss,
        'github-dark': githubDarkCss,
        'atom-one-light': atomOneLightCss,
        'atom-one-dark': atomOneDarkCss,
        vs: vsCss,
        vs2015: vs2015Css,
        xcode: xcodeCss,
        monokai: monokaiCss,
      }
      g.__AURA_STYLE_URLS__ = {
        auraHljsStyle: githubCss,
      }
      markScriptsLoaded()

      try {
        await mermaid.registerExternalDiagrams([zenuml])
        window.mermaid = mermaid
      } catch (error) {
        console.warn('[Aura] Mermaid vendor unavailable:', error)
        window.mermaid = mermaid
      }

      try {
        const viz = await vizInstance()
        g.__AURA_GRAPHVIZ__ = {
          renderSVGElement: (code: string) =>
            Promise.resolve(
              viz.renderSVGElement(code) as unknown as HTMLElement,
            ),
        }
      } catch (error) {
        console.warn('[Aura] Graphviz vendor unavailable:', error)
      }

      g.__AURA_PLANTUML__ = {
        renderToSvg: async (
          source: string,
          options?: { dark?: boolean },
        ) => {
          const api = await createPlantumlApi()
          return api.renderToSvg(source, options)
        },
      }
    })()
  }
  return installPromise
}
