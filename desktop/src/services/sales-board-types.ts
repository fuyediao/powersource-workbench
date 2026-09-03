/**
 * Sales Board types. Aggregated server-side by the `get_sales_board_bundle`
 * Postgres RPC (SECURITY INVOKER, same RLS as the Orders Function) from
 * `orders` / `shop_orders` and their line-item tables.
 */

export type SalesBoardSource = 'erp' | 'nexdot'

/** Hero KPI strip. */
export interface SalesBoardKpis {
  totalAmount: number
  orderCount: number
  avgAmount: number
  postedRate: number
  postedCount: number
  pendingCount: number
  pendingAmount: number
}

/** Ranked customer or product row. */
export interface SalesBoardRankedItem {
  id: string
  code?: string
  name: string
  orderCount: number
  amount: number
}

/** Structured executive signal (the pane renders the i18n sentence). */
export interface SalesBoardInsight {
  kind: string
  ratio: number
  leader: SalesBoardRankedItem
  challenger: SalesBoardRankedItem
}

/** One point in the order-trend chart (day, week, or month bucket). */
export interface SalesBoardMonthlyPoint {
  label: string
  year: number
  month: number
  /** Present for day/week buckets; omitted for month buckets. */
  day?: number
  orderCount: number
  amount: number
}

/** Trend series bucket size chosen by the RPC for the active period. */
export type SalesBoardTrendGranularity = 'day' | 'week' | 'month'

/** Scanned-set coverage. */
export interface SalesBoardQuality {
  amountCoverage: number
  duplicateIds: number
  usdShare: number
  addressCoverage: number
}

/** Query metadata including live dataAsOf. */
export interface SalesBoardMeta {
  source: SalesBoardSource
  currency: string
  dataAsOf?: string | null
  period: string
  trendGranularity?: SalesBoardTrendGranularity
  years: number[]
}

/** Aggregated Sales Board payload. */
export interface SalesBoardSummary {
  kpis: SalesBoardKpis
  insight?: SalesBoardInsight | null
  monthly: SalesBoardMonthlyPoint[]
  topCustomers: SalesBoardRankedItem[]
  topProducts: SalesBoardRankedItem[]
  quality: SalesBoardQuality
  meta: SalesBoardMeta
}

/** One group switcher option. */
export interface SalesBoardGroupOption {
  id: string
  name: string
}

/** Group switcher payload. */
export interface SalesBoardGroupsResponse {
  canSwitch: boolean
  groups: SalesBoardGroupOption[]
  sources: SalesBoardSource[]
}

/** Client query for {@link import('./sales-board-api').fetchSalesBoardSummary}. */
export interface SalesBoardSummaryQuery {
  source: SalesBoardSource
  groupId?: string
  period?: string
  /** Inclusive range bounds (`YYYY-MM-DD`), only read when `period === 'custom'`. */
  from?: string
  to?: string
}
