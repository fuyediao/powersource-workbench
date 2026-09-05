import type { Session, User } from '@supabase/supabase-js'
import type { WorkbenchUser } from '@/types/auth'
import type { StoredAuthSession } from '@/utils/workbench-session'

/**
 * Builds a renderer Session for an OA employee who has no Supabase Auth user.
 * @param user - Public user from the Workbench Go API.
 * @param stored - Cached Workbench tokens.
 * @returns A Session-shaped object the desktop can treat as signed in.
 */
export function sessionFromRemoteOaUser(
  user: WorkbenchUser,
  stored: StoredAuthSession,
): Session {
  const nowIso = new Date().toISOString()
  const expiresAtSec = Math.floor(stored.expiresAt / 1000)
  const supabaseUser: User = {
    id: user.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: '',
    phone: '',
    app_metadata: { provider: 'oa', providers: ['oa'] },
    user_metadata: {
      username: user.username,
      display_name: user.displayName,
      role: user.role,
    },
    identities: [],
    created_at: nowIso,
    updated_at: nowIso,
    is_anonymous: false,
  }
  return {
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken,
    expires_in: Math.max(0, Math.floor((stored.expiresAt - Date.now()) / 1000)),
    expires_at: expiresAtSec,
    token_type: 'bearer',
    user: supabaseUser,
  }
}
