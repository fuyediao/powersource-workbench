/** Names commonly embedded in OLE containers rather than user-authored content. */
const OLE_METADATA_NAMES = new Set([
  'CompObj',
  'Current User',
  'DocumentSummaryInformation',
  'PowerPoint Document',
  'SummaryInformation',
  'WordDocument',
])

/**
 * Normalizes candidate legacy Office text and removes container metadata.
 * @param value - Decoded candidate string.
 * @returns Cleaned user-facing lines.
 */
function normalizeCandidate(value: string): string[] {
  return value
    .replaceAll('\u0000', '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) =>
      Array.from(line)
        .filter((character) => {
          const codePoint = character.charCodeAt(0)
          return codePoint === 0x09 || codePoint >= 0x20
        })
        .join('')
        .trim(),
    )
    .filter((line) => line.length >= 2 && !OLE_METADATA_NAMES.has(line))
}

/**
 * Extracts readable text runs from legacy OLE Office payloads. This is a
 * compatibility fallback for binary DOC/PPT files; modern OOXML files use the
 * structured importers instead.
 * @param buffer - Legacy Office file bytes.
 * @returns Deduplicated readable lines in source order.
 */
export function extractLegacyOfficeText(buffer: ArrayBuffer): string[] {
  const bytes = new Uint8Array(buffer)
  const candidates: string[] = []
  let asciiStart = -1

  for (let index = 0; index <= bytes.length; index += 1) {
    const value = bytes[index]
    const printable =
      index < bytes.length &&
      (value === 0x09 || value === 0x0a || value === 0x0d || (value >= 0x20 && value <= 0x7e))
    if (printable && asciiStart < 0) {
      asciiStart = index
    } else if (!printable && asciiStart >= 0) {
      if (index - asciiStart >= 4) {
        candidates.push(new TextDecoder('windows-1252').decode(bytes.slice(asciiStart, index)))
      }
      asciiStart = -1
    }
  }

  for (const offset of [0, 1]) {
    let text = ''
    for (let index = offset; index + 1 < bytes.length; index += 2) {
      const codePoint = bytes[index] | (bytes[index + 1] << 8)
      const printable =
        codePoint === 0x09 ||
        codePoint === 0x0a ||
        codePoint === 0x0d ||
        (codePoint >= 0x20 && codePoint !== 0xffff)
      if (printable) {
        text += String.fromCharCode(codePoint)
      } else {
        if (text.length >= 4) {
          candidates.push(text)
        }
        text = ''
      }
    }
    if (text.length >= 4) {
      candidates.push(text)
    }
  }

  const seen = new Set<string>()
  const lines: string[] = []
  for (const candidate of candidates) {
    for (const line of normalizeCandidate(candidate)) {
      if (seen.has(line)) {
        continue
      }
      seen.add(line)
      lines.push(line)
      if (lines.length >= 500) {
        return lines
      }
    }
  }
  return lines
}
