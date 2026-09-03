/**
 * PBC part table with inline cell edits and 1–5 score chips.
 */

import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckIcon, CloseIcon } from '@/icons/AllIcons'
import { updatePbcRowFields } from '@/services/pbc-api'
import type {
  PbcPart,
  PbcRow,
  PbcRowAdminUpdate,
  PbcRowProgressUpdate,
  PbcScope,
} from '@/types/pbc'

type CellEditField =
  | 'progress'
  | 'definition'
  | 'code'
  | 'title'
  | 'annualTarget'
  | 'weight'
  | 'evaluationPeriod'

interface PbcPartTableProps {
  part: PbcPart
  rows: PbcRow[]
  scope: PbcScope
  canEditProgress: boolean
  canEditDefinition: boolean
  canEditAdmin: boolean
  isIndividualDocumentOwner?: boolean
  onRowUpdated: (row: PbcRow) => void
}

/**
 * Parses leading digit of an evaluation string as 1–5.
 * @param val - Raw evaluation.
 * @returns Score or null.
 */
function parseScore(val: string | null | undefined): number | null {
  if (!val) return null
  const n = Number.parseInt(val.charAt(0), 10)
  return n >= 1 && n <= 5 ? n : null
}

/**
 * Score chip button classes.
 * @param selected - Whether selected.
 * @param score - 1–5.
 * @returns Class string.
 */
function scoreButtonClass(selected: boolean, score: number): string {
  const base =
    'flex size-7 shrink-0 items-center justify-center rounded text-xs font-bold border transition'
  if (!selected) {
    return `${base} border-ink/20 text-muted hover:border-brand/40 hover:text-brand`
  }
  const colorMap: Record<number, string> = {
    1: 'bg-rose-500/25 border-rose-500/80 text-rose-600 dark:text-rose-300',
    2: 'bg-orange-500/25 border-orange-500/80 text-orange-600 dark:text-orange-300',
    3: 'bg-amber-500/25 border-amber-500/80 text-amber-700 dark:text-amber-200',
    4: 'bg-sky-500/25 border-sky-500/80 text-sky-600 dark:text-sky-300',
    5: 'bg-emerald-500/25 border-emerald-500/80 text-emerald-600 dark:text-emerald-300',
  }
  return `${base} ${colorMap[score] ?? ''}`
}

/**
 * One PBC part (result / process / org_growth) table.
 * @param props - Rows and edit gates.
 * @returns Table UI.
 */
