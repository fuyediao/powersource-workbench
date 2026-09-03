/**
 * Minimal CRM Settings tables/RPCs used by geocrm-electron Settings parity.
 * Appended alongside the start-page library tables in Database.
 */

/** Auth / org role stored in `user_roles`. */
export type UserRole = 'super_admin' | 'system_admin' | 'group_admin' | 'user'

/** Profile row fields used by Settings. */
export interface ProfileRow {
  id: string
  email: string | null
  display_name: string | null
  full_name: string | null
  language: string | null
  organization: string | null
  bio: string | null
  phone_number: string | null
  phone_country: string | null
  avatar_url: string | null
  avatar_index: number | null
  employee_id: string | null
  openai_api_key: string | null
  anthropic_api_key: string | null
  gemini_api_key: string | null
  grok_api_key: string | null
  updated_at: string | null
}

/** Group workspace row. */
export interface GroupRow {
  id: string
  name: string
  description: string | null
  group_admin_id: string | null
  is_temp_managed: boolean | null
  created_at: string | null
}

/** Group membership row. */
export interface GroupMemberRow {
  id: string
  group_id: string
  user_id: string
  status: string
  joined_at: string | null
}

/** Global leader roster row. */
export interface GlobalLeaderRow {
  id: string
  user_id: string
  created_at: string | null
}

/** Supabase Storage bucket for profile avatars. */
export const PROFILE_AVATARS_BUCKET = 'profile-avatars'
