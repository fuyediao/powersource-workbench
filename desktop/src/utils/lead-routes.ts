/**
 * Path parsers for Admin Leads list / detail / create routes.
 * Edit happens in-place on the detail pane (Vue parity).
 */

const LIST_PATH = '/admin/leads'

const LEAD_UUID_RE =
  /^\/admin\/leads\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

/** Create form under `/admin/leads/new`. */
export type LeadFormRoute = { kind: 'form' }

/** Read-only / in-place-edit detail for a lead uuid. */
export type LeadDetailRoute = { kind: 'detail'; leadId: string }

/** Any drill-down route that slides over the list. */
export type LeadDrillRoute = LeadFormRoute | LeadDetailRoute

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
 * Builds the leads list path.
 * @returns `/admin/leads`.
 */
export function leadsListPath(): string {
  return LIST_PATH
}

/**
 * Builds the lead create path.
 * @returns `/admin/leads/new`.
 */
export function leadCreatePath(): string {
  return `${LIST_PATH}/new`
}

/**
 * Builds a lead detail path.
 * @param leadId - Lead uuid.
 * @returns `/admin/leads/:id`.
 */
export function leadDetailPath(leadId: string): string {
  return `${LIST_PATH}/${leadId}`
}

/**
 * Parses any lead drill-down (detail or create form).
 * @param path - Shell active path.
 * @returns Drill route, or null for the list.
 */
export function parseLeadDrillPath(path: string | null): LeadDrillRoute | null {
  const normalized = normalizePath(path)
  if (!normalized) {
    return null
  }
  if (normalized === `${LIST_PATH}/new`) {
    return { kind: 'form' }
  }
  const match = LEAD_UUID_RE.exec(normalized)
  if (match?.[1]) {
    return { kind: 'detail', leadId: match[1] }
  }
  return null
}

/**
 * Returns whether two drill routes point at the same target.
 * @param a - Previous route.
 * @param b - Next route.
 * @returns True when kind and id match.
 */
export function sameLeadDrillRoute(
  a: LeadDrillRoute | null,
  b: LeadDrillRoute | null,
): boolean {
  if (a === null || b === null) {
    return a === b
  }
  if (a.kind !== b.kind) {
    return false
  }
  if (a.kind === 'detail' && b.kind === 'detail') {
    return a.leadId === b.leadId
  }
  return true
}
