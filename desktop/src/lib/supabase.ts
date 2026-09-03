import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { resolveSupabaseUrl } from '@/config/deployment-urls'

const supabaseUrl = resolveSupabaseUrl()
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Missing VITE_DEPLOYMENT_DOMAIN or VITE_SUPABASE_ANON_KEY. Auth is disabled.',
  )
}

/**
 * Shared Supabase client for auth and per-user library data (direct + RLS).
 */
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: {
          detectSessionInUrl: false,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null

/** True when Supabase URL and anon key are configured. */
export const isSupabaseConfigured = Boolean(supabase)
