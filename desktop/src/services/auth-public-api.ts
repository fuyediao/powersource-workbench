import { resolveApiBaseUrl } from '@/config/deployment-urls'

/** Employee-id format accepted by the resolver (PS####). */
export const EMPLOYEE_ID_PATTERN = /^PS\d{4}$/i

/**
 * Returns true when the unified Workbench API origin is configured.
 * @returns Whether employee-id resolve can run.
 */
export function isAuthPublicApiConfigured(): boolean {
  return Boolean(resolveApiBaseUrl())
}

/**
 * Resolves an employee id to its account email via workbench-api.
 * @param employeeId - Employee id in PS#### format.
 * @returns Account email, or null when no match / request failed.
 */
export async function resolveEmployeeId(employeeId: string): Promise<string | null> {
  const base = resolveApiBaseUrl()
  if (!base) {
    return null
  }

  let res: Response
  try {
    res = await fetch(`${base}/auth/public/resolve-employee-id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: employeeId.trim().toUpperCase() }),
      mode: 'cors',
    })
  } catch {
    return null
  }

  if (!res.ok) {
    return null
  }
  const data = (await res.json().catch(() => null)) as { email?: string } | null
  return data?.email ?? null
}
