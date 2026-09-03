/**
 * Resolves the geocrm-api base URL from `VITE_DEPLOYMENT_DOMAIN`
 * (`https://api.{domain}`).
 * @returns Absolute API origin without a trailing slash, or empty when unset.
 */
export function resolveGeocrmApiBaseUrl(): string {
  const domain = process.env.VITE_DEPLOYMENT_DOMAIN?.trim()
  if (!domain) {
    return ''
  }
  const host = domain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  return host ? `https://api.${host}` : ''
}

/**
 * Performs a JSON GET against geocrm-api.
 * @param path - Path beginning with `/`.
 * @returns Parsed JSON body.
 */
export async function apiGetJson<T>(path: string): Promise<T> {
  const base = resolveGeocrmApiBaseUrl()
  if (!base) {
    throw new Error('VITE_DEPLOYMENT_DOMAIN is not set')
  }
  const response = await fetch(`${base}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    throw new Error(`geocrm-api GET ${path} failed: ${response.status}`)
  }
  return (await response.json()) as T
}

/**
 * Performs a JSON POST against geocrm-api.
 * @param path - Path beginning with `/`.
 * @param body - JSON-serializable body.
 * @returns Parsed JSON body.
 */
export async function apiPostJson<T>(path: string, body: unknown): Promise<T> {
  const base = resolveGeocrmApiBaseUrl()
  if (!base) {
    throw new Error('VITE_DEPLOYMENT_DOMAIN is not set')
  }
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    throw new Error(`geocrm-api POST ${path} failed: ${response.status}`)
  }
  return (await response.json()) as T
}
