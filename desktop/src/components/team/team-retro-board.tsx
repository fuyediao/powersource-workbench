/**
 * Team retrospective board (web TeamRetroBoard parity).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckIcon } from '@/icons/AllIcons'
import { isSupabaseConfigured } from '@/lib/supabase'
import {
  emptyTeamRetroPayload,
  fetchTeamRetroBoardPayload,
  normalizeTeamRetroPayload,
  upsertTeamRetroBoardPayload,
} from '@/services/retro-api'
import type { TeamRetroBoardPayload, TeamRetroSectionId } from '@/types/team-retro'

const SECTIONS: TeamRetroSectionId[] = [
  'customer',
  'goals',
  'execution',
  'data',
  'tech',
]

const SECTION_GUIDE_COUNTS: Record<TeamRetroSectionId, number> = {
  customer: 3,
  goals: 3,
  execution: 3,
  data: 2,
  tech: 3,
}

interface TeamRetroBoardProps {
  groupId: string | null
  fiscalYear: number
  periodMonth: number
  canEdit: boolean
  /** When false, role read-only hint is omitted (period banner covers it). */
  periodEditable?: boolean
}

/**
 * True when every section field is blank.
 * @param payload - Board payload.
 * @returns Whether empty.
 */
function isPayloadEmpty(payload: TeamRetroBoardPayload): boolean {
  return SECTIONS.every(
    (id) => !payload[id].teamDesc.trim() && !payload[id].improvement.trim(),
  )
}

/**
 * Legacy browser-only storage key (pre-database persistence).
 * @param groupId - Group UUID.
 * @param periodKey - YYYY-MM.
 * @returns localStorage key.
 */
function legacyLocalStorageKey(groupId: string, periodKey: string): string {
  return `workbench_team_retro_v1:${groupId}:${periodKey}`
}

/**
 * Monthly retrospective board with debounced autosave.
 * @param props - Group, period, and edit gate.
 * @returns Board UI.
 */
