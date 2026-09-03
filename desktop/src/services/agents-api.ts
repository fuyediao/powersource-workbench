/**
 * Agent (Sales Representative System) admin client for Electron.
 * Wraps the workbench-api `/proxy/admin/*` contracts used by workbench-web `proxyApi`.
 */

import { resolveApiBaseUrl } from '@/config/deployment-urls'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

/** Path prefix for proxy-worker routes on the unified workbench-api host. */
const PROXY_API_PREFIX = '/proxy'

/** Agent company profile (`proxy_agent_companies`). */
export interface AgentCompany {
  id: string
  groupId: string
  companyName: string
  shortName: string | null
  phone: string | null
  fax: string | null
  email: string | null
  website: string | null
  companyCountry: string | null
  companyState: string | null
  companyCity: string | null
  companyPostalCode: string | null
  companyAddressLine1: string | null
  companyAddressLine2: string | null
  taxId: string | null
  primaryContactName: string | null
  description: string | null
  createdAt: string
  updatedAt: string
}

/** Login account attached to a company (`proxy_agent_accounts`). */
export interface AgentAccount {
  id: string
  companyId: string
  loginUsername: string
  isActive: boolean
  customerIds: string[]
  /** Map of customer_id → assigned sales-rep account_id (or null). */
  customerRepAssignments: Record<string, string | null>
  /**
   * Present when {@link listAgents} merges the company name for display.
   */
  companyName?: string | null
}

/** Company plus its optional login account. */
export interface AgentDetail {
  company: AgentCompany
  account: AgentAccount | null
}

/** Sales rep profile joined with its login account. */
export interface AgentSalesRep {
  id: string
  companyId: string
  accountId: string | null
  loginUsername: string | null
  isActive: boolean | null
  fullName: string | null
  phone: string | null
  mobile: string | null
  email: string | null
  notes: string | null
  createdAt: string
}

/** Editable agent company fields. */
export interface AgentCompanyInput {
  companyName: string
  shortName: string | null
  phone: string | null
  fax: string | null
  email: string | null
  website: string | null
  companyCountry: string | null
  companyState: string | null
  companyCity: string | null
  companyPostalCode: string | null
  companyAddressLine1: string | null
  companyAddressLine2: string | null
  taxId: string | null
  primaryContactName: string | null
  description: string | null
}

/** Editable sales rep fields. */
export interface AgentSalesRepInput {
  fullName: string | null
  phone: string | null
  mobile: string | null
  email: string | null
  notes: string | null
}

/**
 * Whether workbench-api is configured for agent admin calls.
 * @returns True when the deployment domain is set.
 */
export function isAgentApiConfigured(): boolean {
  return Boolean(resolveApiBaseUrl())
}

/**
 * Supabase access token for authenticated workbench-api calls.
 * @returns Access token, or null when signed out.
 */
async function getToken(): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null
  }
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/**
 * Authenticated fetch to the proxy admin routes.
 * @param path - Relative path under `/proxy` (e.g. `/admin/companies`).
 * @param workspaceGroupId - Target `groups.id`.
 * @param init - Fetch init.
 * @returns Parsed JSON body.
 */
async function agentFetch<T>(
  path: string,
  workspaceGroupId: string,
  init: RequestInit = {},
): Promise<T> {
  const base = resolveApiBaseUrl()
  if (!base) {
    throw new Error('VITE_DEPLOYMENT_DOMAIN is not configured')
  }
  const fullPath = `${PROXY_API_PREFIX}${path}`
  const join = fullPath.includes('?') ? '&' : '?'
  const urlPath = `${fullPath}${join}workspace_group_id=${encodeURIComponent(workspaceGroupId)}`

  const token = await getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Workspace-Group-Id': workspaceGroupId,
    ...(init.headers as Record<string, string>),
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  let res: Response
  try {
    res = await fetch(`${base}${urlPath}`, { ...init, headers, mode: 'cors' })
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'Network error'
    throw new Error(`${reason}. Cannot reach workbench-api.`)
  }

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const message = body.error
    throw new Error(
      typeof message === 'string' ? message : `Request failed: ${res.status}`,
    )
  }
  return body as T
}

/**
 * Reads an optional string field from an API row.
 * @param value - Raw value.
 * @returns Trimmed string, or null.
 */
function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/**
 * Maps an API company row to {@link AgentCompany}.
 * @param raw - API row.
 * @returns Typed company.
 */
