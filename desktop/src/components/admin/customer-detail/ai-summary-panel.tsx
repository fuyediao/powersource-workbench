/**
 * AI customer summary tab: view saved Markdown + Generate / Regenerate (web parity).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { detailSectionCardClass } from '@/components/admin/customer-detail/detail-shared'
import { InsightAiModelMenu } from '@/components/admin/insight-ai-model-menu'
import { ChevronDownIcon, SparklesIcon } from '@/icons/AllIcons'
import type { AppLanguage } from '@/i18n'
import { chatProviderIcon, insightCombinedLabel, resolveSavedInsightModelRef } from '@/chat/ai-model-catalog'
import type { CustomerInsightTrilingual } from '@/services/ai-api'
import { AiApiError, postCustomerSummary } from '@/services/ai-api'
import { useInsightAiModel } from '@/hooks/use-insight-ai-model'
import { listCustomerActivityLogs } from '@/services/customer-activity-logs-api'
import { listCustomerChannels } from '@/services/customer-channels-api'
import { listCustomerVisitLogs } from '@/services/customer-visit-logs-api'
import { listCustomerWorkItems } from '@/services/customer-work-items-api'
import { saveCustomerAiSummary } from '@/services/customers-api'
import type { CustomerActivityLog, CustomerDetail } from '@/types/customer'
import { pickAiSummaryForLocale } from '@/utils/ai-summary-locale'
import { sanitizeCustomerAiSummaryHtml } from '@/utils/ai-summary-markdown'
import { buildCustomerInsightContext } from '@/utils/customer-insight-context'
import { formatDisplayDateTime } from '@/utils/format-display-date'

interface AiSummaryPanelProps {
  customer: CustomerDetail
  /** Called after a successful generate + save so the parent can refresh. */
  onCustomerUpdated: (next: CustomerDetail) => void
}

const SESSION_KEY_MODEL = 'workbench-electron-customer-insight-model'

/** Compact markdown host styles (web `.ai-summary-md` parity, light theme tokens). */
const AI_SUMMARY_MD_CLASS =
  [
    'max-w-none text-sm leading-relaxed text-ink',
    '[&_h1]:mt-3 [&_h1]:mb-1 [&_h1]:text-sm [&_h1]:font-semibold [&_h1]:leading-snug [&_h1]:text-ink',
    '[&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:leading-snug [&_h2]:text-ink',
    '[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:leading-snug [&_h3]:text-ink',
    '[&_h4]:mt-2 [&_h4]:mb-1 [&_h4]:text-xs [&_h4]:font-semibold [&_h4]:leading-snug',
    '[&_h5]:mt-2 [&_h5]:mb-1 [&_h5]:text-xs [&_h5]:font-semibold',
    '[&_h6]:mt-2 [&_h6]:mb-1 [&_h6]:text-xs [&_h6]:font-semibold',
    '[&_h1:first-child]:mt-0 [&_h2:first-child]:mt-0 [&_h3:first-child]:mt-0 [&_h4:first-child]:mt-0',
    '[&_p]:mb-2 [&_p:last-child]:mb-0',
    '[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4',
    '[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-4',
    '[&_li]:mb-0.5 [&_li]:leading-snug',
    '[&_strong]:font-semibold [&_strong]:text-ink',
    '[&_b]:font-semibold [&_b]:text-ink',
    '[&_em]:italic',
    '[&_code]:rounded [&_code]:bg-ink/5 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.7rem]',
    '[&_blockquote]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:border-ink/20 [&_blockquote]:pl-2 [&_blockquote]:text-muted',
    '[&_a]:break-all [&_a]:text-brand [&_a]:underline',
    '[&_hr]:my-3 [&_hr]:border-ink/10',
    '[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse text-xs',
    '[&_th]:border [&_th]:border-ink/10 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold',
    '[&_td]:border [&_td]:border-ink/10 [&_td]:px-2 [&_td]:py-1',
  ].join(' ')

/**
 * Maps i18n language to AppLanguage for summary column pick.
 * @param language - i18next language string.
 * @returns App language.
 */
