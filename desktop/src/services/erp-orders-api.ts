/**
 * GeoCRM admin API for NTNA ERP orders (`/erp/*` on geocrm-api).
 */

import { resolveApiBaseUrl } from '@/config/deployment-urls'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { ErpOrderDetailPayload, ErpSyncResult } from '@/types/orders'

/**
 * Returns true when the unified GeoCRM API origin is configured.
 * @returns Whether ERP order calls can run.
 */
export function isErpOrdersApiConfigured(): boolean {
  return Boolean(resolveApiBaseUrl())
}

/**
 * Supabase access token for authenticated geocrm-api calls.
 * @returns Access token or null when not signed in.
 */
async function getToken(): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null
  }

  const { error: userError } = await supabase.auth.getUser()
  if (userError) {
    const { data: refreshed, error: refError } = await supabase.auth.refreshSession()
    if (refError || !refreshed.session?.access_token) {
      return null
    }
    return refreshed.session.access_token
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    const { data: refreshed, error: refError } = await supabase.auth.refreshSession()
    if (refError || !refreshed.session?.access_token) {
      return null
    }
    return refreshed.session.access_token
  }

  const exp = session.expires_at
  if (exp != null && exp * 1000 < Date.now() + 120_000) {
    const { data: refreshed, error } = await supabase.auth.refreshSession()
    if (!error && refreshed.session?.access_token) {
      return refreshed.session.access_token
    }
  }

  return session.access_token
}

/**
 * Authenticated JSON fetch to geocrm-api.
 * @param path - Absolute API path (e.g. `/erp/sync`).
 * @param init - Fetch init options.
 * @returns Parsed JSON body.
 */
async function geocrmFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = resolveApiBaseUrl()
  if (!base) {
    throw new Error('VITE_DEPLOYMENT_DOMAIN is not configured')
  }

  const runFetch = async (accessToken: string | null): Promise<Response> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string>),
    }
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }
    return fetch(`${base}${path}`, { ...init, headers, mode: 'cors' })
  }

  const authRoundsMax = 3
  let res!: Response
  for (let authRound = 0; authRound < authRoundsMax; authRound++) {
    const token = await getToken()
    try {
      res = await runFetch(token)
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'Network error'
      throw new Error(`${reason}. Cannot reach geocrm-api (${base}).`)
    }
    if (res.status !== 401 || !supabase) {
      break
    }
    await supabase.auth.refreshSession()
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: res.statusText }))) as {
      error?: string
    }
    throw new Error(body.error ?? `Request failed: ${res.status}`)
  }

  return res.json() as Promise<T>
}

/**
 * Trigger an ERP index sync. Without a customer code, syncs every customer that
 * has a customer_code; otherwise syncs only the given customer.
 * @param customerCode - Optional ERP customer code to limit the sync.
 * @returns Sync counters.
 */
export async function syncErpOrders(customerCode?: string): Promise<ErpSyncResult> {
  const query = customerCode ? `?customerCode=${encodeURIComponent(customerCode)}` : ''
  const data = await geocrmFetch<{ ok: boolean; result: ErpSyncResult }>(`/erp/sync${query}`, {
    method: 'POST',
  })
  return data.result
}

/**
 * Fetch a single full ERP order (SaleOrder + SaleOrderSub[]) by BillNo.
 * @param billNo - ERP order number (orders.external_id).
 * @returns ERP detail payload.
 */
export async function fetchErpOrderDetail(billNo: string): Promise<ErpOrderDetailPayload> {
  const data = await geocrmFetch<{
    ok: boolean
    cached: boolean
    detail: ErpOrderDetailPayload
  }>(`/erp/orders/${encodeURIComponent(billNo)}/detail`)
  return data.detail
}
