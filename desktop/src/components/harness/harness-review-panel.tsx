/**
 * Embedded Git review page for the Harness utility workspace.
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshIcon } from '@/icons/AllIcons'
import type { HarnessReviewSnapshot } from '@/types/harness'

interface HarnessReviewPanelProps {
  /** Active Harness working directory. */
  cwd: string | null
}

/** Renders Git status and unified diffs for the selected workspace. */
export function HarnessReviewPanel({ cwd }: HarnessReviewPanelProps) {
  const { t } = useTranslation()
  const [snapshot, setSnapshot] = useState<HarnessReviewSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /** Refreshes the working-tree snapshot from the main process. */
  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      const bridge = window.workbench?.harness
      if (!bridge?.readReview) throw new Error(t('harness.utility.unavailable'))
      setSnapshot(await bridge.readReview(cwd))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('harness.utility.loadError'))
    } finally {
      setLoading(false)
    }
  }, [cwd, t])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="harness-review-page">
      <div className="flex shrink-0 items-center justify-end border-b border-zinc-950/10 px-3 py-2 dark:border-white/10">
        <button
          type="button"
          className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-brand/10 hover:text-brand disabled:opacity-40"
          aria-label={t('harness.utility.refresh')}
          disabled={loading}
          onClick={() => void refresh()}
        >
          <RefreshIcon className={`size-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {loading && !snapshot ? (
          <p className="text-xs font-medium text-muted">{t('harness.utility.loading')}</p>
        ) : error ? (
          <p className="text-xs font-semibold text-danger">{error}</p>
        ) : !snapshot?.repository ? (
          <p className="text-xs font-medium text-muted">{t('harness.utility.reviewNotRepository')}</p>
        ) : !snapshot.status && !snapshot.diff ? (
          <p className="text-xs font-medium text-muted">{t('harness.utility.reviewClean')}</p>
        ) : (
          <div className="space-y-4">
            {snapshot.status ? (
              <section>
                <h3 className="mb-2 text-xs font-extrabold text-ink">{t('harness.utility.reviewStatus')}</h3>
                <pre className="overflow-auto rounded-xl bg-zinc-950/5 p-3 font-mono text-[11px] leading-5 whitespace-pre-wrap text-ink dark:bg-white/5">
                  {snapshot.status}
                </pre>
              </section>
            ) : null}
            {snapshot.summary ? (
              <section>
                <h3 className="mb-2 text-xs font-extrabold text-ink">{t('harness.utility.reviewSummary')}</h3>
                <pre className="overflow-auto rounded-xl bg-zinc-950/5 p-3 font-mono text-[11px] leading-5 whitespace-pre-wrap text-ink dark:bg-white/5">
                  {snapshot.summary}
                </pre>
              </section>
            ) : null}
            {snapshot.diff ? (
              <section>
                <h3 className="mb-2 text-xs font-extrabold text-ink">{t('harness.utility.reviewDiff')}</h3>
                <pre className="overflow-auto rounded-xl bg-zinc-950/5 p-3 font-mono text-[11px] leading-5 whitespace-pre text-ink dark:bg-white/5">
                  {snapshot.diff}
                </pre>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
