/**
 * Harness reasoning-effort helpers.
 *
 * Depth lists come from GET /ai/models (`reasoningEfforts`). The fallback map
 * mirrors backend/internal/ai/catalog/reasoning.go for offline catalog rows.
 */

import type { AiCatalogModel } from '@/chat/ai-model-catalog'

/** Codex / vendor effort ids the Agent picker can send on `turn/start`. */
export const HARNESS_REASONING_EFFORTS = [
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
export type HarnessReasoningEffort = (typeof HARNESS_REASONING_EFFORTS)[number]

const STORAGE_KEY = 'workbench.electron.harness.reasoningEffort.v1'

const QUOTA_HINT_LEVELS = new Set<HarnessReasoningEffort>(['xhigh', 'max', 'ultra'])

interface ReasoningProfile {
  efforts: HarnessReasoningEffort[]
  defaultEffort: HarnessReasoningEffort
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
 * Returns whether a string is a known Codex reasoning effort id.
 * @param value - Candidate
 * @returns True when the value is a supported effort
 */
export function isHarnessReasoningEffort(value: string): value is HarnessReasoningEffort {
  return (HARNESS_REASONING_EFFORTS as readonly string[]).includes(value)
}

/**
 * Fills reasoning fields from the offline catalog map when the API omitted them.
 * @param model - Catalog row
 * @returns Row with reasoningEfforts when the model has adjustable depth
 */
export function withCatalogReasoning(model: AiCatalogModel): AiCatalogModel {
  const apiEfforts = (model.reasoningEfforts ?? []).filter(isHarnessReasoningEffort)
  if (apiEfforts.length > 0) {
    const defaultEffort =
      model.defaultReasoningEffort && isHarnessReasoningEffort(model.defaultReasoningEffort)
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

/**
 * Returns whether the Agent composer should show a depth picker.
 * Single-option models (for example gpt-5-pro = high) stay hidden.
 * @param model - Selected catalog row
 * @returns True when the user can choose among two or more levels
 */
export function showHarnessReasoningPicker(model: AiCatalogModel | undefined): boolean {
  return (model?.reasoningEfforts?.length ?? 0) >= 2
}

/**
 * Resolves a stored or default effort for the selected model.
 * Codex extras `max` / `ultra` that the current catalog no longer lists
 * coerce to Extra high when that step exists.
 * @param model - Selected catalog row
 * @param stored - Last saved effort for this model, if any
 * @returns Catalog-clamped effort, or empty when the model has no depth control
 */
export function resolveHarnessReasoningEffort(
  model: AiCatalogModel | undefined,
  stored: string | null,
): HarnessReasoningEffort | '' {
  const efforts = model?.reasoningEfforts?.filter(isHarnessReasoningEffort) ?? []
  if (efforts.length === 0) return ''
  const fallback =
    model?.defaultReasoningEffort && isHarnessReasoningEffort(model.defaultReasoningEffort)
      ? model.defaultReasoningEffort
      : efforts[0]
  if (stored && isHarnessReasoningEffort(stored) && efforts.includes(stored)) return stored
  if ((stored === 'max' || stored === 'ultra') && efforts.includes('xhigh')) return 'xhigh'
  if ((stored === 'max' || stored === 'ultra') && efforts.includes('high')) return 'high'
  return fallback ?? ''
}

/**
 * Returns whether this effort should show the faster-quota hint.
 * @param effort - Selected effort
 * @returns True for extra-high and above
 */
export function reasoningShowsQuotaHint(effort: string): boolean {
  return isHarnessReasoningEffort(effort) && QUOTA_HINT_LEVELS.has(effort)
}

/**
 * Maps a selected effort onto a discrete slider index for this model.
 * @param levels - Catalog efforts in display order
 * @param effort - Current effort
 * @returns Clamped index, or 0 when the list is empty
 */
export function effortSliderIndex(levels: readonly string[], effort: string): number {
  const index = levels.indexOf(effort)
  if (index >= 0) return index
  return 0
}

/**
 * Reads the catalog effort at a snapped slider index.
 * @param levels - Catalog efforts in display order
 * @param index - Slider index
 * @returns Effort id, or empty when the list is empty
 */
export function effortAtSliderIndex(levels: readonly string[], index: number): string {
  if (levels.length === 0) return ''
  const clamped = Math.min(levels.length - 1, Math.max(0, Math.round(index)))
  return levels[clamped] ?? ''
}

/**
 * Snaps a pointer X position onto the nearest discrete step.
 * @param clientX - Pointer X in viewport coordinates
 * @param trackLeft - Track left edge
 * @param trackWidth - Track width
 * @param count - Step count (must be >= 1)
 * @returns Index in `0 … count-1`
 */
export function snapSliderIndex(
  clientX: number,
  trackLeft: number,
  trackWidth: number,
  count: number,
): number {
  if (count <= 1 || trackWidth <= 0) return 0
  const ratio = (clientX - trackLeft) / trackWidth
  return Math.round(Math.min(1, Math.max(0, ratio)) * (count - 1))
}

/**
 * Loads the last effort chosen for one provider + model id.
 * @param provider - Catalog provider
 * @param modelId - Vendor model id
 * @returns Stored effort or null
 */
export function loadHarnessReasoningEffort(provider: string, modelId: string): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const value = (parsed as Record<string, unknown>)[`${provider}:${modelId}`]
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

/**
 * Persists the effort chosen for one provider + model id.
 * @param provider - Catalog provider
 * @param modelId - Vendor model id
 * @param effort - Catalog-clamped effort
 */
export function saveHarnessReasoningEffort(provider: string, modelId: string, effort: string): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : {}
    const record =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? { ...(parsed as Record<string, string>) }
        : {}
    record[`${provider}:${modelId}`] = effort
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
  } catch {
    // ignore quota
  }
}
