/**
 * Path parsers for T&E Admin community-user list / detail routes.
 */

const LIST_PATH = '/te-admin/users'

const USER_UUID_RE =
  /^\/te-admin\/users\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

/** Read-only / in-place-edit detail for a community account uuid. */
export type TeUserDetailRoute = {
  kind: 'detail'
  userId: string
  /** Optional `?tab=` query value. */
  tab: string | null
}

/** Any drill-down route that slides over the users list. */
export type TeUserDrillRoute = TeUserDetailRoute

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
 * Builds the T&E users list path.
 *
 * @returns `/te-admin/users`.
 */
export function teUsersListPath(): string {
  return LIST_PATH
}

/**
 * Builds a T&E user detail path.
 *
 * @param userId - Community account uuid.
 * @param tab - Optional detail tab query.
 * @returns `/te-admin/users/:id` with optional `?tab=`.
 */
export function teUserDetailPath(userId: string, tab?: string | null): string {
  const base = `${LIST_PATH}/${userId}`
  const trimmed = tab?.trim() ?? ''
  return trimmed ? `${base}?tab=${encodeURIComponent(trimmed)}` : base
}

/**
 * Parses any T&E user drill-down (detail).
 *
 * @param path - Shell active path.
 * @returns Drill route, or null for the list.
 */
export function parseTeUserDrillPath(path: string | null): TeUserDrillRoute | null {
  const normalized = normalizePath(path)
  if (!normalized) {
    return null
  }
  const match = USER_UUID_RE.exec(normalized)
  if (match?.[1]) {
    return { kind: 'detail', userId: match[1], tab: parseTabQuery(path) }
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
export function sameTeUserDrillRoute(
  a: TeUserDrillRoute | null,
  b: TeUserDrillRoute | null,
): boolean {
  if (a === null || b === null) {
    return a === b
  }
  return a.kind === 'detail' && b.kind === 'detail' && a.userId === b.userId
}
