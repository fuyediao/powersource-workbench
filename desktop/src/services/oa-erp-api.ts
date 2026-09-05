/**
 * Settings OA/ERP credentials — local Electron SQLite via IPC.
 * Username defaults come from the Workbench login username.
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { fetchWorkUsername } from '@/services/profile-api'
import { employeeIdFromRemoteOaUserId, isRemoteOaUserId } from '@/utils/auth/workbench-username'

/** Credentials used by Settings and POWERSOURCE autofill. */
export interface OaErpCredentials {
  employeeId: string
  oaUsername: string
  oaPassword: string
  erpUsername: string
  erpPassword: string
}

/** Fields written by Settings → OA/ERP Save. */
export interface OaErpCredentialsUpdate {
  oaUsername: string
  oaPassword: string
  erpUsername: string
  erpPassword: string
}

/** Error from OA/ERP credential helpers. */
export class OaErpApiError extends Error {
  readonly code: string

  /**
   * @param code - Machine-readable error code
   * @param message - Human-readable message
   */
  constructor(code: string, message: string) {
    super(message)
    this.name = 'OaErpApiError'
    this.code = code
  }
}

/**
 * Returns the preload bridge for local OA/ERP SQLite storage.
 * @returns Bridge, or null when not running inside Electron.
 */
function oaErpCredentialsBridge(): Window['workbench']['oaErpCredentials'] | null {
  return window.workbench?.oaErpCredentials ?? null
}

/**
 * Loads the Workbench username for OA/ERP username defaults.
 * @param userId - Signed-in user id
 * @returns Trimmed username or leftover employee id, or empty
 */
async function fetchEmployeeId(userId: string): Promise<string> {
  const fromOa = employeeIdFromRemoteOaUserId(userId)
  if (fromOa) {
    return fromOa
  }
  const username = await fetchWorkUsername(userId)
  if (username) {
    return username
  }
  if (!isSupabaseConfigured || !supabase || isRemoteOaUserId(userId)) {
    return ''
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('employee_id')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) {
    return ''
  }
  const raw = data.employee_id
  return typeof raw === 'string' ? raw.trim() : ''
}

/**
 * Loads the signed-in user's OA/ERP credentials from local SQLite.
 * Empty usernames fall back to the profile employee id.
 * @param userId - Signed-in user id
 * @returns Credentials for Settings / autofill
 */
export async function fetchOaErpCredentials(userId: string): Promise<OaErpCredentials> {
  const bridge = oaErpCredentialsBridge()
  if (!bridge) {
    throw new OaErpApiError('not_configured', 'Local OA/ERP storage is unavailable')
  }

  const employeeId = await fetchEmployeeId(userId)
  let local
  try {
    local = await bridge.get(userId)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load OA/ERP credentials'
    throw new OaErpApiError('load_failed', message)
  }

  const oaUsername = (local?.oaUsername ?? '').trim() || employeeId
  const erpUsername = (local?.erpUsername ?? '').trim() || employeeId

  return {
    employeeId,
    oaUsername,
    oaPassword: local?.oaPassword ?? '',
    erpUsername,
    erpPassword: local?.erpPassword ?? '',
  }
}

/**
 * Upserts OA/ERP usernames and passwords in local SQLite for the signed-in user.
 * @param userId - Signed-in user id
 * @param update - Fields to persist
 * @returns Saved credentials (with employee-id username defaults)
 */
export async function saveOaErpCredentials(
  userId: string,
  update: OaErpCredentialsUpdate,
): Promise<OaErpCredentials> {
  const bridge = oaErpCredentialsBridge()
  if (!bridge) {
    throw new OaErpApiError('not_configured', 'Local OA/ERP storage is unavailable')
  }

  const employeeId = await fetchEmployeeId(userId)
  const oaUsername = update.oaUsername.trim() || employeeId
  const erpUsername = update.erpUsername.trim() || employeeId
  const oaPassword = update.oaPassword
  const erpPassword = update.erpPassword

  try {
    await bridge.set(userId, {
      oaUsername,
      oaPassword,
      erpUsername,
      erpPassword,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save OA/ERP credentials'
    throw new OaErpApiError('save_failed', message)
  }

  return {
    employeeId,
    oaUsername,
    oaPassword,
    erpUsername,
    erpPassword,
  }
}

/**
 * Writes a successful OA login into local OA/ERP Settings credentials.
 * OA password is always replaced with the password that just worked.
 * ERP password is filled only when it is still empty, so a custom ERP secret is kept.
 * @param userId - Signed-in Workbench user id.
 * @param username - Employee id used at sign-in.
 * @param password - Plaintext password accepted by OA.
 * @returns Nothing. Failures are ignored so sign-in still succeeds.
 */
export async function seedOaErpCredentialsFromLogin(
  userId: string,
  username: string,
  password: string,
): Promise<void> {
  const loginUsername = username.trim()
  if (!userId.trim() || !loginUsername || !password) {
    return
  }
  try {
    const current = await fetchOaErpCredentials(userId)
    await saveOaErpCredentials(userId, {
      oaUsername: current.oaUsername.trim() || loginUsername,
      oaPassword: password,
      erpUsername: current.erpUsername.trim() || loginUsername,
      erpPassword: current.erpPassword || password,
    })
  } catch {
    // Local SQLite is optional for sign-in; Settings can still be filled later.
  }
}
