/**
 * Shared model-selection hook for the legacy four-vendor Insight pickers
 * (Customer AI Summary, KOL AI Summary, T&E AI Review): lets the user pick a
 * specific catalog model within ChatGPT / Gemini / Claude / Grok, instead of
 * always calling the backend's fixed per-vendor default.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ELECTRON_FALLBACK_MODELS,
  providerKeyAliases,
  resolveSavedInsightModelRef,
  type AiCatalogModel,
} from '@/chat/ai-model-catalog'
import type { ChatModelId } from '@/chat/chat-types'
import { useAiModelAllowlist } from '@/hooks/use-ai-model-allowlist'
import { filterEnabledAiModels } from '@/utils/settings/ai-model-allowlist'
import { listAiModels } from '@/services/ai-api'
import { getAiKey, readAiKeysFromLocalStorage, type AiKeysState } from '@/services/ai-keys-api'

/** The four legacy vendors these Insight endpoints support. */
const INSIGHT_PROVIDERS: ReadonlySet<ChatModelId> = new Set(['chatgpt', 'gemini', 'claude', 'grok'])

const FALLBACK_INSIGHT_MODELS: AiCatalogModel[] = ELECTRON_FALLBACK_MODELS.filter((m) =>
  INSIGHT_PROVIDERS.has(m.provider),
)

/** Provider + specific catalog model chosen for one Insight picker. */
export interface InsightAiModelSelection {
  provider: ChatModelId
  modelId: string
}

/**
 * Reads a persisted `{provider, modelId}` selection from sessionStorage.
 * @param sessionKey - Storage key scoping the selection to one surface.
 * @returns Parsed selection, or null when missing / invalid.
 */
