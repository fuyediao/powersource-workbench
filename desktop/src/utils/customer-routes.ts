/**
 * Path parsers for Admin customers list / detail / create routes.
 * Edit happens in-place on the detail pane (Vue parity); there is no `/:id/edit` form page.
 */

const CUSTOMER_UUID_RE =
  /^\/admin\/customers\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

const CUSTOMER_EDIT_RE =
  /^\/admin\/customers\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/edit$/i

/** Create form under `/admin/customers/new` only. */
export type CustomerFormRoute = { kind: 'form'; mode: 'create'; customerId: null }

/** Read-only / in-place-edit detail for a customer UUID. */
export type CustomerDetailRoute = { kind: 'detail'; customerId: string }

/** Any drill-down route that slides over the list. */
export type CustomerDrillRoute = CustomerFormRoute | CustomerDetailRoute

/**
 * Detail path for a customer uuid.
 * @param customerId - Customer uuid.
 * @returns Admin shell path.
 */
export function customerDetailPath(customerId: string): string {
  return `/admin/customers/${customerId}`
}
/**
 * Normalizes a shell path (strips trailing slashes).
 * @param path - Raw path.
 * @returns Normalized path or empty.
 */
function normalizePath(path: string | null): string {
  if (!path) {
    return ''
  }
  return path.replace(/\/+$/, '') || '/'
}

/**
 * Parses the create form path (`/admin/customers/new`).
 * @param path - Shell active path.
 * @returns Create form route, or null.
 */
export function parseCustomerFormPath(path: string | null): CustomerFormRoute | null {
  const normalized = normalizePath(path)
  if (!normalized) {
    return null
  }
  if (normalized === '/admin/customers/new') {
    return { kind: 'form', mode: 'create', customerId: null }
  }
  return null
}

/**
 * Parses customer detail path (`/admin/customers/:uuid`).
 * Legacy `/:uuid/edit` is treated as detail (in-place edit on the detail pane).
 * @param path - Shell active path.
 * @returns Detail route, or null.
 */
export function parseCustomerDetailPath(path: string | null): CustomerDetailRoute | null {
  const normalized = normalizePath(path)
  if (!normalized) {
    return null
  }
  const editMatch = CUSTOMER_EDIT_RE.exec(normalized)
  if (editMatch?.[1]) {
    return { kind: 'detail', customerId: editMatch[1] }
  }
  const match = CUSTOMER_UUID_RE.exec(normalized)
  if (match?.[1]) {
    return { kind: 'detail', customerId: match[1] }
  }
  return null
}

/**
 * Parses any customers drill-down (detail or create form).
 * @param path - Shell active path.
 * @returns Drill route, or null for the list.
 */
export function parseCustomerDrillPath(path: string | null): CustomerDrillRoute | null {
  return parseCustomerFormPath(path) ?? parseCustomerDetailPath(path)
}

/**
 * Returns whether two drill routes are the same target.
 * @param a - Previous route.
 * @param b - Next route.
 * @returns True when kind/mode/id match.
 */
export function sameCustomerDrillRoute(
  a: CustomerDrillRoute | null,
  b: CustomerDrillRoute | null,
): boolean {
  if (a === null || b === null) {
    return a === b
  }
  if (a.kind !== b.kind) {
    return false
  }
  if (a.kind === 'detail' && b.kind === 'detail') {
    return a.customerId === b.customerId
  }
  if (a.kind === 'form' && b.kind === 'form') {
    return a.mode === b.mode && a.customerId === b.customerId
  }
  return false
}
