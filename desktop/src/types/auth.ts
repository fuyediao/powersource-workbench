export type WorkbenchRole = 'super_admin' | 'system_admin' | 'member'

/**
 * Returns whether a Workbench role is stored locally (super admin or system admin).
 * @param role - Role from /auth/me.
 * @returns True for platform administrators.
 */
export function isPlatformAdminRole(role: WorkbenchRole | string | null | undefined): boolean {
  return role === 'super_admin' || role === 'system_admin'
}

export interface WorkbenchUser {
  id: string
  username: string
  displayName: string
  role: WorkbenchRole
}

export interface InvitationResult {
  invitationCode: string
  expiresAt: string
  username: string
}