export function PbcPartTable({
  part,
  rows,
  scope,
  canEditProgress,
  canEditDefinition,
  canEditAdmin,
  isIndividualDocumentOwner = false,
  onRowUpdated,
}: PbcPartTableProps): ReactNode {
  const { t } = useTranslation()
  const [editingCell, setEditingCell] = useState<{
    rowId: string
    field: CellEditField
  } | null>(null)
  const [draftText, setDraftText] = useState('')
  const [saving, setSaving] = useState(false)

  const canEditAnnualTarget =
    part === 'result' &&
    (scope === 'group' ? canEditAdmin : isIndividualDocumentOwner)

  const sectionRawScore = useMemo(() => {
    let score = 0
    let hasAny = false
    for (const row of rows) {
      const s = parseScore(row.selfEvaluation)
      if (s !== null && row.weightPercent != null) {
        score += s * (row.weightPercent / 100)
        hasAny = true
      }
    }
    return hasAny ? score : null
  }, [rows])

  const partHeaderClass =
    part === 'result'
      ? 'border-b border-ink/10 bg-white text-sky-700 dark:bg-zinc-950 dark:text-sky-400'
      : part === 'process'
        ? 'border-b border-ink/10 bg-white text-indigo-700 dark:bg-zinc-950 dark:text-indigo-400'
        : 'border-b border-ink/10 bg-white text-teal-700 dark:bg-zinc-950 dark:text-teal-400'

  /**
   * Opens a text cell editor.
   * @param row - Target row.
   * @param field - Cell field.
   * @param initial - Initial draft.
   */
  function openTextEdit(row: PbcRow, field: CellEditField, initial: string): void {
    if (saving) return
    if (editingCell && editingCell.rowId !== row.id) return
    setEditingCell({ rowId: row.id, field })
    setDraftText(initial)
  }

  /**
   * Saves the open text cell.
   */
  async function saveTextEdit(): Promise<void> {
    if (!editingCell) return
    setSaving(true)
    try {
      const updates: PbcRowAdminUpdate = {}
      const text = draftText.trim() || null
      switch (editingCell.field) {
        case 'progress':
          updates.currentProgress = draftText || null
          break
        case 'definition':
          updates.definition = draftText || null
          break
        case 'code':
          updates.code = text
          break
        case 'title':
          updates.title = text
          break
        case 'annualTarget':
          updates.annualTarget = draftText || null
          break
        case 'weight': {
          const n = Number.parseFloat(draftText)
          updates.weightPercent =
            draftText.trim() === '' || Number.isNaN(n) ? null : n
          break
        }
        case 'evaluationPeriod':
          updates.evaluationPeriod = text
          break
        default:
          break
      }
      const updated = await updatePbcRowFields(editingCell.rowId, updates)
      onRowUpdated(updated)
      setEditingCell(null)
      setDraftText('')
    } finally {
      setSaving(false)
    }
  }

  /**
   * Saves a score chip selection.
   * @param row - Target row.
   * @param kind - self or manager.
   * @param score - 1–5.
   */
  async function saveScore(
    row: PbcRow,
    kind: 'self' | 'manager',
    score: number,
  ): Promise<void> {
    if (saving) return
    const label = t(`admin.team.scoreLabel.${score}`)
    const value = `${score} ${label}`
    setSaving(true)
    try {
      const updates: PbcRowProgressUpdate | PbcRowAdminUpdate =
        kind === 'self' ? { selfEvaluation: value } : { managerEvaluation: value }
      const updated = await updatePbcRowFields(row.id, updates)
      onRowUpdated(updated)
    } finally {
      setSaving(false)
    }
  }

  /**
   * Renders a multiline / text cell with optional edit.
   * @param row - Row.
   * @param field - Field key.
   * @param value - Display value.
   * @param canEdit - Whether editable.
   * @param hintKey - i18n hint key.
   * @returns Cell content.
   */
  function renderTextCell(
    row: PbcRow,
    field: CellEditField,
    value: string | null,
    canEdit: boolean,
    hintKey: string,
  ): ReactNode {
    const isEditing =
      editingCell?.rowId === row.id && editingCell.field === field
    if (isEditing) {
      return (
        <div className="space-y-1">
          <textarea
            className="min-h-16 w-full rounded border border-brand/40 bg-white px-2 py-1 text-xs text-ink dark:bg-zinc-900"
            value={draftText}
            disabled={saving}
            onChange={(e) => setDraftText(e.target.value)}
          />
          <div className="flex gap-1">
            <button
              type="button"
              disabled={saving}
              className="rounded p-1 text-emerald-600 hover:bg-emerald-500/10"
              onClick={() => void saveTextEdit()}
            >
              <CheckIcon className="size-3.5" />
            </button>
            <button
              type="button"
              className="rounded p-1 text-muted hover:bg-ink/5"
              onClick={() => {
                setEditingCell(null)
                setDraftText('')
              }}
            >
              <CloseIcon className="size-3.5" />
            </button>
          </div>
        </div>
      )
    }
    if (canEdit) {
      return (
        <button
          type="button"
          className="w-full whitespace-pre-wrap rounded px-1 py-0.5 text-left text-xs font-medium text-ink hover:bg-brand/5"
          title={t(hintKey)}
          onClick={() => openTextEdit(row, field, value ?? '')}
        >
          {value?.trim() ? value : <span className="text-muted">—</span>}
        </button>
      )
    }
    return (
      <span className="whitespace-pre-wrap text-xs font-medium text-ink">
        {value?.trim() ? value : '—'}
      </span>
    )
  }

  /**
   * Renders 1–5 score chips.
   * @param row - Row.
   * @param kind - self or manager.
   * @param canEdit - Edit gate.
   * @returns Chips.
   */
  function renderScore(
    row: PbcRow,
    kind: 'self' | 'manager',
    canEdit: boolean,
  ): ReactNode {
    const current = parseScore(kind === 'self' ? row.selfEvaluation : row.managerEvaluation)
    if (!canEdit) {
      return current != null ? (
        <span className="text-xs font-bold text-ink">
          {current} · {t(`admin.team.scoreLabel.${current}`)}
        </span>
      ) : (
        <span className="text-xs text-muted">{t('admin.team.scorePlaceholder')}</span>
      )
    }
    return (
      <div className="flex flex-wrap gap-1">
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            disabled={saving}
            className={scoreButtonClass(current === score, score)}
            title={t(`admin.team.scoreLabel.${score}`)}
            onClick={() => void saveScore(row, kind, score)}
          >
            {score}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-ink/15 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-950">
      <div className={`flex items-center justify-between px-4 py-2 ${partHeaderClass}`}>
        <h3 className="text-xs font-semibold tracking-wide uppercase">
          {t(`admin.team.part.${part}`)}
        </h3>
        <span className="text-xs tabular-nums text-muted">
          {t('admin.team.pbcSectionScore')}:{' '}
          {sectionRawScore != null ? sectionRawScore.toFixed(2) : '—'}
        </span>
      </div>
      <div className="overflow-x-auto bg-white dark:bg-zinc-950">
        <table className="w-full min-w-[960px] border-collapse text-sm text-ink">
          <thead>
            <tr className="border-b border-ink/10 bg-zinc-100 text-left text-xs font-semibold text-ink dark:bg-zinc-900 dark:text-zinc-200">
              <th className="px-3 py-2">{t('admin.team.col.code')}</th>
              <th className="px-3 py-2">{t('admin.team.col.title')}</th>
              {part === 'result' ? (
                <th className="px-3 py-2">{t('admin.team.col.annualTarget')}</th>
              ) : null}
              <th className="px-3 py-2">{t('admin.team.col.definition')}</th>
              <th className="px-3 py-2">{t('admin.team.col.weight')}</th>
              <th className="px-3 py-2">{t('admin.team.col.evaluationPeriod')}</th>
              <th className="px-3 py-2">{t('admin.team.col.currentProgress')}</th>
              <th className="px-3 py-2">{t('admin.team.col.selfEvaluation')}</th>
              <th className="px-3 py-2">{t('admin.team.col.managerEvaluation')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-ink/10 bg-white align-top even:bg-zinc-50 dark:bg-zinc-950 dark:even:bg-zinc-900">
                <td className="px-3 py-2">
                  {renderTextCell(
                    row,
                    'code',
                    row.code,
                    canEditAdmin,
                    'admin.team.pbcFillCodeHint',
                  )}
                </td>
                <td className="px-3 py-2">
                  {renderTextCell(
                    row,
                    'title',
                    row.title,
                    canEditAdmin,
                    'admin.team.pbcFillTitleHint',
                  )}
                </td>
                {part === 'result' ? (
                  <td className="px-3 py-2">
                    {renderTextCell(
                      row,
                      'annualTarget',
                      row.annualTarget,
                      canEditAnnualTarget,
                      'admin.team.pbcFillAnnualTargetHint',
                    )}
                  </td>
                ) : null}
                <td className="px-3 py-2">
                  {renderTextCell(
                    row,
                    'definition',
                    row.definition,
                    canEditDefinition,
                    'admin.team.pbcFillDefinitionHint',
                  )}
                </td>
                <td className="px-3 py-2">
                  {renderTextCell(
                    row,
                    'weight',
                    row.weightPercent != null ? String(row.weightPercent) : null,
                    canEditAdmin,
                    'admin.team.pbcFillWeightHint',
                  )}
                </td>
                <td className="px-3 py-2">
                  {renderTextCell(
                    row,
                    'evaluationPeriod',
                    row.evaluationPeriod,
                    canEditAdmin,
                    'admin.team.pbcFillEvalPeriodHint',
                  )}
                </td>
                <td className="px-3 py-2">
                  {renderTextCell(
                    row,
                    'progress',
                    row.currentProgress,
                    canEditProgress,
                    'admin.team.pbcFillProgressHint',
                  )}
                </td>
                <td className="px-3 py-2">{renderScore(row, 'self', canEditProgress)}</td>
                <td className="px-3 py-2">{renderScore(row, 'manager', canEditAdmin)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
