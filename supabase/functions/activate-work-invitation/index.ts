import '@supabase/functions-js/edge-runtime.d.ts'
import { withSupabase } from '@supabase/server'
import {
  errorResponse,
  hashInvitationCode,
  isRecord,
  isValidUsername,
  normalizeUsername,
  usernameToEmail,
} from '../_shared/workbench.ts'

interface ActivationRequest {
  invitationCode: string
  password: string
  username: string
}

/** Parses and validates an invitation activation request. */
async function parseRequest(request: Request): Promise<ActivationRequest | null> {
  const value: unknown = await request.json().catch(() => null)
  if (!isRecord(value)) return null
  const username = normalizeUsername(value.username)
  const invitationCode = typeof value.invitationCode === 'string' ? value.invitationCode.trim() : ''
  const password = typeof value.password === 'string' ? value.password : ''
  if (!isValidUsername(username) || invitationCode.length < 32 || password.length < 10) return null
  return { invitationCode, password, username }
}

export default {
  fetch: withSupabase({ auth: 'publishable' }, async (request, context) => {
    const body = await parseRequest(request)
    if (!body) return errorResponse('invalid_invitation', 400)

    const tokenHash = await hashInvitationCode(body.invitationCode)
    const { data: invitation, error: invitationError } = await context.supabaseAdmin
      .from('work_invitations')
      .select('id, username, display_name, expires_at, accepted_at, revoked_at')
      .eq('token_hash', tokenHash)
      .eq('username', body.username)
      .maybeSingle()
    const invalidInvitation = invitationError || !invitation || invitation.accepted_at || invitation.revoked_at
      || new Date(invitation?.expires_at ?? 0).getTime() <= Date.now()
    if (invalidInvitation) return errorResponse('invalid_invitation', 400)

    const { data: created, error: createError } = await context.supabaseAdmin.auth.admin.createUser({
      app_metadata: {
        display_name: invitation.display_name,
        role: 'member',
        username: body.username,
      },
      email: usernameToEmail(body.username),
      email_confirm: true,
      password: body.password,
    })
    if (createError?.code === 'email_exists' || createError?.status === 422) {
      return errorResponse('username_unavailable', 409)
    }
    if (createError || !created.user) return errorResponse('internal_error', 500)

    const { error: profileError } = await context.supabaseAdmin.from('work_profiles').insert({
      display_name: invitation.display_name,
      id: created.user.id,
      role: 'member',
      username: body.username,
    })
    if (profileError) {
      await context.supabaseAdmin.auth.admin.deleteUser(created.user.id)
      const duplicateProfile = profileError.code === '23505'
      return errorResponse(duplicateProfile ? 'username_unavailable' : 'internal_error', duplicateProfile ? 409 : 500)
    }

    const { data: accepted, error: acceptError } = await context.supabaseAdmin
      .from('work_invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invitation.id)
      .is('accepted_at', null)
      .select('id')
      .maybeSingle()
    if (acceptError || !accepted) {
      await context.supabaseAdmin.auth.admin.deleteUser(created.user.id)
      return errorResponse('invalid_invitation', 409)
    }

    return Response.json({ activated: true }, { status: 201 })
  }),
}
