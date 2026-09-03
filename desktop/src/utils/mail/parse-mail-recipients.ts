import type { MailAddress } from '@/types/mail'

/**
 * Splits a To/Cc/Bcc field on commas, ignoring commas inside quotes or angles.
 * @param raw - Full recipient field.
 * @returns Non-empty segments.
 */
export function splitRecipientList(raw: string): string[] {
  const text = raw.trim()
  if (!text) {
    return []
  }
  const parts: string[] = []
  let start = 0
  let inQuotes = false
  let angleDepth = 0
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (inQuotes) {
      continue
    }
    if (ch === '<') {
      angleDepth += 1
    } else if (ch === '>') {
      angleDepth = Math.max(0, angleDepth - 1)
    } else if (ch === ',' && angleDepth === 0) {
      const seg = text.slice(start, i).trim()
      if (seg.length > 0) {
        parts.push(seg)
      }
      start = i + 1
    }
  }
  const last = text.slice(start).trim()
  if (last.length > 0) {
    parts.push(last)
  }
  return parts
}

/**
 * Parses one recipient segment into an address.
 * @param segment - Single To/Cc token.
 * @returns Address, or null when invalid.
 */
export function parseMailAddressSegment(segment: string): MailAddress | null {
  const text = segment.trim()
  if (!text) {
    return null
  }
  const quoted = /^"(.+)"\s*<([^>]+)>$/.exec(text)
  if (quoted) {
    const email = quoted[2].trim()
    const name = quoted[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim()
    if (email) {
      return { email, name: name || undefined }
    }
  }
  const angle = /^(.+?)\s*<([^>]+)>$/.exec(text)
  if (angle) {
    const maybeName = angle[1].trim().replace(/^"|"$/g, '')
    const email = angle[2].trim()
    if (email) {
      return { email, name: maybeName || undefined }
    }
  }
  const emailOnly = text.replace(/^mailto:/i, '').trim()
  if (/^[^\s<>]+@[^\s<>]+$/.test(emailOnly)) {
    return { email: emailOnly }
  }
  return null
}

/**
 * Parses a comma-separated recipient line.
 * @param raw - To / Cc / Bcc field.
 * @returns Valid addresses only.
 */
export function parseCommaSeparatedMailAddresses(raw: string): MailAddress[] {
  return splitRecipientList(raw)
    .map(parseMailAddressSegment)
    .filter((row): row is MailAddress => row != null)
}

/**
 * Formats a From header for a reply To field.
 * @param name - Display name.
 * @param email - Address.
 * @returns `Name <email>` or email alone.
 */
export function formatReplyAddress(name: string | null, email: string): string {
  const trimmed = email.trim()
  if (!trimmed) {
    return ''
  }
  if (name && name.trim() && name.trim() !== trimmed) {
    return `${name.trim()} <${trimmed}>`
  }
  return trimmed
}

/**
 * Escapes text for a simple HTML mail body.
 * @param text - Plain text.
 * @returns HTML fragment.
 */
export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/**
 * Wraps plain compose text as simple HTML paragraphs.
 * @param text - Plain body.
 * @returns HTML string.
 */
export function plainTextToMailHtml(text: string): string {
  const blocks = text.split(/\n{2,}/)
  return blocks
    .map((block) => `<p>${escapeHtml(block).replaceAll('\n', '<br>')}</p>`)
    .join('')
}
