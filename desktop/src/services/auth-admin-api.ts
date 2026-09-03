/**
 * Workbench system-admin user management API (workbench-api `/auth/admin/*`).
 */

import { resolveApiBaseUrl } from '@/config/deployment-urls'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

/** Minimum password length enforced by workbench-api. */
export const AUTH_ADMIN_PASSWORD_MIN_LENGTH = 8

/** Employee-id format accepted by create/edit forms (PS####). */
export const EMPLOYEE_ID_PATTERN = /^PS\d{4}$/i

/** A GoTrue identity record (one per linked provider). */
export interface AuthAdminIdentity {
  id?: string
  provider: string
  identity_data?: Record<string, unknown>
}

/** Subset of the GoTrue user object surfaced by the admin endpoints. */
export interface AuthAdminUser {
  id: string
  email: string | null
  phone?: string | null
  created_at: string
  last_sign_in_at: string | null
  email_confirmed_at?: string | null
  banned_until?: string | null
  user_metadata?: Record<string, unknown> | null
  app_metadata?: Record<string, unknown> | null
  identities?: AuthAdminIdentity[] | null
}

/** Response for the paginated list endpoint. */
export interface AuthAdminListResult {
  users: AuthAdminUser[]
  page: number
  perPage: number
}

/** Payload for creating a user. */
export interface CreateAuthUserInput {
  email: string
  password?: string
  employeeId?: string
  emailConfirm?: boolean
  sendInvite?: boolean
}

/** Payload for updating a user. */
export interface UpdateAuthUserInput {
  email?: string
  employeeId?: string
  banned?: boolean
}

/**
 * Returns true when the unified Workbench API origin is configured.
 * @returns Whether auth-admin calls can run.
 */
export function isAuthAdminApiConfigured(): boolean {
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
 * Authenticated JSON fetch to workbench-api.
 * @param path - Absolute API path (e.g. `/auth/admin/users`).
 * @param init - Fetch init options.
 * @returns Parsed JSON body.
 */
async function workbenchFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
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
      throw new Error(`${reason}. Cannot reach workbench-api (${base}).`)
    }
    if (res.status !== 401 || !supabase) {
      break
    }
    await supabase.auth.refreshSession()
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string }
    throw new Error(body.error ?? `Request failed: ${res.status}`)
  }

  return res.json() as Promise<T>
}

/**
 * List auth users with optional email search.
 * @param params - page (1-based), perPage, and email search substring.
 * @returns Paginated users.
 */
export async function listAuthUsers(
  params: { page?: number; perPage?: number; search?: string } = {},
): Promise<AuthAdminListResult> {
  const query = new URLSearchParams()
  query.set('page', String(params.page ?? 1))
  query.set('per_page', String(params.perPage ?? 20))
  if (params.search?.trim()) {
    query.set('search', params.search.trim())
  }

  const data = await workbenchFetch<{ users: AuthAdminUser[]; page: number; per_page: number }>(
    `/auth/admin/users?${query.toString()}`,
  )
  return { users: data.users ?? [], page: data.page, perPage: data.per_page }
}

/**
 * Create a new auth user (optionally with an initial password and employee id).
 * @param input - Creation payload.
 * @returns Created user.
 */
export async function createAuthUser(input: CreateAuthUserInput): Promise<AuthAdminUser> {
  const data = await workbenchFetch<{ user: AuthAdminUser }>(`/auth/admin/users`, {
    method: 'POST',
    body: JSON.stringify({
      email: input.email,
      password: input.password || undefined,
      employee_id: input.employeeId || undefined,
      email_confirm: input.emailConfirm,
      send_invite: input.sendInvite,
    }),
  })
  return data.user
}

/**
 * Update an auth user's email, employee id, and/or ban status.
 * @param id - Supabase auth user id.
 * @param input - Update payload.
 * @returns Updated user.
 */
export async function updateAuthUser(id: string, input: UpdateAuthUserInput): Promise<AuthAdminUser> {
  const body: Record<string, unknown> = {}
  if (input.email !== undefined) {
    body.email = input.email
  }
  if (input.employeeId !== undefined) {
    body.employee_id = input.employeeId
  }
  if (input.banned !== undefined) {
    body.banned = input.banned
  }

  const data = await workbenchFetch<{ user: AuthAdminUser }>(`/auth/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  return data.user
}

/**
 * Resend an email magic link to an existing auth user.
 * @param id - Supabase auth user id.
 */
export async function inviteAuthUser(id: string): Promise<void> {
  await workbenchFetch<{ ok: boolean }>(`/auth/admin/users/${encodeURIComponent(id)}/invite`, {
    method: 'POST',
  })
}

/**
 * Delete an auth user. The backend rejects deleting the caller's own account.
 * @param id - Supabase auth user id.
 */
export async function deleteAuthUser(id: string): Promise<void> {
  await workbenchFetch<{ ok: boolean }>(`/auth/admin/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

/**
 * Grant or revoke `system_admin` via RPC (super_admin only server-side).
 * @param userId - Target auth user id.
 * @param isAdmin - True to grant, false to revoke.
 * @returns True on success.
 */
export async function setSystemAdmin(userId: string, isAdmin: boolean): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    return false
  }
  const { data, error } = await supabase.rpc('rpc_set_system_admin', {
    p_user_id: userId,
    p_is_admin: isAdmin,
  })
  if (error) {
    console.error('setSystemAdmin', error)
    return false
  }
  const result = data as { success?: boolean; error?: string } | null
  return Boolean(result?.success)
}
