/**
 * Path parsers for T&E Admin application list / detail routes.
 */

const LIST_PATH = '/te-admin'

const APPLICATION_UUID_RE =
  /^\/te-admin\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

/** Read-only / in-place-edit detail for a T&E submission uuid. */
export type TeApplicationDetailRoute = { kind: 'detail'; submissionId: string }

/** Any drill-down route that slides over the applications list. */
export type TeApplicationDrillRoute = TeApplicationDetailRoute

/**
 * Normalizes a shell path (strips query, hash, and trailing slashes).
 *
 * @param path - Raw path.
 * @returns Normalized path or empty string.
 */
function normalizePath(path: string | null): string {
  if (!path) {
    return ''
  }
  const noHash = path.split('#')[0] ?? path
  const noQuery = noHash.split('?')[0] ?? noHash
  return noQuery.replace(/\/+$/, '') || '/'
}

/**
 * Builds the T&E applications list path.
 *
 * @returns `/te-admin`.
 */
export function teApplicationsListPath(): string {
  return LIST_PATH
}

/**
 * Builds a T&E application detail path.
 *
 * @param submissionId - Submission uuid.
 * @returns `/te-admin/:id`.
 */
export function teApplicationDetailPath(submissionId: string): string {
  return `${LIST_PATH}/${submissionId}`
}

/**
 * Parses any T&E application drill-down (detail).
 *
 * @param path - Shell active path.
 * @returns Drill route, or null for the list.
 */
export function parseTeApplicationDrillPath(
  path: string | null,
): TeApplicationDrillRoute | null {
  const normalized = normalizePath(path)
  if (!normalized) {
    return null
  }
  const match = APPLICATION_UUID_RE.exec(normalized)
  if (match?.[1]) {
    return { kind: 'detail', submissionId: match[1] }
  }
  return null
}

/**
 * Returns whether two drill routes point at the same target.
 *
 * @param a - Previous route.
 * @param b - Next route.
 * @returns True when kind and id match.
 */
export function sameTeApplicationDrillRoute(
  a: TeApplicationDrillRoute | null,
  b: TeApplicationDrillRoute | null,
): boolean {
  if (a === null || b === null) {
    return a === b
  }
  return a.kind === 'detail' && b.kind === 'detail' && a.submissionId === b.submissionId
}
