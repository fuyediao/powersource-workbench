import type { InvitationResult, WorkbenchUser } from '@/types/auth'
import {
  persistAuthSession,
  persistLastUsername,
  readAuthSession,
  workbenchApi,
  type StoredAuthSession,
} from '@/utils/workbench-session'

interface AuthSessionResponse {
  accessToken: string
  expiresIn: number
  refreshToken: string
  user: WorkbenchUser
}

/**
 * Persists tokens returned by the Workbench Go API.
 * @param response - Login or refresh payload.
 * @returns The stored session.
 */
async function persistTokenResponse(response: AuthSessionResponse): Promise<StoredAuthSession> {
  const session = {
    accessToken: response.accessToken,
    expiresAt: Date.now() + response.expiresIn * 1000,
    refreshToken: response.refreshToken,
  }
  await persistAuthSession(session)
  return session
}

/**
 * Returns a fresh Supabase access session, refreshing it through Go when needed.
 * @returns A usable Supabase session.
 */
async function ensureSession(): Promise<StoredAuthSession> {
  const session = readAuthSession()
  if (!session) {
    throw new Error('invalid_session')
  }
  if (session.expiresAt > Date.now() + 30_000) {
    return session
  }
  const response = await workbenchApi.post<AuthSessionResponse>('/auth/refresh', {
    refreshToken: session.refreshToken,
  })
  return persistTokenResponse(response.data)
}

/**
 * Signs in through the Workbench Go API with a username and password.
 * @param username - Workbench username. Email is not accepted.
 * @param password - Existing account password.
 * @returns The authenticated Workbench user.
 */
export async function signIn(username: string, password: string): Promise<WorkbenchUser> {
  const trimmed = username.trim()
  const response = await workbenchApi.post<AuthSessionResponse>('/auth/login', {
    username: trimmed,
    password,
  })
  await persistTokenResponse(response.data)
  await persistLastUsername(trimmed)
  return response.data.user
}

/**
 * Loads the current account from the Workbench Go API.
 * @returns The authenticated Workbench user.
 */
export async function loadSession(): Promise<WorkbenchUser> {
  const session = await ensureSession()
  const response = await workbenchApi.get<WorkbenchUser>('/auth/me', {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  })
  return response.data
}

/**
 * Invalidates the current session through the Workbench Go API.
 * @returns Nothing.
 */
export async function signOut(): Promise<void> {
  const session = readAuthSession()
  try {
    if (session) {
      await workbenchApi.post('/auth/logout', {}, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      })
    }
  } finally {
    await persistAuthSession(null)
  }
}

/**
 * Creates a one-time account invitation through the Workbench Go API.
 * @param username - Username reserved for the invitee.
 * @param displayName - Optional display name.
 * @returns The new invitation details.
 */
export async function createInvitation(
  username: string,
  displayName: string,
): Promise<InvitationResult> {
  const session = await ensureSession()
  const response = await workbenchApi.post<InvitationResult>('/auth/invitations', {
    displayName,
    username: username.trim().toLowerCase(),
  }, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  })
  return response.data
}
