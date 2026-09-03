import {
  LOCAL_AI_PROVIDER_IDS,
  LOCAL_AI_PROVIDERS,
  type LocalAiProviderId,
  isLocalAiProviderId,
} from '@/constants/local-ai-providers'

const LS_BASE_URLS = 'ai_local_provider_base_urls'

/** Sparse map of local provider id → base URL. */
export type LocalAiBaseUrlState = Partial<Record<LocalAiProviderId, string>>

/**
 * Normalizes a base URL (trim, strip trailing slash).
 * @param raw - Incoming URL.
 * @returns Clean URL or empty.
 */
export function normalizeLocalAiBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

/**
 * Default base URL for a local provider.
 * @param id - Local provider id.
 * @returns Default origin.
 */
export function defaultLocalAiBaseUrl(id: LocalAiProviderId): string {
  const row = LOCAL_AI_PROVIDERS.find((p) => p.id === id)
  return row?.baseUrl ?? ''
}

/**
 * Reads device-local base URL overrides from localStorage.
 * @returns Sparse overrides (defaults not stored).
 */
export function readLocalAiBaseUrls(): LocalAiBaseUrlState {
  try {
    const raw = localStorage.getItem(LS_BASE_URLS)
    if (!raw) {
      return {}
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: LocalAiBaseUrlState = {}
    for (const id of LOCAL_AI_PROVIDER_IDS) {
      const value = parsed[id]
      if (typeof value === 'string') {
        const normalized = normalizeLocalAiBaseUrl(value)
        if (normalized) {
          out[id] = normalized
        }
      }
    }
    return out
  } catch {
    return {}
  }
}

/**
 * Persists device-local base URL overrides.
 * @param urls - Sparse map.
 * @returns Nothing.
 */
export function writeLocalAiBaseUrls(urls: LocalAiBaseUrlState): void {
  const out: Record<string, string> = {}
  for (const id of LOCAL_AI_PROVIDER_IDS) {
    const value = urls[id]
    if (!value) {
      continue
    }
    const normalized = normalizeLocalAiBaseUrl(value)
    const fallback = defaultLocalAiBaseUrl(id)
    if (normalized && normalized !== fallback) {
      out[id] = normalized
    }
  }
  if (Object.keys(out).length === 0) {
    localStorage.removeItem(LS_BASE_URLS)
    return
  }
  localStorage.setItem(LS_BASE_URLS, JSON.stringify(out))
}

/**
 * Resolves the effective base URL for a local provider (override or default).
 * @param id - Provider id.
 * @param overrides - Optional preloaded overrides.
 * @returns Absolute base URL without trailing slash.
 */
export function resolveLocalAiBaseUrl(
  id: string,
  overrides?: LocalAiBaseUrlState,
): string {
  if (!isLocalAiProviderId(id)) {
    return ''
  }
  const localId = id as LocalAiProviderId
  const bag = overrides ?? readLocalAiBaseUrls()
  const fromBag = bag[localId]
  if (fromBag) {
    return normalizeLocalAiBaseUrl(fromBag)
  }
  return defaultLocalAiBaseUrl(localId)
}

/**
 * Builds a models-list URL for a local provider using the effective base URL.
 * @param id - Local provider id.
 * @param modelsPath - Path from catalog (e.g. `/api/tags`).
 * @param overrides - Optional base URL overrides.
 * @returns Absolute URL or empty.
 */
export function localAiModelsUrl(
  id: string,
  modelsPath: string,
  overrides?: LocalAiBaseUrlState,
): string {
  const base = resolveLocalAiBaseUrl(id, overrides)
  if (!base) {
    return ''
  }
  const path = modelsPath.startsWith('/') ? modelsPath : `/${modelsPath}`
  return `${base}${path}`
}
