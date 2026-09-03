export type WorkbenchRole = 'super_admin' | 'system_admin' | 'member'

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
