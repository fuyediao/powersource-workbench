/**
 * Live Sales Board pane for Kanban `/kanban/sales` (Workbench Electron design
 * system parity with `DashboardPane` / `OrdersCrmPane` — no standalone CSS).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CrmFilterSelect,
  type CrmFilterOption,
} from '@/components/common/crm-filter-select'
import { CrmSegmentedControl } from '@/components/common/crm-segmented-control'
import { SalesBoardMonthlyChart } from '@/components/kanban/sales-board-monthly-chart'
import {
  SalesBoardPieChart,
  buildShareSlices,
  type SalesBoardPieSlice,
} from '@/components/kanban/sales-board-pie-chart'
import { useDesktopDomainWritesContext } from '@/hooks/use-desktop-domain-writes'
import { RefreshIcon } from '@/icons/AllIcons'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import {
  fetchSalesBoardGroups,
  fetchSalesBoardSummary,
  isSalesBoardConfigured,
  type SalesBoardGroupOption,
  type SalesBoardSource,
  type SalesBoardSummary,
} from '@/services/sales-board-api'
import { compactMoney, formatMoney } from '@/services/sales-board-format'
import {
  monthsInQuarter,
  resolveYearCascadeQuery,
  weeksInMonth,
} from '@/services/sales-board-period'

const POLL_MS = 45_000
const REALTIME_DEBOUNCE_MS = 800
const SOURCE_OPTIONS: SalesBoardSource[] = ['erp', 'nexdot']

/** Top-level period filter mode (preset keywords vs calendar year vs custom). */
type SalesBoardPeriodMode = 'preset' | 'year' | 'custom'

const PRESET_PERIODS = new Set([
  'all',
  'current_week',
  'current_month',
  'current_quarter',
  'week',
  'month',
  'quarter',
])

/**
 * @param date - Local date to format.
 * @returns `date` formatted as `YYYY-MM-DD` in local time (no UTC shift).
 */
function toInputDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * @returns Today, formatted as `YYYY-MM-DD` for `<input type="date">`.
 */
function todayInputValue(): string {
  return toInputDate(new Date())
}

/**
 * @returns The first day of the current month, formatted as `YYYY-MM-DD`.
 */
function monthStartInputValue(): string {
  const now = new Date()
  return toInputDate(new Date(now.getFullYear(), now.getMonth(), 1))
}

/**
 * Scans `orders` / `shop_orders` over Supabase (RLS), refreshes on Realtime
 * and poll, and renders the board with the shared Workbench Electron chrome.
 * @returns Sales Board pane.
 */
