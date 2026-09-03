/**
 * Shared vertical model-list menu content for the legacy Insight pickers
 * (Customer / KOL AI summary, T&E AI review): one row per allowlisted
 * catalog model, grouped by vendor, each row showing "vendor icon +
 * Vendor · Model" (same row shape as {@link ../chat/ai-combined-model-picker}).
 * Each panel keeps its own trigger button; this only renders menu rows.
 */

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { chatProviderIcon, groupAiModelsByProvider, insightCombinedLabel, type AiCatalogModel } from '@/chat/ai-model-catalog'
import type { ChatModelId } from '@/chat/chat-types'

interface InsightAiModelMenuProps {
  /** Allowlisted catalog rows to show (already filtered to the four Insight vendors). */
  models: AiCatalogModel[]
  /** Currently selected vendor slug. */
  selectedProvider: string | undefined
  /** Currently selected vendor model id. */
  selectedModelId: string | undefined
  /** Whether a vendor has a configured BYOK API key. */
  isConfigured: (provider: string) => boolean
  /** Called when the user picks a catalog row. */
  onSelect: (provider: ChatModelId, modelId: string) => void
  /** Localized "no API key" suffix appended to a disabled row's title. */
  noKeyLabel: string
}

/**
 * Renders the grouped, scrollable model rows shared by every Insight picker menu.
 * @param props - Catalog, selection, and configuration gating.
 * @returns Menu row list.
 */
export function InsightAiModelMenu({
  models,
  selectedProvider,
  selectedModelId,
  isConfigured,
  onSelect,
  noKeyLabel,
}: InsightAiModelMenuProps) {
  const { t, i18n } = useTranslation()
  const groups = useMemo(() => groupAiModelsByProvider(models), [models])

  return (
    <>
      {groups.flatMap((group) => {
        const GroupIcon = chatProviderIcon(group.provider)
        const groupConfigured = isConfigured(group.provider)
        return group.models.map((model) => {
          const selected = model.provider === selectedProvider && model.id === selectedModelId
          const label = insightCombinedLabel(model.provider, model.id, t, i18n.exists)
          return (
            <button
              key={`${model.provider}:${model.id}`}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={!groupConfigured}
              title={groupConfigured ? label : `${label} — ${noKeyLabel}`}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold ${
                !groupConfigured
                  ? 'cursor-not-allowed text-muted opacity-40'
                  : selected
                    ? 'bg-brand/10 text-brand'
                    : 'text-ink hover:bg-brand/5'
              }`}
              onClick={() => {
                if (groupConfigured) {
                  onSelect(model.provider, model.id)
                }
              }}
            >
              <GroupIcon className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{label}</span>
            </button>
          )
        })
      })}
    </>
  )
}
