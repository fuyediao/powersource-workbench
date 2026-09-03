/**
 * T&E application AI review tab: model picker, generate, and saved Markdown.
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TE_SECTION_CLASS } from '@/components/admin/te-application-shared'
import { InsightAiModelMenu } from '@/components/admin/insight-ai-model-menu'
import { RefreshIcon, SparklesIcon } from '@/icons/AllIcons'
import { chatProviderIcon, insightCombinedLabel } from '@/chat/ai-model-catalog'
import type { InsightAiModelSelection } from '@/hooks/use-insight-ai-model'
import type { AiCatalogModel } from '@/chat/ai-model-catalog'
import type { TeSubmission } from '@/services/te-submissions-repository'

/** Compact markdown host styles (customer AI summary parity). */
const AI_REVIEW_MD_CLASS = [
  'max-w-none text-xs leading-relaxed text-ink',
  '[&_h1]:mt-3 [&_h1]:mb-1 [&_h1]:text-[0.8125rem] [&_h1]:font-semibold [&_h1]:leading-snug [&_h1]:text-ink',
  '[&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-[0.8125rem] [&_h2]:font-semibold [&_h2]:leading-snug [&_h2]:text-ink',
  '[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-[0.8125rem] [&_h3]:font-semibold [&_h3]:leading-snug',
  '[&_h4]:mt-2 [&_h4]:mb-1 [&_h4]:text-xs [&_h4]:font-semibold [&_h4]:leading-snug',
  '[&_h5]:mt-2 [&_h5]:mb-1 [&_h5]:text-xs [&_h5]:font-semibold',
  '[&_h6]:mt-2 [&_h6]:mb-1 [&_h6]:text-xs [&_h6]:font-semibold',
  '[&_h1:first-child]:mt-0 [&_h2:first-child]:mt-0 [&_h3:first-child]:mt-0 [&_h4:first-child]:mt-0',
  '[&_p]:mb-2 [&_p:last-child]:mb-0',
  '[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4',
  '[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-4',
  '[&_li]:mb-0.5 [&_li]:leading-[1.55]',
  '[&_strong]:font-semibold [&_strong]:text-ink',
  '[&_b]:font-semibold [&_b]:text-ink',
  '[&_em]:italic',
  '[&_code]:rounded [&_code]:bg-ink/5 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.7rem]',
  '[&_blockquote]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:border-ink/20 [&_blockquote]:pl-2 [&_blockquote]:text-muted',
  '[&_a]:break-all [&_a]:text-brand [&_a]:underline',
  '[&_hr]:my-3 [&_hr]:border-ink/10',
  '[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse text-[0.7rem]',
  '[&_th]:border [&_th]:border-ink/10 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold',
  '[&_td]:border [&_td]:border-ink/10 [&_td]:px-2 [&_td]:py-1',
].join(' ')

interface TeApplicationAiReviewTabProps {
  submission: TeSubmission
  displayHtml: string
  displayText: string
  hasContent: boolean
  models: AiCatalogModel[]
  selection: InsightAiModelSelection | null
  loading: boolean
  error: string
  isConfigured: (provider: string) => boolean
  hasAnyApiKey: boolean
  formatSavedAt: (iso: string | null) => string
  onSelectModel: (provider: string, modelId: string) => void
  onGenerate: () => void
}

/**
 * AI review generate / regenerate card with model picker.
 *
 * @param props - Review state and actions
 * @returns AI review tab UI
 */