function mapCompany(raw: Record<string, unknown>): AgentCompany {
  return {
    id: String(raw.id ?? ''),
    groupId: String(raw.group_id ?? ''),
    companyName: String(raw.company_name ?? ''),
    shortName: textOrNull(raw.short_name),
    phone: textOrNull(raw.phone),
    fax: textOrNull(raw.fax),
    email: textOrNull(raw.email),
    website: textOrNull(raw.website),
    companyCountry: textOrNull(raw.company_country),
    companyState: textOrNull(raw.company_state),
    companyCity: textOrNull(raw.company_city),
    companyPostalCode: textOrNull(raw.company_postal_code),
    companyAddressLine1: textOrNull(raw.company_address_line1),
    companyAddressLine2: textOrNull(raw.company_address_line2),
    taxId: textOrNull(raw.tax_id),
    primaryContactName: textOrNull(raw.primary_contact_name),
    description: textOrNull(raw.description),
    createdAt: String(raw.created_at ?? ''),
    updatedAt: String(raw.updated_at ?? ''),
  }
}

/**
 * Parses `customer_rep_assignments` from an API account row.
 * @param raw - Unknown JSON value.
 * @returns Typed map (empty when missing).
 */
function mapRepAssignments(raw: unknown): Record<string, string | null> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const out: Record<string, string | null> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    out[key] = value == null ? null : String(value)
  }
  return out
}

/**
 * Maps an API account row to {@link AgentAccount}.
 * @param raw - API row, or null.
 * @returns Typed account, or null.
 */
function mapAccount(raw: unknown): AgentAccount | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const row = raw as Record<string, unknown>
  return {
    id: String(row.id ?? ''),
    companyId: String(row.company_id ?? ''),
    loginUsername: String(row.login_username ?? ''),
    isActive: Boolean(row.is_active),
    customerIds: Array.isArray(row.customer_ids)
      ? row.customer_ids.map((id) => String(id))
      : [],
    customerRepAssignments: mapRepAssignments(row.customer_rep_assignments),
    companyName: textOrNull(row.company_name),
  }
}

/**
 * Maps an API company detail payload.
 * @param raw - API row with `company` shape.
 * @returns Typed detail.
 */
function mapDetail(raw: Record<string, unknown>): AgentDetail {
  return {
    company: mapCompany((raw.company ?? {}) as Record<string, unknown>),
    account: mapAccount(raw.account),
  }
}

/**
 * Maps an API sales rep row.
 * @param raw - API row.
 * @returns Typed sales rep.
 */
function mapSalesRep(raw: Record<string, unknown>): AgentSalesRep {
  return {
    id: String(raw.id ?? ''),
    companyId: String(raw.company_id ?? ''),
    accountId: textOrNull(raw.account_id),
    loginUsername: textOrNull(raw.login_username),
    isActive: raw.is_active == null ? null : Boolean(raw.is_active),
    fullName: textOrNull(raw.full_name),
    phone: textOrNull(raw.phone),
    mobile: textOrNull(raw.mobile),
    email: textOrNull(raw.email),
    notes: textOrNull(raw.notes),
    createdAt: String(raw.created_at ?? ''),
  }
}

/**
 * Converts a company form model to the API payload.
 * @param input - Editable fields.
 * @returns snake_case payload.
 */
function companyPayload(input: AgentCompanyInput): Record<string, unknown> {
  return {
    company_name: input.companyName.trim(),
    short_name: input.shortName,
    phone: input.phone,
    fax: input.fax,
    email: input.email,
    website: input.website,
    company_country: input.companyCountry,
    company_state: input.companyState,
    company_city: input.companyCity,
    company_postal_code: input.companyPostalCode,
    company_address_line1: input.companyAddressLine1,
    company_address_line2: input.companyAddressLine2,
    tax_id: input.taxId,
    primary_contact_name: input.primaryContactName,
    description: input.description,
  }
}

/**
 * Lists agent companies for a workspace group.
 * @param workspaceGroupId - Target `groups.id`.
 * @returns Company details (with optional accounts).
 */
export async function listAgentCompanies(
  workspaceGroupId: string,
): Promise<AgentDetail[]> {
  const data = await agentFetch<{ companies?: Record<string, unknown>[] }>(
    '/admin/companies',
    workspaceGroupId,
  )
  return (data.companies ?? []).map((row) => mapDetail(row))
}

