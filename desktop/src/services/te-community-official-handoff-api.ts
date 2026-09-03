import { resolveApiBaseUrl } from '@/config/deployment-urls'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

/** Successful mint response from POST /te/admin/community/official-handoff. */
export interface TeOfficialHandoffResponse {
  openUrl: string
}

/**
 * Mints a short-lived Official community handoff URL via geocrm-api.
 * Opens as NEXTORCH Official on the T&E site when the hash code is redeemed.
 *
 * @returns Payload with `openUrl` for in-app or system browser open.
 */
export async function mintOfficialCommunityHandoff(): Promise<TeOfficialHandoffResponse> {
  const base = resolveApiBaseUrl()
  if (!base) {
    throw new Error('The GeoCRM API is not configured.')
  }
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('You must be signed in to open the Official community site.')
  }
  const { data, error } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token
  if (error || !accessToken) {
    throw new Error('You must be signed in to open the Official community site.')
  }

  let response: Response
  try {
    response = await fetch(`${base}/te/admin/community/official-handoff`, {
      method: 'POST',
      mode: 'cors',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })
  } catch {
    throw new Error('The GeoCRM API could not be reached.')
  }

  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const obj =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
    const message =
      (typeof obj?.message === 'string' && obj.message) ||
      (typeof obj?.error === 'string' && obj.error) ||
      'Failed to open the Official community site.'
    throw new Error(message)
  }

  const openUrl =
    payload &&
    typeof payload === 'object' &&
    typeof (payload as TeOfficialHandoffResponse).openUrl === 'string'
      ? (payload as TeOfficialHandoffResponse).openUrl.trim()
      : ''
  if (!openUrl) {
    throw new Error('The server did not return a handoff URL.')
  }
  return { openUrl }
}
