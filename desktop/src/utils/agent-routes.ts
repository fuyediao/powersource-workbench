/**
 * Path parsers for Admin agent list / company detail / sales-rep routes.
 */

const LIST_PATH = '/admin/agent'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

const COMPANY_RE = new RegExp(`^/admin/agent/(${UUID})$`, 'i')
const SALES_REP_RE = new RegExp(
  `^/admin/agent/(${UUID})/sales-reps/(${UUID}|new)$`,
  'i',
)

/** Create form under `/admin/agent/new`. */
export type AgentFormRoute = { kind: 'form' }

/** Company detail for a company uuid. */
export type AgentCompanyRoute = { kind: 'company'; companyId: string }

/** Sales-rep detail (or create) under a company. */
export type AgentSalesRepRoute = {
  kind: 'salesRep'
  companyId: string
  /** Null when creating a new rep. */
  repId: string | null
}

/** Any drill-down route that slides over the list. */
export type AgentDrillRoute =
  | AgentFormRoute
  | AgentCompanyRoute
  | AgentSalesRepRoute

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
 * Builds the agent list path.
 * @returns `/admin/agent`.
 */
export function agentsListPath(): string {
  return LIST_PATH
}

/**
 * Builds the agent create path.
 * @returns `/admin/agent/new`.
 */
export function agentCreatePath(): string {
  return `${LIST_PATH}/new`
}

/**
 * Builds a company detail path.
 * @param companyId - Company uuid.
 * @returns `/admin/agent/:companyId`.
 */
export function agentCompanyPath(companyId: string): string {
  return `${LIST_PATH}/${companyId}`
}

/**
 * Builds a sales-rep detail (or create) path.
 * @param companyId - Company uuid.
 * @param repId - Rep uuid, or null for the create form.
 * @returns Sales-rep path.
 */
export function agentSalesRepPath(
  companyId: string,
  repId: string | null,
): string {
  return `${LIST_PATH}/${companyId}/sales-reps/${repId ?? 'new'}`
}

/**
 * Parses any agent drill-down route.
 * @param path - Shell active path.
 * @returns Drill route, or null for the list.
 */
export function parseAgentDrillPath(path: string | null): AgentDrillRoute | null {
  const normalized = normalizePath(path)
  if (!normalized) {
    return null
  }
  if (normalized === `${LIST_PATH}/new`) {
    return { kind: 'form' }
  }
  const repMatch = SALES_REP_RE.exec(normalized)
  if (repMatch?.[1] && repMatch[2]) {
    return {
      kind: 'salesRep',
      companyId: repMatch[1],
      repId: repMatch[2].toLowerCase() === 'new' ? null : repMatch[2],
    }
  }
  const companyMatch = COMPANY_RE.exec(normalized)
  if (companyMatch?.[1]) {
    return { kind: 'company', companyId: companyMatch[1] }
  }
  return null
}

/**
 * Returns whether two drill routes point at the same target.
 * @param a - Previous route.
 * @param b - Next route.
 * @returns True when kind and ids match.
 */
export function sameAgentDrillRoute(
  a: AgentDrillRoute | null,
  b: AgentDrillRoute | null,
): boolean {
  if (a === null || b === null) {
    return a === b
  }
  if (a.kind !== b.kind) {
    return false
  }
  if (a.kind === 'company' && b.kind === 'company') {
    return a.companyId === b.companyId
  }
  if (a.kind === 'salesRep' && b.kind === 'salesRep') {
    return a.companyId === b.companyId && a.repId === b.repId
  }
  return true
}
