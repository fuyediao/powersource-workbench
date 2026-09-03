import '@supabase/functions-js/edge-runtime.d.ts'
import { withSupabase } from '@supabase/server'
import {
  createInvitationCode,
  errorResponse,
  hashInvitationCode,
  isRecord,
  isValidUsername,
  normalizeUsername,
} from '../_shared/workbench.ts'

interface InvitationRequest {
  displayName: string
  username: string
}

/** Parses and validates an invitation creation request. */
async function parseRequest(request: Request): Promise<InvitationRequest | null> {
  const value: unknown = await request.json().catch(() => null)
  if (!isRecord(value)) return null
  const username = normalizeUsername(value.username)
  if (!isValidUsername(username)) return null
  return {
    username,
    displayName: typeof value.displayName === 'string' ? value.displayName.trim().slice(0, 120) : '',
  }
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
    const userId = typeof context.userClaims?.sub === 'string' ? context.userClaims.sub : ''
    if (!userId) return errorResponse('invalid_session', 401)

    const { data: account, error: accountError } = await context.supabaseAdmin.auth.admin.getUserById(userId)
    if (accountError || account.user?.app_metadata.role !== 'system_admin') {
      return errorResponse('forbidden', 403)
    }

    const body = await parseRequest(request)
    if (!body) return errorResponse('invalid_username', 400)

    const { count: profileCount, error: profileError } = await context.supabaseAdmin
      .from('work_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('username', body.username)
    if (profileError) return errorResponse('internal_error', 500)
    if ((profileCount ?? 0) > 0) return errorResponse('username_unavailable', 409)

    const invitationCode = createInvitationCode()
    const tokenHash = await hashInvitationCode(invitationCode)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const { error: insertError } = await context.supabaseAdmin.from('work_invitations').insert({
      created_by: userId,
      display_name: body.displayName,
      expires_at: expiresAt,
      token_hash: tokenHash,
      username: body.username,
    })
    if (insertError?.code === '23505') return errorResponse('username_unavailable', 409)
    if (insertError) return errorResponse('internal_error', 500)

    return Response.json({ invitationCode, expiresAt, username: body.username }, { status: 201 })
  }),
}
