/**
 * Path parsers for T&E Admin community-post list / detail routes.
 */

const LIST_PATH = '/te-admin/community'

const POST_UUID_RE =
  /^\/te-admin\/community\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

/** Read-only / in-place-edit detail for a community post uuid. */
export type TeCommunityDetailRoute = {
  kind: 'detail'
  postId: string
  /** Optional `?tab=` query value. */
  tab: string | null
}

/** Any drill-down route that slides over the community list. */
export type TeCommunityDrillRoute = TeCommunityDetailRoute

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
 * Reads an optional `tab` query parameter from a shell path.
 *
 * @param path - Raw path (may include query/hash).
 * @returns Trimmed tab value, or null.
 */
function parseTabQuery(path: string | null): string | null {
  if (!path) {
    return null
  }
  const noHash = path.split('#')[0] ?? path
  const qIndex = noHash.indexOf('?')
  if (qIndex < 0) {
    return null
  }
  const params = new URLSearchParams(noHash.slice(qIndex + 1))
  const tab = params.get('tab')?.trim() ?? ''
  return tab.length > 0 ? tab : null
}

/**
 * Builds the T&E community list path.
 *
 * @returns `/te-admin/community`.
 */
export function teCommunityListPath(): string {
  return LIST_PATH
}

/**
 * Builds a T&E community post detail path.
 *
 * @param postId - Post uuid.
 * @param tab - Optional detail tab query.
 * @returns `/te-admin/community/:id` with optional `?tab=`.
 */
export function teCommunityDetailPath(postId: string, tab?: string | null): string {
  const base = `${LIST_PATH}/${postId}`
  const trimmed = tab?.trim() ?? ''
  return trimmed ? `${base}?tab=${encodeURIComponent(trimmed)}` : base
}

/**
 * Parses any T&E community drill-down (detail).
 *
 * @param path - Shell active path.
 * @returns Drill route, or null for the list.
 */
export function parseTeCommunityDrillPath(
  path: string | null,
): TeCommunityDrillRoute | null {
  const normalized = normalizePath(path)
  if (!normalized) {
    return null
  }
  const match = POST_UUID_RE.exec(normalized)
  if (match?.[1]) {
    return { kind: 'detail', postId: match[1], tab: parseTabQuery(path) }
  }
  return null
}

/**
 * Returns whether two drill routes point at the same target.
 * Tab query changes do not count as a different drill.
 *
 * @param a - Previous route.
 * @param b - Next route.
 * @returns True when kind and id match.
 */
export function sameTeCommunityDrillRoute(
  a: TeCommunityDrillRoute | null,
  b: TeCommunityDrillRoute | null,
): boolean {
  if (a === null || b === null) {
    return a === b
  }
  return a.kind === 'detail' && b.kind === 'detail' && a.postId === b.postId
}
