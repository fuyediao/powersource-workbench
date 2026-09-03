import { matchPowersourceLoginSystem } from '@/constants/powersource-endpoints'
import { fetchOaErpCredentials } from '@/services/oa-erp-api'

/** Outcome of one silent OA/ERP login attempt. */
export type PowersourceAutoLoginResult = 'done' | 'skip' | 'failed'

interface SilentLoginResult {
  ok: boolean
  finalUrl?: string
  reason?: string
}

/**
 * Loads Settings credentials and asks main to silent-POST the OA/ERP login,
 * then open `V_Main.aspx` (no visible form fill).
 *
 * @param tabId - In-app browser tab id
 * @param loginUrl - Absolute POWERSOURCE login URL
 * @param userId - Signed-in user id
 * @returns `done` on success, `skip` when no credentials / not OA-ERP, else `failed`
 */
export async function tryPowersourceAutoLogin(
  tabId: string,
  loginUrl: string,
  userId: string,
): Promise<PowersourceAutoLoginResult> {
  const system = matchPowersourceLoginSystem(loginUrl)
  if (!system || !userId.trim()) {
    return 'skip'
  }
  const invoke = window.workbench?.browser?.invoke
  if (!invoke) {
    return 'skip'
  }

  let credentials
  try {
    credentials = await fetchOaErpCredentials(userId)
  } catch {
    return 'skip'
  }

  const username = system === 'oa' ? credentials.oaUsername : credentials.erpUsername
  const password = system === 'oa' ? credentials.oaPassword : credentials.erpPassword
  if (!username.trim() || !password) {
    return 'skip'
  }

  try {
    const raw = await invoke('silentLogin', tabId, loginUrl, username, password)
    const result = raw as SilentLoginResult
    return result?.ok ? 'done' : 'failed'
  } catch {
    return 'failed'
  }
}
