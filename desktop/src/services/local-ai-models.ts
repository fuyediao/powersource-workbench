/**
 * Probes local AI runtimes (Ollama / LM Studio / llama.cpp) for their
 * installed model list. These runtimes are Electron-only and intentionally
 * omitted from `backend/internal/ai/catalog/catalog.go` — Ask / Agent merge
 * this probe result into the desktop catalog instead.
 */

import {
  LOCAL_AI_PROVIDERS,
  type LocalAiProviderId,
} from '@/constants/local-ai-providers'
import { localAiModelsUrl, type LocalAiBaseUrlState } from '@/utils/settings/local-ai-prefs'
import type { AiCatalogModel } from '@/chat/ai-model-catalog'

interface OllamaTagsResponse {
  models?: Array<{ name?: string; model?: string }>
}

interface OpenAiStyleModelsResponse {
  data?: Array<{ id?: string }>
}

/**
 * Probes one local runtime's models endpoint.
 * @param providerId - Local runtime id.
 * @param overrides - Optional device-local base URL overrides.
 * @param signal - Optional abort signal.
 * @returns Catalog rows for that runtime's installed models, or an empty list when unreachable.
 */
export async function probeLocalAiModels(
  providerId: LocalAiProviderId,
  overrides?: LocalAiBaseUrlState,
  signal?: AbortSignal,
): Promise<AiCatalogModel[]> {
  const provider = LOCAL_AI_PROVIDERS.find((p) => p.id === providerId)
  if (!provider) {
    return []
  }
  const url = localAiModelsUrl(providerId, provider.modelsPath, overrides)
  if (!url) {
    return []
  }
  try {
    const response = await fetch(url, { method: 'GET', signal })
    if (!response.ok) {
      return []
    }
    if (provider.apiStyle === 'ollama') {
      const data = (await response.json()) as OllamaTagsResponse
      return (data.models ?? [])
        .map((row) => (row.model ?? row.name ?? '').trim())
        .filter((id) => id.length > 0)
        .map((id) => ({ id, provider: providerId, labelEn: id }))
    }
    const data = (await response.json()) as OpenAiStyleModelsResponse
    return (data.data ?? [])
      .map((row) => (row.id ?? '').trim())
      .filter((id) => id.length > 0)
      .map((id) => ({ id, provider: providerId, labelEn: id }))
  } catch {
    return []
  }
}

/**
 * Probes every local runtime in parallel.
 * @param overrides - Optional device-local base URL overrides.
 * @param signal - Optional abort signal.
 * @returns Combined catalog rows from every reachable local runtime.
 */
export async function probeAllLocalAiModels(
  overrides?: LocalAiBaseUrlState,
  signal?: AbortSignal,
): Promise<AiCatalogModel[]> {
  const results = await Promise.all(
    LOCAL_AI_PROVIDERS.map((provider) =>
      probeLocalAiModels(provider.id as LocalAiProviderId, overrides, signal),
    ),
  )
  return results.flat()
}
