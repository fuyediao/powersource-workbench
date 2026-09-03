/**
 * CRM sales dashboard pane (web Admin DashboardView parity via get_dashboard_bundle).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import {
  fetchDashboardBundle,
  type DashboardBundle,
  type DashboardFunnelRow,
} from '@/services/dashboard-api'
import {
  type DashboardPeriod,
  isDashboardPeriod,
} from '@/utils/dashboard-period'
import { ChevronDownIcon } from '@/icons/AllIcons'

const PERIOD_OPTIONS: DashboardPeriod[] = ['week', 'month', 'quarter', 'year', 'all']

const PERIOD_I18N_KEYS: Record<DashboardPeriod, string> = {
  week: 'admin.dashboard.periodThisWeek',
  month: 'admin.dashboard.periodLastMonth',
  quarter: 'admin.dashboard.periodLastQuarter',
  year: 'admin.dashboard.periodLastYear',
  all: 'admin.dashboard.periodAll',
}

const FUNNEL_SALES_PROCESS_OPTIONS = [
  'ai_automated_sales',
  'brand_order',
  'tender',
  'custom',
] as const

type FunnelSalesProcess = (typeof FUNNEL_SALES_PROCESS_OPTIONS)[number]

const KPI_ACCENTS = [
  'text-violet-500',
  'text-amber-500',
  'text-teal-500',
  'text-emerald-500',
  'text-sky-500',
  'text-blue-500',
  'text-cyan-500',
  'text-rose-500',
  'text-green-500',
  'text-pink-500',
  'text-orange-500',
  'text-indigo-500',
  'text-yellow-600',
  'text-lime-600',
  'text-violet-600',
  'text-fuchsia-500',
] as const

const FUNNEL_COLORS = [
  '#3b82f6',
  '#f97316',
  '#a855f7',
  '#22c55e',
  '#ef4444',
  '#eab308',
  '#06b6d4',
  '#ec4899',
  '#6366f1',
  '#84cc16',
  '#14b8a6',
  '#f59e0b',
] as const

/**
 * Formats a compact currency-like magnitude (no locale currency symbol).
 * @param value - Amount.
 * @returns Compact string.
 */
function formatCompactAmount(value: number): string {
  if (!Number.isFinite(value)) {
    return '0'
  }
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1e9) {
    return `${sign}${(abs / 1e9).toFixed(1)}B`
  }
  if (abs >= 1e6) {
    return `${sign}${(abs / 1e6).toFixed(1)}M`
  }
  if (abs >= 1e3) {
    return `${sign}${(abs / 1e3).toFixed(1)}K`
  }
  return `${sign}${Math.round(abs)}`
}

/**
 * Polar degrees (clockwise from top) to SVG cartesian.
 * @param cx - Center x.
 * @param cy - Center y.
 * @param r - Radius.
 * @param deg - Angle degrees.
 * @returns Point.
 */