export function SalesBoardPane() {
  const { t } = useTranslation()
  const domainWrites = useDesktopDomainWritesContext()
  const [source, setSource] = useState<SalesBoardSource>('erp')
  const [sources, setSources] = useState<SalesBoardSource[]>(SOURCE_OPTIONS)
  const [groupId, setGroupId] = useState('')
  const [groups, setGroups] = useState<SalesBoardGroupOption[]>([])
  const [canSwitchGroup, setCanSwitchGroup] = useState(false)
  const [periodMode, setPeriodMode] = useState<SalesBoardPeriodMode>('preset')
  const [presetPeriod, setPresetPeriod] = useState('all')
  const [yearPeriod, setYearPeriod] = useState('')
  const [yearQuarter, setYearQuarter] = useState('')
  const [yearMonth, setYearMonth] = useState('')
  const [yearWeek, setYearWeek] = useState('')
  const [customFrom, setCustomFrom] = useState(monthStartInputValue)
  const [customTo, setCustomTo] = useState(todayInputValue)
  const [years, setYears] = useState<number[]>([])
  const [summary, setSummary] = useState<SalesBoardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const yearCascade = useMemo(
    () => resolveYearCascadeQuery(yearPeriod, yearQuarter, yearMonth, yearWeek),
    [yearMonth, yearPeriod, yearQuarter, yearWeek],
  )

  const period =
    periodMode === 'custom'
      ? 'custom'
      : periodMode === 'year'
        ? yearCascade.period
        : presetPeriod
  const queryFrom =
    periodMode === 'custom'
      ? customFrom
      : periodMode === 'year'
        ? yearCascade.from
        : undefined
  const queryTo =
    periodMode === 'custom'
      ? customTo
      : periodMode === 'year'
        ? yearCascade.to
        : undefined
  const usesCustomBounds = period === 'custom'
  const customRangeReady =
    !usesCustomBounds ||
    (Boolean(queryFrom) && Boolean(queryTo) && (queryFrom ?? '') <= (queryTo ?? ''))
  const yearReady = periodMode !== 'year' || Boolean(yearPeriod)
  const periodReady = customRangeReady && yearReady

  const load = useCallback(async () => {
    if (!isSalesBoardConfigured()) {
      setError(t('kanban.sales.apiMissing'))
      setLoading(false)
      return
    }
    if (!periodReady) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [groupPayload, nextSummary] = await Promise.all([
        fetchSalesBoardGroups(domainWrites.isSystemAdmin),
        fetchSalesBoardSummary(
          {
            source,
            groupId: groupId || undefined,
            period,
            from: usesCustomBounds ? queryFrom : undefined,
            to: usesCustomBounds ? queryTo : undefined,
          },
          domainWrites.isSystemAdmin,
        ),
      ])
      setGroups(groupPayload.groups)
      setCanSwitchGroup(groupPayload.canSwitch)
      setSources(groupPayload.sources.length > 0 ? groupPayload.sources : ['erp'])
      setSummary(nextSummary)
      if (nextSummary.meta.years.length > 0) {
        setYears(nextSummary.meta.years)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }, [
    domainWrites.isSystemAdmin,
    groupId,
    period,
    periodReady,
    queryFrom,
    queryTo,
    source,
    t,
    usesCustomBounds,
  ])

  useEffect(() => {
    if (years.length === 0) {
      return
    }
    setYearPeriod((current) => {
      if (current && years.includes(Number(current))) {
        return current
      }
      return String(years[years.length - 1])
    })
  }, [years])

  useEffect(() => {
    void load()
  }, [load, reloadToken])

  useEffect(() => {
    const client = supabase
    if (!isSupabaseConfigured || !client) {
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    /**
     * Debounces a Realtime reload after burst writes.
     * @returns Nothing.
     */
    function schedule(): void {
      if (timer) {
        clearTimeout(timer)
      }
      timer = setTimeout(() => {
        setReloadToken((value) => value + 1)
      }, REALTIME_DEBOUNCE_MS)
    }
    const channel = client
      .channel('sales-board-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_orders' }, schedule)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'erp_order_lines' },
        schedule,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shop_order_items' },
        schedule,
      )
      .subscribe()
    return () => {
      if (timer) {
        clearTimeout(timer)
      }
      void client.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    /**
     * Reloads once the window regains visibility.
     * @returns Nothing.
     */
    function onVisible(): void {
      if (document.visibilityState === 'visible') {
        setReloadToken((value) => value + 1)
      }
    }
    /**
     * Reloads once the window regains focus.
     * @returns Nothing.
     */
    function onFocus(): void {
      setReloadToken((value) => value + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        setReloadToken((value) => value + 1)
      }
    }, POLL_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
      window.clearInterval(poll)
    }
  }, [])

  const groupOptions: CrmFilterOption[] = useMemo(
    () => [
      { value: '', label: t('kanban.sales.groupAll') },
      ...groups.map((group) => ({ value: group.id, label: group.name })),
    ],
    [groups, t],
  )

  const presetOptions: CrmFilterOption[] = useMemo(
    () => [
      { value: 'all', label: t('kanban.sales.periodAll') },
      { value: 'current_week', label: t('kanban.sales.periodCurrentWeek') },
      { value: 'current_month', label: t('kanban.sales.periodCurrentMonth') },
      { value: 'current_quarter', label: t('kanban.sales.periodCurrentQuarter') },
      { value: 'week', label: t('kanban.sales.periodWeek') },
      { value: 'month', label: t('kanban.sales.periodMonth') },
      { value: 'quarter', label: t('kanban.sales.periodQuarter') },
    ],
    [t],
  )

  const yearOptions: CrmFilterOption[] = useMemo(
    () => years.map((year) => ({ value: String(year), label: String(year) })),
    [years],
  )

  const quarterOptions: CrmFilterOption[] = useMemo(
    () => [
      { value: '', label: t('kanban.sales.periodQuarterAll') },
      { value: '1', label: t('kanban.sales.periodQuarterN', { n: 1 }) },
      { value: '2', label: t('kanban.sales.periodQuarterN', { n: 2 }) },
      { value: '3', label: t('kanban.sales.periodQuarterN', { n: 3 }) },
      { value: '4', label: t('kanban.sales.periodQuarterN', { n: 4 }) },
    ],
    [t],
  )

  const monthOptions: CrmFilterOption[] = useMemo(() => {
    const allowed = yearQuarter
      ? monthsInQuarter(Number(yearQuarter))
      : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    return [
      { value: '', label: t('kanban.sales.periodMonthAll') },
      ...allowed.map((month) => ({
        value: String(month),
        label: t('kanban.sales.periodMonthN', { n: month }),
      })),
    ]
  }, [t, yearQuarter])

  const weekOptionsList = useMemo(() => {
    if (!yearPeriod || !yearMonth) {
      return []
    }
    return weeksInMonth(Number(yearPeriod), Number(yearMonth))
  }, [yearMonth, yearPeriod])

  const weekOptions: CrmFilterOption[] = useMemo(
    () => [
      { value: '', label: t('kanban.sales.periodWeekAll') },
      ...weekOptionsList.map((week) => ({ value: week.value, label: week.label })),
    ],
    [t, weekOptionsList],
  )

  /**
   * Switches the top-level period mode and seeds a sensible secondary value.
   * @param nextMode - Preset keywords, calendar year, or custom range.
   * @returns Nothing.
   */
  function handlePeriodModeChange(nextMode: SalesBoardPeriodMode): void {
    setPeriodMode(nextMode)
    if (nextMode === 'year' && !yearPeriod && years.length > 0) {
      setYearPeriod(String(years[years.length - 1]))
    }
    if (nextMode === 'preset' && !PRESET_PERIODS.has(presetPeriod)) {
      setPresetPeriod('all')
    }
  }

  /**
   * Updates the year and clears deeper cascade levels.
   * @param nextYear - Selected calendar year.
   * @returns Nothing.
   */
  function handleYearChange(nextYear: string): void {
    setYearPeriod(nextYear)
    setYearQuarter('')
    setYearMonth('')
    setYearWeek('')
  }

  /**
   * Updates the quarter and clears month/week when the month falls outside.
   * @param nextQuarter - `` or `1`–`4`.
   * @returns Nothing.
   */
  function handleQuarterChange(nextQuarter: string): void {
    setYearQuarter(nextQuarter)
    setYearWeek('')
    if (nextQuarter && yearMonth) {
      const allowed = monthsInQuarter(Number(nextQuarter))
      if (!allowed.includes(Number(yearMonth))) {
        setYearMonth('')
      }
    }
  }

  /**
   * Updates the month and clears week.
   * @param nextMonth - `` or `1`–`12`.
   * @returns Nothing.
   */
  function handleMonthChange(nextMonth: string): void {
    setYearMonth(nextMonth)
    setYearWeek('')
  }

  const sourceOptions = useMemo(
    () =>
      SOURCE_OPTIONS.filter((item) => sources.includes(item)).map((item) => ({
        value: item,
        label: item === 'erp' ? t('kanban.sales.sourceErp') : t('kanban.sales.sourceNexdot'),
      })),
    [sources, t],
  )

  const periodModeOptions = useMemo(
    () =>
      (
        [
          ['preset', 'periodModePreset'],
          ['year', 'periodModeYear'],
          ['custom', 'periodModeCustom'],
        ] as const
      ).map(([mode, labelKey]) => ({
        value: mode,
        label: t(`kanban.sales.${labelKey}`),
      })),
    [t],
  )

  const currency = summary?.meta.currency || 'USD'
  const kpis = summary?.kpis
  const insight = summary?.insight
  const hasOrders = Boolean(summary && summary.kpis.orderCount > 0)

  const peakRevenue = useMemo(() => {
    const months = summary?.monthly ?? []
    if (months.length === 0) {
      return null
    }
    return months.reduce((best, row) => (row.amount > best.amount ? row : best))
  }, [summary?.monthly])

  const peakOrders = useMemo(() => {
    const months = summary?.monthly ?? []
    if (months.length === 0) {
      return null
    }
    return months.reduce((best, row) => (row.orderCount > best.orderCount ? row : best))
  }, [summary?.monthly])

  const lastMonthIncomplete = useMemo(() => {
    const granularity = summary?.meta.trendGranularity ?? 'month'
    if (granularity !== 'month') {
      return false
    }
    const months = summary?.monthly ?? []
    const last = months[months.length - 1]
    if (!last) {
      return false
    }
    const now = new Date()
    return last.year === now.getFullYear() && last.month === now.getMonth() + 1
  }, [summary?.meta.trendGranularity, summary?.monthly])

  const topCustomerAmount = summary?.topCustomers[0]?.amount || 1
  const topProductAmount = summary?.topProducts[0]?.amount || 1
  const topProduct = summary?.topProducts[0]

  const customerPieSlices = useMemo(() => {
    if (!summary) {
      return [] as SalesBoardPieSlice[]
    }
    return buildShareSlices(
      summary.topCustomers.map((row) => ({
        id: row.id,
        name: row.name,
        value: row.amount,
      })),
      summary.kpis.totalAmount,
      t('kanban.sales.pieOther'),
    )
  }, [summary, t])

  const productPieSlices = useMemo(() => {
    if (!summary) {
      return [] as SalesBoardPieSlice[]
    }
    const namedSum = summary.topProducts.reduce((sum, row) => sum + row.amount, 0)
    const total = Math.max(summary.kpis.totalAmount, namedSum)
    return buildShareSlices(
      summary.topProducts.map((row) => ({
        id: row.id,
        name: row.name,
        value: row.amount,
      })),
      total,
      t('kanban.sales.pieOther'),
    )
  }, [summary, t])

  const statusPieSlices = useMemo(() => {
    if (!summary) {
      return [] as SalesBoardPieSlice[]
    }
    const { postedCount, pendingCount, orderCount } = summary.kpis
    const other = Math.max(0, orderCount - postedCount - pendingCount)
    return [
      {
        id: 'posted',
        label: t('kanban.sales.pieStatusPosted'),
        value: postedCount,
        color: '#10b981',
      },
      {
        id: 'pending',
        label: t('kanban.sales.pieStatusPending'),
        value: pendingCount,
        color: '#f59e0b',
      },
      {
        id: 'other',
        label: t('kanban.sales.pieOther'),
        value: other,
        color: '#94a3b8',
      },
    ].filter((slice) => slice.value > 0)
  }, [summary, t])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
      <div className="flex w-full flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-extrabold text-brand">{t('kanban.sales.title')}</h1>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10"
            title={t('kanban.sales.refresh')}
            onClick={() => setReloadToken((value) => value + 1)}
          >
            <RefreshIcon className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('kanban.sales.refresh')}</span>
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <CrmSegmentedControl
            value={source}
            options={sourceOptions}
            ariaLabel={t('kanban.sales.title')}
            onChange={setSource}
          />
          {canSwitchGroup ? (
            <CrmFilterSelect
              size="sm"
              className="min-w-40 max-w-52"
              value={groupId}
              options={groupOptions}
              ariaLabel={t('kanban.sales.groupLabel')}
              onChange={setGroupId}
            />
          ) : null}
          <CrmSegmentedControl
            value={periodMode}
            options={periodModeOptions}
            ariaLabel={t('kanban.sales.periodModeLabel')}
            onChange={handlePeriodModeChange}
          />
          {periodMode === 'preset' ? (
            <CrmFilterSelect
              size="sm"
              className="min-w-32 max-w-40"
              value={presetPeriod}
              options={presetOptions}
              ariaLabel={t('kanban.sales.periodLabel')}
              onChange={setPresetPeriod}
            />
          ) : null}
          {periodMode === 'year' ? (
            yearOptions.length > 0 ? (
              <>
                <CrmFilterSelect
                  size="sm"
                  className="min-w-28 max-w-36"
                  value={yearPeriod}
                  options={yearOptions}
                  ariaLabel={t('kanban.sales.periodYearLabel')}
                  onChange={handleYearChange}
                />
                <CrmFilterSelect
                  size="sm"
                  className="min-w-28 max-w-36"
                  value={yearQuarter}
                  options={quarterOptions}
                  ariaLabel={t('kanban.sales.periodQuarterLabel')}
                  onChange={handleQuarterChange}
                />
                <CrmFilterSelect
                  size="sm"
                  className="min-w-28 max-w-36"
                  value={yearMonth}
                  options={monthOptions}
                  ariaLabel={t('kanban.sales.periodMonthLabel')}
                  onChange={handleMonthChange}
                />
                {yearMonth ? (
                  <CrmFilterSelect
                    size="sm"
                    className="min-w-36 max-w-48"
                    value={yearWeek}
                    options={weekOptions}
                    ariaLabel={t('kanban.sales.periodWeekLabel')}
                    onChange={setYearWeek}
                  />
                ) : null}
              </>
            ) : (
              <span className="text-xs font-medium text-muted">
                {t('kanban.sales.periodYearEmpty')}
              </span>
            )
          ) : null}
          {periodMode === 'custom' ? (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                className="rounded-xl border border-ink/10 bg-white/60 px-2.5 py-1.5 text-xs font-medium text-ink outline-none focus:border-brand dark:bg-zinc-950/40"
                value={customFrom}
                max={customTo || undefined}
                aria-label={t('kanban.sales.periodCustomFrom')}
                onChange={(event) => setCustomFrom(event.target.value)}
              />
              <span className="text-xs font-medium text-muted">–</span>
              <input
                type="date"
                className="rounded-xl border border-ink/10 bg-white/60 px-2.5 py-1.5 text-xs font-medium text-ink outline-none focus:border-brand dark:bg-zinc-950/40"
                value={customTo}
                min={customFrom || undefined}
                aria-label={t('kanban.sales.periodCustomTo')}
                onChange={(event) => setCustomTo(event.target.value)}
              />
            </div>
          ) : null}
        </div>

        {periodMode === 'custom' && !customRangeReady ? (
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
            {t('kanban.sales.periodCustomInvalid')}
          </p>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-600 dark:text-rose-300">
            {error}
          </p>
        ) : null}

        {loading && !summary ? (
          <div className="grid gap-3">
            <div className="h-24 animate-pulse rounded-2xl bg-ink/5" />
            <div className="h-40 animate-pulse rounded-2xl bg-ink/5" />
            <div className="h-56 animate-pulse rounded-2xl bg-ink/5" />
          </div>
        ) : null}

        {!loading && !error && summary && !hasOrders ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-3xl border border-ink/10 bg-white/60 py-16 text-center dark:bg-white/5">
            <h2 className="text-base font-bold text-ink">{t('kanban.sales.emptyTitle')}</h2>
            <p className="text-sm text-muted">{t('kanban.sales.emptyBody')}</p>
          </div>
        ) : null}

        {summary && hasOrders && kpis ? (
          <div className="flex flex-col gap-4">
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <div className="rounded-2xl border border-ink/10 bg-white/60 p-3 dark:bg-zinc-900/50">
                <p className="text-2xl font-bold tabular-nums text-brand">
                  {compactMoney(kpis.totalAmount, currency)}
                </p>
                <p className="mt-1 text-xs font-medium text-muted">
                  {t('kanban.sales.kpiTotal')}
                </p>
                <p className="text-[11px] font-medium text-muted/80">
                  {t('kanban.sales.kpiTotalHint', { currency })}
                </p>
              </div>
              <div className="rounded-2xl border border-ink/10 bg-white/60 p-3 dark:bg-zinc-900/50">
                <p className="text-2xl font-bold tabular-nums text-sky-500">
                  {kpis.orderCount.toLocaleString()}
                </p>
                <p className="mt-1 text-xs font-medium text-muted">
                  {t('kanban.sales.kpiOrders')}
                </p>
                <p className="text-[11px] font-medium text-muted/80">
                  {t('kanban.sales.kpiOrdersHint')}
                </p>
              </div>
              <div className="rounded-2xl border border-ink/10 bg-white/60 p-3 dark:bg-zinc-900/50">
                <p className="text-2xl font-bold tabular-nums text-teal-500">
                  {formatMoney(kpis.avgAmount, currency, 0)}
                </p>
                <p className="mt-1 text-xs font-medium text-muted">{t('kanban.sales.kpiAvg')}</p>
                <p className="text-[11px] font-medium text-muted/80">
                  {t('kanban.sales.kpiAvgHint')}
                </p>
              </div>
              <div className="rounded-2xl border border-ink/10 bg-white/60 p-3 dark:bg-zinc-900/50">
                <p className="text-2xl font-bold tabular-nums text-emerald-500">
                  {kpis.postedRate.toFixed(2)}%
                </p>
                <p className="mt-1 text-xs font-medium text-muted">
                  {t('kanban.sales.kpiPosted')}
                </p>
                <p className="text-[11px] font-medium text-muted/80">
                  {t('kanban.sales.kpiPostedHint', { count: kpis.postedCount.toLocaleString() })}
                </p>
              </div>
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                  {kpis.pendingCount.toLocaleString()}
                </p>
                <p className="mt-1 text-xs font-medium text-amber-700/80 dark:text-amber-300/80">
                  {t('kanban.sales.kpiPending')}
                </p>
                <p className="text-[11px] font-medium text-amber-700/70 dark:text-amber-300/70">
                  {t('kanban.sales.kpiPendingHint', {
                    amount: formatMoney(kpis.pendingAmount, currency, 2),
                  })}
                </p>
              </div>
            </section>

            {insight ? (
              <section className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-violet-700 dark:text-violet-300">
                      {t('kanban.sales.insightBadge')}
                    </h2>
                    <p className="mt-1 text-sm font-semibold text-ink">
                      {t('kanban.sales.insightTitle')}
                    </p>
                  </div>
                  <span className="text-lg font-bold tabular-nums text-violet-600 dark:text-violet-300">
                    {insight.ratio}×
                  </span>
                </div>
                <p className="mt-2 text-sm text-ink/80">
                  {t('kanban.sales.insightBody', {
                    leader: insight.leader.name,
                    leaderAmount: compactMoney(insight.leader.amount, currency),
                    leaderOrders: insight.leader.orderCount.toLocaleString(),
                    challenger: insight.challenger.name,
                    challengerAmount: compactMoney(insight.challenger.amount, currency),
                    challengerOrders: insight.challenger.orderCount.toLocaleString(),
                    ratio: insight.ratio,
                  })}
                </p>
              </section>
            ) : null}

            <section className="rounded-2xl border border-ink/10 bg-white/70 shadow-sm backdrop-blur-xl dark:bg-zinc-950/55">
              <div className="border-b border-ink/10 px-4 py-3">
                <h2 className="text-sm font-semibold text-brand">
                  {t('kanban.sales.monthlyTitle')}
                </h2>
              </div>
              <div className="p-4">
                <SalesBoardMonthlyChart
                  months={summary.monthly}
                  currency={currency}
                  ordersLabel={t('kanban.sales.legendOrders')}
                  amountLabel={t('kanban.sales.legendAmount')}
                  ordersUnit={t('kanban.sales.ordersUnit')}
                  ariaLabel={t('kanban.sales.monthlyTitle')}
                />
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-muted">
                  {peakRevenue ? (
                    <span>
                      {t('kanban.sales.peakRevenue', {
                        label: peakRevenue.label,
                        amount: compactMoney(peakRevenue.amount, currency),
                      })}
                    </span>
                  ) : null}
                  {peakOrders ? (
                    <span>
                      {t('kanban.sales.peakOrders', {
                        label: peakOrders.label,
                        count: peakOrders.orderCount.toLocaleString(),
                      })}
                    </span>
                  ) : null}
                  {lastMonthIncomplete ? <span>{t('kanban.sales.incompleteMonth')}</span> : null}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-ink/10 bg-white/70 shadow-sm backdrop-blur-xl dark:bg-zinc-950/55">
              <div className="border-b border-ink/10 px-4 py-3">
                <h2 className="text-sm font-semibold text-brand">
                  {t('kanban.sales.pieSectionTitle')}
                </h2>
              </div>
              <div className="grid gap-6 p-4 md:grid-cols-2 xl:grid-cols-3">
                <SalesBoardPieChart
                  title={t('kanban.sales.pieCustomerTitle')}
                  slices={customerPieSlices}
                  currency={currency}
                  emptyLabel={t('kanban.sales.pieEmpty')}
                  ariaLabel={t('kanban.sales.pieCustomerTitle')}
                />
                <SalesBoardPieChart
                  title={t('kanban.sales.pieProductTitle')}
                  slices={productPieSlices}
                  currency={currency}
                  emptyLabel={t('kanban.sales.pieEmpty')}
                  ariaLabel={t('kanban.sales.pieProductTitle')}
                />
                <SalesBoardPieChart
                  title={t('kanban.sales.pieStatusTitle')}
                  slices={statusPieSlices}
                  unitLabel={t('kanban.sales.ordersUnit')}
                  emptyLabel={t('kanban.sales.pieEmpty')}
                  ariaLabel={t('kanban.sales.pieStatusTitle')}
                />
              </div>
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-2xl border border-ink/10 bg-white/70 shadow-sm backdrop-blur-xl dark:bg-zinc-950/55">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 px-4 py-3">
                  <h2 className="text-sm font-semibold text-brand">
                    {t('kanban.sales.customerTitle')}
                  </h2>
                  <span className="text-xs font-medium text-muted">
                    {t('kanban.sales.topN')}
                  </span>
                </div>
                <div className="flex flex-col gap-3 p-4">
                  {summary.topCustomers.map((row, index) => (
                    <div key={row.id} className="flex items-center gap-3">
                      <b className="w-5 shrink-0 text-xs font-bold tabular-nums text-muted">
                        {String(index + 1).padStart(2, '0')}
                      </b>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-ink">
                            {row.name}
                          </span>
                          <span className="shrink-0 text-xs font-semibold tabular-nums text-brand">
                            {compactMoney(row.amount, currency)}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/10">
                          <div
                            className="h-full rounded-full bg-brand"
                            style={{ width: `${(row.amount / topCustomerAmount) * 100}%` }}
                          />
                        </div>
                        <span className="mt-1 block text-[11px] font-medium text-muted">
                          {row.code ? `${row.code} · ` : ''}
                          {row.orderCount.toLocaleString()} {t('kanban.sales.ordersUnit')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-ink/10 bg-white/70 shadow-sm backdrop-blur-xl dark:bg-zinc-950/55">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 px-4 py-3">
                  <h2 className="text-sm font-semibold text-brand">
                    {t('kanban.sales.productTitle')}
                  </h2>
                  <span className="text-xs font-medium text-muted">
                    {t('kanban.sales.productHint')}
                  </span>
                </div>
                <div className="flex flex-col gap-3 p-4">
                  {summary.topProducts.map((row, index) => (
                    <div key={row.id} className="flex items-center gap-3">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[10px] font-bold text-brand">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-ink">
                            {row.name}
                          </span>
                          <span className="shrink-0 text-xs font-semibold tabular-nums text-brand">
                            {formatMoney(row.amount, currency, 0)}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/10">
                          <div
                            className="h-full rounded-full bg-teal-500"
                            style={{ width: `${(row.amount / topProductAmount) * 100}%` }}
                          />
                        </div>
                        <span className="mt-1 block text-[11px] font-medium text-muted">
                          {row.orderCount.toLocaleString()} {t('kanban.sales.ordersUnit')}
                        </span>
                      </div>
                    </div>
                  ))}
                  {topProduct ? (
                    <div className="mt-1 rounded-xl border border-teal-500/30 bg-teal-500/10 px-3 py-2">
                      <p className="text-xs font-bold text-teal-700 dark:text-teal-300">
                        {t('kanban.sales.productCallout')}
                      </p>
                      <p className="text-xs font-medium text-teal-700/80 dark:text-teal-300/80">
                        {t('kanban.sales.productCalloutBody', {
                          name: topProduct.name,
                          amount: compactMoney(topProduct.amount, currency),
                        })}
                      </p>
                    </div>
                  ) : null}
                </div>
              </section>
            </div>

            <section className="rounded-2xl border border-ink/10 bg-white/70 shadow-sm backdrop-blur-xl dark:bg-zinc-950/55">
              <div className="border-b border-ink/10 px-4 py-3">
                <h2 className="text-sm font-semibold text-brand">
                  {t('kanban.sales.qualityTitle')}
                </h2>
              </div>
              <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
                <div>
                  <p className="text-lg font-bold tabular-nums text-ink">
                    {summary.quality.amountCoverage.toFixed(0)}%
                  </p>
                  <p className="text-xs font-medium text-muted">
                    {t('kanban.sales.qualityAmount')}
                  </p>
                </div>
                <div>
                  <p className="text-lg font-bold tabular-nums text-ink">
                    {summary.quality.duplicateIds}
                  </p>
                  <p className="text-xs font-medium text-muted">
                    {t('kanban.sales.qualityDupes')}
                  </p>
                </div>
                <div>
                  <p className="text-lg font-bold tabular-nums text-ink">
                    {summary.quality.usdShare.toFixed(0)}%
                  </p>
                  <p className="text-xs font-medium text-muted">{t('kanban.sales.qualityUsd')}</p>
                </div>
                <div>
                  <p
                    className={`text-lg font-bold tabular-nums ${
                      summary.quality.addressCoverage < 50 ? 'text-amber-600 dark:text-amber-400' : 'text-ink'
                    }`}
                  >
                    {summary.quality.addressCoverage.toFixed(1)}%
                  </p>
                  <p className="text-xs font-medium text-muted">
                    {t('kanban.sales.qualityAddress')}
                  </p>
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  )
}
