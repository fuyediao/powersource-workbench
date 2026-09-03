export interface OutlineHeading {
  id: string
  level: number
  text: string
}

/**
 * Build a stable outline id from heading text and occurrence index.
 *
 * @param text - Heading label.
 * @param index - Occurrence index among all headings.
 * @returns DOM-safe id string.
 */
function headingId(text: string, index: number): string {
  const slug = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 64)
  return `${slug || 'heading'}_${index}`
}

/**
 * Extract heading elements from a rendered editor surface.
 *
 * @param contentElement - Editor content root (wysiwyg/ir).
 * @returns Outline heading list.
 */
/**
 * Compare two outline lists for equality (id, level, text).
 *
 * @param a - Previous headings.
 * @param b - Next headings.
 * @returns True when every entry matches.
 */
export function outlineHeadingsEqual(
  a: OutlineHeading[],
  b: OutlineHeading[],
): boolean {
  if (a.length !== b.length) {
    return false
  }
  return a.every(
    (heading, index) =>
      heading.id === b[index].id &&
      heading.level === b[index].level &&
      heading.text === b[index].text,
  )
}

export function extractOutlineHeadings(
  contentElement: HTMLElement,
): OutlineHeading[] {
  const headings: OutlineHeading[] = []
  const seen = new Set<string>()
  contentElement
    .querySelectorAll<HTMLHeadingElement>(
      'h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]',
    )
    .forEach((heading) => {
      const text = heading.textContent?.trim()
      if (!text || !heading.id) {
        return
      }
      // Skip transient duplicate ids during live DOM updates (invalid HTML).
      if (seen.has(heading.id)) {
        return
      }
      seen.add(heading.id)
      headings.push({
        id: heading.id,
        level: Number(heading.tagName.substring(1)),
        text,
      })
    })
  return headings
}

/**
 * Extract ATX headings from raw Markdown (source mode).
 *
 * @param markdown - Full markdown document.
 * @returns Outline heading list with synthetic ids.
 */
export function extractOutlineFromMarkdown(markdown: string): OutlineHeading[] {
  const headings: OutlineHeading[] = []
  const lines = markdown.split(/\r?\n/)
  let inFence = false

  lines.forEach((line) => {
    if (line.trim().startsWith('```') || line.trim().startsWith('~~~')) {
      inFence = !inFence
      return
    }
    if (inFence) {
      return
    }
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (!match) {
      return
    }
    const text = match[2].trim()
    if (!text) {
      return
    }
    headings.push({
      id: headingId(text, headings.length),
      level: match[1].length,
      text,
    })
  })

  return headings
}