function readSessionSelection(sessionKey: string): InsightAiModelSelection | null {
  try {
    const raw = sessionStorage.getItem(sessionKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const provider = (parsed as { provider?: unknown }).provider
    const modelId = (parsed as { modelId?: unknown }).modelId
    if (typeof provider === 'string' && provider.trim() && typeof modelId === 'string' && modelId.trim()) {
      return { provider: provider.trim(), modelId: modelId.trim() }
    }
  } catch {
    // ignore
  }
  return null
}

/**
 * Persists a `{provider, modelId}` selection to sessionStorage.
 * @param sessionKey - Storage key scoping the selection to one surface.
 * @param selection - Provider + catalog model id.
 * @returns Nothing.
 */
function writeSessionSelection(sessionKey: string, selection: InsightAiModelSelection): void {
  try {
    sessionStorage.setItem(sessionKey, JSON.stringify(selection))
  } catch {
    // ignore quota
  }
}

/**
 * Picks a starting selection: sessionStorage first, then the record's saved
 * model (legacy vendor slug or specific catalog id), then the catalog's
 * Gemini default, then the first row.
 * @param sessionKey - Storage key scoping the selection to one surface.
 * @param savedModel - Record's persisted model column, if any.
 * @param models - Catalog rows to validate against.
 * @returns A selection guaranteed to reference a known catalog row, when any exist.
 */
function pickInitialSelection(
  sessionKey: string,
  savedModel: string | null | undefined,
  models: AiCatalogModel[],
): InsightAiModelSelection | null {
  const session = readSessionSelection(sessionKey)
  if (session && models.some((m) => m.provider === session.provider && m.id === session.modelId)) {
    return session
  }
  const saved = resolveSavedInsightModelRef(savedModel)
  if (saved && models.some((m) => m.provider === saved.provider && m.id === saved.modelId)) {
    return saved
  }
  const geminiDefault = models.find((m) => m.provider === 'gemini' && m.default) ?? models.find((m) => m.provider === 'gemini')
  if (geminiDefault) {
    return { provider: geminiDefault.provider, modelId: geminiDefault.id }
  }
  const first = models[0]
  return first ? { provider: first.provider, modelId: first.id } : null
}

interface UseInsightAiModelOptions {
  /** sessionStorage key scoping the selection to one surface (Customer / KOL / T&E). */
  sessionKey: string
  /** Record's persisted model column (legacy vendor slug or specific catalog id); seeds the first selection only. */
  savedModel?: string | null
}

/**
 * Hook for one Insight picker's model selection: filtered + allowlisted
 * catalog, BYOK gating, session-persisted selection, and auto-fallback when
 * the current pick becomes unconfigured or disabled.
 * @param options - Session storage key and the record's saved model column.
 * @returns Catalog, selection state, gating, and a setter.
 */
export function useInsightAiModel({ sessionKey, savedModel }: UseInsightAiModelOptions) {
  const { overrides } = useAiModelAllowlist()
  const [rawModels, setRawModels] = useState<AiCatalogModel[]>(FALLBACK_INSIGHT_MODELS)
  const [keys, setKeys] = useState<AiKeysState>(() => readAiKeysFromLocalStorage())
  const [selection, setSelection] = useState<InsightAiModelSelection | null>(() =>
    pickInitialSelection(sessionKey, savedModel, FALLBACK_INSIGHT_MODELS),
  )

  const models = useMemo(() => filterEnabledAiModels(rawModels, overrides), [rawModels, overrides])

  useEffect(() => {
    let cancelled = false
    listAiModels('electron')
      .then((rows) => {
        if (cancelled) return
        const mapped: AiCatalogModel[] = rows
          .filter((r) => typeof r.provider === 'string' && INSIGHT_PROVIDERS.has(r.provider) && r.id.trim())
          .map((r) => ({
            id: r.id,
            provider: r.provider,
            labelEn: r.labelEn,
            default: r.default,
          }))
        if (mapped.length > 0) {
          setRawModels(mapped)
        }
      })
      .catch((err) => console.warn('[useInsightAiModel] Failed to load AI model catalog:', err))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per mount
  }, [])

  /**
   * Whether a catalog provider has a configured BYOK API key.
   * @param provider - Vendor slug.
   * @returns True when at least one key alias for the provider is set.
   */
  const isConfigured = useCallback(
    (provider: string): boolean => providerKeyAliases(provider).some((id) => Boolean(getAiKey(keys, id))),
    [keys],
  )

  /** Re-reads BYOK keys from localStorage (call after switching records). */
  const refreshKeys = useCallback((): void => {
    setKeys(readAiKeysFromLocalStorage())
  }, [])

  const isUsable = useCallback(
    (model: AiCatalogModel): boolean => isConfigured(model.provider),
    [isConfigured],
  )

  useEffect(() => {
    if (models.length === 0) return
    const current =
      selection && models.find((m) => m.provider === selection.provider && m.id === selection.modelId)
    if (current && isUsable(current)) {
      return
    }
    const fallback = models.find(isUsable) ?? models[0]
    if (fallback && (!selection || fallback.provider !== selection.provider || fallback.id !== selection.modelId)) {
      setSelection({ provider: fallback.provider, modelId: fallback.id })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isUsable closes over keys/overrides
  }, [models, keys, overrides])

  /**
   * Selects a catalog model and remembers it for the session.
   * @param provider - Vendor slug.
   * @param modelId - Vendor API model id.
   * @returns Nothing.
   */
  const selectModel = useCallback(
    (provider: ChatModelId, modelId: string): void => {
      const next = { provider, modelId }
      setSelection(next)
      writeSessionSelection(sessionKey, next)
    },
    [sessionKey],
  )

  const selectedModel = useMemo(
    () => (selection ? models.find((m) => m.provider === selection.provider && m.id === selection.modelId) : undefined),
    [models, selection],
  )
  const selectedReady = selection ? isConfigured(selection.provider) : false

  return {
    models,
    selection,
    selectedModel,
    selectedReady,
    isConfigured,
    selectModel,
    refreshKeys,
  }
}
