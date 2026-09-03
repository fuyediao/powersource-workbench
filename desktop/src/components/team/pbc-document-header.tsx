/**
 * PBC document header (meta fields + score card + overall goals).
 */

import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckIcon, CloseIcon, PencilIcon } from '@/icons/AllIcons'
import { updatePbcDocument } from '@/services/pbc-api'
import type { PbcDocument } from '@/types/pbc'

interface PbcDocumentHeaderProps {
  document: PbcDocument
  canEdit: boolean
  totalScore?: number | null
  onSaved: (doc: PbcDocument) => void
}

/**
 * Grade letter derived from weighted total score 0–5.
 * @param score - Total score or null.
 * @returns Grade metadata or null.
 */
function scoreGrade(score: number | null | undefined): {
  letter: string
  labelKey: string
  textClass: string
  ringClass: string
} | null {
  if (score == null) return null
  if (score >= 4.5) {
    return {
      letter: 'S',
      labelKey: 'pbcGrade.S',
      textClass: 'text-emerald-600 dark:text-emerald-400',
      ringClass: 'border-emerald-500/40 bg-emerald-500/10',
    }
  }
  if (score >= 3.5) {
    return {
      letter: 'A',
      labelKey: 'pbcGrade.A',
      textClass: 'text-sky-600 dark:text-sky-400',
      ringClass: 'border-sky-500/40 bg-sky-500/10',
    }
  }
  if (score >= 2.5) {
    return {
      letter: 'B',
      labelKey: 'pbcGrade.B',
      textClass: 'text-amber-600 dark:text-amber-400',
      ringClass: 'border-amber-500/40 bg-amber-500/10',
    }
  }
  return {
    letter: 'C',
    labelKey: 'pbcGrade.C',
    textClass: 'text-rose-600 dark:text-rose-400',
    ringClass: 'border-rose-500/40 bg-rose-500/10',
  }
}

/**
 * Editable PBC document header.
 * @param props - Document, edit gate, score, save callback.
 * @returns Header UI.
 */
