import type { OfficeFeatureId } from '@/constants/office-folder'

/** One successful `open_office_file` result ready for the Office utility page. */
export interface HarnessOfficeOpenResult {
  fileId: string
  kind: OfficeFeatureId
}

/** Returns whether a string is an Office feature kind. */
function isOfficeKind(value: string): value is OfficeFeatureId {
  return value === 'docs' || value === 'sheets' || value === 'slides'
}

/**
 * Parses the JSON text returned by the first-party `open_office_file` tool.
 * @param value - Dynamic-tool result text.
 * @returns File identity for the embedded editor, or null for an error payload.
 */
export function parseHarnessOfficeOpenResult(value: string): HarnessOfficeOpenResult | null {
  if (!value.trim()) return null
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const row = parsed as Record<string, unknown>
    const fileId = typeof row.id === 'string' ? row.id.trim() : ''
    const kind = typeof row.kind === 'string' ? row.kind.trim() : ''
    if (!fileId || !isOfficeKind(kind)) return null
    return { fileId, kind }
  } catch {
    return null
  }
}