function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  deg: number,
): { x: number; y: number } {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

/**
 * Builds an SVG pie-slice path.
 * @param cx - Center x.
 * @param cy - Center y.
 * @param r - Radius.
 * @param startDeg - Start angle.
 * @param endDeg - End angle.
 * @returns Path `d` attribute.
 */
function buildArcPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string {
  if (Math.abs(endDeg - startDeg) >= 359.9) {
    const top = polarToCartesian(cx, cy, r, 0)
    const bottom = polarToCartesian(cx, cy, r, 180)
    return [
      `M ${top.x} ${top.y}`,
      `A ${r} ${r} 0 0 1 ${bottom.x} ${bottom.y}`,
      `A ${r} ${r} 0 0 1 ${top.x} ${top.y}`,
      'Z',
    ].join(' ')
  }
  const start = polarToCartesian(cx, cy, r, startDeg)
  const end = polarToCartesian(cx, cy, r, endDeg)
  const largeArc = endDeg - startDeg > 180 ? 1 : 0
  return [
    `M ${cx} ${cy}`,
    `L ${start.x.toFixed(3)} ${start.y.toFixed(3)}`,
    `A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`,
    'Z',
  ].join(' ')
}

/**
 * CRM dashboard content for the Electron 看板 Function (briefing + funnel only;
 * schedule / focus / mail live as Home aside widgets).
 * @returns Dashboard UI.
 */
export function DashboardPane() {
  const { t } = useTranslation()
  const [period, setPeriod] = useState<DashboardPeriod>('week')
  const [periodOpen, setPeriodOpen] = useState(false)
  const [funnelProcess, setFunnelProcess] = useState<FunnelSalesProcess>('tender')
  const [funnelOpen, setFunnelOpen] = useState(false)
  const periodMenu = useDialogPresence(periodOpen, 180)
  const funnelMenu = useDialogPresence(funnelOpen, 180)
  const [bundle, setBundle] = useState<DashboardBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (nextPeriod: DashboardPeriod): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchDashboardBundle(nextPeriod)
      setBundle(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBundle(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(period)
  }, [load, period])

  useEffect(() => {
    /**
     * Closes period / funnel menus on outside click.
     * @param event - Document click.
     */
    function onDocClick(event: MouseEvent): void {
      const target = event.target as HTMLElement | null
      if (!target?.closest?.('[data-dashboard-period-dropdown]')) {
        setPeriodOpen(false)
      }
      if (!target?.closest?.('[data-dashboard-funnel-process-dropdown]')) {
        setFunnelOpen(false)
      }
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  const kpiCards = useMemo(() => {
    const k = bundle?.kpis
    if (!k) {
      return []
    }
    return [
      { value: k.newAccounts, labelKey: 'admin.dashboard.stats.newAccounts' },
      { value: k.newOpportunities, labelKey: 'admin.dashboard.stats.newOpportunities' },
      { value: k.newFollowUps, labelKey: 'admin.dashboard.stats.newFollowUps' },
      {
        value: k.totalOpportunityAmount,
        labelKey: 'admin.dashboard.stats.totalOpportunityAmount',
        format: 'currency' as const,
      },
      { value: k.followedLeads, labelKey: 'admin.dashboard.stats.followedLeads' },
      { value: k.followedCustomers, labelKey: 'admin.dashboard.stats.followedCustomers' },
      {
        value: k.customerManagementTotal,
        labelKey: 'admin.dashboard.stats.customerManagementTotal',
      },
      {
        value: k.followedOpportunities,
        labelKey: 'admin.dashboard.stats.followedOpportunities',
      },
      { value: k.wonOpportunities, labelKey: 'admin.dashboard.stats.wonOpportunities' },
      { value: k.newKol, labelKey: 'admin.dashboard.stats.newKolCount' },
      { value: k.newVisitLog, labelKey: 'admin.dashboard.stats.newVisitLogCount' },
      { value: k.newOrders, labelKey: 'admin.dashboard.stats.newOrderCount' },
      { value: k.overduePlans, labelKey: 'admin.dashboard.stats.overdueFollowUpPlans' },
      { value: k.completedPlans, labelKey: 'admin.dashboard.stats.completedFollowUpPlans' },
      { value: k.newTe, labelKey: 'admin.dashboard.stats.newTeSubmissions' },
      { value: k.mapFavorites, labelKey: 'admin.dashboard.stats.mapFavoritesList' },
    ].map((card, i) => ({
      ...card,
      accentClass: KPI_ACCENTS[i % KPI_ACCENTS.length],
    }))
  }, [bundle])

  const funnelRows: DashboardFunnelRow[] = useMemo(
    () => bundle?.funnelByProcess[funnelProcess] ?? [],
    [bundle, funnelProcess],
  )

  const funnelTotalAmount = useMemo(
    () => Math.max(1, funnelRows.reduce((sum, row) => sum + row.amount, 0)),
    [funnelRows],
  )

  const pieSlices = useMemo(() => {
    const total = funnelRows.reduce((sum, row) => sum + row.amount, 0)
    if (total <= 0) {
      return []
    }
    let cursor = 0
    const result: {
      stage: string
      amount: number
      ratio: number
      startAngle: number
      endAngle: number
      color: string
    }[] = []
    funnelRows.forEach((row, i) => {
      if (row.amount <= 0) {
        return
      }
      const ratio = row.amount / total
      const start = cursor
      cursor += ratio * 360
      result.push({
        stage: row.stage,
        amount: row.amount,
        ratio,
        startAngle: start,
        endAngle: cursor,
        color: FUNNEL_COLORS[i % FUNNEL_COLORS.length],
      })
    })
    return result
  }, [funnelRows])

  /**
   * Selects a reporting period.
   * @param next - Period value.
   */
  function selectPeriod(next: DashboardPeriod): void {
    setPeriod(next)
    setPeriodOpen(false)
  }

  return (
    <div ref={rootRef} className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
      <div className="flex w-full flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-extrabold text-brand">{t('admin.dashboard.title')}</h1>
        </header>

        {loading && !bundle ? (
          <div className="grid gap-3">
            <div className="h-40 animate-pulse rounded-2xl bg-ink/5" />
            <div className="h-56 animate-pulse rounded-2xl bg-ink/5" />
          </div>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-600 dark:text-rose-300">
            {error}
          </p>
        ) : null}

        {bundle ? (
          <div className="flex flex-col gap-4">
              <section className="rounded-2xl border border-ink/10 bg-white/70 shadow-sm backdrop-blur-xl dark:bg-zinc-950/55">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 px-4 py-3">
                  <h2 className="text-sm font-semibold text-brand">
                    {t('admin.dashboard.salesBriefing')}
                  </h2>
                  <div className="relative" data-dashboard-period-dropdown>
                    <button
                      type="button"
                      aria-expanded={periodOpen}
                      aria-haspopup="listbox"
                      aria-label={t('admin.dashboard.periodSelectAria')}
                      className="inline-flex min-w-28 items-center justify-between gap-1.5 rounded-lg border border-ink/15 bg-white/80 px-2.5 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-brand/40 dark:bg-zinc-900/80"
                      onClick={(event) => {
                        event.stopPropagation()
                        setPeriodOpen((open) => !open)
                      }}
                    >
                      <span className="truncate">{t(PERIOD_I18N_KEYS[period])}</span>
                      <ChevronDownIcon
                        className={`size-3.5 shrink-0 text-muted transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${periodOpen ? 'rotate-180 text-brand' : ''}`}
                        aria-hidden
                      />
                    </button>
                    {periodMenu.mounted ? (
                      <ul
                        className={`absolute right-0 z-20 mt-1 w-full min-w-36 origin-top overflow-hidden rounded-lg border border-ink/10 bg-white py-1 shadow-xl dark:bg-zinc-900 ${
                          periodMenu.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
                        }`}
                        role="listbox"
                        aria-label={t('admin.dashboard.periodSelectAria')}
                      >
                        {PERIOD_OPTIONS.map((option) => (
                          <li key={option} role="presentation">
                            <button
                              type="button"
                              role="option"
                              aria-selected={period === option}
                              className={`w-full px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                                period === option
                                  ? 'bg-brand/15 text-brand'
                                  : 'text-ink hover:bg-ink/5'
                              }`}
                              onClick={(event) => {
                                event.stopPropagation()
                                if (isDashboardPeriod(option)) {
                                  selectPeriod(option)
                                }
                              }}
                            >
                              {t(PERIOD_I18N_KEYS[option])}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
                  {kpiCards.map((card) => (
                    <div
                      key={card.labelKey}
                      className="rounded-xl border border-ink/10 bg-white/60 p-3 dark:bg-zinc-900/50"
                    >
                      <p
                        className={`text-2xl font-bold tabular-nums ${card.accentClass}`}
                      >
                        {card.format === 'currency'
                          ? formatCompactAmount(card.value)
                          : String(card.value)}
                      </p>
                      <p className="mt-1 text-xs font-medium text-muted">{t(card.labelKey)}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-ink/10 bg-white/70 shadow-sm backdrop-blur-xl dark:bg-zinc-950/55">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 px-4 py-3">
                  <h2 className="text-sm font-semibold text-brand">
                    {t('admin.dashboard.salesFunnel')}
                  </h2>
                  <div className="relative min-w-40" data-dashboard-funnel-process-dropdown>
                    <button
                      type="button"
                      className={`flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-ink/15 bg-white/80 px-2.5 text-xs font-semibold text-ink transition-colors hover:border-brand/40 dark:bg-zinc-900/80 ${
                        funnelOpen ? 'border-brand/50 ring-1 ring-brand/20' : ''
                      }`}
                      onClick={(event) => {
                        event.stopPropagation()
                        setFunnelOpen((open) => !open)
                      }}
                    >
                      <span className="truncate">
                        {t(`admin.opportunities.salesProcess.${funnelProcess}`, {
                          defaultValue: funnelProcess,
                        })}
                      </span>
                      <ChevronDownIcon
                        className={`size-3 shrink-0 text-muted transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${funnelOpen ? 'rotate-180 text-brand' : ''}`}
                        aria-hidden
                      />
                    </button>
                    {funnelMenu.mounted ? (
                      <div
                        className={`absolute left-0 z-20 mt-1 w-full origin-top overflow-hidden rounded-xl border border-ink/10 bg-white py-1 shadow-xl dark:bg-zinc-900 ${
                          funnelMenu.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
                        }`}
                      >
                        {FUNNEL_SALES_PROCESS_OPTIONS.map((process) => (
                          <button
                            key={process}
                            type="button"
                            className={`flex w-full items-center px-3 py-2 text-left text-sm transition-colors ${
                              funnelProcess === process
                                ? 'bg-brand/15 text-brand'
                                : 'text-ink hover:bg-ink/5'
                            }`}
                            onClick={(event) => {
                              event.stopPropagation()
                              setFunnelProcess(process)
                              setFunnelOpen(false)
                            }}
                          >
                            {t(`admin.opportunities.salesProcess.${process}`, {
                              defaultValue: process,
                            })}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="grid gap-4 p-4 lg:grid-cols-[1fr_220px]">
                  <div className="space-y-2">
                    {funnelRows.length === 0 ? (
                      <p className="py-6 text-center text-xs font-medium text-muted">
                        {t('admin.dashboard.funnel.pieNoData')}
                      </p>
                    ) : (
                      funnelRows.map((row, index) => {
                        const widthPct = Math.max(
                          0,
                          Math.min(100, (row.amount / funnelTotalAmount) * 100),
                        )
                        return (
                          <div key={row.stage} className="flex items-center gap-3">
                            <span className="w-28 shrink-0 truncate text-xs font-medium text-muted sm:w-36">
                              {t(`admin.opportunities.stage.${row.stage}`, {
                                defaultValue: row.stage,
                              })}
                            </span>
                            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-ink/10">
                              <div
                                className="h-full rounded-full transition-[width]"
                                style={{
                                  width: `${widthPct}%`,
                                  backgroundColor: FUNNEL_COLORS[index % FUNNEL_COLORS.length],
                                }}
                              />
                            </div>
                            <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-ink">
                              {row.count}
                            </span>
                            <span className="w-14 shrink-0 text-right text-xs font-medium tabular-nums text-muted">
                              {formatCompactAmount(row.amount)}
                            </span>
                          </div>
                        )
                      })
                    )}
                  </div>
                  <div className="flex flex-col items-center justify-center gap-2">
                    <p className="text-xs font-semibold text-muted">
                      {t('admin.dashboard.funnel.pieByAmount')}
                    </p>
                    {pieSlices.length === 0 ? (
                      <p className="text-xs text-muted">{t('admin.dashboard.funnel.pieNoData')}</p>
                    ) : (
                      <svg viewBox="0 0 120 120" className="size-36" aria-hidden>
                        {pieSlices.map((slice) => (
                          <path
                            key={slice.stage}
                            d={buildArcPath(
                              60,
                              60,
                              52,
                              slice.startAngle,
                              slice.endAngle,
                            )}
                            fill={slice.color}
                          />
                        ))}
                      </svg>
                    )}
                  </div>
                </div>
              </section>
          </div>
        ) : null}
      </div>
    </div>
  )
}
