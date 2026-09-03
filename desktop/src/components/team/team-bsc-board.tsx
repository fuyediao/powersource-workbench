/**
 * Balanced Scorecard board (web TeamBscBoard parity).
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckIcon, CloseIcon, PencilIcon, PlusIcon, TrashIcon } from '@/icons/AllIcons'
import { isSupabaseConfigured } from '@/lib/supabase'
import {
  createBscDocument,
  deleteBscGoal,
  deleteBscKpi,
  fetchBscDocument,
  updateBscVision,
  upsertBscGoal,
  upsertBscKpi,
} from '@/services/bsc-api'
import type { BscDimension, BscDocument, BscGoal, BscKpi } from '@/types/bsc'

const DIMENSIONS: BscDimension[] = ['financial', 'customer', 'internal', 'learning']

const DIM_BORDER: Record<BscDimension, string> = {
  financial: 'border-emerald-500/30',
  customer: 'border-sky-500/30',
  internal: 'border-amber-500/30',
  learning: 'border-violet-500/30',
}

const DIM_ACCENT: Record<BscDimension, string> = {
  financial: 'text-emerald-600 dark:text-emerald-400',
  customer: 'text-sky-600 dark:text-sky-400',
  internal: 'text-amber-600 dark:text-amber-400',
  learning: 'text-violet-600 dark:text-violet-400',
}

interface TeamBscBoardProps {
  groupId: string | null
  fiscalYear: number
  periodMonth: number
  canEdit: boolean
  /** When false, role read-only hint is omitted (period banner covers it). */
  periodEditable?: boolean
}

interface GoalDraft {
  open: boolean
  editingId: string | null
  name: string
  description: string
  weightPercent: string
  responsibility: string
  saving: boolean
}

interface KpiDraft {
  open: boolean
  editingId: string | null
  name: string
  formula: string
  targetValue: string
  currentValue: string
  dataSource: string
  weightPercent: string
  saving: boolean
}

/**
 * Empty goal draft for a dimension.
 * @returns Goal draft.
 */
function emptyGoalDraft(): GoalDraft {
  return {
    open: false,
    editingId: null,
    name: '',
    description: '',
    weightPercent: '',
    responsibility: '',
    saving: false,
  }
}

/**
 * Empty KPI draft for a goal.
 * @returns KPI draft.
 */
function emptyKpiDraft(): KpiDraft {
  return {
    open: false,
    editingId: null,
    name: '',
    formula: '',
    targetValue: '',
    currentValue: '',
    dataSource: '',
    weightPercent: '',
    saving: false,
  }
}

/**
 * Parses a KPI current/target string into a number when possible.
 * @param value - Raw text.
 * @returns Number or null.
 */
function parseNumericValue(value: string | null): number | null {
  if (!value) return null
  const cleaned = value.replace(/[,\s]/g, '').replace(/[%].*$/, '').trim()
  const n = Number.parseFloat(cleaned)
  return Number.isNaN(n) ? null : n
}

/**
 * KPI progress 0??00 from current/target.
 * @param kpi - KPI row.
 * @returns Percentage or null.
 */
function kpiProgressPct(kpi: BscKpi): number | null {
  const cur = parseNumericValue(kpi.currentValue)
  const tgt = parseNumericValue(kpi.targetValue)
  if (cur === null || tgt === null || tgt === 0) return null
  return Math.min(100, Math.max(0, Math.round((cur / tgt) * 100)))
}

/**
 * Team-wide BSC board with vision, goals, and KPIs.
 * @param props - Group, period, edit gate.
 * @returns Board UI.
 */
