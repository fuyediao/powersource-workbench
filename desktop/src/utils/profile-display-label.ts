/**
 * Profile / visit-log creator display labels (web `profile-display-label` parity).
 */

/**
 * Prefer display name, then full name, then email for a profile row.
 * @param profile - Profile fields from Supabase.
 * @returns Non-empty label or empty string.
 */
export function profileDisplayLabel(profile: {
  display_name?: string | null
  full_name?: string | null
  email?: string | null
}): string {
  return (
    profile.display_name?.trim() ||
    profile.full_name?.trim() ||
    profile.email?.trim() ||
    ''
  )
}

/**
 * Label for a visit-log creator (profile name preferred over stored email).
 * @param log - Visit log with optional resolved display name.
 * @returns Display label or em dash when unknown.
 */
export function visitLogCreatorLabel(log: {
  createdByDisplayName?: string | null
  createdByEmail?: string | null
}): string {
  return log.createdByDisplayName?.trim() || log.createdByEmail?.trim() || '—'
}
