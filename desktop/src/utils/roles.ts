import type { WorkbenchRole } from '@/types/auth'

/**
 * Parses a stored Workbench role value.
 * @param value - Unknown role string from Auth metadata or a profile row.
 * @returns A supported Workbench role.
 */
export function parseWorkbenchRole(value: unknown): WorkbenchRole {
  if (value === 'super_admin' || value === 'system_admin' || value === 'member') {
    return value
  }
  return 'member'
}

/**
 * Reports whether a role may perform platform-administrator actions.
 * Super admin is a superset of system admin, matching the GeoCRM roster.
 * @param role - Authenticated Workbench role.
 * @returns Whether the role may invite users and manage platform settings.
 */
export function isPlatformAdmin(role: WorkbenchRole): boolean {
  return role === 'super_admin' || role === 'system_admin'
}