export function TeamBscBoard({
  groupId,
  fiscalYear,
  periodMonth,
  canEdit,
  periodEditable = true,
}: TeamBscBoardProps): ReactNode {
  const { t } = useTranslation()
  const [doc, setDoc] = useState<BscDocument | null>(null)
  const [loading, setLoading] = useState(false)
  const [initialising, setInitialising] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [visionEditing, setVisionEditing] = useState(false)
  const [visionDraft, setVisionDraft] = useState('')
  const [descDraft, setDescDraft] = useState('')
  const [visionSaving, setVisionSaving] = useState(false)
  const [goalDrafts, setGoalDrafts] = useState<Record<BscDimension, GoalDraft>>({
    financial: emptyGoalDraft(),
    customer: emptyGoalDraft(),
    internal: emptyGoalDraft(),
    learning: emptyGoalDraft(),
  })
  const [kpiDrafts, setKpiDrafts] = useState<Record<string, KpiDraft>>({})

  const periodKey = useMemo(
    () => `${fiscalYear}-${String(periodMonth).padStart(2, '0')}`,
    [fiscalYear, periodMonth],
  )

  const goalsByDimension = useMemo(() => {
    const map: Record<BscDimension, BscGoal[]> = {
      financial: [],
      customer: [],
      internal: [],
      learning: [],
    }
    for (const g of doc?.goals ?? []) map[g.dimension].push(g)
    return map
  }, [doc])

  /**
   * Loads BSC document for the current period.
   */
  const load = useCallback(async (): Promise<void> => {
    setLoadError(null)
    setSaveError(null)
    setVisionEditing(false)
    if (!groupId || !isSupabaseConfigured) {
      setDoc(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const next = await fetchBscDocument(groupId, fiscalYear, periodMonth)
      setDoc(next)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t('admin.team.bsc.loadError'))
      setDoc(null)
    } finally {
      setLoading(false)
    }
  }, [fiscalYear, groupId, periodMonth, t])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * Creates an empty BSC document for this period.
   */
  async function handleInit(): Promise<void> {
    if (!groupId || !canEdit || initialising) return
    setInitialising(true)
    setSaveError(null)
    try {
      const created = await createBscDocument(groupId, fiscalYear, periodMonth)
      setDoc(created)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('admin.team.bsc.saveError'))
    } finally {
      setInitialising(false)
    }
  }

  /**
   * Opens vision editor with current values.
   */
  function openVisionEdit(): void {
    setVisionDraft(doc?.strategicVision ?? '')
    setDescDraft(doc?.strategicDescription ?? '')
    setVisionEditing(true)
  }

  /**
   * Saves vision fields.
   */
  async function saveVision(): Promise<void> {
    if (!doc || visionSaving) return
    setVisionSaving(true)
    setSaveError(null)
    try {
      const updated = await updateBscVision(doc.id, visionDraft, descDraft)
      setDoc({ ...doc, ...updated })
      setVisionEditing(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('admin.team.bsc.saveError'))
    } finally {
      setVisionSaving(false)
    }
  }

  /**
   * Opens add/edit goal form for a dimension.
   * @param dimension - BSC dimension.
   * @param goal - Existing goal or null for create.
   */
  function openGoalForm(dimension: BscDimension, goal: BscGoal | null): void {
    setGoalDrafts((prev) => ({
      ...prev,
      [dimension]: {
        open: true,
        editingId: goal?.id ?? null,
        name: goal?.name ?? '',
        description: goal?.description ?? '',
        weightPercent: goal?.weightPercent != null ? String(goal.weightPercent) : '',
        responsibility: goal?.responsibility ?? '',
        saving: false,
      },
    }))
  }

  /**
   * Saves the goal draft for a dimension.
   * @param dimension - BSC dimension.
   */
  async function saveGoal(dimension: BscDimension): Promise<void> {
    if (!doc) return
    const draft = goalDrafts[dimension]
    if (!draft.name.trim()) return
    setGoalDrafts((prev) => ({
      ...prev,
      [dimension]: { ...prev[dimension], saving: true },
    }))
    setSaveError(null)
    try {
      const weight = draft.weightPercent.trim()
        ? Number.parseFloat(draft.weightPercent)
        : null
      const saved = await upsertBscGoal({
        id: draft.editingId ?? undefined,
        documentId: doc.id,
        dimension,
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        weightPercent: weight != null && !Number.isNaN(weight) ? weight : null,
        responsibility: draft.responsibility.trim() || null,
        sortOrder: draft.editingId
          ? (doc.goals.find((g) => g.id === draft.editingId)?.sortOrder ?? 0)
          : goalsByDimension[dimension].length,
      })
      setDoc((current) => {
        if (!current) return current
        if (draft.editingId) {
          return {
            ...current,
            goals: current.goals.map((g) =>
              g.id === saved.id ? { ...saved, kpis: g.kpis } : g,
            ),
          }
        }
        return { ...current, goals: [...current.goals, { ...saved, kpis: [] }] }
      })
      setGoalDrafts((prev) => ({ ...prev, [dimension]: emptyGoalDraft() }))
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('admin.team.bsc.saveError'))
      setGoalDrafts((prev) => ({
        ...prev,
        [dimension]: { ...prev[dimension], saving: false },
      }))
    }
  }

  /**
   * Deletes a goal after confirm.
   * @param goal - Goal to delete.
   */
  async function removeGoal(goal: BscGoal): Promise<void> {
    if (!canEdit) return
    if (!window.confirm(t('admin.team.bsc.deleteGoalConfirm'))) return
    setSaveError(null)
    try {
      await deleteBscGoal(goal.id)
      setDoc((current) =>
        current
          ? { ...current, goals: current.goals.filter((g) => g.id !== goal.id) }
          : current,
      )
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('admin.team.bsc.saveError'))
    }
  }

  /**
   * Opens KPI form for a goal.
   * @param goalId - Parent goal id.
   * @param kpi - Existing KPI or null.
   */
  function openKpiForm(goalId: string, kpi: BscKpi | null): void {
    setKpiDrafts((prev) => ({
      ...prev,
      [goalId]: {
        open: true,
        editingId: kpi?.id ?? null,
        name: kpi?.name ?? '',
        formula: kpi?.formula ?? '',
        targetValue: kpi?.targetValue ?? '',
        currentValue: kpi?.currentValue ?? '',
        dataSource: kpi?.dataSource ?? '',
        weightPercent: kpi?.weightPercent != null ? String(kpi.weightPercent) : '',
        saving: false,
      },
    }))
  }

  /**
   * Saves KPI draft for a goal.
   * @param goal - Parent goal.
   */
  async function saveKpi(goal: BscGoal): Promise<void> {
    const draft = kpiDrafts[goal.id] ?? emptyKpiDraft()
    if (!draft.name.trim()) return
    setKpiDrafts((prev) => ({
      ...prev,
      [goal.id]: { ...(prev[goal.id] ?? emptyKpiDraft()), saving: true },
    }))
    setSaveError(null)
    try {
      const weight = draft.weightPercent.trim()
        ? Number.parseFloat(draft.weightPercent)
        : null
      const saved = await upsertBscKpi({
        id: draft.editingId ?? undefined,
        goalId: goal.id,
        name: draft.name.trim(),
        formula: draft.formula.trim() || null,
        targetValue: draft.targetValue.trim() || null,
        currentValue: draft.currentValue.trim() || null,
        dataSource: draft.dataSource.trim() || null,
        weightPercent: weight != null && !Number.isNaN(weight) ? weight : null,
        sortOrder: draft.editingId
          ? (goal.kpis.find((k) => k.id === draft.editingId)?.sortOrder ?? 0)
          : goal.kpis.length,
      })
      setDoc((current) => {
        if (!current) return current
        return {
          ...current,
          goals: current.goals.map((g) => {
            if (g.id !== goal.id) return g
            if (draft.editingId) {
              return {
                ...g,
                kpis: g.kpis.map((k) => (k.id === saved.id ? saved : k)),
              }
            }
            return { ...g, kpis: [...g.kpis, saved] }
          }),
        }
      })
      setKpiDrafts((prev) => ({ ...prev, [goal.id]: emptyKpiDraft() }))
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('admin.team.bsc.saveError'))
      setKpiDrafts((prev) => ({
        ...prev,
        [goal.id]: { ...(prev[goal.id] ?? emptyKpiDraft()), saving: false },
      }))
    }
  }

  /**
   * Deletes a KPI after confirm.
   * @param goalId - Parent goal id.
   * @param kpi - KPI to delete.
   */
  async function removeKpi(goalId: string, kpi: BscKpi): Promise<void> {
    if (!canEdit) return
    if (!window.confirm(t('admin.team.bsc.deleteKpiConfirm'))) return
    setSaveError(null)
    try {
      await deleteBscKpi(kpi.id)
      setDoc((current) =>
        current
          ? {
              ...current,
              goals: current.goals.map((g) =>
                g.id === goalId
                  ? { ...g, kpis: g.kpis.filter((k) => k.id !== kpi.id) }
                  : g,
              ),
            }
          : current,
      )
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('admin.team.bsc.saveError'))
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-100 px-5 py-4 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
        {t('admin.team.bsc.supabaseRequired')}
      </div>
    )
  }

  if (!groupId) {
    return <p className="text-sm font-medium text-muted">{t('admin.team.bsc.noGroup')}</p>
  }

  if (loading) {
    return <p className="text-sm font-medium text-muted">{t('admin.team.bsc.loading')}</p>
  }

  if (loadError) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-rose-500">{loadError}</p>
        <button
          type="button"
          className="rounded-xl bg-brand px-3 py-1.5 text-sm font-bold text-brand-fg"
          onClick={() => void load()}
        >
          {t('admin.team.pbcRetry')}
        </button>
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="space-y-3 rounded-xl border border-ink/15 bg-white shadow-sm p-5 dark:bg-zinc-900">
        <p className="text-sm text-muted">{t('admin.team.bsc.noDoc')}</p>
        {canEdit ? (
          <button
            type="button"
            disabled={initialising}
            className="rounded-xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg disabled:opacity-50"
            onClick={() => void handleInit()}
          >
            {initialising ? t('status.loading') : t('admin.team.bsc.initBtn')}
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-ink/10 bg-white dark:bg-zinc-950">
        <div className="flex items-center justify-between gap-3 border-b border-ink/10 bg-white px-5 py-3 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-brand">{t('admin.team.bsc.title')}</h2>
          <span className="text-xs tabular-nums text-muted">{periodKey}</span>
        </div>
        <div className="space-y-3 bg-white p-5 dark:bg-zinc-950">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-bold text-ink">{t('admin.team.bsc.vision.title')}</h3>
            {canEdit && !visionEditing ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand"
                onClick={openVisionEdit}
              >
                <PencilIcon className="size-3.5" />
                {t('admin.team.bsc.vision.editBtn')}
              </button>
            ) : null}
          </div>
          {visionEditing ? (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-muted">
                {t('admin.team.bsc.vision.visionLabel')}
                <textarea
                  className="mt-1 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink dark:bg-zinc-900"
                  rows={2}
                  value={visionDraft}
                  placeholder={t('admin.team.bsc.vision.placeholder')}
                  onChange={(e) => setVisionDraft(e.target.value)}
                />
              </label>
              <label className="block text-xs font-medium text-muted">
                {t('admin.team.bsc.vision.descLabel')}
                <textarea
                  className="mt-1 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink dark:bg-zinc-900"
                  rows={2}
                  value={descDraft}
                  placeholder={t('admin.team.bsc.vision.descPlaceholder')}
                  onChange={(e) => setDescDraft(e.target.value)}
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={visionSaving}
                  className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-brand-fg disabled:opacity-50"
                  onClick={() => void saveVision()}
                >
                  <CheckIcon className="size-3.5" />
                  {t('admin.team.bsc.save')}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-lg bg-ink/5 px-3 py-1.5 text-xs font-bold text-ink"
                  onClick={() => setVisionEditing(false)}
                >
                  <CloseIcon className="size-3.5" />
                  {t('admin.team.bsc.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium text-ink">
                {doc.strategicVision || t('admin.team.bsc.vision.clickToEdit')}
              </p>
              {doc.strategicDescription ? (
                <p className="mt-1 text-xs text-muted">{doc.strategicDescription}</p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {!canEdit && periodEditable ? (
        <p className="text-xs text-muted">{t('admin.team.bsc.readOnlyHint')}</p>
      ) : null}
      {saveError ? <p className="text-xs text-rose-500">{saveError}</p> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {DIMENSIONS.map((dimension) => {
          const goals = goalsByDimension[dimension]
          const draft = goalDrafts[dimension]
          return (
            <section
              key={dimension}
              className={`overflow-hidden rounded-xl border bg-white dark:bg-zinc-950 ${DIM_BORDER[dimension]}`}
            >
              <div className="flex items-center justify-between gap-2 border-b border-ink/10 px-4 py-3">
                <div>
                  <h3 className={`text-sm font-bold ${DIM_ACCENT[dimension]}`}>
                    {t(`admin.team.bsc.dimension.${dimension}`)}
                  </h3>
                  <p className="text-xs text-muted">
                    {t(`admin.team.bsc.dimensionSub.${dimension}`)}
                  </p>
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg bg-brand/10 px-2 py-1 text-xs font-bold text-brand"
                    onClick={() => openGoalForm(dimension, null)}
                  >
                    <PlusIcon className="size-3.5" />
                    {t('admin.team.bsc.addGoal')}
                  </button>
                ) : null}
              </div>
              <div className="space-y-3 p-4">
                {draft.open ? (
                  <div className="space-y-2 rounded-lg border border-ink/10 p-3">
                    <input
                      className="w-full rounded-lg border border-ink/10 bg-white px-2 py-1.5 text-sm dark:bg-zinc-900"
                      placeholder={t('admin.team.bsc.col.name')}
                      value={draft.name}
                      onChange={(e) =>
                        setGoalDrafts((prev) => ({
                          ...prev,
                          [dimension]: { ...prev[dimension], name: e.target.value },
                        }))
                      }
                    />
                    <textarea
                      className="w-full rounded-lg border border-ink/10 bg-white px-2 py-1.5 text-sm dark:bg-zinc-900"
                      rows={2}
                      placeholder={t('admin.team.bsc.col.description')}
                      value={draft.description}
                      onChange={(e) =>
                        setGoalDrafts((prev) => ({
                          ...prev,
                          [dimension]: {
                            ...prev[dimension],
                            description: e.target.value,
                          },
                        }))
                      }
                    />
                    <div className="flex flex-wrap gap-2">
                      <input
                        className="w-24 rounded-lg border border-ink/10 bg-white px-2 py-1.5 text-sm dark:bg-zinc-900"
                        placeholder={t('admin.team.bsc.col.weight')}
                        value={draft.weightPercent}
                        onChange={(e) =>
                          setGoalDrafts((prev) => ({
                            ...prev,
                            [dimension]: {
                              ...prev[dimension],
                              weightPercent: e.target.value,
                            },
                          }))
                        }
                      />
                      <input
                        className="min-w-40 flex-1 rounded-lg border border-ink/10 bg-white px-2 py-1.5 text-sm dark:bg-zinc-900"
                        placeholder={t('admin.team.bsc.col.responsibility')}
                        value={draft.responsibility}
                        onChange={(e) =>
                          setGoalDrafts((prev) => ({
                            ...prev,
                            [dimension]: {
                              ...prev[dimension],
                              responsibility: e.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={draft.saving}
                        className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-brand-fg disabled:opacity-50"
                        onClick={() => void saveGoal(dimension)}
                      >
                        {t('admin.team.bsc.save')}
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-ink/5 px-3 py-1.5 text-xs font-bold text-ink"
                        onClick={() =>
                          setGoalDrafts((prev) => ({
                            ...prev,
                            [dimension]: emptyGoalDraft(),
                          }))
                        }
                      >
                        {t('admin.team.bsc.cancel')}
                      </button>
                    </div>
                  </div>
                ) : null}

                {goals.length === 0 ? (
                  <p className="text-xs text-muted">{t('admin.team.bsc.noGoals')}</p>
                ) : (
                  goals.map((goal) => {
                    const kpiDraft = kpiDrafts[goal.id] ?? emptyKpiDraft()
                    return (
                      <article
                        key={goal.id}
                        className="rounded-lg border border-ink/10 bg-white p-3 dark:bg-zinc-900"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-bold text-ink">{goal.name}</h4>
                            {goal.description ? (
                              <p className="mt-0.5 text-xs text-muted">{goal.description}</p>
                            ) : null}
                            <p className="mt-1 text-xs text-muted">
                              {goal.weightPercent != null
                                ? `${t('admin.team.bsc.weightLabel')}: ${goal.weightPercent}%`
                                : null}
                              {goal.responsibility
                                ? ` · ${goal.responsibility}`
                                : null}
                            </p>
                          </div>
                          {canEdit ? (
                            <div className="flex gap-1">
                              <button
                                type="button"
                                className="rounded-lg p-1.5 text-brand hover:bg-brand/10"
                                title={t('admin.team.bsc.editGoal')}
                                onClick={() => openGoalForm(dimension, goal)}
                              >
                                <PencilIcon className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-500/10"
                                title={t('admin.team.bsc.deleteGoal')}
                                onClick={() => void removeGoal(goal)}
                              >
                                <TrashIcon className="size-3.5" />
                              </button>
                            </div>
                          ) : null}
                        </div>

                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted">
                              {t('admin.team.bsc.col.kpiName')}
                            </span>
                            {canEdit ? (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-xs font-bold text-brand"
                                onClick={() => openKpiForm(goal.id, null)}
                              >
                                <PlusIcon className="size-3" />
                                {t('admin.team.bsc.addKpi')}
                              </button>
                            ) : null}
                          </div>

                          {kpiDraft.open ? (
                            <div className="space-y-2 rounded-lg border border-ink/10 p-2">
                              {(
                                [
                                  ['name', t('admin.team.bsc.col.kpiName')],
                                  ['formula', t('admin.team.bsc.col.formula')],
                                  ['targetValue', t('admin.team.bsc.col.targetValue')],
                                  ['currentValue', t('admin.team.bsc.col.currentValue')],
                                  ['dataSource', t('admin.team.bsc.col.dataSource')],
                                  ['weightPercent', t('admin.team.bsc.col.weight')],
                                ] as const
                              ).map(([key, label]) => (
                                <input
                                  key={key}
                                  className="w-full rounded-lg border border-ink/10 bg-white px-2 py-1 text-xs dark:bg-zinc-900"
                                  placeholder={label}
                                  value={kpiDraft[key]}
                                  onChange={(e) =>
                                    setKpiDrafts((prev) => ({
                                      ...prev,
                                      [goal.id]: {
                                        ...(prev[goal.id] ?? emptyKpiDraft()),
                                        [key]: e.target.value,
                                      },
                                    }))
                                  }
                                />
                              ))}
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={kpiDraft.saving}
                                  className="rounded-lg bg-brand px-2 py-1 text-xs font-bold text-brand-fg disabled:opacity-50"
                                  onClick={() => void saveKpi(goal)}
                                >
                                  {t('admin.team.bsc.save')}
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg bg-ink/5 px-2 py-1 text-xs font-bold"
                                  onClick={() =>
                                    setKpiDrafts((prev) => ({
                                      ...prev,
                                      [goal.id]: emptyKpiDraft(),
                                    }))
                                  }
                                >
                                  {t('admin.team.bsc.cancel')}
                                </button>
                              </div>
                            </div>
                          ) : null}

                          {goal.kpis.length === 0 ? (
                            <p className="text-xs text-muted">{t('admin.team.bsc.noKpis')}</p>
                          ) : (
                            goal.kpis.map((kpi) => {
                              const pct = kpiProgressPct(kpi)
                              return (
                                <div
                                  key={kpi.id}
                                  className="rounded-md border border-ink/5 px-2 py-2"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <p className="text-xs font-semibold text-ink">{kpi.name}</p>
                                      <p className="text-[11px] text-muted">
                                        {[kpi.formula, kpi.targetValue, kpi.currentValue]
                                          .filter(Boolean)
                                          .join(' · ')}
                                      </p>
                                      {pct != null ? (
                                        <div className="mt-1 h-1.5 w-32 overflow-hidden rounded-full bg-ink/10">
                                          <div
                                            className="h-full rounded-full bg-brand"
                                            style={{ width: `${pct}%` }}
                                          />
                                        </div>
                                      ) : null}
                                    </div>
                                    {canEdit ? (
                                      <div className="flex gap-1">
                                        <button
                                          type="button"
                                          className="rounded p-1 text-brand hover:bg-brand/10"
                                          onClick={() => openKpiForm(goal.id, kpi)}
                                        >
                                          <PencilIcon className="size-3" />
                                        </button>
                                        <button
                                          type="button"
                                          className="rounded p-1 text-rose-500 hover:bg-rose-500/10"
                                          onClick={() => void removeKpi(goal.id, kpi)}
                                        >
                                          <TrashIcon className="size-3" />
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              )
                            })
                          )}
                        </div>
                      </article>
                    )
                  })
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
