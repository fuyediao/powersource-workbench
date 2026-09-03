/**
 * Static PBC scoring rubric (1–5 + N/A).
 */

import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

const RUBRIC_ROWS = [
  {
    scoreKey: 'score5',
    descKey: 'desc5',
    colorClass: 'bg-emerald-100 border-emerald-300 text-emerald-950 dark:bg-emerald-950/80 dark:border-emerald-700 dark:text-emerald-100',
  },
  {
    scoreKey: 'score4',
    descKey: 'desc4',
    colorClass: 'bg-green-100 border-green-300 text-green-950 dark:bg-green-950/80 dark:border-green-700 dark:text-green-100',
  },
  {
    scoreKey: 'score3',
    descKey: 'desc3',
    colorClass: 'bg-amber-100 border-amber-300 text-amber-950 dark:bg-amber-950/80 dark:border-amber-700 dark:text-amber-100',
  },
  {
    scoreKey: 'score2',
    descKey: 'desc2',
    colorClass: 'bg-orange-100 border-orange-300 text-orange-950 dark:bg-orange-950/80 dark:border-orange-700 dark:text-orange-100',
  },
  {
    scoreKey: 'score1',
    descKey: 'desc1',
    colorClass: 'bg-rose-100 border-rose-300 text-rose-950 dark:bg-rose-950/80 dark:border-rose-700 dark:text-rose-100',
  },
  {
    scoreKey: 'score0',
    descKey: 'desc0',
    colorClass: 'bg-zinc-100 border-zinc-300 text-zinc-900 dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-100',
  },
] as const

/**
 * Scoring rubric grid under PBC tables.
 * @returns Rubric UI.
 */
export function PbcScoringRubric(): ReactNode {
  const { t } = useTranslation()
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-ink/15 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-950">
      <div className="border-b border-ink/10 bg-zinc-100 px-4 py-2 dark:bg-zinc-900">
        <span className="text-xs font-semibold tracking-wide text-ink uppercase">
          {t('admin.team.scoringRubric.title')}
        </span>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-ink/10 sm:grid-cols-3 lg:grid-cols-6">
        {RUBRIC_ROWS.map((row) => (
          <div key={row.scoreKey} className={`border px-3 py-3 text-xs ${row.colorClass}`}>
            <p className="mb-1 font-semibold">
              {t(`admin.team.scoringRubric.${row.scoreKey}`)}
            </p>
            <p className="leading-relaxed opacity-90">
              {t(`admin.team.scoringRubric.${row.descKey}`)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
