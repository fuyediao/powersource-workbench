/** System color-emoji fonts (no bundled Twemoji). */
export const clashEmojiFontStack =
  '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"'

/** Clash UI sans stack with system emoji. */
export const clashUiFontFamily = `-apple-system, BlinkMacSystemFont, "Microsoft YaHei UI", "Microsoft YaHei", Roboto, "Helvetica Neue", Arial, sans-serif, ${clashEmojiFontStack}`

/** Clash Monaco editor stack with system emoji. */
export const clashEditorFontFamily = `Fira Code, JetBrains Mono, Roboto Mono, "Source Code Pro", Consolas, Menlo, Monaco, monospace, "Courier New", ${clashEmojiFontStack}`
