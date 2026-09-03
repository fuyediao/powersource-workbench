/**
 * Team Collaboration Function page (web `/admin/team` parity).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { useTranslation } from 'react-i18next'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import { TeamBscBoard } from '@/components/team/team-bsc-board'
import { TeamPbcPane } from '@/components/team/team-pbc-pane'
import { TeamRetroBoard } from '@/components/team/team-retro-board'
import { SlidingSegmented } from '@/components/ui/sliding-segmented'
import { useDesktopModuleAccess } from '@/hooks/use-desktop-module-access'
import { StatusLoading } from '@/components/common/status-loading'
import { useTeamScope } from '@/hooks/use-team-scope'
import { CalendarIcon } from '@/icons/AllIcons'
import { listGroupsForTeamPicker, type GroupListItem } from '@/services/pbc-api'
import { isTeamPeriodEditable } from '@/utils/team-period-edit'
import {
  patchTeamMenuHandlers,
  setTeamMenuView,
  unregisterTeamMenuHost,
  usesNativeTeamMenu,
} from '@/utils/team-menu'

type TopMode = 'bsc' | 'pbc' | 'retro'

const TOP_MODE_ORDER: TopMode[] = ['bsc', 'pbc', 'retro']

/**
 * Horizontal slide class when switching BSC / PBC / Retro (shell tab parity).
 * @param from - Previous mode.
 * @param to - Next mode.
 * @returns Animation class or empty.
 */
function topModeSlideClass(from: TopMode | null, to: TopMode): string {
  if (!from || from === to) {
    return ''
  }
  const fromIndex = TOP_MODE_ORDER.indexOf(from)
  const toIndex = TOP_MODE_ORDER.indexOf(to)
  if (fromIndex < 0 || toIndex < 0) {
    return ''
  }
  return toIndex > fromIndex ? 'animate-tab-page-forward' : 'animate-tab-page-back'
}

interface TeamPageProps {
  userId: string
  user: User
}

/**
 * Year options: current year and two prior years.
 * @returns Year numbers descending.
 */
function yearOptions(): number[] {
  const current = new Date().getFullYear()
  return [current, current - 1, current - 2]
}

/**
 * Month options for the selected year (only up to current month for this year).
 * @param year - Selected year.
 * @returns Month numbers 1–12.
 */
function monthOptionsForYear(year: number): number[] {
  const now = new Date()
  const maxMonth = year === now.getFullYear() ? now.getMonth() + 1 : 12
  return Array.from({ length: maxMonth }, (_, i) => i + 1)
}

/**
 * Team Collaboration Function: BSC / PBC / Retro boards.
 * @param props - Signed-in user.
 * @returns Team UI.
 */
