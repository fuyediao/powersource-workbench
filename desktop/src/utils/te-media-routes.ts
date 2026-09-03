/**
 * Path parsers for T&E Admin shared-media list / detail routes.
 */

const LIST_PATH = '/te-admin/media'

const GROUP_UUID_RE =
  /^\/te-admin\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

/** Detail for a shared-media group uuid. */
export type TeMediaDetailRoute = { kind: 'detail'; groupId: string }

/** Any drill-down route that slides over the media list. */
export type TeMediaDrillRoute = TeMediaDetailRoute

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
 * Builds the T&E media list path.
 *
 * @returns `/te-admin/media`.
 */
export function teMediaListPath(): string {
  return LIST_PATH
}

/**
 * Builds a T&E media group detail path.
 *
 * @param groupId - Shared-media group uuid.
 * @returns `/te-admin/media/:groupId`.
 */
export function teMediaDetailPath(groupId: string): string {
  return `${LIST_PATH}/${groupId}`
}

/**
 * Parses any T&E media drill-down (detail).
 *
 * @param path - Shell active path.
 * @returns Drill route, or null for the list.
 */
export function parseTeMediaDrillPath(path: string | null): TeMediaDrillRoute | null {
  const normalized = normalizePath(path)
  if (!normalized) {
    return null
  }
  const match = GROUP_UUID_RE.exec(normalized)
  if (match?.[1]) {
    return { kind: 'detail', groupId: match[1] }
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
export function sameTeMediaDrillRoute(
  a: TeMediaDrillRoute | null,
  b: TeMediaDrillRoute | null,
): boolean {
  if (a === null || b === null) {
    return a === b
  }
  return a.kind === 'detail' && b.kind === 'detail' && a.groupId === b.groupId
}
