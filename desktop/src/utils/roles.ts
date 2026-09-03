import type { WorkbenchRole } from '@/types/auth'

/**
 * Reports whether a role may perform platform-administrator actions.
 * Super admin is a superset of system admin.
 * @param role - Authenticated Workbench role.
 * @returns Whether the role may invite users and manage platform settings.
 */
export function isPlatformAdmin(role: WorkbenchRole): boolean {
  return role === 'super_admin' || role === 'system_admin'
}
