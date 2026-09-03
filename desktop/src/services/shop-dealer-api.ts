/**
 * workbench-api shop dealer admin client for Electron (list/detail/addresses).
 */

import { resolveApiBaseUrl } from '@/config/deployment-urls'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { ShopDealerAccount } from '@/types/customer'

/** Minimum password length; keep in sync with backend shop dealer handlers. */
export const SHOP_DEALER_PASSWORD_MIN_LENGTH = 8

/**
 * B2B address from shop dealer shipping/billing tables (not CRM customer_addresses).
 */
export interface ShopDealerAddress {
  id: string
  dealerAccountId: string
  customerId: string
  groupId: string
  addressType: 'billing' | 'shipping'
  firstName: string
  lastName: string
  phone: string
  /** ISO 3166-1 alpha-2 for PhoneInput country selection. */
  phoneCountry: string
  email: string
  country: string
  state: string
  city: string
  postalCode: string
  district: string
  line1: string
  line2: string
  createdAt: string
  updatedAt: string
}

/** Create / update payload for dealer addresses (email and line2 optional). */
export interface ShopDealerAddressInput {
  addressType: 'billing' | 'shipping'
  firstName: string
  lastName: string
  phone: string
  /** ISO 3166-1 alpha-2 for PhoneInput country selection. */
  phoneCountry: string
  email?: string
  country: string
  city: string
  state: string
  postalCode: string
  line1: string
  line2?: string
  district?: string
}

/**
 * Whether workbench-api is configured for dealer admin calls.
 * @returns True when deployment domain is set.
 */
export function isShopDealerApiConfigured(): boolean {
  return Boolean(resolveApiBaseUrl())
}

/**
 * Supabase access token for authenticated workbench-api calls.
 * @returns Access token or null when not signed in.
 */
async function getToken(): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null
  }
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/**
 * Append workspace group query for admin shop dealer routes.
 * @param path - Relative path.
 * @param workspaceGroupId - Target groups.id.
 * @returns Path with query.
 */
function withWorkspaceGroup(path: string, workspaceGroupId: string): string {
  const join = path.includes('?') ? '&' : '?'
  return `${path}${join}workspace_group_id=${encodeURIComponent(workspaceGroupId)}`
}

/**
 * Authenticated fetch to workbench-api shop admin dealer routes.
 * @param path - Absolute API path under workbench-api.
 * @param workspaceGroupId - Target groups.id.
 * @param init - Fetch init.
 * @returns Parsed JSON body.
 */
async function shopAdminFetch<T>(
  path: string,
  workspaceGroupId: string,
  init: RequestInit = {},
): Promise<T> {
  const base = resolveApiBaseUrl()
  if (!base) {
    throw new Error('VITE_DEPLOYMENT_DOMAIN is not configured')
  }
  const urlPath = withWorkspaceGroup(path, workspaceGroupId)
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

  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean
    error?: string
  }
  if (!res.ok) {
    throw new Error(
      typeof body.error === 'string' ? body.error : `Request failed: ${res.status}`,
    )
  }
  return body as T
}

/**
 * Maps API dealer JSON (camelCase or snake_case) to ShopDealerAccount.
 * @param raw - API row.
 * @returns Typed dealer.
 */
function mapDealer(raw: Record<string, unknown>): ShopDealerAccount {
  return {
    id: String(raw.id ?? ''),
    customerId: String(raw.customerId ?? raw.customer_id ?? ''),
    groupId: String(raw.groupId ?? raw.group_id ?? ''),
    loginUsername: String(raw.loginUsername ?? raw.login_username ?? ''),
    isActive: Boolean(raw.isActive ?? raw.is_active),
    companyName: String(raw.companyName ?? raw.company_name ?? ''),
    customerCode: String(raw.customerCode ?? raw.customer_code ?? ''),
    createdAt: String(raw.createdAt ?? raw.created_at ?? ''),
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? ''),
  }
}

/**
 * Maps API address JSON to ShopDealerAddress.
 * @param raw - API row.
 * @returns Typed address.
 */
function mapAddress(raw: Record<string, unknown>): ShopDealerAddress {
  const addressTypeRaw = String(raw.addressType ?? raw.address_type ?? 'shipping')
  const addressType: 'billing' | 'shipping' =
    addressTypeRaw === 'billing' ? 'billing' : 'shipping'
  return {
    id: String(raw.id ?? ''),
    dealerAccountId: String(raw.dealerAccountId ?? raw.dealer_account_id ?? ''),
    customerId: String(raw.customerId ?? raw.customer_id ?? ''),
    groupId: String(raw.groupId ?? raw.group_id ?? ''),
    addressType,
    firstName: String(raw.firstName ?? raw.first_name ?? ''),
    lastName: String(raw.lastName ?? raw.last_name ?? ''),
    phone: String(raw.phone ?? ''),
    phoneCountry: String(raw.phoneCountry ?? raw.phone_country ?? ''),
    email: String(raw.email ?? ''),
    country: String(raw.country ?? ''),
    state: String(raw.state ?? ''),
    city: String(raw.city ?? ''),
    postalCode: String(raw.postalCode ?? raw.postal_code ?? ''),
    district: String(raw.district ?? ''),
    line1: String(raw.line1 ?? ''),
    line2: String(raw.line2 ?? ''),
    createdAt: String(raw.createdAt ?? raw.created_at ?? ''),
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? ''),
  }
}

/**
 * Lists dealer accounts for the workspace group.
 * @param workspaceGroupId - Target groups.id.
 * @returns Dealer rows.
 */
