/**
 * Electron AI model catalog helpers: defaults, persistence, and label keys.
 */

import type { ChatModelId } from '@/chat/chat-types'
import type { ChatAssistantKind } from '@/types/chat'
import {
  BotIcon,
  ChatGptIcon,
  ClaudeIcon,
  GeminiIcon,
  GrokIcon,
  getAiProviderIcon,
} from '@/icons/AllIcons'
import type { ReactElement, SVGProps } from 'react'

/** One allowlisted vendor model from GET /ai/models. */
export interface AiCatalogModel {
  id: string
  provider: ChatModelId
  labelEn: string
  default?: boolean
  vision?: boolean
  computerUse?: boolean
  /** Vendor-native reasoning / thinking levels from GET /ai/models. */
  reasoningEfforts?: string[]
  /** Catalog default when the user has not picked a level. */
  defaultReasoningEffort?: string
}

/** Persisted Electron chat model selection. */
export interface ElectronAiModelSelection {
  provider: ChatModelId
  modelId: string
}

const STORAGE_KEY = 'electron_ai_model_selection'

/**
 * localStorage key for the last model on one Ask / Agent surface.
 * Ask keeps the unscoped key so existing preferences still apply.
 * @param kind - Surface that owns the picker
 * @returns Storage key
 */
function selectionStorageKey(kind?: ChatAssistantKind): string {
  if (!kind || kind === 'ask') return STORAGE_KEY
  return `${STORAGE_KEY}_${kind}`
}