export function TeamPage({ userId }: TeamPageProps): ReactNode {
  const { t } = useTranslation()
  const access = useDesktopModuleAccess(userId)
  const scope = useTeamScope(userId)
  const [topMode, setTopMode] = useState<TopMode>('bsc')
  const prevTopModeRef = useRef<TopMode | null>(null)
  const topModeSlide = topModeSlideClass(prevTopModeRef.current, topMode)
  if (prevTopModeRef.current !== topMode) {
    prevTopModeRef.current = topMode
  }
  const now = new Date()
  const [fiscalYear, setFiscalYear] = useState(now.getFullYear())
  const [periodMonth, setPeriodMonth] = useState(now.getMonth() + 1)
  const [pickerGroups, setPickerGroups] = useState<GroupListItem[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)

  const functionAllowed =
    access.hasUnrestrictedAccess ||
    (access.isLoaded && access.isEntryAllowed('desktop_team'))

  const activeGroupId = scope.isSystemAdmin
    ? selectedGroupId
    : (scope.currentGroup?.id ?? null)

  const years = useMemo(() => yearOptions(), [])
  const months = useMemo(() => monthOptionsForYear(fiscalYear), [fiscalYear])
  const isCurrentPeriod = useMemo(() => {
    const d = new Date()
    return fiscalYear === d.getFullYear() && periodMonth === d.getMonth() + 1
  }, [fiscalYear, periodMonth])
  const periodEditable = useMemo(
    () => isTeamPeriodEditable(fiscalYear, periodMonth),
    [fiscalYear, periodMonth],
  )
  const canEditTeam = scope.canManageTeam && periodEditable

  /**
   * Reset year/month filters to the calendar current period.
   * @returns Nothing.
   */
  const goToCurrentMonth = useCallback((): void => {
    const d = new Date()
    setFiscalYear(d.getFullYear())
    setPeriodMonth(d.getMonth() + 1)
  }, [])

  /**
   * Switches BSC / PBC / Retro from the page or the native Team menu.
   * @param next - Target mode.
   * @returns Nothing.
   */
  const onTopModeChange = useCallback((next: TopMode): void => {
    setTopMode(next)
  }, [])

  useEffect(() => {
    if (!months.includes(periodMonth)) {
      setPeriodMonth(months[months.length - 1] ?? 1)
    }
  }, [months, periodMonth])

  useEffect(() => {
    if (!scope.isSystemAdmin || scope.isLoading) return
    let cancelled = false
    void listGroupsForTeamPicker()
      .then((groups) => {
        if (cancelled) return
        setPickerGroups(groups)
        setSelectedGroupId((current) => {
          if (current && groups.some((g) => g.id === current)) return current
          if (scope.currentGroup && groups.some((g) => g.id === scope.currentGroup?.id)) {
            return scope.currentGroup.id
          }
          return groups[0]?.id ?? null
        })
      })
      .catch((err) => {
        console.error('Load team groups error:', err)
      })
    return () => {
      cancelled = true
    }
  }, [scope.currentGroup, scope.isLoading, scope.isSystemAdmin])

  useEffect(() => {
    return () => unregisterTeamMenuHost()
  }, [])

  useEffect(() => {
    patchTeamMenuHandlers({
      setMode: (mode) => {
        setTopMode(mode)
      },
      selectYear: (year) => {
        setFiscalYear(year)
      },
      selectMonth: (month) => {
        setPeriodMonth(month)
      },
      selectGroup: (groupId) => {
        setSelectedGroupId(groupId)
      },
      goToCurrent: goToCurrentMonth,
    })
  }, [goToCurrentMonth])

  const yearSelectOptions = useMemo(
    () =>
      years.map((y) => ({
        value: String(y),
        label: `${y}${t('admin.team.yearSuffix')}`,
      })),
    [t, years],
  )

  const monthSelectOptions = useMemo(
    () =>
      months.map((m) => ({
        value: String(m),
        label: `${m}${t('admin.team.monthSuffix')}`,
      })),
    [months, t],
  )

  const groupSelectOptions = useMemo(
    () =>
      pickerGroups.map((g) => ({
        value: g.id,
        label: g.name,
      })),
    [pickerGroups],
  )

  const nativeTeamMenu = usesNativeTeamMenu()

  useEffect(() => {
    setTeamMenuView({
      modes: [
        { id: 'bsc', label: t('admin.team.bscTab') },
        { id: 'pbc', label: t('admin.team.pbcTab') },
        { id: 'retro', label: t('admin.team.retroTab') },
      ],
      selectedMode: topMode,
      years: yearSelectOptions.map((option) => ({
        id: option.value,
        label: option.label,
      })),
      selectedYear: fiscalYear,
      months: monthSelectOptions.map((option) => ({
        id: option.value,
        label: option.label,
      })),
      selectedMonth: periodMonth,
      canGoToCurrent: !isCurrentPeriod,
      groups: groupSelectOptions.map((option) => ({
        id: option.value,
        label: option.label,
      })),
      selectedGroupId,
      showGroupMenu: scope.isSystemAdmin,
    })
  }, [
    fiscalYear,
    groupSelectOptions,
    isCurrentPeriod,
    monthSelectOptions,
    periodMonth,
    scope.isSystemAdmin,
    selectedGroupId,
    t,
    topMode,
    yearSelectOptions,
  ])

  if (!access.isLoaded || scope.isLoading) {
    return (
      <div className="feature-page h-dvh max-h-dvh">
        <StatusLoading />
      </div>
    )
  }

  if (!functionAllowed) {
    return (
      <div className="feature-page flex h-dvh max-h-dvh flex-col overflow-hidden text-ink">
        <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <h2 className="text-lg font-bold text-ink">
            {t('admin.moduleAccess.noModulesTitle')}
          </h2>
          <p className="text-sm font-medium text-muted">
            {t('admin.moduleAccess.noModulesDescription')}
          </p>
        </div>
      </div>
    )
  }

  const tabs: Array<{ id: TopMode; labelKey: string }> = [
    { id: 'bsc', labelKey: 'admin.team.bscTab' },
    { id: 'pbc', labelKey: 'admin.team.pbcTab' },
    { id: 'retro', labelKey: 'admin.team.retroTab' },
  ]
  const tabOptions = tabs.map((tab) => ({
    value: tab.id,
    label: t(tab.labelKey),
  }))

  return (
    <div className="admin-page feature-page flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden text-ink">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-5">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-ink/10 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-950">
          <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-ink/10 bg-white px-5 py-3 sm:px-6 dark:bg-zinc-950">
            <h1 className="text-lg font-extrabold tracking-tight text-brand">
              {t('admin.team.title')}
            </h1>
            {nativeTeamMenu ? null : (
              <>
                <SlidingSegmented
                  value={topMode}
                  options={tabOptions}
                  ariaLabel={t('admin.team.title')}
                  onChange={onTopModeChange}
                />
                <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-2">
                  <CrmFilterSelect
                    className="!w-auto min-w-28 max-w-36 shrink-0"
                    size="sm"
                    value={String(fiscalYear)}
                    options={yearSelectOptions}
                    ariaLabel={t('admin.team.pbcFiscalYear')}
                    onChange={(next) => setFiscalYear(Number.parseInt(next, 10))}
                  />
                  <CrmFilterSelect
                    className="!w-auto min-w-24 max-w-32 shrink-0"
                    size="sm"
                    value={String(periodMonth)}
                    options={monthSelectOptions}
                    ariaLabel={t('admin.team.pbcFiscalYear')}
                    onChange={(next) => setPeriodMonth(Number.parseInt(next, 10))}
                  />
                  {!isCurrentPeriod ? (
                    <button
                      type="button"
                      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-ink/15 bg-white px-2.5 text-xs font-semibold text-ink transition-colors hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                      onClick={goToCurrentMonth}
                    >
                      <CalendarIcon className="size-3.5 opacity-70" />
                      {t('admin.team.goToCurrentMonth')}
                    </button>
                  ) : null}
                  {scope.isSystemAdmin ? (
                    <CrmFilterSelect
                      className="!w-auto min-w-40 max-w-56 shrink-0"
                      size="sm"
                      value={selectedGroupId ?? ''}
                      options={
                        groupSelectOptions.length > 0
                          ? groupSelectOptions
                          : [{ value: '', label: t('admin.team.pbcSelectGroup') }]
                      }
                      ariaLabel={t('admin.team.pbcSelectGroup')}
                      onChange={(next) => setSelectedGroupId(next || null)}
                    />
                  ) : null}
                </div>
              </>
            )}
          </header>

          <main className="min-h-0 flex-1 overflow-auto bg-white p-5 sm:p-6 dark:bg-zinc-950">
            {!activeGroupId ? (
              <p className="text-sm font-medium text-ink">{t('admin.team.pbcNoGroup')}</p>
            ) : (
              <div key={topMode} className={`space-y-4 ${topModeSlide}`}>
                {!periodEditable ? (
                  <p className="rounded-xl border border-ink/10 bg-zinc-50 px-4 py-2.5 text-xs font-medium text-ink dark:bg-zinc-900">
                    {t('admin.team.periodReadOnlyHint')}
                  </p>
                ) : null}
                {topMode === 'bsc' ? (
                  <TeamBscBoard
                    groupId={activeGroupId}
                    fiscalYear={fiscalYear}
                    periodMonth={periodMonth}
                    canEdit={canEditTeam}
                    periodEditable={periodEditable}
                  />
                ) : topMode === 'pbc' ? (
                  <TeamPbcPane
                    userId={userId}
                    groupId={activeGroupId}
                    fiscalYear={fiscalYear}
                    periodMonth={periodMonth}
                    canManageTeam={scope.canManageTeam}
                    periodEditable={periodEditable}
                  />
                ) : (
                  <TeamRetroBoard
                    groupId={activeGroupId}
                    fiscalYear={fiscalYear}
                    periodMonth={periodMonth}
                    canEdit={canEditTeam}
                    periodEditable={periodEditable}
                  />
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
