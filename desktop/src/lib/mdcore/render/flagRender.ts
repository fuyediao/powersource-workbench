/**
 * Render Unicode country-flag emoji as inline SVG images.
 * Uses bundled `getFlagSvgDataUri` (`src/icons/flags.ts`), not `public/flags`.
 * Pasted Markdown `![CN](/flags/cn.svg)` is still demoted back to emoji.
 */

import { getFlagSvgDataUri } from '@/icons/flags'

/** Regional Indicator Symbol range (🇦 … 🇿). */
const RI_MIN = 0x1f1e6
const RI_MAX = 0x1f1ff

/** Markdown image that points at a packed flag SVG, e.g. `![CN](/flags/cn.svg)`. */
const FLAG_MD_RE =
  /!\[[^\]]*]\((?:[^)\s]*\/)?flags\/([a-z]{2})\.svg(?:\s+"[^"]*")?\)/gi

/**
 * Resolve the data URI for a bundled country flag SVG.
 *
 * @param iso - Lowercase ISO 3166-1 alpha-2 code.
 * @returns Data URI, or empty string when unknown.
 */
function flagSrc(iso: string): string {
  return getFlagSvgDataUri(iso) ?? ''
}

/**
 * Convert ISO 3166-1 alpha-2 to a Unicode flag emoji.
 *
 * @param iso - Two-letter country code.
 * @returns Flag emoji, or empty string when invalid.
 */
export function isoToFlagEmoji(iso: string): string {
  if (!/^[a-z]{2}$/i.test(iso)) {
    return ''
  }
  const upper = iso.toUpperCase()
  return String.fromCodePoint(
    RI_MIN + upper.charCodeAt(0) - 0x41,
    RI_MIN + upper.charCodeAt(1) - 0x41,
  )
}

/**
 * Whether a string code point is a regional-indicator symbol.
 *
 * @param char - Single Unicode code point string.
 * @returns True when the character is 🇦–🇿.
 */
function isRegionalIndicator(char: string): boolean {
  const code = char.codePointAt(0)
  return code !== undefined && code >= RI_MIN && code <= RI_MAX
}

/**
 * Map a regional-indicator character to A–Z.
 *
 * @param char - Regional-indicator code point.
 * @returns ASCII letter.
 */
function riToLetter(char: string): string {
  const code = char.codePointAt(0) ?? RI_MIN
  return String.fromCharCode(0x41 + (code - RI_MIN))
}

/**
 * Extract ISO code from a flag image `src` if it points at `.../flags/{iso}.svg`.
 *
 * @param src - Image URL.
 * @returns Lowercase ISO code, or empty string.
 */
