/**
 * Resolves frontend backend URLs from environment variables.
 *
 * When `VITE_DEPLOYMENT_DOMAIN` is set (e.g. `powersource.app`), clients derive
 * `https://supabase.{domain}` and `https://api.{domain}` in code.
 */

/**
 * Normalizes `VITE_DEPLOYMENT_DOMAIN` to a bare hostname.
 * @param domain - Root domain such as `powersource.app`.
 * @returns Hostname without scheme or trailing slash.
 */
export function resolveDeploymentHost(domain: string): string {
  return domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
}

/**
 * Resolves the public Supabase origin from `VITE_DEPLOYMENT_DOMAIN`.
 * @returns Origin or empty string when unset.
 */
export function resolveSupabaseUrl(): string {
  const domain = import.meta.env.VITE_DEPLOYMENT_DOMAIN
  if (!domain) {
    return ''
  }
  const host = resolveDeploymentHost(domain)
  return host ? `https://supabase.${host}` : ''
}

/**
 * Resolves the public geocrm-api origin from `VITE_DEPLOYMENT_DOMAIN`.
 * @returns Origin or empty string when unset.
 */
export function resolveApiBaseUrl(): string {
  const domain = import.meta.env.VITE_DEPLOYMENT_DOMAIN
  if (!domain) {
    return ''
  }
  const host = resolveDeploymentHost(domain)
  return host ? `https://api.${host}` : ''
}

/**
 * Resolves the public web app origin (Gmail OAuth `returnOrigin`).
 * @returns Origin such as `https://powersource.app`, or empty when unset.
 */
export function resolveAppPublicOrigin(): string {
  const domain = import.meta.env.VITE_DEPLOYMENT_DOMAIN
  if (!domain) {
    return ''
  }
  const host = resolveDeploymentHost(domain)
  return host ? `https://${host}` : ''
}