/**
 * Loads one agent company.
 * @param workspaceGroupId - Target `groups.id`.
 * @param companyId - Company uuid.
 * @returns Company detail.
 */
export async function getAgentCompany(
  workspaceGroupId: string,
  companyId: string,
): Promise<AgentDetail> {
  const data = await agentFetch<{ company?: Record<string, unknown> }>(
    `/admin/companies/${companyId}`,
    workspaceGroupId,
  )
  return mapDetail(data.company ?? {})
}

/**
 * Creates an agent company (profile only; login comes later).
 * @param workspaceGroupId - Target `groups.id`.
 * @param input - Company fields.
 * @returns Created detail.
 */
export async function createAgentCompany(
  workspaceGroupId: string,
  input: AgentCompanyInput,
): Promise<AgentDetail> {
  const data = await agentFetch<{ company?: Record<string, unknown> }>(
    '/admin/companies',
    workspaceGroupId,
    { method: 'POST', body: JSON.stringify(companyPayload(input)) },
  )
  return mapDetail(data.company ?? {})
}

/**
 * Updates an agent company profile.
 * @param workspaceGroupId - Target `groups.id`.
 * @param companyId - Company uuid.
 * @param input - Company fields.
 * @returns Updated detail.
 */
export async function updateAgentCompany(
  workspaceGroupId: string,
  companyId: string,
  input: AgentCompanyInput,
): Promise<AgentDetail> {
  const data = await agentFetch<{ company?: Record<string, unknown> }>(
    `/admin/companies/${companyId}`,
    workspaceGroupId,
    { method: 'PATCH', body: JSON.stringify(companyPayload(input)) },
  )
  return mapDetail(data.company ?? {})
}

/**
 * Deletes an agent company (cascades to account and grants).
 * @param workspaceGroupId - Target `groups.id`.
 * @param companyId - Company uuid.
 * @returns Nothing.
 */
export async function deleteAgentCompany(
  workspaceGroupId: string,
  companyId: string,
): Promise<void> {
  await agentFetch(`/admin/companies/${companyId}`, workspaceGroupId, {
    method: 'DELETE',
  })
}

/**
 * Creates the primary login account for a company.
 * @param workspaceGroupId - Target `groups.id`.
 * @param companyId - Company uuid.
 * @param params - Login username and password.
 * @returns Created account.
 */
export async function createAgentAccount(
  workspaceGroupId: string,
  companyId: string,
  params: { loginUsername: string; password: string },
): Promise<AgentAccount | null> {
  const data = await agentFetch<{ account?: Record<string, unknown> }>(
    `/admin/companies/${companyId}/account`,
    workspaceGroupId,
    {
      method: 'POST',
      body: JSON.stringify({
        login_username: params.loginUsername,
        password: params.password,
      }),
    },
  )
  return mapAccount(data.account)
}

/**
 * Updates a company login account (active state and/or password).
 * @param workspaceGroupId - Target `groups.id`.
 * @param companyId - Company uuid.
 * @param updates - Active flag and/or new password.
 * @returns Updated account.
 */
export async function updateAgentAccount(
  workspaceGroupId: string,
  companyId: string,
  updates: { isActive?: boolean; password?: string },
): Promise<AgentAccount | null> {
  const body: Record<string, unknown> = {}
  if (updates.isActive !== undefined) {
    body.is_active = updates.isActive
  }
  if (updates.password) {
    body.password = updates.password
  }
  const data = await agentFetch<{ account?: Record<string, unknown> }>(
    `/admin/companies/${companyId}/account`,
    workspaceGroupId,
    { method: 'PATCH', body: JSON.stringify(body) },
  )
  return mapAccount(data.account)
}

/**
 * Lists sales reps for a company.
 * @param workspaceGroupId - Target `groups.id`.
 * @param companyId - Company uuid.
 * @returns Sales rep rows.
 */
export async function listAgentSalesReps(
  workspaceGroupId: string,
  companyId: string,
): Promise<AgentSalesRep[]> {
  const data = await agentFetch<{ sales_reps?: Record<string, unknown>[] }>(
    `/admin/companies/${companyId}/sales-reps`,
    workspaceGroupId,
  )
  return (data.sales_reps ?? []).map((row) => mapSalesRep(row))
}