function isoFromFlagSrc(src: string): string {
  const match = /(?:^|\/)flags\/([a-z]{2})\.svg(?:\?|#|$)/i.exec(src)
  return match ? match[1].toLowerCase() : ''
}

/**
 * Whether an image is a flag substitute (class, data-type, or `/flags/*.svg` src).
 *
 * @param el - Candidate element.
 * @returns True when the image should be treated as a flag emoji.
 */
export function isFlagImage(el: Element | null): boolean {
  if (!el || el.tagName !== 'IMG') {
    return false
  }
  const img = el as HTMLImageElement
  if (img.classList.contains('aura-flag') || img.getAttribute('data-type') === 'flag-emoji') {
    return true
  }
  return isoFromFlagSrc(img.getAttribute('src') || '') !== ''
}

/**
 * Resolve Unicode emoji for a flag image.
 *
 * @param img - Flag-like image element.
 * @returns Flag emoji, or empty string when unknown.
 */
function emojiFromFlagImg(img: HTMLImageElement): string {
  const data = img.getAttribute('data-emoji') || ''
  if (data) {
    return data
  }
  const alt = img.getAttribute('alt') || ''
  const altChars = [...alt]
  if (
    altChars.length >= 2 &&
    isRegionalIndicator(altChars[0]) &&
    isRegionalIndicator(altChars[1])
  ) {
    return altChars[0] + altChars[1]
  }
  if (/^[a-z]{2}$/i.test(alt)) {
    return isoToFlagEmoji(alt)
  }
  const fromSrc = isoFromFlagSrc(img.getAttribute('src') || '')
  return fromSrc ? isoToFlagEmoji(fromSrc) : ''
}

/**
 * Whether a text node should be skipped (code, already-rendered flags, etc.).
 * Do not treat the top-level contenteditable `pre.aura-reset` as a code fence.
 *
 * @param node - DOM text node.
 * @returns True when the node must not be rewritten.
 */
function shouldSkipTextNode(node: Node): boolean {
  const parent = node.parentElement
  if (!parent) {
    return true
  }
  if (
    parent.closest(
      'code, script, style, .aura-flag, .aura-wysiwyg__preview',
    )
  ) {
    return true
  }
  const pre = parent.closest('pre')
  if (pre && !pre.classList.contains('aura-reset')) {
    return true
  }
  return false
}

/**
 * Whether text contains at least one regional-indicator pair.
 *
 * @param text - Plain text.
 * @returns True when a flag emoji pair may be present.
 */
function hasFlagPair(text: string): boolean {
  const chars = [...text]
  for (let i = 0; i < chars.length - 1; i++) {
    if (isRegionalIndicator(chars[i]) && isRegionalIndicator(chars[i + 1])) {
      return true
    }
  }
  return false
}

/**
 * Create an inline flag image that stays emoji-sized.
 *
 * @param emoji - Unicode flag emoji (two regional indicators).
 * @param iso - Lowercase ISO code for the bundled SVG.
 * @returns Configured `img` element, or a text node when the SVG is missing.
 */
function createFlagImage(emoji: string, iso: string): Node {
  const src = flagSrc(iso)
  if (!src) {
    return document.createTextNode(emoji)
  }
  const img = document.createElement('img')
  img.className = 'aura-flag'
  img.alt = emoji
  img.src = src
  img.draggable = false
  img.width = 18
  img.height = 14
  img.setAttribute('data-type', 'flag-emoji')
  img.setAttribute('data-emoji', emoji)
  img.setAttribute('contenteditable', 'false')
  img.style.cssText =
    'display:inline-block;width:1.2em;height:0.9em;max-width:1.2em;max-height:0.9em;margin:0 0.08em;padding:0;border:0;vertical-align:-0.1em;object-fit:cover;cursor:text'
  img.addEventListener('error', () => {
    img.replaceWith(document.createTextNode(emoji))
  })
  return img
}

/**
 * Replace flag emoji pairs in a text node with SVG flag images.
 *
 * @param textNode - Text node to rewrite.
 */
function replaceFlagsInTextNode(textNode: Text): void {
  const text = textNode.textContent ?? ''
  const chars = [...text]
  const frag = document.createDocumentFragment()
  let buffer = ''

  /**
   * Flush buffered plain text into the fragment.
   */
  const flush = (): void => {
    if (buffer) {
      frag.appendChild(document.createTextNode(buffer))
      buffer = ''
    }
  }

  for (let i = 0; i < chars.length; i++) {
    const a = chars[i]
    const b = chars[i + 1]
    if (b && isRegionalIndicator(a) && isRegionalIndicator(b)) {
      const iso = (riToLetter(a) + riToLetter(b)).toLowerCase()
      flush()
      frag.appendChild(createFlagImage(a + b, iso))
      i++
      continue
    }
    buffer += a
  }
  flush()
  textNode.parentNode?.replaceChild(frag, textNode)
}

/**
 * Restore flag images to Unicode emoji text (export / SpinDOM / clipboard).
 * Matches class, `data-type`, and plain `/flags/{iso}.svg` images from paste/source.
 *
 * @param root - Element tree to rewrite in place.
 */
export function unwrapFlagImages(root: HTMLElement): void {
  root.querySelectorAll('img').forEach((img) => {
    if (!isFlagImage(img)) {
      return
    }
    const emoji = emojiFromFlagImg(img as HTMLImageElement)
    if (emoji) {
      img.replaceWith(document.createTextNode(emoji))
    }
  })
}

/**
 * Rewrite Markdown `![](.../flags/xx.svg)` back to Unicode flag emoji.
 *
 * @param md - Markdown text.
 * @returns Markdown with flag image links demoted to emoji.
 */
export function demoteFlagMarkdown(md: string): string {
  return md.replace(FLAG_MD_RE, (_whole, iso: string) => isoToFlagEmoji(iso))
}

/**
 * Replace Unicode flag emoji (and heal `/flags/*.svg` document images) with inline SVGs.
 *
 * @param root - Editor or preview root element.
 */
export const flagRender = (root: HTMLElement): void => {
  if (!root) {
    return
  }
  // Heal pasted / source-mode markdown images → emoji, then re-render as small flags.
  unwrapFlagImages(root)

  const targets: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    if (!shouldSkipTextNode(node) && hasFlagPair(node.textContent ?? '')) {
      targets.push(node as Text)
    }
    node = walker.nextNode()
  }
  targets.forEach(replaceFlagsInTextNode)
}
