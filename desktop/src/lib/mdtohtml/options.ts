/**
 * Engine option flags consumed by `src/core` when binding the Markdown
 * engine.
 */
export interface MarkdownEngineOptions {
  /** Enable GFM tables / task lists / strikethrough / autolink. */
  gfm: boolean
  /** Render `$...$` / `$$...$$` math blocks. */
  math: boolean
  /** Render `==mark==` highlight. */
  mark: boolean
  /** Render `^sup^`. */
  sup: boolean
  /** Render `~sub~`. */
  sub: boolean
  /** Render `||spoiler||` Discord-style spoilers. */
  spoiler: boolean
  /** Render Critic Markup (`{++}` / `{--}` / `{==}` / `{>>}`). */
  critic: boolean
  /** Render footnotes. */
  footnotes: boolean
  /** Render GFM alerts / callouts (`> [!NOTE]`). */
  callout: boolean
  /** Expand a `[ToC]` marker into a nested table of contents. */
  toc: boolean
  /** Show code-block preview pane. */
  codeBlockPreview: boolean
  /** Host-provided fence languages that need a derived visual preview. */
  renderedCodeLanguages: string[]
  /** Show math-block preview pane. */
  mathBlockPreview: boolean
  /** Strip dangerous HTML on output. */
  sanitize: boolean
  /** Emoji alias → unicode / image map. */
  emojis: Record<string, string>
  /** Base URL prepended to relative emoji images. */
  emojiSite: string
}

/** Default engine options aligned with Aura's product configuration. */
export const DEFAULT_ENGINE_OPTIONS: MarkdownEngineOptions = {
  gfm: true,
  math: true,
  mark: true,
  sup: true,
  sub: true,
  spoiler: true,
  critic: true,
  footnotes: true,
  callout: true,
  toc: false,
  codeBlockPreview: true,
  renderedCodeLanguages: [],
  mathBlockPreview: true,
  sanitize: false,
  emojis: {},
  emojiSite: '',
}