function toAppLanguage(language: string): AppLanguage {
  if (language === 'zh-CN' || language.startsWith('zh-Hans') || language === 'zh-cn') {
    return 'zh-CN'
  }
  if (language === 'zh-TW' || language.startsWith('zh-Hant') || language === 'zh-tw') {
    return 'zh-TW'
  }
  if (language === 'en' || language.startsWith('en')) {
    return 'en'
  }
  return 'zh-TW'
}

/**
 * Builds a plain-English activity narrative for the insight context.
 * @param logs - Activity rows (newest first expected).
 * @returns Narrative string.
 */
function buildActivityNarrative(logs: CustomerActivityLog[]): string {
  if (logs.length === 0) {
    return 'No recent activity logs.'
  }
  return logs
    .slice(0, 20)
    .map((log) => {
      const when = log.createdAt?.slice(0, 19) ?? ''
      const actor = log.actorEmail?.trim() || 'system'
      const fields = Object.keys(log.changedFields ?? {}).join(', ')
      const fieldBit = fields ? ` fields=[${fields}]` : ''
      return `${when} ${actor}: ${log.action} ${log.entityType}${fieldBit}`
    })
    .join('\n')
}

/**
 * Renders the AI customer summary tab with generate controls.
 * @param props - Customer detail and update callback.
 * @returns Panel UI.
 */
