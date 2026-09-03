import { createMarkdownEngineApi, type MarkdownEngineApi } from '@/lib/mdtohtml'

/**
 * Create and configure the Markdown engine for the editor.
 *
 * @param options - Markdown feature flags from Aura options.
 * @returns Configured engine API.
 */
export const setMarkdownEngine = (
  options: IMarkdownBindOptions,
): MarkdownEngineApi => {
  const markdown = createMarkdownEngineApi({
    footnotes: options.footnotes,
    mark: options.mark,
    sup: options.sup,
    sub: options.sub,
    sanitize: options.sanitize,
    codeBlockPreview: options.codeBlockPreview,
    renderedCodeLanguages: options.renderedCodeLanguages,
    mathBlockPreview: options.mathBlockPreview,
    emojis: options.emojis,
    emojiSite: options.emojiSite,
  })
  markdown.putEmojis(options.emojis)
  markdown.setEmojiSite(options.emojiSite)
  markdown.setHeadingAnchor(options.headingAnchor)
  markdown.setInlineMathAllowDigitAfterOpenMarker(options.inlineMathDigit)
  markdown.setAutoSpace(options.autoSpace!)
  markdown.setToc(options.toc!)
  markdown.setFootnotes(options.footnotes!)
  markdown.setFixTermTypo(options.fixTermTypo!)
  markdown.setCodeBlockPreview(options.codeBlockPreview!)
  markdown.setMathBlockPreview(options.mathBlockPreview!)
  markdown.setSanitize(options.sanitize!)
  markdown.setChineseParagraphBeginningSpace(options.paragraphBeginningSpace!)
  markdown.setRenderListStyle(options.listStyle!)
  markdown.setLinkBase(options.linkBase!)
  markdown.setLinkPrefix(options.linkPrefix!)
  markdown.setMark(options.mark!)
    markdown.setGfmAutoLink(options.gfmAutoLink!)
    markdown.setSup(options.sup!)
    markdown.setSub(options.sub!)
    return markdown
}
