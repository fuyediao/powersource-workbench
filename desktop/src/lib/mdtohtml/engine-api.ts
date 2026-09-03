import { AuraMarkdownEngine, createMarkdownEngine } from './engine'
import type { MarkdownEngineOptions } from './options'

/**
 * Public Markdown engine API consumed by `src/core`.
 * Thin facade over {@link AuraMarkdownEngine}.
 */
export interface MarkdownEngineApi {
  markdownToAuraDom(markdown: string): string
  topBlockSourceSlices(markdown: string): string[]
  auraDomToMarkdown(html: string): string
  auraDomToHtml(html: string): string
  markdownToHtml(markdown: string): string
  spinAuraDom(html: string): string
  htmlToMarkdown(html: string): string
  htmlToAuraDom(html: string): string
  isValidLinkDest(link: string): boolean
  getEmojis(): Record<string, string>
  sanitize(html: string): string
  setToc(enable: boolean): void
  setFootnotes(enable: boolean): void
  setCallout(enable: boolean): void
  setMark(enable: boolean): void
  setSup(enable: boolean): void
  setSub(enable: boolean): void
  setSanitize(enable: boolean): void
  setCodeBlockPreview(enable: boolean): void
  setMathBlockPreview(enable: boolean): void
  setWysiwyg(enable: boolean): void
  putEmojis(emojis: Record<string, string>): void
  setEmojiSite(site: string): void
  setHeadingAnchor(enable: boolean): void
  setInlineMathAllowDigitAfterOpenMarker(enable: boolean): void
  setAutoSpace(enable: boolean): void
  setFixTermTypo(enable: boolean): void
  setChineseParagraphBeginningSpace(enable: boolean): void
  setRenderListStyle(enable: boolean): void
  setLinkBase(base: string): void
  setLinkPrefix(prefix: string): void
  setGfmAutoLink(enable: boolean): void
  setImageLazyLoading(value: string): void
}

/**
 * Create the Markdown engine API used by the WYSIWYG kernel.
 *
 * @param options - Engine option overrides.
 * @returns Configured engine API.
 */
export function createMarkdownEngineApi(
  options: Partial<MarkdownEngineOptions> = {},
): MarkdownEngineApi {
  const engine: AuraMarkdownEngine = createMarkdownEngine(options)
  const noop = (): void => undefined
  return {
    markdownToAuraDom: (markdown) => engine.markdownToAuraDom(markdown),
    topBlockSourceSlices: (markdown) => engine.topBlockSourceSlices(markdown),
    auraDomToMarkdown: (html) => engine.auraDomToMarkdown(html),
    auraDomToHtml: (html) => engine.auraDomToHtml(html),
    markdownToHtml: (markdown) => engine.markdownToHtml(markdown),
    spinAuraDom: (html) => engine.spinAuraDom(html),
    htmlToMarkdown: (html) => engine.htmlToMarkdown(html),
    htmlToAuraDom: (html) => engine.htmlToAuraDom(html),
    isValidLinkDest: (link) => engine.isValidLinkDest(link),
    getEmojis: () => engine.getEmojis(),
    sanitize: (html) => engine.sanitize(html),
    setToc: (enable) => engine.setOptions({ toc: enable }),
    setFootnotes: (enable) => engine.setOptions({ footnotes: enable }),
    setCallout: (enable) => engine.setOptions({ callout: enable }),
    setMark: (enable) => engine.setOptions({ mark: enable }),
    setSup: (enable) => engine.setOptions({ sup: enable }),
    setSub: (enable) => engine.setOptions({ sub: enable }),
    setSanitize: (enable) => engine.setOptions({ sanitize: enable }),
    setCodeBlockPreview: (enable) =>
      engine.setOptions({ codeBlockPreview: enable }),
    setMathBlockPreview: (enable) =>
      engine.setOptions({ mathBlockPreview: enable }),
    setWysiwyg: noop,
    putEmojis: (emojis) => engine.setOptions({ emojis }),
    setEmojiSite: (site) => engine.setOptions({ emojiSite: site }),
    setHeadingAnchor: noop,
    setInlineMathAllowDigitAfterOpenMarker: noop,
    setAutoSpace: noop,
    setFixTermTypo: noop,
    setChineseParagraphBeginningSpace: noop,
    setRenderListStyle: noop,
    setLinkBase: noop,
    setLinkPrefix: noop,
    setGfmAutoLink: noop,
    setImageLazyLoading: noop,
  }
}