export function AiSummaryPanel({ customer, onCustomerUpdated }: AiSummaryPanelProps) {
  const { t, i18n } = useTranslation()
  const {
    models: insightModels,
    selection,
    selectedReady,
    isConfigured,
    selectModel,
    refreshKeys,
  } = useInsightAiModel({ sessionKey: SESSION_KEY_MODEL, savedModel: customer.aiSummaryModel })
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const text = pickAiSummaryForLocale(customer, toAppLanguage(i18n.language))
  const html = useMemo(() => sanitizeCustomerAiSummaryHtml(text ?? ''), [text])
  const hasSaved = Boolean(text?.trim())

  useEffect(() => {
    refreshKeys()
  }, [customer.id, refreshKeys])

  useEffect(() => {
    /**
     * Closes the model menu on outside click.
     * @param event - Mouse event.
     * @returns Nothing.
     */
    function onDocClick(event: MouseEvent): void {
      if (!menuRef.current?.contains(event.target as Node)) {
        setModelMenuOpen(false)
      }
    }
    if (modelMenuOpen) {
      document.addEventListener('mousedown', onDocClick)
    }
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [modelMenuOpen])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  /**
   * Generates a trilingual summary, saves it, and refreshes the parent customer.
   * @returns Nothing.
   */
  async function handleGenerate(): Promise<void> {
    if (generating) {
      return
    }
    if (!selection || !selectedReady) {
      setErrorMessage(t('admin.customers.detail.aiSummary.noKey'))
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setGenerating(true)
    setErrorMessage(null)

    try {
      const [workItems, visitLogs, channels, activityLogs] = await Promise.all([
        listCustomerWorkItems(customer.id).catch(() => []),
        listCustomerVisitLogs(customer.id).catch(() => []),
        listCustomerChannels(customer.id).catch(() => []),
        listCustomerActivityLogs(customer.id).catch(() => []),
      ])

      const context = buildCustomerInsightContext({
        customer,
        workItems,
        visitLogs,
        channels,
        activityNarrative: buildActivityNarrative(activityLogs),
        uiLocale: toAppLanguage(i18n.language),
      })

      const tri: CustomerInsightTrilingual = await postCustomerSummary(
        selection.provider,
        context,
        controller.signal,
        selection.modelId,
      )

      const next = await saveCustomerAiSummary(customer.id, tri, selection.modelId)
      onCustomerUpdated(next)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      const message =
        err instanceof AiApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t('admin.customers.detail.aiSummary.generateFailed')
      setErrorMessage(message)
      console.error('[AiSummaryPanel] generate:', err)
    } finally {
      setGenerating(false)
    }
  }

  const modelLabel = selection ? insightCombinedLabel(selection.provider, selection.modelId, t, i18n.exists) : ''
  const savedRef = resolveSavedInsightModelRef(customer.aiSummaryModel)
  const savedModelLabel = savedRef ? insightCombinedLabel(savedRef.provider, savedRef.modelId, t, i18n.exists) : null
  const SelectedIcon = chatProviderIcon(selection?.provider ?? 'gemini')

  return (
    <div className={detailSectionCardClass()}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-extrabold text-ink">
          {t('admin.customers.detail.aiSummary.title')}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div ref={menuRef} className="relative">
            <button
              type="button"
              className={`inline-flex max-w-[12rem] items-center gap-1.5 rounded-xl border border-ink/10 bg-canvas/80 px-2.5 py-1.5 text-xs font-semibold hover:border-brand/40 disabled:opacity-50 ${
                selectedReady ? 'text-ink' : 'text-muted'
              }`}
              disabled={generating}
              title={
                selectedReady
                  ? modelLabel
                  : `${modelLabel} — ${t('admin.customers.detail.aiSummary.noKey')}`
              }
              aria-label={t('admin.customers.detail.aiSummary.modelPickerAria', {
                model: modelLabel,
              })}
              aria-expanded={modelMenuOpen}
              onClick={() => setModelMenuOpen((open) => !open)}
            >
              <SelectedIcon
                className={`size-3.5 shrink-0 ${selectedReady ? '' : 'opacity-40'}`}
              />
              <span className="min-w-0 flex-1 truncate">{modelLabel}</span>
              <ChevronDownIcon
                className={`size-3.5 shrink-0 text-muted transition-transform ${modelMenuOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {modelMenuOpen ? (
              <div className="absolute right-0 z-20 mt-1 max-h-80 min-w-[13rem] overflow-y-auto rounded-xl border border-ink/10 bg-white py-1 shadow-lg dark:bg-zinc-900">
                <InsightAiModelMenu
                  models={insightModels}
                  selectedProvider={selection?.provider}
                  selectedModelId={selection?.modelId}
                  isConfigured={isConfigured}
                  onSelect={(provider, modelId) => {
                    selectModel(provider, modelId)
                    setModelMenuOpen(false)
                  }}
                  noKeyLabel={t('admin.customers.detail.aiSummary.noKey')}
                />
              </div>
            ) : null}
          </div>
          <button
            type="button"
            disabled={generating || !selectedReady}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-xs font-bold text-brand-fg disabled:opacity-50"
            onClick={() => void handleGenerate()}
          >
            <SparklesIcon className="size-3.5" />
            {generating
              ? t('admin.customers.detail.aiSummary.loading')
              : hasSaved
                ? t('admin.customers.detail.aiSummary.regenerate')
                : t('admin.customers.detail.aiSummary.generate')}
          </button>
        </div>
      </div>

      {errorMessage ? (
        <p className="mb-3 text-sm font-medium text-rose-500">{errorMessage}</p>
      ) : null}

      {!hasSaved && !generating ? (
        <p className="py-8 text-center text-sm text-muted">
          {t('admin.customers.detail.aiSummary.emptyHint')}
        </p>
      ) : null}

      {generating && !hasSaved ? (
        <p className="py-8 text-center text-sm text-muted">
          {t('admin.customers.detail.aiSummary.panelLoading')}
        </p>
      ) : null}

      {hasSaved ? (
        <div className="space-y-3">
          <div
            className={AI_SUMMARY_MD_CLASS}
            // HTML from Aura lib/mdtohtml + sanitize.
            dangerouslySetInnerHTML={{ __html: html }}
          />
          <div className="flex flex-wrap items-center gap-3 border-t border-ink/10 pt-3 text-[11px] text-muted">
            {customer.aiSummaryGeneratedAt ? (
              <span>
                {t('admin.customers.detail.aiSummary.savedAt', {
                  time: formatDisplayDateTime(customer.aiSummaryGeneratedAt),
                })}
              </span>
            ) : null}
            {savedModelLabel ? <span>{savedModelLabel}</span> : null}
          </div>
          <p className="text-[11px] text-muted">{t('admin.customers.detail.aiSummary.privacy')}</p>
        </div>
      ) : null}
    </div>
  )
}
