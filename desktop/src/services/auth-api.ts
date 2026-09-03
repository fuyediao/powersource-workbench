import { resolveAccountEmailDomain } from '@/config/deployment-urls'
import type { InvitationResult, WorkbenchRole, WorkbenchUser } from '@/types/auth'
import {
  persistAuthSession,
  readAuthSession,
  supabaseAuthApi,
  supabaseFunctionsApi,
  type StoredAuthSession,
} from '@/utils/api'

interface SupabaseAuthUser {
  app_metadata?: Record<string, unknown>
  email?: string
  id: string
}

interface SupabaseTokenResponse {
  access_token: string
  expires_in: number
  refresh_token: string
  user: SupabaseAuthUser
}

const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,31}$/

/** Normalizes a username before it is sent to Supabase Auth. */
function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

/** Maps a Workbench username to the internal email identity used by Supabase Auth. */
function usernameToEmail(username: string): string {
  return `${username}@${resolveAccountEmailDomain()}`
}

/** Converts a Supabase Auth user into the public Workbench account shape. */
function mapUser(user: SupabaseAuthUser): WorkbenchUser {
  const metadata = user.app_metadata ?? {}
  const emailUsername = user.email?.split('@', 1)[0] ?? ''
  const username = typeof metadata.username === 'string' ? metadata.username : emailUsername
  const displayName = typeof metadata.display_name === 'string' ? metadata.display_name : ''
  const role: WorkbenchRole = metadata.role === 'system_admin' ? 'system_admin' : 'member'
  return { id: user.id, username, displayName, role }
}

/** Persists tokens from a Supabase password or refresh exchange. */
function persistTokenResponse(response: SupabaseTokenResponse): StoredAuthSession {
  const session = {
    accessToken: response.access_token,
    expiresAt: Date.now() + response.expires_in * 1000,
    refreshToken: response.refresh_token,
  }
  persistAuthSession(session)
  return session
}

/** Returns a fresh Supabase access session, refreshing it when necessary. */
async function ensureSession(): Promise<StoredAuthSession> {
  const session = readAuthSession()
  if (!session) throw new Error('invalid_session')
  if (session.expiresAt > Date.now() + 30_000) return session
  const response = await supabaseAuthApi.post<SupabaseTokenResponse>('/token?grant_type=refresh_token', {
    refresh_token: session.refreshToken,
  })
  return persistTokenResponse(response.data)
}

/** Signs in with an invited Workbench username and password. */
export async function signIn(username: string, password: string): Promise<WorkbenchUser> {
  const normalizedUsername = normalizeUsername(username)
  if (!usernamePattern.test(normalizedUsername)) throw new Error('invalid_username')
  const response = await supabaseAuthApi.post<SupabaseTokenResponse>('/token?grant_type=password', {
    email: usernameToEmail(normalizedUsername),
    password,
  })
  persistTokenResponse(response.data)
  return mapUser(response.data.user)
}

/** Activates a one-time invitation and signs into the new Supabase account. */
export async function activateInvitation(
  invitationCode: string,
  username: string,
  password: string,
): Promise<WorkbenchUser> {
  const normalizedUsername = normalizeUsername(username)
  await supabaseFunctionsApi.post('/activate-work-invitation', {
    invitationCode,
    password,
    username: normalizedUsername,
  })
  return signIn(normalizedUsername, password)
}

/** Loads the current account from Supabase Auth using a persisted session. */
export async function loadSession(): Promise<WorkbenchUser> {
  const session = await ensureSession()
  const response = await supabaseAuthApi.get<SupabaseAuthUser>('/user', {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  })
  return mapUser(response.data)
}

/** Invalidates the current Supabase Auth session. */
export async function signOut(): Promise<void> {
  const session = readAuthSession()
  try {
    if (session) {
      await supabaseAuthApi.post('/logout?scope=local', {}, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      })
    }
  } finally {
    persistAuthSession(null)
  }
}

/** Creates a one-time account invitation through the administrator Edge Function. */
export async function createInvitation(
  username: string,
  displayName: string,
): Promise<InvitationResult> {
  const session = await ensureSession()
  const response = await supabaseFunctionsApi.post<InvitationResult>('/create-work-invitation', {
    displayName,
    username: normalizeUsername(username),
  }, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  })
  return response.data
}
