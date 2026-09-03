/**
 * Path helpers for Admin visit-log list / detail / create routes.
 */

const VISIT_LOG_UUID_RE =
  /^\/admin\/visit-log\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

/** Create form under `/admin/visit-log/new`. */
export type VisitLogFormRoute = { kind: 'form' }

/** Detail / edit for a visit log UUID. */
export type VisitLogDetailRoute = { kind: 'detail'; visitLogId: string }

/** Any drill-down route that slides over the list. */
export type VisitLogDrillRoute = VisitLogFormRoute | VisitLogDetailRoute

/**
 * Normalizes a shell path (strips query, hash, and trailing slashes).
 * @param path - Raw path.
 * @returns Normalized path.
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
 * Parses the query string from a shell path (hash stripped first).
 * @param path - Raw path that may include `?query`.
 * @returns Search params.
 */
export function parseVisitLogSearchParams(path: string | null): URLSearchParams {
  if (!path) {
    return new URLSearchParams()
  }
  const noHash = path.split('#')[0] ?? path
  const qIndex = noHash.indexOf('?')
  if (qIndex < 0) {
    return new URLSearchParams()
  }
  return new URLSearchParams(noHash.slice(qIndex + 1))
}

/**
 * True when `returnTo` is a same-app Admin path (no protocol-relative `//`).
 * @param value - Candidate path (query is ignored).
 * @returns Whether navigation is allowed.
 */
export function isSafeAdminReturnTo(value: string): boolean {
  const pathOnly = value.split('?')[0] ?? value
  return pathOnly.startsWith('/admin/') && !pathOnly.includes('//')
}

/**
 * Reads a safe `returnTo` query from a visit-log path.
 * @param path - Shell path with optional query.
 * @returns In-app Admin path, or null.
 */
export function visitLogReturnTo(path: string | null): string | null {
  const raw = parseVisitLogSearchParams(path).get('returnTo')
  if (!raw || !isSafeAdminReturnTo(raw)) {
    return null
  }
  return raw
}

/**
 * Reads `kolId` from a visit-log create path query.
 * @param path - Shell path with optional query.
 * @returns KOL uuid, or null.
 */
export function visitLogKolIdQuery(path: string | null): string | null {
  const raw = parseVisitLogSearchParams(path).get('kolId')?.trim() ?? ''
  return raw || null
}

/**
 * Reads `customerId` from a visit-log create path query.
 * @param path - Shell path with optional query.
 * @returns Customer uuid, or null.
 */
export function visitLogCustomerIdQuery(path: string | null): string | null {
  const raw = parseVisitLogSearchParams(path).get('customerId')?.trim() ?? ''
  return raw || null
}

/**
 * Parses create path.
 * @param path - Shell path.
 * @returns Form route or null.
 */
export function parseVisitLogFormPath(path: string | null): VisitLogFormRoute | null {
  if (normalizePath(path) === '/admin/visit-log/new') {
    return { kind: 'form' }
  }
  return null
}

/**
 * Parses detail path.
 * @param path - Shell path.
 * @returns Detail route or null.
 */
export function parseVisitLogDetailPath(path: string | null): VisitLogDetailRoute | null {
  const match = VISIT_LOG_UUID_RE.exec(normalizePath(path))
  if (match?.[1]) {
    return { kind: 'detail', visitLogId: match[1] }
  }
  return null
}

/**
 * Parses any visit-log drill-down.
 * @param path - Shell path.
 * @returns Drill route or null for the list.
 */
export function parseVisitLogDrillPath(path: string | null): VisitLogDrillRoute | null {
  return parseVisitLogFormPath(path) ?? parseVisitLogDetailPath(path)
}

/**
 * Whether two drill routes are the same screen.
 * @param a - Previous.
 * @param b - Next.
 * @returns Equality.
 */
export function sameVisitLogDrillRoute(
  a: VisitLogDrillRoute | null,
  b: VisitLogDrillRoute | null,
): boolean {
  if (a === null || b === null) {
    return a === b
  }
  if (a.kind !== b.kind) {
    return false
  }
  if (a.kind === 'form' && b.kind === 'form') {
    return true
  }
  return a.kind === 'detail' && b.kind === 'detail' && a.visitLogId === b.visitLogId
}
