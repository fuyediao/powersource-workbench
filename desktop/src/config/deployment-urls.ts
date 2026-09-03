/**
 * Resolves frontend backend URLs from environment variables.
 *
 * When `VITE_DEPLOYMENT_DOMAIN` is set (e.g. `powersource.work`), clients derive
 * `https://supabase.{domain}` and `https://api.{domain}` in code.
 */

/**
 * Normalizes a configured deployment domain to a hostname.
 * @param domain - Domain with or without an HTTP scheme.
 * @returns A hostname without trailing slashes.
 */
export function resolveDeploymentHost(domain: string): string {
  return domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
}

/**
 * Resolves the public Supabase URL used by the desktop client.
 * @returns The configured or derived Supabase URL.
 */
export function resolveSupabaseUrl(): string {
  const explicit = import.meta.env.VITE_SUPABASE_URL?.trim()
  if (explicit) {
    return explicit.replace(/\/$/, '')
  }
  const host = resolveDeploymentHost(import.meta.env.VITE_DEPLOYMENT_DOMAIN ?? '')
  if (host) {
    return `https://supabase.${host}`
  }
  return import.meta.env.DEV ? 'http://127.0.0.1:54321' : 'https://supabase.powersource.work'
}

/**
 * Reads the public Supabase API key embedded in the desktop build.
 * @returns The publishable or legacy anonymous key, or empty when unset.
 */
export function resolveSupabasePublishableKey(): string {
  const publishable = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  return publishable || anon || ''
}

/**
 * Resolves the Workbench Go API origin used for login and invitations.
 * @returns The configured API URL without a trailing slash.
 */
export function resolveWorkbenchApiUrl(): string {
  const explicit = import.meta.env.VITE_WORKBENCH_API_URL?.trim()
  if (explicit) {
    return explicit.replace(/\/$/, '')
  }
  const host = resolveDeploymentHost(import.meta.env.VITE_DEPLOYMENT_DOMAIN ?? '')
  if (host) {
    return `https://api.${host}`
  }
  return 'https://api.powersource.work'
}

/**
 * Resolves the public workbench-api origin from `VITE_DEPLOYMENT_DOMAIN`.
 * @returns Origin or empty string when unset.
 */
export function resolveApiBaseUrl(): string {
  return resolveWorkbenchApiUrl()
}

/**
 * Resolves the public web app origin (Gmail OAuth `returnOrigin`).
 * @returns Origin such as `https://powersource.work`, or empty when unset.
 */
export function resolveAppPublicOrigin(): string {
  const domain = import.meta.env.VITE_DEPLOYMENT_DOMAIN
  if (!domain) {
    return ''
  }
  const host = resolveDeploymentHost(domain)
  return host ? `https://${host}` : ''
}
