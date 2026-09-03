const QUOTE_SELECTORS = [
  'blockquote',
  '.gmail_quote',
  '.gmail_quote_container',
  '.yahoo_quoted',
  '[data-mail-quoted]',
  'div.gmail_extra',
].join(',')

export interface SplitQuotedMailHtml {
  main: string
  quoted: string | null
}

/**
 * Splits a sanitized mail body into visible content and collapsible quotes.
 * @param html - Sanitized HTML.
 * @returns Main HTML plus optional quoted HTML.
 */
export function splitQuotedMailHtml(html: string): SplitQuotedMailHtml {
  const trimmed = html.trim()
  if (!trimmed) {
    return { main: '', quoted: null }
  }
  const doc = new DOMParser().parseFromString(`<div id="root">${trimmed}</div>`, 'text/html')
  const root = doc.getElementById('root')
  if (!root) {
    return { main: trimmed, quoted: null }
  }
  const quoteNodes = Array.from(root.querySelectorAll(QUOTE_SELECTORS)).filter((node) => {
    return !node.parentElement?.closest(QUOTE_SELECTORS)
  })
  if (quoteNodes.length === 0) {
    return { main: trimmed, quoted: null }
  }
  const quotedWrap = doc.createElement('div')
  for (const node of quoteNodes) {
    quotedWrap.appendChild(node)
  }
  const quoted = quotedWrap.innerHTML.trim()
  const main = root.innerHTML.trim()
  if (!quoted || !main) {
    return { main: trimmed, quoted: null }
  }
  return { main, quoted }
}

/**
 * Highlights case-insensitive query matches in HTML text nodes.
 * @param html - Sanitized HTML.
 * @param query - Search text.
 * @returns HTML with `<mark>` wrappers.
 */
export function highlightMailHtml(html: string, query: string): string {
  const needle = query.trim()
  if (!needle) {
    return html
  }
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.getElementById('root')
  if (!root) {
    return html
  }
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let current = walker.nextNode()
  while (current) {
    if (current instanceof Text && current.data.trim().length > 0) {
      nodes.push(current)
    }
    current = walker.nextNode()
  }
  const lower = needle.toLowerCase()
  for (const node of nodes) {
    const source = node.data
    const sourceLower = source.toLowerCase()
    if (!sourceLower.includes(lower)) {
      continue
    }
    const frag = doc.createDocumentFragment()
    let cursor = 0
    let index = sourceLower.indexOf(lower, cursor)
    while (index >= 0) {
      if (index > cursor) {
        frag.appendChild(doc.createTextNode(source.slice(cursor, index)))
      }
      const mark = doc.createElement('mark')
      mark.className = 'mail-find-hit'
      mark.textContent = source.slice(index, index + needle.length)
      frag.appendChild(mark)
      cursor = index + needle.length
      index = sourceLower.indexOf(lower, cursor)
    }
    if (cursor < source.length) {
      frag.appendChild(doc.createTextNode(source.slice(cursor)))
    }
    node.parentNode?.replaceChild(frag, node)
  }
  return root.innerHTML
}
