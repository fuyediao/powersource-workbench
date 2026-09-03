/**
 * Repository for the BSC (Balanced Scorecard) module.
 * Tables: bsc_documents, bsc_goals, bsc_kpis.
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type {
  BscDocument,
  BscGoal,
  BscKpi,
  BscDimension,
  BscGoalInput,
  BscKpiInput,
} from '@/types/bsc'

/**
 * Maps a raw KPI DB row to a typed BscKpi.
 * @param row - Raw bsc_kpis row.
 * @returns Typed KPI.
 */
function mapKpiRow(row: Record<string, unknown>): BscKpi {
  return {
    id: row.id as string,
    goalId: row.goal_id as string,
    name: (row.name as string | null) ?? '',
    formula: (row.formula as string | null) ?? null,
    targetValue: (row.target_value as string | null) ?? null,
    currentValue: (row.current_value as string | null) ?? null,
    dataSource: (row.data_source as string | null) ?? null,
    weightPercent: (row.weight_percent as number | null) ?? null,
    sortOrder: (row.sort_order as number) ?? 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/**
 * Maps a raw goal DB row to a typed BscGoal (empty kpis).
 * @param row - Raw bsc_goals row.
 * @returns Typed goal.
 */
function mapGoalRow(row: Record<string, unknown>): BscGoal {
  return {
    id: row.id as string,
    documentId: row.document_id as string,
    dimension: row.dimension as BscDimension,
    name: (row.name as string | null) ?? '',
    description: (row.description as string | null) ?? null,
    weightPercent: (row.weight_percent as number | null) ?? null,
    responsibility: (row.responsibility as string | null) ?? null,
    sortOrder: (row.sort_order as number) ?? 0,
    kpis: [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/**
 * Fetches the full BSC document for a group and calendar month.
 * @param groupId - Workspace group UUID.
 * @param fiscalYear - Calendar year.
 * @param periodMonth - Month 1–12.
 * @returns Full document with goals/kpis, or null if missing.
 */
export async function fetchBscDocument(
  groupId: string,
  fiscalYear: number,
  periodMonth: number,
): Promise<BscDocument | null> {
  if (!isSupabaseConfigured || !supabase) return null

  const { data: docRow, error: docErr } = await supabase
    .from('bsc_documents')
    .select('*')
    .eq('group_id', groupId)
    .eq('fiscal_year', fiscalYear)
    .eq('period_month', periodMonth)
    .maybeSingle()

  if (docErr) throw new Error(docErr.message)
  if (!docRow) return null

  const doc: BscDocument = {
    id: docRow.id as string,
    groupId: docRow.group_id as string,
    fiscalYear: docRow.fiscal_year as number,
    periodMonth: docRow.period_month as number,
    strategicVision: (docRow.strategic_vision as string | null) ?? null,
    strategicDescription: (docRow.strategic_description as string | null) ?? null,
    createdBy: (docRow.created_by as string | null) ?? null,
    createdAt: docRow.created_at as string,
    updatedAt: docRow.updated_at as string,
    goals: [],
  }

  const { data: goalRows, error: goalErr } = await supabase
    .from('bsc_goals')
    .select('*')
    .eq('document_id', doc.id)
    .order('sort_order', { ascending: true })

  if (goalErr) throw new Error(goalErr.message)
  if (!goalRows || goalRows.length === 0) return doc

  const goalIds = goalRows.map((g) => g.id as string)

  const { data: kpiRows, error: kpiErr } = await supabase
    .from('bsc_kpis')
    .select('*')
    .in('goal_id', goalIds)
    .order('sort_order', { ascending: true })

  if (kpiErr) throw new Error(kpiErr.message)

  const kpisByGoal = new Map<string, BscKpi[]>()
  for (const kRow of (kpiRows ?? []) as Record<string, unknown>[]) {
    const kpi = mapKpiRow(kRow)
    const arr = kpisByGoal.get(kpi.goalId) ?? []
    arr.push(kpi)
    kpisByGoal.set(kpi.goalId, arr)
  }

  doc.goals = (goalRows as Record<string, unknown>[]).map((gRow) => {
    const goal = mapGoalRow(gRow)
    goal.kpis = kpisByGoal.get(goal.id) ?? []
    return goal
  })

  return doc
}

/**
 * Creates a new BSC document for a group and calendar month.
 * @param groupId - Workspace group UUID.
 * @param fiscalYear - Calendar year.
 * @param periodMonth - Month 1–12.
 * @returns Newly created document (no goals).
 */
export async function createBscDocument(
  groupId: string,
  fiscalYear: number,
  periodMonth: number,
): Promise<BscDocument> {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured')

  const { data, error } = await supabase
    .from('bsc_documents')
    .insert({ group_id: groupId, fiscal_year: fiscalYear, period_month: periodMonth })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return {
    id: data.id as string,
    groupId: data.group_id as string,
    fiscalYear: data.fiscal_year as number,
    periodMonth: data.period_month as number,
    strategicVision: (data.strategic_vision as string | null) ?? null,
    strategicDescription: (data.strategic_description as string | null) ?? null,
    createdBy: (data.created_by as string | null) ?? null,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
    goals: [],
  }
}

/**
 * Updates the strategic vision statement and description.
 * @param docId - BSC document UUID.
 * @param strategicVision - Vision text (empty clears).
 * @param strategicDescription - Description (empty clears).
 * @returns Updated vision fields.
 */
export async function updateBscVision(
  docId: string,
  strategicVision: string,
  strategicDescription: string,
): Promise<Pick<BscDocument, 'strategicVision' | 'strategicDescription'>> {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase
    .from('bsc_documents')
    .update({
      strategic_vision: strategicVision || null,
      strategic_description: strategicDescription || null,
    })
    .eq('id', docId)
    .select('strategic_vision, strategic_description')
    .single()
  if (error) throw new Error(error.message)
  return {
    strategicVision: (data.strategic_vision as string | null) ?? null,
    strategicDescription: (data.strategic_description as string | null) ?? null,
  }
}

/**
 * Inserts or updates a strategic goal.
 * @param input - Goal data.
 * @returns Saved goal (empty kpis — caller merges).
 */
export async function upsertBscGoal(input: BscGoalInput): Promise<BscGoal> {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured')

  let row: Record<string, unknown>

  if (input.id) {
    const { data, error } = await supabase
      .from('bsc_goals')
      .update({
        dimension: input.dimension,
        name: input.name,
        description: input.description ?? null,
        weight_percent: input.weightPercent ?? null,
        responsibility: input.responsibility ?? null,
        sort_order: input.sortOrder ?? 0,
      })
      .eq('id', input.id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    row = data as Record<string, unknown>
  } else {
    const { data, error } = await supabase
      .from('bsc_goals')
      .insert({
        document_id: input.documentId,
        dimension: input.dimension,
        name: input.name,
        description: input.description ?? null,
        weight_percent: input.weightPercent ?? null,
        responsibility: input.responsibility ?? null,
        sort_order: input.sortOrder ?? 0,
      })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    row = data as Record<string, unknown>
  }

  return mapGoalRow(row)
}

/**
 * Deletes a strategic goal (KPIs cascade).
 * @param goalId - Goal UUID.
 */
export async function deleteBscGoal(goalId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.from('bsc_goals').delete().eq('id', goalId)
  if (error) throw new Error(error.message)
}

/**
 * Inserts or updates a KPI indicator.
 * @param input - KPI data.
 * @returns Saved KPI.
 */
export async function upsertBscKpi(input: BscKpiInput): Promise<BscKpi> {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured')

  let row: Record<string, unknown>

  if (input.id) {
    const { data, error } = await supabase
      .from('bsc_kpis')
      .update({
        name: input.name,
        formula: input.formula ?? null,
        target_value: input.targetValue ?? null,
        current_value: input.currentValue ?? null,
        data_source: input.dataSource ?? null,
        weight_percent: input.weightPercent ?? null,
        sort_order: input.sortOrder ?? 0,
      })
      .eq('id', input.id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    row = data as Record<string, unknown>
  } else {
    const { data, error } = await supabase
      .from('bsc_kpis')
      .insert({
        goal_id: input.goalId,
        name: input.name,
        formula: input.formula ?? null,
        target_value: input.targetValue ?? null,
        current_value: input.currentValue ?? null,
        data_source: input.dataSource ?? null,
        weight_percent: input.weightPercent ?? null,
        sort_order: input.sortOrder ?? 0,
      })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    row = data as Record<string, unknown>
  }

  return mapKpiRow(row)
}

/**
 * Deletes a KPI indicator.
 * @param kpiId - KPI UUID.
 */
export async function deleteBscKpi(kpiId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.from('bsc_kpis').delete().eq('id', kpiId)
  if (error) throw new Error(error.message)
}