export async function listShopDealers(
  workspaceGroupId: string,
): Promise<ShopDealerAccount[]> {
  const body = await shopAdminFetch<{ dealers?: unknown[] }>(
    '/shop/admin/dealers',
    workspaceGroupId,
    { method: 'GET' },
  )
  return (body.dealers ?? []).map((row) =>
    mapDealer(row as Record<string, unknown>),
  )
}

/**
 * Loads one dealer account by id.
 * @param workspaceGroupId - Target groups.id.
 * @param dealerId - shop_dealer_accounts.id.
 * @returns Dealer row.
 */
export async function getShopDealer(
  workspaceGroupId: string,
  dealerId: string,
): Promise<ShopDealerAccount> {
  const body = await shopAdminFetch<{ dealer?: Record<string, unknown> }>(
    `/shop/admin/dealers/${encodeURIComponent(dealerId)}`,
    workspaceGroupId,
    { method: 'GET' },
  )
  if (!body.dealer) {
    throw new Error('not_found')
  }
  return mapDealer(body.dealer)
}

/**
 * Creates a dealer login for a CRM customer.
 * @param workspaceGroupId - Target groups.id.
 * @param input - Customer id, username, password.
 * @returns Created dealer.
 */
export async function createShopDealer(
  workspaceGroupId: string,
  input: { customerId: string; loginUsername: string; password: string },
): Promise<ShopDealerAccount> {
  const body = await shopAdminFetch<{ dealer?: Record<string, unknown> }>(
    '/shop/admin/dealers',
    workspaceGroupId,
    {
      method: 'POST',
      body: JSON.stringify({
        customerId: input.customerId,
        loginUsername: input.loginUsername,
        password: input.password,
      }),
    },
  )
  if (!body.dealer) {
    throw new Error('create_failed')
  }
  return mapDealer(body.dealer)
}

/**
 * Updates dealer password and/or active flag.
 * @param workspaceGroupId - Target groups.id.
 * @param dealerId - shop_dealer_accounts.id.
 * @param input - Optional password and isActive.
 * @returns Updated dealer.
 */
export async function updateShopDealer(
  workspaceGroupId: string,
  dealerId: string,
  input: { password?: string; isActive?: boolean },
): Promise<ShopDealerAccount> {
  const payload: { password?: string; isActive?: boolean } = {}
  if (input.password != null && input.password !== '') {
    payload.password = input.password
  }
  if (typeof input.isActive === 'boolean') {
    payload.isActive = input.isActive
  }
  const body = await shopAdminFetch<{ dealer?: Record<string, unknown> }>(
    `/shop/admin/dealers/${encodeURIComponent(dealerId)}`,
    workspaceGroupId,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  )
  if (!body.dealer) {
    throw new Error('update_failed')
  }
  return mapDealer(body.dealer)
}

/**
 * Lists B2B addresses for a dealer account.
 * @param workspaceGroupId - Target groups.id.
 * @param dealerId - shop_dealer_accounts.id.
 * @returns Address rows.
 */
export async function listShopDealerAddresses(
  workspaceGroupId: string,
  dealerId: string,
): Promise<ShopDealerAddress[]> {
  const body = await shopAdminFetch<{ addresses?: unknown[] }>(
    `/shop/admin/dealers/${encodeURIComponent(dealerId)}/addresses`,
    workspaceGroupId,
    { method: 'GET' },
  )
  return (body.addresses ?? []).map((row) =>
    mapAddress(row as Record<string, unknown>),
  )
}

/**
 * Creates a dealer address.
 * @param workspaceGroupId - Target groups.id.
 * @param dealerId - shop_dealer_accounts.id.
 * @param input - Address fields.
 * @returns Created address.
 */
export async function createShopDealerAddress(
  workspaceGroupId: string,
  dealerId: string,
  input: ShopDealerAddressInput,
): Promise<ShopDealerAddress> {
  const body = await shopAdminFetch<{ address?: Record<string, unknown> }>(
    `/shop/admin/dealers/${encodeURIComponent(dealerId)}/addresses`,
    workspaceGroupId,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )
  if (!body.address) {
    throw new Error('create_failed')
  }
  return mapAddress(body.address)
}

/**
 * Updates a dealer address.
 * @param workspaceGroupId - Target groups.id.
 * @param dealerId - shop_dealer_accounts.id.
 * @param addressId - Address id.
 * @param input - Address fields.
 * @returns Updated address.
 */
export async function updateShopDealerAddress(
  workspaceGroupId: string,
  dealerId: string,
  addressId: string,
  input: ShopDealerAddressInput,
): Promise<ShopDealerAddress> {
  const body = await shopAdminFetch<{ address?: Record<string, unknown> }>(
    `/shop/admin/dealers/${encodeURIComponent(dealerId)}/addresses/${encodeURIComponent(addressId)}`,
    workspaceGroupId,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  )
  if (!body.address) {
    throw new Error('update_failed')
  }
  return mapAddress(body.address)
}

/**
 * Deletes a dealer address.
 * @param workspaceGroupId - Target groups.id.
 * @param dealerId - shop_dealer_accounts.id.
 * @param addressId - Address id.
 * @returns Promise that resolves when deleted.
 */
export async function deleteShopDealerAddress(
  workspaceGroupId: string,
  dealerId: string,
  addressId: string,
): Promise<void> {
  await shopAdminFetch(
    `/shop/admin/dealers/${encodeURIComponent(dealerId)}/addresses/${encodeURIComponent(addressId)}`,
    workspaceGroupId,
    { method: 'DELETE' },
  )
}
