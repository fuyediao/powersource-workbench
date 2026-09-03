/** Elements stripped entirely during sanitization. */
const FORBIDDEN_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED'])

/** Attribute-value prefixes that can execute script. */
const SCRIPT_URL_RE = /^\s*(javascript|vbscript):/i

/** `data:` URIs allowed on media/image `src` (not on navigable `href`). */
const SAFE_DATA_SRC_RE = /^\s*data:(image|audio|video)[/;]/i

/** Tags where a `data:` `src` is treated as media payload, not script. */
const DATA_SRC_TAGS = new Set(['IMG', 'AUDIO', 'VIDEO', 'SOURCE'])

/** URL-bearing attributes that must be checked against dangerous schemes. */
const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'action', 'formaction'])

/**
 * Whether an attribute value is an unsafe URL for the given element.
 *
 * @param tagName - Uppercase element tag name
 * @param attrName - Lowercase attribute name
 * @param value - Attribute value
 * @returns True when the attribute should be stripped
 */
function isDangerousUrl(
  tagName: string,
  attrName: string,
  value: string,
): boolean {
  if (SCRIPT_URL_RE.test(value)) {
    return true
  }
  if (!/^\s*data:/i.test(value)) {
    return false
  }
  // Allow `data:image|audio|video` on media `src`; strip other `data:` (e.g. href).
  if (attrName === 'src' && DATA_SRC_TAGS.has(tagName)) {
    return !SAFE_DATA_SRC_RE.test(value)
  }
  return true
}

/**
 * Strip script-bearing markup from an HTML fragment. Removes `<script>` /
 * `<style>` and friends, inline event handlers (`on*`), and `javascript:` URLs.
 * Keeps `data:image|audio|video` on media/image `src` so chat/editor embeds play.
 *
 * @param html - Untrusted HTML fragment.
 * @returns Sanitized HTML string.
 */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(
    `<div id="aura-sanitize-root">${html}</div>`,
    'text/html',
  )
  const root = doc.getElementById('aura-sanitize-root')
  if (!root) {
    return ''
  }

  root.querySelectorAll('*').forEach((el) => {
    if (FORBIDDEN_TAGS.has(el.tagName)) {
      el.remove()
      return
    }
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name)
        return
      }
      if (URL_ATTRS.has(name) && isDangerousUrl(el.tagName, name, attr.value)) {
        el.removeAttribute(attr.name)
      }
    })
  })

  return root.innerHTML
}