/**
 * Creates a sales rep profile, optionally with a login account.
 * @param workspaceGroupId - Target `groups.id`.
 * @param companyId - Company uuid.
 * @param input - Rep fields.
 * @param credentials - Optional login username and password.
 * @returns Created sales rep.
 */
export async function createAgentSalesRep(
  workspaceGroupId: string,
  companyId: string,
  input: AgentSalesRepInput,
  credentials?: { loginUsername: string; password: string },
): Promise<AgentSalesRep> {
  const body: Record<string, unknown> = {
    full_name: input.fullName,
    phone: input.phone,
    mobile: input.mobile,
    email: input.email,
    notes: input.notes,
  }
  if (credentials?.loginUsername && credentials.password) {
    body.login_username = credentials.loginUsername
    body.password = credentials.password
  }
  const data = await agentFetch<{ sales_rep?: Record<string, unknown> }>(
    `/admin/companies/${companyId}/sales-reps`,
    workspaceGroupId,
    { method: 'POST', body: JSON.stringify(body) },
  )
  return mapSalesRep(data.sales_rep ?? {})
}

/**
 * Updates a sales rep profile and/or its login account.
 * @param workspaceGroupId - Target `groups.id`.
 * @param companyId - Company uuid.
 * @param repId - Sales rep uuid.
 * @param input - Rep fields.
 * @param account - Optional account changes.
 * @returns Updated sales rep.
 */
export async function updateAgentSalesRep(
  workspaceGroupId: string,
  companyId: string,
  repId: string,
  input: AgentSalesRepInput,
  account?: { loginUsername?: string; password?: string; isActive?: boolean },
): Promise<AgentSalesRep> {
  const body: Record<string, unknown> = {
    full_name: input.fullName,
    phone: input.phone,
    mobile: input.mobile,
    email: input.email,
    notes: input.notes,
  }
  if (account?.loginUsername) {
    body.login_username = account.loginUsername
  }
  if (account?.password) {
    body.password = account.password
  }
  if (account?.isActive !== undefined) {
    body.is_active = account.isActive
  }
  const data = await agentFetch<{ sales_rep?: Record<string, unknown> }>(
    `/admin/companies/${companyId}/sales-reps/${repId}`,
    workspaceGroupId,
    { method: 'PATCH', body: JSON.stringify(body) },
  )
  return mapSalesRep(data.sales_rep ?? {})
}

/**
 * Deletes a sales rep (cascades to its login account).
 * @param workspaceGroupId - Target `groups.id`.
 * @param companyId - Company uuid.
 * @param repId - Sales rep uuid.
 * @returns Nothing.
 */
export async function deleteAgentSalesRep(
  workspaceGroupId: string,
  companyId: string,
  repId: string,
): Promise<void> {
  await agentFetch(
    `/admin/companies/${companyId}/sales-reps/${repId}`,
    workspaceGroupId,
    { method: 'DELETE' },
  )
}

/**
 * Lists agent accounts (with company name) so customer detail can resolve grants.
 * @param workspaceGroupId - Target `groups.id`.
 * @returns Accounts that have a login (companies without accounts are omitted).
 */
export async function listAgents(
  workspaceGroupId: string,
): Promise<AgentAccount[]> {
  const details = await listAgentCompanies(workspaceGroupId)
  return details
    .filter((d) => d.account !== null)
    .map((d) => {
      const account = d.account as AgentAccount
      return {
        ...account,
        companyName: d.company.companyName,
      }
    })
}

/**
 * Replaces the full customer grant list for a company's primary account.
 * @param workspaceGroupId - Target `groups.id`.
 * @param companyId - `proxy_agent_companies.id`.
 * @param customerIds - New list of customer UUIDs.
 * @param repAssignments - Optional map of customer_id → rep account_id (or null).
 * @returns Nothing.
 */
export async function setAgentGrants(
  workspaceGroupId: string,
  companyId: string,
  customerIds: string[],
  repAssignments?: Record<string, string | null>,
): Promise<void> {
  await agentFetch<{ ok?: boolean }>(
    `/admin/companies/${companyId}/account/grants`,
    workspaceGroupId,
    {
      method: 'PUT',
      body: JSON.stringify({
        customer_ids: customerIds,
        ...(repAssignments
          ? { customer_rep_assignments: repAssignments }
          : {}),
      }),
    },
  )
}
