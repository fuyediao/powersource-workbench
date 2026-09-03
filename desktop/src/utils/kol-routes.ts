/**
 * Path parsers for Admin KOL list / detail / create routes.
 * Edit happens in-place on the detail pane (Vue parity).
 */

const LIST_PATH = '/admin/kol'

const KOL_UUID_RE =
  /^\/admin\/kol\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

/** Create form under `/admin/kol/new`. */
export type KolFormRoute = { kind: 'form' }

/** Read-only / in-place-edit detail for a KOL uuid. */
export type KolDetailRoute = { kind: 'detail'; kolId: string }

/** Any drill-down route that slides over the list. */
export type KolDrillRoute = KolFormRoute | KolDetailRoute

/**
 * Normalizes a shell path (strips query, hash, and trailing slashes).
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
 * Builds the KOL list path.
 * @returns `/admin/kol`.
 */
export function kolsListPath(): string {
  return LIST_PATH
}

/**
 * Builds the KOL create path.
 * @returns `/admin/kol/new`.
 */
export function kolCreatePath(): string {
  return `${LIST_PATH}/new`
}

/**
 * Builds a KOL detail path.
 * @param kolId - KOL uuid.
 * @returns `/admin/kol/:id`.
 */
export function kolDetailPath(kolId: string): string {
  return `${LIST_PATH}/${kolId}`
}

/**
 * Parses any KOL drill-down (detail or create form).
 * @param path - Shell active path.
 * @returns Drill route, or null for the list.
 */
export function parseKolDrillPath(path: string | null): KolDrillRoute | null {
  const normalized = normalizePath(path)
  if (!normalized) {
    return null
  }
  if (normalized === `${LIST_PATH}/new`) {
    return { kind: 'form' }
  }
  const match = KOL_UUID_RE.exec(normalized)
  if (match?.[1]) {
    return { kind: 'detail', kolId: match[1] }
  }
  return null
}

/**
 * Returns whether two drill routes point at the same target.
 * @param a - Previous route.
 * @param b - Next route.
 * @returns True when kind and id match.
 */
export function sameKolDrillRoute(
  a: KolDrillRoute | null,
  b: KolDrillRoute | null,
): boolean {
  if (a === null || b === null) {
    return a === b
  }
  if (a.kind !== b.kind) {
    return false
  }
  if (a.kind === 'detail' && b.kind === 'detail') {
    return a.kolId === b.kolId
  }
  return true
}
