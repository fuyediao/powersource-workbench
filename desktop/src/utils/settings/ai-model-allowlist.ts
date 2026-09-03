/**
 * Desktop-only AI model allowlist: which catalog (and local runtime) models
 * appear in Electron pickers. Persisted as sparse overrides in local SQLite
 * via `window.workbench.aiModelAllowlist`; absent rows fall back to
 * {@link DEFAULT_ENABLED_MODEL_IDS}. Website `GET /ai/models?client=web` and
 * workbench-web pickers are unrelated to this file.
 */

import { ELECTRON_FALLBACK_MODELS, type AiCatalogModel } from '@/chat/ai-model-catalog'

/** One explicit enable/disable override loaded from local SQLite. */
export interface AiModelAllowlistRow {
  provider: string
  modelId: string
  enabled: boolean
}

/**
 * Latest catalog id per flagship vendor turned on by default on an empty
 * allowlist database. Pinned explicitly so a catalog refresh cannot silently
 * change what a fresh install shows — bump this constant instead.
 */
const DEFAULT_ENABLED_MODEL_IDS: ReadonlySet<string> = new Set([
  'chatgpt:gpt-5.6-sol',
  'claude:claude-fable-5-1',
  'gemini:gemini-3.7-flash',
  'grok:grok-4.6',
])

/**
 * Builds the allowlist map key for one catalog model.
 * @param provider - Catalog provider id.
 * @param modelId - Vendor or local runtime model id.
 * @returns Composite key.
 */
export function aiModelAllowlistKey(provider: string, modelId: string): string {
  return `${provider}:${modelId}`
}

/**
 * Whether a model is on by default when the allowlist database is empty.
 * Local Ollama / LM Studio / llama.cpp models are never in this set.
 * @param provider - Catalog provider id.
 * @param modelId - Vendor model id.
 * @returns True for the pinned default catalog ids.
 */
export function isAiModelEnabledByDefault(provider: string, modelId: string): boolean {
  return DEFAULT_ENABLED_MODEL_IDS.has(aiModelAllowlistKey(provider, modelId))
}

/**
 * Resolves whether one model should appear in desktop pickers.
 * @param provider - Catalog provider id.
 * @param modelId - Vendor or local runtime model id.
 * @param overrides - Loaded allowlist overrides.
 * @returns Effective enabled flag (override wins; otherwise the default set).
 */
export function isAiModelEnabled(
  provider: string,
  modelId: string,
  overrides: ReadonlyMap<string, boolean>,
): boolean {
  const key = aiModelAllowlistKey(provider, modelId)
  const override = overrides.get(key)
  if (override !== undefined) {
    return override
  }
  return isAiModelEnabledByDefault(provider, modelId)
}

/**
 * Filters a catalog down to allowlisted models.
 * @param models - Catalog rows (cloud and/or local).
 * @param overrides - Loaded allowlist overrides.
 * @returns Only the enabled rows, in the original order.
 */
export function filterEnabledAiModels<T extends { provider: string; id: string }>(
  models: readonly T[],
  overrides: ReadonlyMap<string, boolean>,
): T[] {
  return models.filter((model) => isAiModelEnabled(model.provider, model.id, overrides))
}

/**
 * Whether at least one catalog model of a vendor is enabled. Used by
 * vendor-only pickers (customer / KOL insight, T&E review) that do not
 * expose a per-model id.
 * @param provider - Catalog provider id (e.g. `gemini`).
 * @param overrides - Loaded allowlist overrides.
 * @param catalog - Reference catalog to check against (defaults to the offline fallback list).
 * @returns True when the vendor has at least one enabled model.
 */
export function isAiVendorEnabled(
  provider: string,
  overrides: ReadonlyMap<string, boolean>,
  catalog: readonly AiCatalogModel[] = ELECTRON_FALLBACK_MODELS,
): boolean {
  return catalog.some(
    (model) => model.provider === provider && isAiModelEnabled(model.provider, model.id, overrides),
  )
}

function rowsToOverrideMap(rows: readonly AiModelAllowlistRow[]): Map<string, boolean> {
  const map = new Map<string, boolean>()
  for (const row of rows) {
    if (row.provider.trim() && row.modelId.trim()) {
      map.set(aiModelAllowlistKey(row.provider, row.modelId), Boolean(row.enabled))
    }
  }
  return map
}

let overridesCache: Map<string, boolean> | null = null
let pendingLoad: Promise<Map<string, boolean>> | null = null
const overrideListeners = new Set<() => void>()

/**
 * Notifies every subscriber that the allowlist overrides changed.
 * @returns Nothing.
 */
function notifyAiModelAllowlistListeners(): void {
  overrideListeners.forEach((listener) => listener())
}

/**
 * Returns the last-loaded overrides without triggering an IPC round-trip.
 * @returns Cached overrides, or an empty map before the first load.
 */
export function getAiModelAllowlistSnapshot(): Map<string, boolean> {
  return overridesCache ?? new Map()
}

/**
 * Subscribes to allowlist override changes (Settings toggles, refresh, or
 * writes from any other surface sharing this module).
 * @param listener - Callback invoked after the cache updates.
 * @returns Unsubscribe function.
 */
export function subscribeAiModelAllowlist(listener: () => void): () => void {
  overrideListeners.add(listener)
  return () => {
    overrideListeners.delete(listener)
  }
}

/**
 * Loads allowlist overrides from local SQLite (via IPC), memoizing the result.
 * @param forceRefresh - Bypasses the memo and re-reads from IPC.
 * @returns Loaded overrides map.
 */
export async function loadAiModelAllowlist(forceRefresh = false): Promise<Map<string, boolean>> {
  if (overridesCache && !forceRefresh) {
    return overridesCache
  }
  if (pendingLoad && !forceRefresh) {
    return pendingLoad
  }
  pendingLoad = (async () => {
    try {
      const rows = (await window.workbench?.aiModelAllowlist?.list?.()) ?? []
      const map = rowsToOverrideMap(rows)
      overridesCache = map
      notifyAiModelAllowlistListeners()
      return map
    } catch {
      const map = overridesCache ?? new Map()
      overridesCache = map
      return map
    } finally {
      pendingLoad = null
    }
  })()
  return pendingLoad
}

/**
 * Persists one enable/disable override and updates every subscriber
 * optimistically (Settings and every open picker stay in sync live).
 * @param provider - Catalog provider id.
 * @param modelId - Vendor or local runtime model id.
 * @param enabled - Whether the model should appear in desktop pickers.
 * @returns Nothing.
 */
export async function setAiModelAllowlistEnabled(
  provider: string,
  modelId: string,
  enabled: boolean,
): Promise<void> {
  const next = new Map(overridesCache ?? new Map())
  next.set(aiModelAllowlistKey(provider, modelId), enabled)
  overridesCache = next
  notifyAiModelAllowlistListeners()
  try {
    await window.workbench?.aiModelAllowlist?.set?.(provider, modelId, enabled)
  } catch {
    // Optimistic cache already applied; a later refresh reconciles on failure.
  }
}