/** Fallback catalog when GET /ai/models is unavailable (official IDs only). */
export const ELECTRON_FALLBACK_MODELS: AiCatalogModel[] = [
  { id: 'gpt-5.6-sol', provider: 'chatgpt', labelEn: 'GPT-5.6 Sol', default: true, vision: true, computerUse: true },
  { id: 'gpt-5.6-terra', provider: 'chatgpt', labelEn: 'GPT-5.6 Terra', vision: true, computerUse: true },
  { id: 'gpt-5.6-luna', provider: 'chatgpt', labelEn: 'GPT-5.6 Luna', vision: true, computerUse: true },
  { id: 'gpt-5.5', provider: 'chatgpt', labelEn: 'GPT-5.5', vision: true, computerUse: true },
  { id: 'gpt-5.5-pro', provider: 'chatgpt', labelEn: 'GPT-5.5 Pro' },
  { id: 'gpt-5.4', provider: 'chatgpt', labelEn: 'GPT-5.4', vision: true, computerUse: true },
  { id: 'gpt-5.4-pro', provider: 'chatgpt', labelEn: 'GPT-5.4 Pro' },
  { id: 'gpt-5.4-mini', provider: 'chatgpt', labelEn: 'GPT-5.4 Mini' },
  { id: 'gpt-5.4-nano', provider: 'chatgpt', labelEn: 'GPT-5.4 Nano' },
  { id: 'gpt-5.3-codex', provider: 'chatgpt', labelEn: 'GPT-5.3 Codex' },
  { id: 'gpt-5.2', provider: 'chatgpt', labelEn: 'GPT-5.2', vision: true, computerUse: true },
  { id: 'gpt-5.2-pro', provider: 'chatgpt', labelEn: 'GPT-5.2 Pro' },
  { id: 'gpt-5.1', provider: 'chatgpt', labelEn: 'GPT-5.1' },
  { id: 'gpt-5', provider: 'chatgpt', labelEn: 'GPT-5' },
  { id: 'gpt-5-mini', provider: 'chatgpt', labelEn: 'GPT-5 Mini' },
  { id: 'gpt-5-nano', provider: 'chatgpt', labelEn: 'GPT-5 Nano' },
  { id: 'gpt-5-pro', provider: 'chatgpt', labelEn: 'GPT-5 Pro' },
  { id: 'o3-pro', provider: 'chatgpt', labelEn: 'o3 Pro' },
  { id: 'o3', provider: 'chatgpt', labelEn: 'o3' },
  { id: 'gpt-4.1', provider: 'chatgpt', labelEn: 'GPT-4.1' },
  { id: 'gpt-4.1-mini', provider: 'chatgpt', labelEn: 'GPT-4.1 Mini' },
  { id: 'gpt-4o', provider: 'chatgpt', labelEn: 'GPT-4o', vision: true, computerUse: true },
  { id: 'gpt-4o-mini', provider: 'chatgpt', labelEn: 'GPT-4o Mini', vision: true, computerUse: true },
  { id: 'gemini-3.7-flash', provider: 'gemini', labelEn: 'Gemini 3.7 Flash', vision: true, computerUse: true },
  { id: 'gemini-3.6-flash', provider: 'gemini', labelEn: 'Gemini 3.6 Flash', vision: true, computerUse: true },
  { id: 'gemini-3.5-flash', provider: 'gemini', labelEn: 'Gemini 3.5 Flash', vision: true, computerUse: true },
  { id: 'gemini-3.5-flash-lite', provider: 'gemini', labelEn: 'Gemini 3.5 Flash-Lite', vision: true, computerUse: true },
  { id: 'gemini-3.1-flash-lite', provider: 'gemini', labelEn: 'Gemini 3.1 Flash-Lite', vision: true, computerUse: true },
  { id: 'gemini-3.1-pro-preview', provider: 'gemini', labelEn: 'Gemini 3.1 Pro', default: true, vision: true, computerUse: true },
  { id: 'gemini-3-flash-preview', provider: 'gemini', labelEn: 'Gemini 3 Flash', vision: true, computerUse: true },
  { id: 'gemini-2.5-pro', provider: 'gemini', labelEn: 'Gemini 2.5 Pro', vision: true, computerUse: true },
  { id: 'gemini-2.5-flash', provider: 'gemini', labelEn: 'Gemini 2.5 Flash', vision: true, computerUse: true },
  { id: 'gemini-2.5-flash-lite', provider: 'gemini', labelEn: 'Gemini 2.5 Flash-Lite', vision: true, computerUse: true },
  { id: 'claude-opus-5', provider: 'claude', labelEn: 'Opus 5', default: true, vision: true, computerUse: true },
  { id: 'claude-fable-5-1', provider: 'claude', labelEn: 'Fable 5.1', vision: true, computerUse: true },
  { id: 'claude-fable-5', provider: 'claude', labelEn: 'Fable 5', vision: true, computerUse: true },
  { id: 'claude-sonnet-5', provider: 'claude', labelEn: 'Sonnet 5', vision: true, computerUse: true },
  { id: 'claude-opus-4-8', provider: 'claude', labelEn: 'Opus 4.8', vision: true, computerUse: true },
  { id: 'claude-opus-4-7', provider: 'claude', labelEn: 'Opus 4.7', vision: true, computerUse: true },
  { id: 'claude-opus-4-6', provider: 'claude', labelEn: 'Opus 4.6', vision: true, computerUse: true },
  { id: 'claude-opus-4-5-20251101', provider: 'claude', labelEn: 'Opus 4.5', vision: true, computerUse: true },
  { id: 'claude-sonnet-4-6', provider: 'claude', labelEn: 'Sonnet 4.6', vision: true, computerUse: true },
  { id: 'claude-sonnet-4-5-20250929', provider: 'claude', labelEn: 'Sonnet 4.5', vision: true, computerUse: true },
  { id: 'claude-haiku-4-5-20251001', provider: 'claude', labelEn: 'Haiku 4.5', vision: true, computerUse: true },
  { id: 'grok-4.6', provider: 'grok', labelEn: 'Grok 4.6', vision: true, computerUse: true },
  { id: 'grok-4.5', provider: 'grok', labelEn: 'Grok 4.5', default: true, vision: true, computerUse: true },
  { id: 'grok-4.3', provider: 'grok', labelEn: 'Grok 4.3', vision: true, computerUse: true },
  { id: 'grok-4.20', provider: 'grok', labelEn: 'Grok 4.20', vision: true, computerUse: true },
  { id: 'grok-4.20-0309-reasoning', provider: 'grok', labelEn: 'Grok 4.20 Reasoning', vision: true, computerUse: true },
  { id: 'grok-4.20-0309-non-reasoning', provider: 'grok', labelEn: 'Grok 4.20 Non-reasoning', vision: true, computerUse: true },
  { id: 'grok-build-0.1', provider: 'grok', labelEn: 'Grok Build 0.1', vision: true, computerUse: true },
]

