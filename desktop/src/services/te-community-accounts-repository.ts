/**
 * Maps `public.te_community_accounts` rows for the Workbench admin UI.
 * Never select `password_hash` from the client.
 */

export type TeCommunityAccountStatus = 'active' | 'suspended' | 'banned'

/** Community account row exposed to the admin list. */
export interface TeCommunityAccount {
  id: string
  email: string
  status: TeCommunityAccountStatus
  forcePasswordChange: boolean
  displayName: string | null
  /** Public community nickname (distinct from formal displayName). */
  nickname: string | null
  /** Public community avatar URL (WebP). Null when no avatar uploaded. */
  avatarUrl: string | null
  organization: string | null
  phoneNumber: string | null
  initialSubmissionId: string | null
  lastLoginAt: string | null
  suspendedAt: string | null
  suspendedReason: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Map a Supabase row to `TeCommunityAccount`.
 *
 * @param row - Raw PostgREST record
 * @returns Normalized account
 */
export function mapTeCommunityAccountFromRow(row: Record<string, unknown>): TeCommunityAccount {
  return {
    id: String(row.id),
    email: String(row.email ?? ''),
    status: (row.status as TeCommunityAccountStatus) ?? 'active',
    forcePasswordChange: row.force_password_change === true,
    displayName: typeof row.display_name === 'string' ? row.display_name : null,
    nickname: typeof row.nickname === 'string' ? row.nickname : null,
    avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    organization: typeof row.organization === 'string' ? row.organization : null,
    phoneNumber: typeof row.phone_number === 'string' ? row.phone_number : null,
    initialSubmissionId:
      typeof row.initial_submission_id === 'string' ? row.initial_submission_id : null,
    lastLoginAt: typeof row.last_login_at === 'string' ? row.last_login_at : null,
    suspendedAt: typeof row.suspended_at === 'string' ? row.suspended_at : null,
    suspendedReason: typeof row.suspended_reason === 'string' ? row.suspended_reason : null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  }
}

/** Columns safe to expose in the admin UI (excludes password_hash). */
export const TE_COMMUNITY_ACCOUNT_SELECT =
  'id, email, status, force_password_change, display_name, nickname, avatar_url, organization, phone_number, initial_submission_id, last_login_at, suspended_at, suspended_reason, created_at, updated_at'

/** Nested account fields for post/comment/report author joins. */
export const TE_COMMUNITY_AUTHOR_EMBED = 'display_name, nickname, avatar_url, email'

/**
 * Public community label: prefer nickname over formal display_name.
 *
 * @param nickname - Nickname column value
 * @param displayName - Formal display_name value
 * @returns Trimmed public name or null
 */
export function coalesceCommunityPublicName(
  nickname: unknown,
  displayName: unknown,
): string | null {
  if (typeof nickname === 'string' && nickname.trim()) return nickname.trim()
  if (typeof displayName === 'string' && displayName.trim()) return displayName.trim()
  return null
}
