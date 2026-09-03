/**
 * Sales Board data via the `get_sales_board_bundle` Supabase RPC (one round
 * trip; SECURITY INVOKER so it runs under the caller's session — same RLS as
 * the Orders Function). Mirrors `fetchDashboardBundle` / `get_dashboard_bundle`
 * for the workbench: aggregation happens in Postgres, not in the renderer.
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { listGroups } from '@/services/groups-api'
import type {
  SalesBoardGroupOption,
  SalesBoardGroupsResponse,
  SalesBoardInsight,
  SalesBoardKpis,
  SalesBoardMonthlyPoint,
  SalesBoardQuality,
  SalesBoardRankedItem,
  SalesBoardSource,
  SalesBoardSummary,
  SalesBoardSummaryQuery,
} from '@/services/sales-board-types'

export type {
  SalesBoardGroupOption,
  SalesBoardGroupsResponse,
  SalesBoardInsight,
  SalesBoardKpis,
  SalesBoardMeta,
  SalesBoardMonthlyPoint,
  SalesBoardQuality,
  SalesBoardRankedItem,
  SalesBoardSource,
  SalesBoardSummary,
  SalesBoardSummaryQuery,
} from '@/services/sales-board-types'

/**
 * @returns Whether Supabase is configured for the board.
 */
export function isSalesBoardConfigured(): boolean {
  return isSupabaseConfigured && Boolean(supabase)
}

/**
 * Loads switcher groups. System admins see every group (Orders ERP parity).
 * @param isSystemAdmin - Whether the caller may pick any group.
 * @returns Groups payload.
 */
export async function fetchSalesBoardGroups(
  isSystemAdmin: boolean,
): Promise<SalesBoardGroupsResponse> {
  const sources: SalesBoardSource[] = ['erp', 'nexdot']
  if (!isSystemAdmin) {
    return { canSwitch: false, groups: [], sources }
  }
  const rows = await listGroups()
  const groups: SalesBoardGroupOption[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
  }))
  return { canSwitch: true, groups, sources }
}

/**
 * @param value - Raw jsonb value.
 * @param fallback - Default when not a finite number.
 * @returns Coerced number.
 */