/** Provider display order: the four flagships first, then remaining catalog order. */
export const AI_PROVIDER_ORDER: ChatModelId[] = ['chatgpt', 'gemini', 'claude', 'grok']

/**
 * Returns the i18n key for a vendor model id.
 * Dots in API ids are replaced so i18next path parsing stays flat.
 * @param modelId - Vendor API model id
 * @returns Locale path under chat.modelSelector.models
 */
export function modelLabelKey(modelId: string): string {
  return `chat.modelSelector.models.${modelId.replace(/\./g, '_')}`
}

/**
 * Returns the i18n key for a provider group header.
 * Chat slugs stay under chat.modelSelector; other vendors reuse Settings names.
 * @param provider - Chat or Settings provider slug
 * @returns Locale path
 */
export function providerLabelKey(provider: ChatModelId): string {
  if (
    provider === 'chatgpt' ||
    provider === 'gemini' ||
    provider === 'claude' ||
    provider === 'grok'
  ) {
    return `chat.modelSelector.providers.${provider}`
  }
  return `settings.ai.providers.${provider}`
}

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  chatgpt: 'ChatGPT',
  openai: 'OpenAI',
  claude: 'Claude',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  grok: 'Grok',
  deepseek: 'DeepSeek',
  mistral: 'Mistral',
  moonshot: 'Moonshot',
  minimax: 'MiniMax',
  zhipu: 'ZhiPu',
  perplexity: 'Perplexity',
  stepfun: 'StepFun',
}

/**
 * Returns a brand-cased label for a catalog provider slug.
 * Used when Chat / Settings locale folders are not loaded yet.
 * @param provider - Catalog provider id
 * @returns Display name (for example `Gemini`, not `gemini`)
 */