export function PbcDocumentHeader({
  document,
  canEdit,
  totalScore = null,
  onSaved,
}: PbcDocumentHeaderProps): ReactNode {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [committer, setCommitter] = useState('')
  const [department, setDepartment] = useState('')
  const [position, setPosition] = useState('')
  const [direction, setDirection] = useState('')
  const [validFrom, setValidFrom] = useState('')
  const [validTo, setValidTo] = useState('')

  const grade = useMemo(() => scoreGrade(totalScore), [totalScore])

  const validPeriodDisplay = useMemo(() => {
    const from = document.validFrom ?? ''
    const to = document.validTo ?? ''
    if (!from && !to) return null
    if (from && to) return `${from} – ${to}`
    return from || to
  }, [document.validFrom, document.validTo])

  const overallGoals = useMemo(() => {
    const dir = document.overallDirection
    if (!dir) return []
    return dir
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  }, [document.overallDirection])

  /**
   * Opens the edit form with current values.
   */
  function openEdit(): void {
    setCommitter(document.committerDisplayName ?? '')
    setDepartment(document.departmentLabel ?? '')
    setPosition(document.positionLabel ?? '')
    setDirection(document.overallDirection ?? '')
    setValidFrom(document.validFrom ?? '')
    setValidTo(document.validTo ?? '')
    setEditing(true)
  }

  /**
   * Persists header fields via pbc-api.
   */
  async function saveEdit(): Promise<void> {
    setSaving(true)
    try {
      const updated = await updatePbcDocument(document.id, {
        committerDisplayName: committer.trim() || null,
        departmentLabel: department.trim() || null,
        positionLabel: position.trim() || null,
        overallDirection: direction.trim() || null,
        validFrom: validFrom || null,
        validTo: validTo || null,
      })
      onSaved(updated)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-ink/15 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-3 border-b border-ink/10 bg-white px-5 py-3 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold tracking-wide text-brand">
          {t('admin.team.pbcTitle')}
        </h2>
        {canEdit && !editing ? (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:text-brand/80"
            onClick={openEdit}
          >
            <PencilIcon className="size-3.5" />
            {t('admin.team.action.editHeader')}
          </button>
        ) : null}
        {editing ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={saving}
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand disabled:opacity-50"
              onClick={() => void saveEdit()}
            >
              <CheckIcon className="size-3.5" />
              {t('admin.team.action.saveRow')}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink"
              onClick={() => setEditing(false)}
            >
              <CloseIcon className="size-3.5" />
              {t('admin.team.action.cancelEdit')}
            </button>
          </div>
        ) : null}
      </div>

      <div className="bg-white px-5 py-4 dark:bg-zinc-950">
        {editing ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-muted">
              {t('admin.team.pbcCommitter')}
              <input
                className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-sm font-medium text-ink dark:bg-zinc-900"
                value={committer}
                onChange={(e) => setCommitter(e.target.value)}
              />
            </label>
            <label className="text-xs text-muted">
              {t('admin.team.pbcDepartment')}
              <input
                className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-sm font-medium text-ink dark:bg-zinc-900"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              />
            </label>
            <label className="text-xs text-muted">
              {t('admin.team.pbcPosition')}
              <input
                className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-sm font-medium text-ink dark:bg-zinc-900"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted">
                {t('admin.team.pbcValidPeriod')} (from)
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-sm font-medium text-ink dark:bg-zinc-900"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                />
              </label>
              <label className="text-xs text-muted">
                to
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-sm font-medium text-ink dark:bg-zinc-900"
                  value={validTo}
                  onChange={(e) => setValidTo(e.target.value)}
                />
              </label>
            </div>
            <label className="text-xs text-muted sm:col-span-2">
              {t('admin.team.pbcOverallGoals')}
              <textarea
                className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-sm font-medium text-ink dark:bg-zinc-900"
                rows={3}
                placeholder={t('admin.team.pbcOverallGoalsHint')}
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
              />
            </label>
          </div>
        ) : (
          <div className="flex flex-wrap items-start gap-6">
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-8 gap-y-2 text-sm md:grid-cols-3">
              <div>
                <p className="text-xs text-muted">{t('admin.team.pbcCommitter')}</p>
                <p className="font-medium text-ink">{document.committerDisplayName || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted">{t('admin.team.pbcDepartment')}</p>
                <p className="font-medium text-ink">{document.departmentLabel || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted">{t('admin.team.pbcPosition')}</p>
                <p className="font-medium text-ink">{document.positionLabel || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted">{t('admin.team.pbcValidPeriod')}</p>
                <p className="font-medium text-ink">{validPeriodDisplay || '—'}</p>
              </div>
            </div>
            {grade && totalScore != null ? (
              <div
                className={`shrink-0 rounded-xl border px-4 py-3 text-center ${grade.ringClass}`}
              >
                <p className={`text-2xl font-extrabold ${grade.textClass}`}>{grade.letter}</p>
                <p className="text-xs font-semibold tabular-nums text-ink">
                  {totalScore.toFixed(2)}
                </p>
                <p className={`text-[11px] ${grade.textClass}`}>
                  {t(`admin.team.${grade.labelKey}`)}
                </p>
                <p className="mt-0.5 text-[10px] text-muted">{t('admin.team.pbcTotalScore')}</p>
              </div>
            ) : null}
          </div>
        )}

        {!editing ? (
          <div className="mt-4 border-t border-ink/10 pt-3">
            <p className="mb-2 text-xs font-semibold text-muted">
              {t('admin.team.pbcOverallGoals')}
            </p>
            {overallGoals.length === 0 ? (
              <p className="text-xs text-muted">{t('admin.team.pbcOverallGoalsEmpty')}</p>
            ) : (
              <ol className="list-decimal space-y-1 pl-5 text-sm text-ink">
                {overallGoals.map((goal) => (
                  <li key={goal}>{goal}</li>
                ))}
              </ol>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
