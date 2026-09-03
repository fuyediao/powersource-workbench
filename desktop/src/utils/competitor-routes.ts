/**
 * Path parsers for Admin competitor list / shop / line routes.
 */

const LIST_PATH = '/admin/competitor-list'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

const SHOP_RE = new RegExp(`^/admin/competitor-list/shops/(${UUID})$`, 'i')
const LINE_RE = new RegExp(
  `^/admin/competitor-list/shops/(${UUID})/lines/(${UUID}|new)$`,
  'i',
)

/** Create form under `/admin/competitor-list/shops/new`. */
export type CompetitorShopFormRoute = { kind: 'form' }

/** Shop detail for a shop uuid. */
export type CompetitorShopRoute = { kind: 'shop'; shopId: string }

/** Line detail (or create) under a shop. */
export type CompetitorLineRoute = {
  kind: 'line'
  shopId: string
  /** Null when creating a new line. */
  lineId: string | null
}

/** Any drill-down route that slides over the list. */
export type CompetitorDrillRoute =
  | CompetitorShopFormRoute
  | CompetitorShopRoute
  | CompetitorLineRoute

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
 * Builds the competitor list path.
 * @returns `/admin/competitor-list`.
 */
export function competitorListPath(): string {
  return LIST_PATH
}

/**
 * Builds the competitor shop create path.
 * @returns `/admin/competitor-list/shops/new`.
 */
export function competitorShopCreatePath(): string {
  return `${LIST_PATH}/shops/new`
}

/**
 * Builds a competitor shop detail path.
 * @param shopId - Shop uuid.
 * @returns Shop detail path.
 */
export function competitorShopPath(shopId: string): string {
  return `${LIST_PATH}/shops/${shopId}`
}

/**
 * Builds a competitor line detail (or create) path.
 * @param shopId - Shop uuid.
 * @param lineId - Line uuid, or null for the create form.
 * @returns Line path.
 */
export function competitorLinePath(
  shopId: string,
  lineId: string | null,
): string {
  return `${LIST_PATH}/shops/${shopId}/lines/${lineId ?? 'new'}`
}

/**
 * Parses any competitor drill-down route.
 * @param path - Shell active path.
 * @returns Drill route, or null for the list.
 */
export function parseCompetitorDrillPath(
  path: string | null,
): CompetitorDrillRoute | null {
  const normalized = normalizePath(path)
  if (!normalized) {
    return null
  }
  if (normalized === `${LIST_PATH}/shops/new`) {
    return { kind: 'form' }
  }
  const lineMatch = LINE_RE.exec(normalized)
  if (lineMatch?.[1] && lineMatch[2]) {
    return {
      kind: 'line',
      shopId: lineMatch[1],
      lineId: lineMatch[2].toLowerCase() === 'new' ? null : lineMatch[2],
    }
  }
  const shopMatch = SHOP_RE.exec(normalized)
  if (shopMatch?.[1]) {
    return { kind: 'shop', shopId: shopMatch[1] }
  }
  return null
}

/**
 * Returns whether two drill routes point at the same target.
 * @param a - Previous route.
 * @param b - Next route.
 * @returns True when kind and ids match.
 */
export function sameCompetitorDrillRoute(
  a: CompetitorDrillRoute | null,
  b: CompetitorDrillRoute | null,
): boolean {
  if (a === null || b === null) {
    return a === b
  }
  if (a.kind !== b.kind) {
    return false
  }
  if (a.kind === 'shop' && b.kind === 'shop') {
    return a.shopId === b.shopId
  }
  if (a.kind === 'line' && b.kind === 'line') {
    return a.shopId === b.shopId && a.lineId === b.lineId
  }
  return true
}