export function providerDisplayName(provider: string): string {
  const known = PROVIDER_DISPLAY_NAMES[provider]
  if (known) {
    return known
  }
  return provider
    .split(/[-_]/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/**
 * Returns API-key bag aliases for a catalog provider slug.
 * @param provider - Catalog provider id
 * @returns Lookup keys in the BYOK bag
 */
export function providerKeyAliases(provider: string): string[] {
  switch (provider) {
    case 'chatgpt':
      return ['openai', 'chatgpt']
    case 'claude':
      return ['anthropic', 'claude']
    default:
      return [provider]
  }
}

/**
 * Combined vendor + explicit-model label for the legacy four-vendor Insight
 * pickers (Customer / KOL AI summary, T&E AI review), e.g.
 * `Gemini · Gemini 3.1 Pro`. Unlike the old vendor-only label, this always
 * names the specific catalog model the caller passed in.
 * @param provider - Vendor slug (chatgpt | gemini | claude | grok)
 * @param modelId - Vendor API model id (falls back to the provider's default row when omitted)
 * @param t - i18next translate function
 * @param exists - i18next `exists` check bound to the active language
 * @returns Combined display label, or the vendor name alone when the model id is unknown
 */
export function insightCombinedLabel(
  provider: ChatModelId,
  modelId: string | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
  exists: (key: string) => boolean,
): string {
  const providerKey = providerLabelKey(provider)
  const providerText = exists(providerKey) ? t(providerKey) : providerDisplayName(provider)
  const catalogModel = modelId
    ? ELECTRON_FALLBACK_MODELS.find((m) => m.provider === provider && m.id === modelId)
    : ELECTRON_FALLBACK_MODELS.find((m) => m.provider === provider && m.default)
  if (!catalogModel) {
    return providerText
  }
  const modelKey = modelLabelKey(catalogModel.id)
  const modelText = exists(modelKey) ? t(modelKey) : catalogModel.labelEn
  return t('chat.modelSelector.combinedLabel', { provider: providerText, model: modelText })
}

/** A resolved vendor + specific catalog model pair for one Insight picker. */
export interface InsightModelRef {
  provider: ChatModelId
  modelId: string
}

/**
 * Resolves a value saved in `customers.ai_summary_model`, `kols.ai_summary_model`,
 * or `te_submissions.ai_review_model` into a vendor + specific catalog model
 * pair, for both legacy rows (bare vendor slug, e.g. `"gemini"`) and rows
 * saved after per-model selection shipped (a specific catalog id, e.g.
 * `"gpt-5.6-luna"`).
 * @param raw - Stored column value
 * @returns Resolved provider + model id, or null when unrecognized
 */
export function resolveSavedInsightModelRef(raw: string | null | undefined): InsightModelRef | null {
  const value = raw?.trim()
  if (!value) {
    return null
  }
  if (value === 'chatgpt' || value === 'gemini' || value === 'claude' || value === 'grok') {
    const defaultModel = ELECTRON_FALLBACK_MODELS.find((m) => m.provider === value && m.default)
    return defaultModel ? { provider: value, modelId: defaultModel.id } : null
  }
  const match = ELECTRON_FALLBACK_MODELS.find((m) => m.id === value)
  return match ? { provider: match.provider, modelId: match.id } : null
}

/**
 * Resolves the brand icon for a catalog provider slug.
 * @param provider - Catalog provider id
 * @returns Icon component
 */
export function chatProviderIcon(provider: string): (props: SVGProps<SVGSVGElement>) => ReactElement {
  switch (provider) {
    case 'chatgpt':
    case 'openai':
      return ChatGptIcon
    case 'claude':
    case 'anthropic':
      return ClaudeIcon
    case 'gemini':
      return GeminiIcon
    case 'grok':
      return GrokIcon
    default:
      return getAiProviderIcon(provider) ?? BotIcon
  }
}

/**
 * Loads the last Electron model selection from localStorage.
 * @param kind - Ask or Agent surface; Ask uses the legacy unscoped key
 * @returns Selection or null when missing / invalid
 */
export function loadElectronAiModelSelection(kind?: ChatAssistantKind): ElectronAiModelSelection | null {
  try {
    const raw = localStorage.getItem(selectionStorageKey(kind))
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
 * Persists the Electron model selection.
 * @param selection - Provider + vendor model id
 * @param kind - Ask or Agent surface; Ask uses the legacy unscoped key
 */
export function saveElectronAiModelSelection(
  selection: ElectronAiModelSelection,
  kind?: ChatAssistantKind,
): void {
  try {
    localStorage.setItem(selectionStorageKey(kind), JSON.stringify(selection))
  } catch {
    // ignore quota
  }
}

/**
 * Picks a valid selection from catalog + optional saved preference.
 * @param models - Catalog rows
 * @param saved - Optional persisted selection
 * @returns Provider and modelId known to the catalog
 */
export function resolveElectronAiSelection(
  models: AiCatalogModel[],
  saved: ElectronAiModelSelection | null,
): ElectronAiModelSelection {
  if (saved) {
    const match = models.find((m) => m.provider === saved.provider && m.id === saved.modelId)
    if (match) return { provider: match.provider, modelId: match.id }
  }
  const geminiDefault =
    models.find((m) => m.provider === 'gemini' && m.default) ??
    models.find((m) => m.provider === 'gemini')
  if (geminiDefault) {
    return { provider: geminiDefault.provider, modelId: geminiDefault.id }
  }
  const first = models[0]
  if (first) return { provider: first.provider, modelId: first.id }
  return { provider: 'gemini', modelId: 'gemini-3.1-pro-preview' }
}

/**
 * Groups catalog models by provider in display order.
 * @param models - Flat catalog
 * @returns Ordered groups with at least one model each
 */
export function groupAiModelsByProvider(
  models: AiCatalogModel[],
): Array<{ provider: ChatModelId; models: AiCatalogModel[] }> {
  const byProvider = new Map<ChatModelId, AiCatalogModel[]>()
  for (const m of models) {
    const list = byProvider.get(m.provider) ?? []
    list.push(m)
    byProvider.set(m.provider, list)
  }
  const out: Array<{ provider: ChatModelId; models: AiCatalogModel[] }> = []
  const seen = new Set<ChatModelId>()
  for (const provider of AI_PROVIDER_ORDER) {
    const group = byProvider.get(provider)
    if (group && group.length > 0) {
      out.push({ provider, models: group })
      seen.add(provider)
    }
  }
  for (const m of models) {
    if (seen.has(m.provider)) continue
    const group = byProvider.get(m.provider)
    if (group && group.length > 0) {
      out.push({ provider: m.provider, models: group })
      seen.add(m.provider)
    }
  }
  return out
}
