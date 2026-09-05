/**
 * Catalog reasoning-effort helpers for Settings Models.
 *
 * Depth lists come from GET /ai/models (`reasoningEfforts`). The fallback map
 * mirrors backend/internal/ai/catalog/reasoning.go for offline catalog rows.
 */

import type { AiCatalogModel } from '@/chat/ai-model-catalog'

/** Vendor effort ids the Models allowlist can display. */
export const CATALOG_REASONING_EFFORTS = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultra',
] as const

/** One catalog-backed reasoning depth. */
export type CatalogReasoningEffort = (typeof CATALOG_REASONING_EFFORTS)[number]

interface ReasoningProfile {
  efforts: CatalogReasoningEffort[]
  defaultEffort: CatalogReasoningEffort
}

/**
 * Offline copy of catalog/reasoning.go. Used only when GET /ai/models omits
 * reasoning fields (older API) or the local fallback catalog is in use.
 */
const FALLBACK_REASONING: Record<string, ReasoningProfile> = {
  'chatgpt:gpt-5.6-sol': { efforts: ['low', 'medium', 'high', 'xhigh'], defaultEffort: 'low' },
  'chatgpt:gpt-5.6-terra': { efforts: ['low', 'medium', 'high', 'xhigh'], defaultEffort: 'medium' },
  'chatgpt:gpt-5.6-luna': { efforts: ['low', 'medium', 'high', 'xhigh'], defaultEffort: 'medium' },
  'chatgpt:gpt-5.5': { efforts: ['low', 'medium', 'high', 'xhigh'], defaultEffort: 'medium' },
  'chatgpt:gpt-5.5-pro': { efforts: ['high'], defaultEffort: 'high' },
  'chatgpt:gpt-5.4': { efforts: ['low', 'medium', 'high', 'xhigh'], defaultEffort: 'medium' },
  'chatgpt:gpt-5.4-pro': { efforts: ['high'], defaultEffort: 'high' },
  'chatgpt:gpt-5.4-mini': { efforts: ['low', 'medium', 'high', 'xhigh'], defaultEffort: 'medium' },
  'chatgpt:gpt-5.4-nano': { efforts: ['low', 'medium', 'high', 'xhigh'], defaultEffort: 'medium' },
  'chatgpt:gpt-5.3-codex': { efforts: ['low', 'medium', 'high', 'xhigh'], defaultEffort: 'medium' },
  'chatgpt:gpt-5.2': { efforts: ['low', 'medium', 'high', 'xhigh'], defaultEffort: 'medium' },
  'chatgpt:gpt-5.2-pro': { efforts: ['high'], defaultEffort: 'high' },
  'chatgpt:gpt-5.1': { efforts: ['none', 'low', 'medium', 'high', 'xhigh'], defaultEffort: 'none' },
  'chatgpt:gpt-5': { efforts: ['minimal', 'low', 'medium', 'high'], defaultEffort: 'medium' },
  'chatgpt:gpt-5-mini': { efforts: ['minimal', 'low', 'medium', 'high'], defaultEffort: 'medium' },
  'chatgpt:gpt-5-nano': { efforts: ['minimal', 'low', 'medium', 'high'], defaultEffort: 'medium' },
  'chatgpt:gpt-5-pro': { efforts: ['high'], defaultEffort: 'high' },
  'chatgpt:o3': { efforts: ['low', 'medium', 'high'], defaultEffort: 'medium' },
  'chatgpt:o3-pro': { efforts: ['high'], defaultEffort: 'high' },
  'gemini:gemini-3.7-flash': { efforts: ['low', 'medium', 'high'], defaultEffort: 'medium' },
  'gemini:gemini-3.6-flash': { efforts: ['minimal', 'low', 'medium', 'high'], defaultEffort: 'medium' },
  'gemini:gemini-3.5-flash': { efforts: ['minimal', 'low', 'medium', 'high'], defaultEffort: 'medium' },
  'gemini:gemini-3.5-flash-lite': { efforts: ['minimal', 'low', 'medium', 'high'], defaultEffort: 'minimal' },
  'gemini:gemini-3.1-flash-lite': { efforts: ['minimal', 'low', 'medium', 'high'], defaultEffort: 'minimal' },
  'gemini:gemini-3.1-pro-preview': { efforts: ['low', 'medium', 'high'], defaultEffort: 'high' },
  'gemini:gemini-3-flash-preview': { efforts: ['minimal', 'low', 'medium', 'high'], defaultEffort: 'high' },
  'gemini:gemini-2.5-pro': { efforts: ['low', 'medium', 'high'], defaultEffort: 'medium' },
  'gemini:gemini-2.5-flash': { efforts: ['low', 'medium', 'high'], defaultEffort: 'medium' },
  'gemini:gemini-2.5-flash-lite': { efforts: ['none', 'low', 'medium', 'high'], defaultEffort: 'none' },
  'claude:claude-opus-5': { efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'high' },
  'claude:claude-fable-5-1': { efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'high' },
  'claude:claude-fable-5': { efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'high' },
  'claude:claude-sonnet-5': { efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'high' },
  'claude:claude-opus-4-8': { efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'high' },
  'claude:claude-opus-4-7': { efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'high' },
  'claude:claude-opus-4-6': { efforts: ['low', 'medium', 'high', 'max'], defaultEffort: 'high' },
  'claude:claude-opus-4-5-20251101': { efforts: ['low', 'medium', 'high'], defaultEffort: 'high' },
  'claude:claude-sonnet-4-6': { efforts: ['low', 'medium', 'high', 'max'], defaultEffort: 'high' },
  'grok:grok-4.6': { efforts: ['low', 'medium', 'high', 'xhigh'], defaultEffort: 'high' },
  'grok:grok-4.5': { efforts: ['low', 'medium', 'high'], defaultEffort: 'high' },
  'grok:grok-4.3': { efforts: ['none', 'low', 'medium', 'high'], defaultEffort: 'low' },
}

/**
 * Returns whether a string is a known catalog reasoning effort id.
 * @param value - Candidate
 * @returns True when the value is a supported effort
 */
export function isCatalogReasoningEffort(value: string): value is CatalogReasoningEffort {
  return (CATALOG_REASONING_EFFORTS as readonly string[]).includes(value)
}

/**
 * Fills reasoning fields from the offline catalog map when the API omitted them.
 * @param model - Catalog row
 * @returns Row with reasoningEfforts when the model has adjustable depth
 */
export function withCatalogReasoning(model: AiCatalogModel): AiCatalogModel {
  const apiEfforts = (model.reasoningEfforts ?? []).filter(isCatalogReasoningEffort)
  if (apiEfforts.length > 0) {
    const defaultEffort =
      model.defaultReasoningEffort && isCatalogReasoningEffort(model.defaultReasoningEffort)
        ? model.defaultReasoningEffort
        : apiEfforts[0]
    return { ...model, reasoningEfforts: apiEfforts, defaultReasoningEffort: defaultEffort }
  }
  const profile = FALLBACK_REASONING[`${model.provider}:${model.id}`]
  if (!profile) return { ...model, reasoningEfforts: undefined, defaultReasoningEffort: undefined }
  return {
    ...model,
    reasoningEfforts: profile.efforts,
    defaultReasoningEffort: profile.defaultEffort,
  }
}
