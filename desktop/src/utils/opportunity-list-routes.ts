/**
 * Path parsers for the Admin Opportunities **list** (`/admin/opportunities-list`).
 * Edit happens in-place on the detail pane (Vue parity). The Freeform board
 * lives under the Kanban Function at `/kanban/opportunities`.
 */

const LIST_PATH = '/admin/opportunities-list'

const OPPORTUNITY_UUID_RE =
  /^\/admin\/opportunities-list\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

/** Create form under `/admin/opportunities-list/new`. */
export type OpportunityFormRoute = { kind: 'form' }

/** Read-only / in-place-edit detail for an opportunity uuid. */
export type OpportunityDetailRoute = { kind: 'detail'; opportunityId: string }

/** Any drill-down route that slides over the list. */
export type OpportunityDrillRoute = OpportunityFormRoute | OpportunityDetailRoute

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
 * Builds the opportunities list path.
 * @returns `/admin/opportunities-list`.
 */
export function opportunitiesListPath(): string {
  return LIST_PATH
}

/**
 * Builds the opportunity create path.
 * @returns `/admin/opportunities-list/new`.
 */
export function opportunityCreatePath(): string {
  return `${LIST_PATH}/new`
}

/**
 * Builds an opportunity detail path.
 * @param opportunityId - Opportunity uuid.
 * @returns `/admin/opportunities-list/:id`.
 */
export function opportunityDetailPath(opportunityId: string): string {
  return `${LIST_PATH}/${opportunityId}`
}

/**
 * Whether a path belongs to the Admin opportunities list (list, create, or detail).
 * @param path - Candidate path.
 * @returns True for `/admin/opportunities-list` and nested routes.
 */
export function isOpportunityListPath(path: string): boolean {
  const normalized = normalizePath(path)
  return normalized === LIST_PATH || normalized.startsWith(`${LIST_PATH}/`)
}

/**
 * Parses any opportunity drill-down (detail or create form).
 * @param path - Shell active path.
 * @returns Drill route, or null for the list.
 */
export function parseOpportunityDrillPath(path: string | null): OpportunityDrillRoute | null {
  const normalized = normalizePath(path)
  if (!normalized) {
    return null
  }
  if (normalized === `${LIST_PATH}/new`) {
    return { kind: 'form' }
  }
  const match = OPPORTUNITY_UUID_RE.exec(normalized)
  if (match?.[1]) {
    return { kind: 'detail', opportunityId: match[1] }
  }
  return null
}

/**
 * Returns whether two drill routes point at the same target.
 * @param a - Previous route.
 * @param b - Next route.
 * @returns True when kind and id match.
 */
export function sameOpportunityDrillRoute(
  a: OpportunityDrillRoute | null,
  b: OpportunityDrillRoute | null,
): boolean {
  if (a === null || b === null) {
    return a === b
  }
  if (a.kind !== b.kind) {
    return false
  }
  if (a.kind === 'detail' && b.kind === 'detail') {
    return a.opportunityId === b.opportunityId
  }
  return true
}
