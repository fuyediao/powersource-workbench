/**
 * Normalizes a configured deployment domain to a hostname.
 * @param domain - Domain with or without an HTTP scheme.
 * @returns A hostname without trailing slashes.
 */
export function resolveDeploymentHost(domain: string): string {
  return domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
}

/** Resolves the public Supabase URL used by the desktop client. */
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

/** Reads the public Supabase API key embedded in the desktop build. */
export function resolveSupabasePublishableKey(): string {
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!key) throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY is required')
  return key
}

/** Resolves the internal email domain used to represent username-only accounts. */
export function resolveAccountEmailDomain(): string {
  return resolveDeploymentHost(import.meta.env.VITE_WORKBENCH_ACCOUNT_EMAIL_DOMAIN ?? '')
    || 'accounts.powersource.work'
}
