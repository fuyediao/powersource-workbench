/**
 * Tier / rating criteria reference dialog for the KOL overview tab.
 */

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { getRatingStarClass, kolTierBadgeClass } from '@/constants/kol-constants'
import { CloseIcon, StarIcon } from '@/icons/AllIcons'
import type { KolTier } from '@/types/kol'
import { useDialogPresence } from '@/hooks/use-dialog-presence'

interface CriteriaTierRow {
  level: string
  categories: string[]
  strategy: string
}

interface CriteriaRatingRow {
  score: number
  criteria: string[]
}

interface CriteriaModalProps {
  open: boolean
  onClose: () => void
}

/**
 * Reads a nested i18n array (react-i18next `returnObjects`).
 * @param value - Translation result.
 * @returns Typed array, or empty when the key is missing.
 */
function asObjectArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

/**
 * Portal dialog listing KOL tier categories and rating score criteria.
 * @param props - Open state and close handler.
 * @returns Dialog, or null when unmounted.
 */
export function CriteriaModal({ open, onClose }: CriteriaModalProps) {
  const { t } = useTranslation()
  const presence = useDialogPresence(open)

  const tierRows = asObjectArray<CriteriaTierRow>(
    t('admin.kolDetail.criteria.tier.rows', { returnObjects: true }),
  )
  const ratingRows = asObjectArray<CriteriaRatingRow>(
    t('admin.kolDetail.criteria.rating.rows', { returnObjects: true }),
  )

  useEffect(() => {
    if (!open) {
      return
    }
    /**
     * Closes on Escape.
     * @param event - Keyboard event.
     * @returns Nothing.
     */
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!presence.mounted) {
    return null
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-[130] flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px] ${
        presence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label={t('admin.kolDetail.criteria.modalTitle')}
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-ink/10 px-5 py-4">
          <h2 className="min-w-0 truncate text-base font-extrabold text-ink">
            {t('admin.kolDetail.criteria.modalTitle')}
          </h2>
          <button
            type="button"
            className="rounded-lg p-1.5 text-muted hover:bg-ink/5 hover:text-ink"
            aria-label={t('actions.close')}
            onClick={onClose}
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">
              {t('admin.kolDetail.criteria.tier.section')}
            </h3>
            <div className="overflow-hidden rounded-xl border border-ink/10">
              <table className="w-full text-xs">
                <thead className="bg-canvas/80 text-muted">
                  <tr>
                    <th className="w-16 px-3 py-2 text-left font-medium">
                      {t('admin.kolDetail.criteria.tier.headerLevel')}
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      {t('admin.kolDetail.criteria.tier.headerCategories')}
                    </th>
                    <th className="w-40 px-3 py-2 text-left font-medium">
                      {t('admin.kolDetail.criteria.tier.headerStrategy')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {tierRows.map((row) => (
                    <tr key={row.level} className="align-top">
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex size-7 items-center justify-center rounded-md text-sm font-bold ${kolTierBadgeClass(
                            row.level as KolTier,
                          )}`}
                        >
                          {row.level}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 leading-relaxed text-ink">
                        <ul className="space-y-1">
                          {(row.categories ?? []).map((cat) => (
                            <li key={cat}>{cat}</li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-3 py-2.5 text-ink/80">{row.strategy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">
              {t('admin.kolDetail.criteria.rating.section')}
            </h3>
            <div className="overflow-hidden rounded-xl border border-ink/10">
              <table className="w-full text-xs">
                <thead className="bg-canvas/80 text-muted">
                  <tr>
                    <th className="w-20 px-3 py-2 text-left font-medium">
                      {t('admin.kolDetail.criteria.rating.headerScore')}
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      {t('admin.kolDetail.criteria.rating.headerCriteria')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {ratingRows.map((row) => (
                    <tr key={row.score} className="align-top">
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-0.5">
                          {Array.from({ length: row.score }, (_, index) => (
                            <StarIcon
                              key={index}
                              className={`size-3.5 ${getRatingStarClass(row.score)}`}
                              filled
                            />
                          ))}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 leading-relaxed text-ink">
                        <ul className="space-y-1">
                          {(row.criteria ?? []).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-ink/10 px-5 py-3">
          <p className="text-xs text-muted">{t('admin.kolDetail.criteria.modalCloseHint')}</p>
          <button
            type="button"
            className="rounded-xl bg-brand/15 px-4 py-2 text-sm font-semibold text-brand hover:bg-brand/25"
            onClick={onClose}
          >
            {t('actions.close')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
