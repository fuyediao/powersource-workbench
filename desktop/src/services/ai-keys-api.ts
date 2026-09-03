import { isSupabaseConfigured, supabase } from '@/lib/supabase'

/** Legacy chat provider ids that still dual-write dedicated profile columns. */
export const LEGACY_AI_PROVIDER_IDS = ['openai', 'anthropic', 'gemini', 'grok'] as const

export type LegacyAiProviderId = (typeof LEGACY_AI_PROVIDER_IDS)[number]

/** Sparse map of Cherry-style provider id → API key. */
export type AiKeysState = Record<string, string>

/** @deprecated Prefer string provider ids from GET /ai/providers. */
export type AiModelKey = LegacyAiProviderId

const LS_BLOB = 'ai_provider_keys'
const LS_LEGACY: Record<LegacyAiProviderId, string> = {
  openai: 'openai_api_key',
  anthropic: 'anthropic_api_key',
  gemini: 'gemini_api_key',
  grok: 'grok_api_key',
}

/**
 * Normalizes a raw key bag (drops empty values, trims).
 * @param raw - Incoming map.
 * @returns Clean sparse map.
 */
export function normalizeAiKeys(raw: Record<string, unknown> | null | undefined): AiKeysState {
  const out: AiKeysState = {}
  if (!raw || typeof raw !== 'object') {
    return out
  }
  for (const [id, value] of Object.entries(raw)) {
    if (typeof value !== 'string') {
      continue
    }
    const trimmed = value.trim()
    if (trimmed) {
      out[id] = trimmed
    }
  }
  return out
}

/**
 * Reads one key from the bag.
 * @param keys - Key bag.
 * @param providerId - Provider id.
 * @returns Trimmed key or empty string.
 */
export function getAiKey(keys: AiKeysState, providerId: string): string {
  return (keys[providerId] ?? '').trim()
}

/**
 * Reads AI keys from localStorage (JSON blob + legacy single keys).
 * @returns Key bag.
 */
export function readAiKeysFromLocalStorage(): AiKeysState {
  let bag: AiKeysState = {}
  try {
    const raw = localStorage.getItem(LS_BLOB)
    if (raw) {
      bag = normalizeAiKeys(JSON.parse(raw) as Record<string, unknown>)
    }
  } catch {
    bag = {}
  }
  for (const id of LEGACY_AI_PROVIDER_IDS) {
    if (!bag[id]) {
      const legacy = localStorage.getItem(LS_LEGACY[id])
      if (legacy?.trim()) {
        bag[id] = legacy.trim()
      }
    }
  }
  return bag
}

/**
 * Writes AI keys through to localStorage (JSON blob + legacy keys).
 * @param keys - Key bag.
 * @returns Nothing.
 */
export function writeAiKeysToLocalStorage(keys: AiKeysState): void {
  const normalized = normalizeAiKeys(keys)
  localStorage.setItem(LS_BLOB, JSON.stringify(normalized))
  for (const id of LEGACY_AI_PROVIDER_IDS) {
    const value = normalized[id] ?? ''
    if (value) {
      localStorage.setItem(LS_LEGACY[id], value)
    } else {
      localStorage.removeItem(LS_LEGACY[id])
    }
  }
}

/**
 * Loads AI keys from profiles for an authenticated user.
 * @param userId - Auth user id.
 * @returns Key bag or null when unavailable.
 */
export async function fetchAiKeys(userId: string): Promise<AiKeysState | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('ai_provider_keys, openai_api_key, anthropic_api_key, gemini_api_key, grok_api_key')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) {
    return null
  }
  const row = data as {
    ai_provider_keys?: Record<string, unknown> | null
    openai_api_key?: string | null
    anthropic_api_key?: string | null
    gemini_api_key?: string | null
    grok_api_key?: string | null
  }
  const bag = normalizeAiKeys(row.ai_provider_keys ?? {})
  if (!bag.openai && row.openai_api_key?.trim()) {
    bag.openai = row.openai_api_key.trim()
  }
  if (!bag.anthropic && row.anthropic_api_key?.trim()) {
    bag.anthropic = row.anthropic_api_key.trim()
  }
  if (!bag.gemini && row.gemini_api_key?.trim()) {
    bag.gemini = row.gemini_api_key.trim()
  }
  if (!bag.grok && row.grok_api_key?.trim()) {
    bag.grok = row.grok_api_key.trim()
  }
  return bag
}

