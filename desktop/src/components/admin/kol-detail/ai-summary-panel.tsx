/**
 * AI KOL summary tab: view saved Markdown + Generate / Regenerate.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { detailSectionCardClass } from '@/components/admin/customer-detail/detail-shared'
import { InsightAiModelMenu } from '@/components/admin/insight-ai-model-menu'
import { RefreshIcon, SparklesIcon } from '@/icons/AllIcons'
import type { AppLanguage } from '@/i18n'
import { chatProviderIcon, insightCombinedLabel, resolveSavedInsightModelRef } from '@/chat/ai-model-catalog'
import type { CustomerInsightTrilingual } from '@/services/ai-api'
import { AiApiError, postKolSummary } from '@/services/ai-api'
import { useInsightAiModel } from '@/hooks/use-insight-ai-model'
import { saveKolAiSummary } from '@/services/kols-api'
import { labelsForProductCatalogIds } from '@/services/orders-te-api'
import type { KolChannel, KolDetail } from '@/types/kol'
import { pickAiSummaryForLocale } from '@/utils/ai-summary-locale'
import { sanitizeCustomerAiSummaryHtml } from '@/utils/ai-summary-markdown'
import { buildKolInsightContext } from '@/utils/kol-insight-context'
import { formatDisplayDateTime } from '@/utils/format-display-date'

interface AiSummaryPanelProps {
  kol: KolDetail
  channels: KolChannel[]
  editing: boolean
  onKolUpdated: (next: KolDetail) => void
}

const SESSION_KEY_MODEL = 'workbench-electron-kol-insight-model'

/** Compact markdown host styles (customer AI summary parity, light theme). */
const AI_SUMMARY_MD_CLASS = [
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
 * Renders the AI KOL summary tab with generate controls.
 * @param props - KOL detail, channels, edit lock, and update callback.
 * @returns Panel UI.
 */
export function AiSummaryPanel({
  kol,
  channels,
  editing,
  onKolUpdated,
}: AiSummaryPanelProps) {
  const { t, i18n } = useTranslation()
  const {
    models: insightModels,
    selection,
    selectedReady,
    isConfigured,
    selectModel,
    refreshKeys,
  } = useInsightAiModel({ sessionKey: SESSION_KEY_MODEL, savedModel: kol.aiSummaryModel })
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const text = pickAiSummaryForLocale(kol, toAppLanguage(i18n.language))
  const html = useMemo(() => sanitizeCustomerAiSummaryHtml(text ?? ''), [text])
  const hasSaved = Boolean(text?.trim())
  const hasAnyKey = insightModels.some((model) => isConfigured(model.provider))

  useEffect(() => {
    refreshKeys()
  }, [kol.id, refreshKeys])

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
   * Generates a trilingual summary, saves it, and refreshes the parent KOL.
   * @returns Nothing.
   */
  async function handleGenerate(): Promise<void> {
    if (generating) {
      return
    }
    if (editing) {
      setErrorMessage(t('admin.kolDetail.aiSummary.saveFirst'))
      return
    }
    if (!selection || !selectedReady) {
      setErrorMessage(t('admin.kolDetail.aiSummary.noKey'))
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setGenerating(true)
    setErrorMessage(null)

    try {
      const testedProducts = await labelsForProductCatalogIds(
        kol.testedProducts ?? [],
      )
      const context = buildKolInsightContext({
        kol: { ...kol, testedProducts },
        channels,
      })
      const tri: CustomerInsightTrilingual = await postKolSummary(
        selection.provider,
        context,
        controller.signal,
        selection.modelId,
      )
      const next = await saveKolAiSummary(kol.id, tri, selection.modelId)
      onKolUpdated(next)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      const message =
        err instanceof AiApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t('admin.kolDetail.aiSummary.noKey')
      setErrorMessage(message)
      console.error('[KolAiSummaryPanel] generate:', err)
    } finally {
      setGenerating(false)
    }
  }

  const modelLabel = selection ? insightCombinedLabel(selection.provider, selection.modelId, t, i18n.exists) : ''
  const savedRef = resolveSavedInsightModelRef(kol.aiSummaryModel)
  const savedModelLabel = savedRef ? insightCombinedLabel(savedRef.provider, savedRef.modelId, t, i18n.exists) : null
  const SelectedIcon = chatProviderIcon(selection?.provider ?? 'gemini')
  const showEmptyHint =
    hasAnyKey && !generating && !errorMessage && !hasSaved
  const showFooter = hasSaved || generating || showEmptyHint

  return (
    <div className={`${detailSectionCardClass()} space-y-4`}>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SparklesIcon className="size-4 shrink-0 text-brand" />
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
            {t('admin.kolDetail.aiSummary.title')}
          </h3>
        </div>
        <div
          className="flex min-w-0 items-center gap-2"
          role="group"
          aria-label={t('admin.kolDetail.aiSummary.toolbarGroupAria')}
        >
          <button
            type="button"
            disabled={!hasAnyKey || generating}
            className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-brand/40 bg-brand/15 px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand/25 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => void handleGenerate()}
          >
            {generating ? (
              <span className="inline-block size-3 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
            ) : hasSaved ? (
              <RefreshIcon className="size-3" />
            ) : (
              <SparklesIcon className="size-3" />
            )}
            {generating
              ? t('admin.kolDetail.aiSummary.loading')
              : hasSaved
                ? t('admin.kolDetail.aiSummary.regenerate')
                : t('admin.kolDetail.aiSummary.generate')}
          </button>
          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              disabled={generating}
              className={`flex size-[29px] shrink-0 items-center justify-center rounded-xl border border-ink/10 bg-canvas/80 text-ink hover:border-brand/40 disabled:opacity-50 ${
                selectedReady ? '' : 'text-muted'
              }`}
              title={
                selectedReady
                  ? modelLabel
                  : `${modelLabel} — ${t('admin.kolDetail.aiSummary.noKey')}`
              }
              aria-label={t('admin.kolDetail.aiSummary.modelPickerAria', {
                model: modelLabel,
              })}
              aria-expanded={modelMenuOpen}
              onClick={() => setModelMenuOpen((open) => !open)}
            >
              <SelectedIcon
                className={`size-4 shrink-0 ${selectedReady ? '' : 'opacity-40'}`}
              />
            </button>
            {modelMenuOpen ? (
              <div className="absolute top-full right-0 z-20 mt-1 max-h-80 min-w-[13rem] overflow-y-auto rounded-xl border border-ink/10 bg-white py-1 shadow-xl dark:bg-zinc-900">
                <InsightAiModelMenu
                  models={insightModels}
                  selectedProvider={selection?.provider}
                  selectedModelId={selection?.modelId}
                  isConfigured={isConfigured}
                  onSelect={(provider, modelId) => {
                    selectModel(provider, modelId)
                    setModelMenuOpen(false)
                  }}
                  noKeyLabel={t('admin.kolDetail.aiSummary.noKey')}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {!hasAnyKey ? (
          <p className="flex items-start gap-1 text-[11px] text-muted">
            {t('admin.kolDetail.aiSummary.noKey')}
          </p>
        ) : null}

        {errorMessage ? (
          <p className="text-[11px] font-medium text-rose-500">{errorMessage}</p>
        ) : null}

        {hasSaved ? (
          <div
            className={AI_SUMMARY_MD_CLASS}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : null}

        {generating && !hasSaved ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-ink/15 bg-canvas/40 px-4 py-10">
            <span className="inline-block size-4 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
            <p className="text-xs text-muted">
              {t('admin.kolDetail.aiSummary.panelLoading')}
            </p>
          </div>
        ) : null}

        {showEmptyHint ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-ink/15 bg-canvas/40 px-4 py-10 text-center">
            <SparklesIcon className="size-[22px] shrink-0 text-muted" />
            <p className="max-w-sm text-xs leading-relaxed text-muted">
              {t('admin.kolDetail.aiSummary.emptyHint')}
            </p>
          </div>
        ) : null}

        {showFooter ? (
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <p className="min-w-0 flex-1 text-[10px] leading-snug text-muted">
              {t('admin.kolDetail.aiSummary.privacy')}
            </p>
            {kol.aiSummaryGeneratedAt ? (
              <p className="shrink-0 text-[10px] text-muted">
                {t('admin.kolDetail.aiSummary.savedAt', {
                  time: formatDisplayDateTime(kol.aiSummaryGeneratedAt),
                })}
              </p>
            ) : null}
          </div>
        ) : null}
        {savedModelLabel && hasSaved ? (
          <p className="text-[10px] text-muted">{savedModelLabel}</p>
        ) : null}
      </div>
    </div>
  )
}