export function TeApplicationAiReviewTab({
  submission,
  displayHtml,
  displayText,
  hasContent,
  models,
  selection,
  loading,
  error,
  isConfigured,
  hasAnyApiKey,
  formatSavedAt,
  onSelectModel,
  onGenerate,
}: TeApplicationAiReviewTabProps) {
  const { t, i18n } = useTranslation()
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const selectedLabel = selection
    ? insightCombinedLabel(selection.provider, selection.modelId, t, i18n.exists)
    : ''
  const selectedReady = selection ? isConfigured(selection.provider) : false
  const SelectedIcon = chatProviderIcon(selection?.provider ?? 'gemini')

  useEffect(() => {
    if (!modelMenuOpen) return
    /**
     * Close the model picker when clicking elsewhere.
     *
     * @param event - Document click
     */
    function onDocumentClick(event: MouseEvent): void {
      const target = event.target as HTMLElement
      if (!target.closest('[data-dropdown="aiModel"]')) setModelMenuOpen(false)
    }
    document.addEventListener('click', onDocumentClick)
    return () => document.removeEventListener('click', onDocumentClick)
  }, [modelMenuOpen])

  const generateLabel = loading
    ? t('admin.te.aiReview.loading')
    : hasContent
      ? t('admin.te.aiReview.regenerate')
      : t('admin.te.aiReview.generate')

  return (
    <div className="space-y-6">
      <section className={TE_SECTION_CLASS}>
        <header className="flex items-center gap-2 border-b border-brand/20 bg-brand/10 px-4 py-2.5">
          <SparklesIcon className="size-3.5 shrink-0 text-brand" />
          <h3 className="flex-1 text-sm font-semibold text-ink">
            {t('admin.te.section.aiReview')}
          </h3>
        </header>
        <div className="space-y-3 p-4 md:p-5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!hasAnyApiKey || loading}
              className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                !hasAnyApiKey || loading
                  ? 'cursor-not-allowed border-ink/10 bg-white/40 text-muted opacity-40 dark:border-white/10'
                  : 'cursor-pointer border-brand/50 bg-brand/15 text-brand hover:bg-brand/25'
              }`}
              onClick={onGenerate}
            >
              {loading ? (
                <RefreshIcon className="size-3 animate-spin" />
              ) : hasContent ? (
                <RefreshIcon className="size-3" />
              ) : (
                <SparklesIcon className="size-3" />
              )}
              {generateLabel}
            </button>

            <div className="relative shrink-0" data-dropdown="aiModel">
              <button
                type="button"
                disabled={loading}
                title={!selectedReady ? `${selectedLabel} — ${t('admin.te.aiReview.noKey')}` : selectedLabel}
                aria-label={t('admin.te.aiReview.modelPickerAria', {
                  model: selectedLabel,
                })}
                aria-expanded={modelMenuOpen}
                className={`flex size-[29px] shrink-0 items-center justify-center rounded-lg border border-ink/10 bg-white/70 text-ink transition-colors hover:border-brand/40 hover:text-ink dark:border-white/10 dark:bg-white/5 ${
                  loading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                }`}
                onClick={(event) => {
                  event.stopPropagation()
                  if (!loading) setModelMenuOpen((open) => !open)
                }}
              >
                <SelectedIcon className={`size-[18px] shrink-0 ${selectedReady ? '' : 'opacity-40'}`} />
              </button>
              {modelMenuOpen ? (
                <div
                  className="absolute top-full right-0 z-30 mt-1 max-h-80 min-w-[13rem] overflow-y-auto rounded-lg border border-ink/10 bg-white/95 py-1 shadow-xl dark:border-white/10 dark:bg-zinc-950/95"
                  onClick={(event) => event.stopPropagation()}
                >
                  <InsightAiModelMenu
                    models={models}
                    selectedProvider={selection?.provider}
                    selectedModelId={selection?.modelId}
                    isConfigured={isConfigured}
                    onSelect={(provider, modelId) => {
                      onSelectModel(provider, modelId)
                      setModelMenuOpen(false)
                    }}
                    noKeyLabel={t('admin.te.aiReview.noKey')}
                  />
                </div>
              ) : null}
            </div>
          </div>

          {!hasAnyApiKey ? (
            <p className="text-[11px] text-muted">{t('admin.te.aiReview.noKey')}</p>
          ) : error && error !== 'no_key' ? (
            <p className="text-[11px] text-rose-500">{error}</p>
          ) : null}

          {displayText ? (
            <div
              className={AI_REVIEW_MD_CLASS}
              dangerouslySetInnerHTML={{ __html: displayHtml }}
            />
          ) : null}

          {hasContent || loading ? (
            <div className="flex items-center justify-between gap-2">
              <p className="flex-1 text-[10px] leading-snug text-muted">
                {t('admin.te.aiReview.privacy')}
              </p>
              {submission.aiReviewGeneratedAt ? (
                <p className="shrink-0 text-[10px] text-muted">
                  {t('admin.te.aiReview.savedAt', {
                    time: formatSavedAt(submission.aiReviewGeneratedAt),
                  })}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
