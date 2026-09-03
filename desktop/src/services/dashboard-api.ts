/**
 * Dashboard bundle via Supabase `get_dashboard_bundle` (same RPC as geocrm-web mobile).
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { DashboardPeriod } from '@/utils/dashboard-period'

/** Sales-briefing KPI numbers. */
export interface DashboardBundleKpis {
  newAccounts: number
  newOpportunities: number
  newFollowUps: number
  totalOpportunityAmount: number
  followedLeads: number
  followedCustomers: number
  customerManagementTotal: number
  followedOpportunities: number
  wonOpportunities: number
  newKol: number
  newVisitLog: number
  newOrders: number
  overduePlans: number
  completedPlans: number
  newTe: number
  mapFavorites: number
}

/** One funnel row for a sales process. */
export interface DashboardFunnelRow {
  stage: string
  count: number
  amount: number
}

/** Upcoming follow-up for the schedule strip. */
export interface DashboardScheduleItem {
  id: string
  type: string
  subtitle: string
  scheduledAt: string
  customerId: string | null
  leadId: string | null
  opportunityId: string | null
}

/** Parsed `get_dashboard_bundle` payload. */
export interface DashboardBundle {
  kpis: DashboardBundleKpis
  funnelByProcess: Record<string, DashboardFunnelRow[]>
  schedule: DashboardScheduleItem[]
  businessFocus: {
    recentLeads: number
    recentAccounts: number
    activeOpportunities: number
  }
}

/**
 * Empty bundle used when Supabase is off or the RPC returns an error payload.
 * @returns Zeroed dashboard bundle.
 */
function emptyDashboardBundle(): DashboardBundle {
  return {
    kpis: {
      newAccounts: 0,
      newOpportunities: 0,
      newFollowUps: 0,
      totalOpportunityAmount: 0,
      followedLeads: 0,
      followedCustomers: 0,
      customerManagementTotal: 0,
      followedOpportunities: 0,
      wonOpportunities: 0,
      newKol: 0,
      newVisitLog: 0,
      newOrders: 0,
      overduePlans: 0,
      completedPlans: 0,
      newTe: 0,
      mapFavorites: 0,
    },
    funnelByProcess: {},
    schedule: [],
    businessFocus: { recentLeads: 0, recentAccounts: 0, activeOpportunities: 0 },
  }
}

/**
 * Reads a finite number from a raw RPC record.
 * @param record - JSON object.
 * @param key - Property name.
 * @returns Number or 0.
 */
function num(record: Record<string, unknown>, key: string): number {
  const v = record[key]
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Reads a non-empty string from a raw RPC record.
 * @param record - JSON object.
 * @param key - Property name.
 * @returns String or null.
 */
function nstr(record: Record<string, unknown>, key: string): string | null {
  const v = record[key]
  return typeof v === 'string' && v.length > 0 ? v : null
}

/**
 * Loads the dashboard bundle for the signed-in user (RLS inside the RPC).
 * @param period - Trailing window.
 * @returns Parsed bundle (empty on misconfig / soft error).
 */
export async function fetchDashboardBundle(
  period: DashboardPeriod,
): Promise<DashboardBundle> {
  if (!isSupabaseConfigured || !supabase) {
    return emptyDashboardBundle()
  }

  const { data, error } = await supabase.rpc(
    'get_dashboard_bundle' as never,
    { p_period: period } as never,
  )
  if (error) {
    throw error
  }

  const payload = (data ?? {}) as Record<string, unknown>
  if (payload.error) {
    return emptyDashboardBundle()
  }

  const kpis = (payload.kpis ?? {}) as Record<string, unknown>
  const focus = (payload.business_focus ?? {}) as Record<string, unknown>
  const funnelRaw = (payload.funnel ?? {}) as Record<string, unknown>
  const scheduleRaw = Array.isArray(payload.schedule)
    ? (payload.schedule as Record<string, unknown>[])
    : []

  const funnelByProcess: Record<string, DashboardFunnelRow[]> = {}
  for (const [slug, rows] of Object.entries(funnelRaw)) {
    funnelByProcess[slug] = Array.isArray(rows)
      ? (rows as Record<string, unknown>[]).map((r) => ({
          stage: String(r.stage ?? ''),
          count: num(r, 'count'),
          amount: num(r, 'amount'),
        }))
      : []
  }

  return {
    kpis: {
      newAccounts: num(kpis, 'new_accounts'),
      newOpportunities: num(kpis, 'new_opportunities'),
      newFollowUps: num(kpis, 'new_follow_ups'),
      totalOpportunityAmount: num(kpis, 'total_opportunity_amount'),
      followedLeads: num(kpis, 'followed_leads'),
      followedCustomers: num(kpis, 'followed_customers'),
      customerManagementTotal: num(kpis, 'customer_management_total'),
      followedOpportunities: num(kpis, 'followed_opportunities'),
      wonOpportunities: num(kpis, 'won_opportunities'),
      newKol: num(kpis, 'new_kol'),
      newVisitLog: num(kpis, 'new_visit_log'),
      newOrders: num(kpis, 'new_orders'),
      overduePlans: num(kpis, 'overdue_plans'),
      completedPlans: num(kpis, 'completed_plans'),
      newTe: num(kpis, 'new_te'),
      mapFavorites: num(kpis, 'map_favorites'),
    },
    funnelByProcess,
    schedule: scheduleRaw.map((r) => ({
      id: String(r.id ?? ''),
      type: String(r.type ?? ''),
      subtitle: nstr(r, 'subtitle') ?? '—',
      scheduledAt: String(r.scheduled_at ?? ''),
      customerId: nstr(r, 'customer_id'),
      leadId: nstr(r, 'lead_id'),
      opportunityId: nstr(r, 'opportunity_id'),
    })),
    businessFocus: {
      recentLeads: num(focus, 'recent_leads'),
      recentAccounts: num(focus, 'recent_accounts'),
      activeOpportunities: num(focus, 'active_opportunities'),
    },
  }
}