export function TeamRetroBoard({
  groupId,
  fiscalYear,
  periodMonth,
  canEdit,
  periodEditable = true,
}: TeamRetroBoardProps): ReactNode {
  const { t } = useTranslation()
  const [board, setBoard] = useState<TeamRetroBoardPayload>(() => emptyTeamRetroPayload())
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const saveTimer = useRef<number | null>(null)
  const flashTimer = useRef<number | null>(null)
  const boardRef = useRef(board)
  boardRef.current = board

  const periodKey = useMemo(
    () => `${fiscalYear}-${String(periodMonth).padStart(2, '0')}`,
    [fiscalYear, periodMonth],
  )

  const migrateLegacy = useCallback(
    async (gid: string): Promise<void> => {
      if (!isSupabaseConfigured || !canEdit) return
      const key = legacyLocalStorageKey(gid, periodKey)
      let raw: string | null
      try {
        raw = localStorage.getItem(key)
      } catch {
        return
      }
      if (!raw) return
      try {
        const normalized = normalizeTeamRetroPayload(JSON.parse(raw) as unknown)
        if (isPayloadEmpty(normalized)) {
          localStorage.removeItem(key)
          return
        }
        await upsertTeamRetroBoardPayload(gid, fiscalYear, periodMonth, normalized)
        setBoard(normalized)
        localStorage.removeItem(key)
      } catch {
        // Leave local draft if migration fails.
      }
    },
    [canEdit, fiscalYear, periodMonth, periodKey],
  )

  const load = useCallback(async (): Promise<void> => {
    setLoadError(null)
    setSaveError(null)
    if (!groupId || !isSupabaseConfigured) {
      setBoard(emptyTeamRetroPayload())
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const payload = await fetchTeamRetroBoardPayload(groupId, fiscalYear, periodMonth)
      if (payload === null) {
        setBoard(emptyTeamRetroPayload())
        return
      }
      setBoard(payload)
      if (isPayloadEmpty(payload)) {
        await migrateLegacy(groupId)
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t('admin.team.retro.loadError'))
      setBoard(emptyTeamRetroPayload())
    } finally {
      setLoading(false)
    }
  }, [fiscalYear, groupId, migrateLegacy, periodMonth, t])

  useEffect(() => {
    setSavedFlash(false)
    void load()
  }, [load])

  useEffect(() => {
    return () => {
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current)
      if (flashTimer.current != null) window.clearTimeout(flashTimer.current)
    }
  }, [])

  /**
   * Persist the current board to Supabase.
   * @returns Promise that resolves when save completes.
   */
  async function saveBoard(): Promise<void> {
    if (!groupId || !canEdit || !isSupabaseConfigured) return
    setSaveError(null)
    try {
      await upsertTeamRetroBoardPayload(groupId, fiscalYear, periodMonth, boardRef.current)
      setSavedFlash(true)
      if (flashTimer.current != null) window.clearTimeout(flashTimer.current)
      flashTimer.current = window.setTimeout(() => setSavedFlash(false), 2500)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('admin.team.retro.saveError'))
    }
  }

  /**
   * Debounce autosave after field edits.
   * @returns void
   */
  function scheduleSave(): void {
    if (!canEdit || !isSupabaseConfigured) return
    if (saveTimer.current != null) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void saveBoard()
    }, 800)
  }

  /**
   * Update one section field and queue autosave.
   * @param sectionId - Retro section id.
   * @param field - Field name.
   * @param value - New value.
   * @returns void
   */
  function onFieldChange(
    sectionId: TeamRetroSectionId,
    field: 'teamDesc' | 'improvement',
    value: string,
  ): void {
    setBoard((prev) => ({
      ...prev,
      [sectionId]: { ...prev[sectionId], [field]: value },
    }))
    scheduleSave()
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-100 px-5 py-4 text-sm text-amber-950 dark:bg-amber-950/80 dark:text-amber-100">
        {t('admin.team.retro.supabaseRequired')}
      </div>
    )
  }

  if (!groupId) {
    return <p className="text-sm font-medium text-ink">{t('admin.team.bsc.noGroup')}</p>
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-rose-500/40 bg-rose-100 px-5 py-4 text-sm text-rose-950 dark:bg-rose-950/80 dark:text-rose-100">
        {loadError}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-ink/15 bg-white shadow-sm dark:bg-zinc-950">
        <div className="flex items-center justify-between gap-3 border-b border-ink/10 bg-white px-5 py-3 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-brand">{t('admin.team.retro.title')}</h2>
          <div className="flex items-center gap-3">
            {loading ? <span className="text-xs text-ink">{t('status.loading')}</span> : null}
            {savedFlash && !loading ? (
              <span className="flex items-center gap-1 text-xs font-medium text-brand">
                <CheckIcon className="size-3.5" />
                {t('admin.team.retro.savedAt')}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2 bg-white px-5 py-2 dark:bg-zinc-950">
          <span className="text-xs text-ink">{t('admin.team.retro.periodLabel')}</span>
          <span className="text-xs font-medium tabular-nums text-ink">{periodKey}</span>
          <span className="ml-auto text-xs italic text-ink">{t('admin.team.retro.groupScopeNote')}</span>
        </div>
      </div>

      {!canEdit && periodEditable ? (
        <p className="text-xs text-ink">{t('admin.team.retro.readOnlyHint')}</p>
      ) : null}
      {saveError ? <p className="text-xs text-rose-500">{saveError}</p> : null}

      <div
        className={`overflow-hidden rounded-xl border border-ink/15 bg-white shadow-sm dark:bg-zinc-950 ${loading ? 'pointer-events-none opacity-60' : ''}`}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] border-collapse text-sm text-ink">
            <thead>
              <tr className="border-b border-ink/10 bg-zinc-100 dark:bg-zinc-900">
                <th className="w-36 px-4 py-2.5 text-left text-xs font-semibold text-ink">
                  {t('admin.team.retro.col.focus')}
                </th>
                <th className="w-52 px-4 py-2.5 text-left text-xs font-semibold text-ink">
                  {t('admin.team.retro.col.guide')}
                </th>
                <th className="w-24 px-4 py-2.5 text-left text-xs font-semibold text-ink">
                  {t('admin.team.retro.col.responsibility')}
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-ink">
                  {t('admin.team.retro.col.teamDesc')}
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-ink">
                  {t('admin.team.retro.col.improvement')}
                </th>
              </tr>
            </thead>
            <tbody>
              {SECTIONS.map((sectionId) => {
                const guideCount = SECTION_GUIDE_COUNTS[sectionId]
                const guides: string[] = []
                for (let i = 1; i <= guideCount; i += 1) {
                  guides.push(t(`admin.team.retro.section.${sectionId}.guide${i}`))
                }
                return (
                  <tr
                    key={sectionId}
                    className="border-t border-ink/10 bg-white align-top even:bg-zinc-50 dark:bg-zinc-950 dark:even:bg-zinc-900"
                  >
                    <td className="px-4 py-3 font-semibold text-ink">
                      {t(`admin.team.retro.section.${sectionId}.title`)}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink">
                      <ul className="list-disc space-y-1 pl-4">
                        {guides.map((g) => (
                          <li key={g}>{g}</li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink">
                      {t(`admin.team.retro.section.${sectionId}.responsibility`)}
                    </td>
                    <td className="px-4 py-3">
                      <textarea
                        className="min-h-20 w-full rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-sm font-medium text-ink placeholder:text-muted outline-none focus:border-brand/40 dark:bg-zinc-900"
                        disabled={!canEdit}
                        value={board[sectionId].teamDesc}
                        placeholder={t('admin.team.retro.placeholder.teamDesc')}
                        onChange={(e) => onFieldChange(sectionId, 'teamDesc', e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <textarea
                        className="min-h-20 w-full rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-sm font-medium text-ink placeholder:text-muted outline-none focus:border-brand/40 dark:bg-zinc-900"
                        disabled={!canEdit}
                        value={board[sectionId].improvement}
                        placeholder={t('admin.team.retro.placeholder.improvement')}
                        onChange={(e) => onFieldChange(sectionId, 'improvement', e.target.value)}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