function toNum(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

/**
 * @param value - Raw jsonb value.
 * @returns Coerced string ('' when not a string).
 */
function toStr(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * @param raw - Raw jsonb ranked-item object.
 * @returns Typed ranked item.
 */
function parseRankedItem(raw: unknown): SalesBoardRankedItem {
  const row = (raw ?? {}) as Record<string, unknown>
  const code = toStr(row.code)
  return {
    id: toStr(row.id),
    code: code || undefined,
    name: toStr(row.name),
    orderCount: toNum(row.orderCount),
    amount: toNum(row.amount),
  }
}

/**
 * @param raw - Raw jsonb insight object, or null.
 * @returns Typed insight, or null when absent/malformed.
 */
function parseInsight(raw: unknown): SalesBoardInsight | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const row = raw as Record<string, unknown>
  return {
    kind: toStr(row.kind) || 'customer_aov_split',
    ratio: toNum(row.ratio),
    leader: parseRankedItem(row.leader),
    challenger: parseRankedItem(row.challenger),
  }
}

/**
 * @param raw - Raw jsonb monthly-point object.
 * @returns Typed monthly point.
 */
function parseMonthlyPoint(raw: unknown): SalesBoardMonthlyPoint {
  const row = (raw ?? {}) as Record<string, unknown>
  const day = row.day == null ? undefined : toNum(row.day)
  return {
    label: toStr(row.label),
    year: toNum(row.year),
    month: toNum(row.month),
    day: day && day > 0 ? day : undefined,
    orderCount: toNum(row.orderCount),
    amount: toNum(row.amount),
  }
}

/**
 * @param raw - Raw jsonb quality object.
 * @returns Typed quality summary.
 */
function parseQuality(raw: unknown): SalesBoardQuality {
  const row = (raw ?? {}) as Record<string, unknown>
  return {
    amountCoverage: toNum(row.amountCoverage),
    duplicateIds: toNum(row.duplicateIds),
    usdShare: toNum(row.usdShare),
    addressCoverage: toNum(row.addressCoverage),
  }
}

/**
 * @param source - Requested source, echoed back when the RPC returns none.
 * @returns Zeroed summary used when Supabase is off or the RPC soft-errors.
 */
function emptySummary(source: SalesBoardSource): SalesBoardSummary {
  const kpis: SalesBoardKpis = {
    totalAmount: 0,
    orderCount: 0,
    avgAmount: 0,
    postedRate: 0,
    postedCount: 0,
    pendingCount: 0,
    pendingAmount: 0,
  }
  return {
    kpis,
    insight: null,
    monthly: [],
    topCustomers: [],
    topProducts: [],
    quality: { amountCoverage: 0, duplicateIds: 0, usdShare: 0, addressCoverage: 0 },
    meta: { source, currency: 'USD', dataAsOf: null, period: 'all', years: [] },
  }
}

/**
 * Aggregates ERP or NEXDOT orders visible under RLS via one RPC call.
 * @param query - Source, optional group, period.
 * @param isSystemAdmin - Whether an explicit groupId filter is honored.
 * @returns Summary payload.
 */
export async function fetchSalesBoardSummary(
  query: SalesBoardSummaryQuery,
  isSystemAdmin: boolean,
): Promise<SalesBoardSummary> {
  if (!supabase) {
    throw new Error('Supabase is not configured')
  }
  const groupId = isSystemAdmin ? query.groupId?.trim() || null : null
  const period = query.period ?? 'all'
  const isCustomRange = period === 'custom'
  const { data, error } = await supabase.rpc('get_sales_board_bundle' as never, {
    p_source: query.source,
    p_group_id: groupId,
    p_period: period,
    p_from: isCustomRange ? query.from?.trim() || null : null,
    p_to: isCustomRange ? query.to?.trim() || null : null,
  } as never)
  if (error) {
    throw error
  }

  const payload = (data ?? {}) as Record<string, unknown>
  if (payload.error) {
    return emptySummary(query.source)
  }

  const kpisRaw = (payload.kpis ?? {}) as Record<string, unknown>
  const metaRaw = (payload.meta ?? {}) as Record<string, unknown>
  const years = Array.isArray(metaRaw.years) ? metaRaw.years.map((y) => toNum(y)) : []
  const trendGranularityRaw = toStr(metaRaw.trendGranularity)
  const trendGranularity =
    trendGranularityRaw === 'day' || trendGranularityRaw === 'week' || trendGranularityRaw === 'month'
      ? trendGranularityRaw
      : undefined

  return {
    kpis: {
      totalAmount: toNum(kpisRaw.totalAmount),
      orderCount: toNum(kpisRaw.orderCount),
      avgAmount: toNum(kpisRaw.avgAmount),
      postedRate: toNum(kpisRaw.postedRate),
      postedCount: toNum(kpisRaw.postedCount),
      pendingCount: toNum(kpisRaw.pendingCount),
      pendingAmount: toNum(kpisRaw.pendingAmount),
    },
    insight: parseInsight(payload.insight),
    monthly: Array.isArray(payload.monthly) ? payload.monthly.map(parseMonthlyPoint) : [],
    topCustomers: Array.isArray(payload.topCustomers)
      ? payload.topCustomers.map(parseRankedItem)
      : [],
    topProducts: Array.isArray(payload.topProducts)
      ? payload.topProducts.map(parseRankedItem)
      : [],
    quality: parseQuality(payload.quality),
    meta: {
      source: (toStr(metaRaw.source) || query.source) as SalesBoardSource,
      currency: toStr(metaRaw.currency) || 'USD',
      dataAsOf: typeof metaRaw.dataAsOf === 'string' ? metaRaw.dataAsOf : null,
      period: toStr(metaRaw.period) || 'all',
      trendGranularity,
      years,
    },
  }
}