/**
 * Persists all AI keys to profiles + localStorage (dual-writes legacy columns).
 * @param userId - Optional auth user id.
 * @param keys - Key bag.
 * @returns True on success.
 */
export async function saveAiKeys(userId: string | undefined, keys: AiKeysState): Promise<boolean> {
  const normalized = normalizeAiKeys(keys)
  writeAiKeysToLocalStorage(normalized)
  if (!userId || !isSupabaseConfigured || !supabase) {
    return true
  }
  const update: Record<string, string | null | AiKeysState> = {
    updated_at: new Date().toISOString(),
    ai_provider_keys: normalized,
    openai_api_key: normalized.openai ?? null,
    anthropic_api_key: normalized.anthropic ?? null,
    gemini_api_key: normalized.gemini ?? null,
    grok_api_key: normalized.grok ?? null,
  }
  const { error } = await supabase.from('profiles').upsert({ id: userId, ...update }, { onConflict: 'id' })
  if (error) {
    console.error('saveAiKeys', error)
    return false
  }
  return true
}

/**
 * Clears all AI keys from profiles + localStorage.
 * @param userId - Optional auth user id.
 * @returns True on success.
 */
export async function clearAiKeys(userId: string | undefined): Promise<boolean> {
  return saveAiKeys(userId, {})
}

/**
 * Browser-side connectivity probe for one vendor key.
 * @param apiStyle - openai | anthropic | gemini | ollama | unsupported.
 * @param modelsUrl - Absolute models list URL (optional for unsupported).
 * @param apiKey - Candidate key (optional for ollama / auth-optional OpenAI-compat).
 * @returns Whether the probe succeeded and a short message.
 */
export async function testAiProviderBrowser(
  apiStyle: string,
  modelsUrl: string,
  apiKey: string,
): Promise<{ ok: boolean; message: string }> {
  const key = apiKey.trim()
  if (apiStyle === 'unsupported' || !modelsUrl.trim()) {
    return { ok: false, message: 'unsupported' }
  }
  if ((apiStyle === 'anthropic' || apiStyle === 'gemini') && !key) {
    return { ok: false, message: 'missing_key' }
  }
  try {
    switch (apiStyle) {
      case 'ollama': {
        const res = await fetch(modelsUrl)
        return { ok: res.ok, message: res.ok ? 'ok' : `HTTP ${res.status}` }
      }
      case 'anthropic': {
        const res = await fetch(modelsUrl, {
          headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
          },
        })
        return { ok: res.ok, message: res.ok ? 'ok' : `HTTP ${res.status}` }
      }
      case 'gemini': {
        const sep = modelsUrl.includes('?') ? '&' : '?'
        const res = await fetch(`${modelsUrl}${sep}key=${encodeURIComponent(key)}`)
        return { ok: res.ok, message: res.ok ? 'ok' : `HTTP ${res.status}` }
      }
      case 'openai': {
        const headers: Record<string, string> = {}
        if (key) {
          headers.Authorization = `Bearer ${key}`
        }
        const res = await fetch(modelsUrl, { headers })
        return { ok: res.ok, message: res.ok ? 'ok' : `HTTP ${res.status}` }
      }
      default:
        return { ok: false, message: 'unknown_style' }
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'network_error' }
  }
}

/**
 * @deprecated Use testAiProviderBrowser with catalog metadata.
 * @param model - Legacy provider.
 * @param apiKey - Key.
 * @returns Probe result.
 */
export async function testAiKeyBrowser(
  model: AiModelKey,
  apiKey: string,
): Promise<{ ok: boolean; message: string }> {
  const urls: Record<AiModelKey, { style: string; url: string }> = {
    openai: { style: 'openai', url: 'https://api.openai.com/v1/models' },
    anthropic: { style: 'anthropic', url: 'https://api.anthropic.com/v1/models' },
    gemini: {
      style: 'gemini',
      url: 'https://generativelanguage.googleapis.com/v1beta/models',
    },
    grok: { style: 'openai', url: 'https://api.x.ai/v1/models' },
  }
  const meta = urls[model]
  return testAiProviderBrowser(meta.style, meta.url, apiKey)
}
