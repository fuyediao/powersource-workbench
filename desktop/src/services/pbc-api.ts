/**
 * Pure-async repository for the PBC (Personal Business Commitment) module.
 * Tables: pbc_documents, pbc_rows.
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { Json } from '@/types/database'
import type {
  PbcDocument,
  PbcDocumentInput,
  PbcRow,
  PbcRowAdminUpdate,
  PbcRowProgressUpdate,
  PbcMilestone,
} from '@/types/pbc'

/** Minimal group row for system-admin team picker. */
export interface GroupListItem {
  id: string
  name: string
}

/** Profile snippet on a team member row. */
export interface TeamMemberProfile {
  email?: string | null
  full_name?: string | null
  display_name?: string | null
}

/** Active group member used by PBC member picker. */
export interface TeamGroupMember {
  id: string
  groupId: string
  userId: string
  isActive: boolean
  isGroupAdmin: boolean
  user: TeamMemberProfile | null
}

/**
 * First and last calendar days of a month as ISO date strings (YYYY-MM-DD).
 * @param calendarYear - Four-digit year.
 * @param month1to12 - Calendar month 1–12.
 * @returns Valid-from / valid-to bounds.
 */
export function pbcCalendarMonthBounds(
  calendarYear: number,
  month1to12: number,
): { validFrom: string; validTo: string } {
  const pad = (n: number) => String(n).padStart(2, '0')
  const lastDay = new Date(calendarYear, month1to12, 0).getDate()
  return {
    validFrom: `${calendarYear}-${pad(month1to12)}-01`,
    validTo: `${calendarYear}-${pad(month1to12)}-${pad(lastDay)}`,
  }
}

/**
 * Maps a raw Supabase row to a typed PbcDocument.
 * @param row - Raw pbc_documents row.
 * @returns Typed document.
 */
function mapDocumentRow(row: Record<string, unknown>): PbcDocument {
  const pm = row.period_month
  return {
    id: row.id as string,
    groupId: row.group_id as string,
    scope: row.scope as 'group' | 'individual',
    subjectUserId: (row.subject_user_id as string | null) ?? null,
    fiscalYear: row.fiscal_year as number,
    periodMonth: typeof pm === 'number' ? pm : 1,
    validFrom: (row.valid_from as string | null) ?? null,
    validTo: (row.valid_to as string | null) ?? null,
    committerDisplayName: (row.committer_display_name as string | null) ?? null,
    departmentLabel: (row.department_label as string | null) ?? null,
    positionLabel: (row.position_label as string | null) ?? null,
    overallDirection: (row.overall_direction as string | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/**
 * Maps a raw Supabase row to a typed PbcRow.
 * @param row - Raw pbc_rows row.
 * @returns Typed row.
 */
function mapPbcRow(row: Record<string, unknown>): PbcRow {
  const rawMilestones = row.milestones as PbcMilestone[] | null | undefined
  return {
    id: row.id as string,
    documentId: row.document_id as string,
    part: row.part as 'result' | 'process' | 'org_growth',
    sortOrder: row.sort_order as number,
    rowKind: (row.row_kind as 'normal' | 'bonus' | 'observation') ?? 'normal',
    code: (row.code as string | null) ?? null,
    title: (row.title as string | null) ?? null,
    annualTarget: (row.annual_target as string | null) ?? null,
    milestones: Array.isArray(rawMilestones) ? rawMilestones : null,
    definition: (row.definition as string | null) ?? null,
    weightPercent: (row.weight_percent as number | null) ?? null,
    evaluationPeriod: (row.evaluation_period as string | null) ?? null,
    currentProgress: (row.current_progress as string | null) ?? null,
    selfEvaluation: (row.self_evaluation as string | null) ?? null,
    managerEvaluation: (row.manager_evaluation as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/**
 * Lists all groups for the system-admin team picker.
 * @returns Group id + name rows.
 */
export async function listGroupsForTeamPicker(): Promise<GroupListItem[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { data, error } = await supabase
    .from('groups')
    .select('id, name')
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row: { id: string; name: string }) => ({
    id: row.id,
    name: row.name,
  }))
}

/**
 * Maps a raw group_members row plus optional profile.
 * @param row - DB row.
 * @param profile - Profile snippet.
 * @returns TeamGroupMember.
 */
function mapGroupMemberRow(
  row: Record<string, unknown>,
  profile?: TeamMemberProfile | null,
): TeamGroupMember {
  return {
    id: row.id as string,
    groupId: row.group_id as string,
    userId: row.user_id as string,
    isActive: (row.is_active as boolean) || false,
    isGroupAdmin: (row.is_group_admin as boolean) || false,
    user: profile ?? null,
  }
}

/**
 * Synthetic group_members row when admin is only on groups.group_admin_id.
 * @param groupId - Group UUID.
 * @param adminUserId - groups.group_admin_id.
 * @returns Row object for mapGroupMemberRow.
 */
function virtualGroupAdminMemberRow(
  groupId: string,
  adminUserId: string,
): Record<string, unknown> {
  return {
    id: `virtual-group-admin-${adminUserId}`,
    group_id: groupId,
    user_id: adminUserId,
    is_active: true,
    is_group_admin: true,
    added_at: new Date(0).toISOString(),
  }
}

/**
 * Loads active members of a group with profile snippets (PBC member tabs).
 * @param groupId - Group UUID.
 * @returns Active members (virtual admin prepended when needed).
 */
export async function fetchGroupMembersForGroup(
  groupId: string,
): Promise<TeamGroupMember[]> {
  if (!isSupabaseConfigured || !supabase) return []

  const { data: groupRow } = await supabase
    .from('groups')
    .select('group_admin_id')
    .eq('id', groupId)
    .maybeSingle()
  const groupAdminId = (groupRow?.group_admin_id as string | null | undefined) ?? null

  const { data: membersData, error: fetchError } = await supabase
    .from('group_members')
    .select('*')
    .eq('group_id', groupId)
    .eq('is_active', true)
    .order('added_at', { ascending: false })
  if (fetchError) throw fetchError

  const memberRows = membersData ?? []
  const memberUserIds = new Set(memberRows.map((m: { user_id: string }) => m.user_id))
  const needsVirtualAdmin = Boolean(groupAdminId && !memberUserIds.has(groupAdminId))

  const profileIdSet = new Set<string>(
    memberRows.map((m: { user_id: string }) => m.user_id),
  )
  if (needsVirtualAdmin && groupAdminId) profileIdSet.add(groupAdminId)
  const profileIds = [...profileIdSet]

  if (profileIds.length === 0) return []

  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, email, full_name, display_name')
    .in('id', profileIds)

  const profileMap = new Map<string, TeamMemberProfile>()
  if (profilesData) {
    for (const p of profilesData as Array<{
      id: string
      email?: string
      full_name?: string
      display_name?: string
    }>) {
      profileMap.set(p.id, {
        email: p.email,
        full_name: p.full_name,
        display_name: p.display_name,
      })
    }
  }

  const fromDb = memberRows.map((row: Record<string, unknown>) => {
    const uid = row.user_id as string
    return mapGroupMemberRow(row, profileMap.get(uid) ?? null)
  })

  if (!needsVirtualAdmin || !groupAdminId) return fromDb

  const virtualRow = virtualGroupAdminMemberRow(groupId, groupAdminId)
  const virtualMember = mapGroupMemberRow(virtualRow, profileMap.get(groupAdminId) ?? null)
  return [virtualMember, ...fromDb]
}

/**
 * Lists all pbc_documents for a group, year, and month.
 * @param groupId - Group UUID.
 * @param fiscalYear - Fiscal year.
 * @param periodMonth - Calendar month 1–12.
 * @returns Documents visible via RLS.
 */
export async function listPbcDocuments(
  groupId: string,
  fiscalYear: number,
  periodMonth: number,
): Promise<PbcDocument[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { data, error } = await supabase
    .from('pbc_documents')
    .select('*')
    .eq('group_id', groupId)
    .eq('fiscal_year', fiscalYear)
    .eq('period_month', periodMonth)
    .order('scope', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapDocumentRow)
}

/**
 * Fetches or creates the group-scope document; seeds default rows via RPC.
 * @param input - Document input without scope/subject.
 * @returns Existing or newly created document.
 */
export async function getOrCreateGroupDocument(
  input: Omit<PbcDocumentInput, 'scope' | 'subjectUserId'>,
): Promise<PbcDocument> {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured')

  const { data: existing, error: fetchErr } = await supabase
    .from('pbc_documents')
    .select('*')
    .eq('group_id', input.groupId)
    .eq('scope', 'group')
    .is('subject_user_id', null)
    .eq('fiscal_year', input.fiscalYear)
    .eq('period_month', input.periodMonth)
    .maybeSingle()
  if (fetchErr) throw fetchErr
  if (existing) return mapDocumentRow(existing)

  const payload = {
    group_id: input.groupId,
    scope: 'group',
    subject_user_id: null,
    fiscal_year: input.fiscalYear,
    period_month: input.periodMonth,
    valid_from: input.validFrom ?? null,
    valid_to: input.validTo ?? null,
    committer_display_name: input.committerDisplayName ?? null,
    department_label: input.departmentLabel ?? null,
    position_label: input.positionLabel ?? null,
    overall_direction: input.overallDirection ?? null,
  }
  const { data: created, error: insertErr } = await supabase
    .from('pbc_documents')
    .insert(payload)
    .select()
    .single()
  if (insertErr) throw insertErr

  await supabase.rpc('pbc_init_default_rows', { p_document_id: created.id })

  return mapDocumentRow(created)
}

/**
 * Fetches or creates an individual-scope document for a member.
 * @param input - Document input with subjectUserId.
 * @returns Existing or newly created document.
 */
export async function getOrCreateIndividualDocument(
  input: Omit<PbcDocumentInput, 'scope'> & { subjectUserId: string },
): Promise<PbcDocument> {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured')

  const { data: existing, error: fetchErr } = await supabase
    .from('pbc_documents')
    .select('*')
    .eq('group_id', input.groupId)
    .eq('scope', 'individual')
    .eq('subject_user_id', input.subjectUserId)
    .eq('fiscal_year', input.fiscalYear)
    .eq('period_month', input.periodMonth)
    .maybeSingle()
  if (fetchErr) throw fetchErr
  if (existing) return mapDocumentRow(existing)

  const payload = {
    group_id: input.groupId,
    scope: 'individual',
    subject_user_id: input.subjectUserId,
    fiscal_year: input.fiscalYear,
    period_month: input.periodMonth,
    valid_from: input.validFrom ?? null,
    valid_to: input.validTo ?? null,
    committer_display_name: input.committerDisplayName ?? null,
    department_label: input.departmentLabel ?? null,
    position_label: input.positionLabel ?? null,
    overall_direction: input.overallDirection ?? null,
  }
  const { data: created, error: insertErr } = await supabase
    .from('pbc_documents')
    .insert(payload)
    .select()
    .single()
  if (insertErr) throw insertErr

  await supabase.rpc('pbc_init_default_rows', { p_document_id: created.id })

  return mapDocumentRow(created)
}

/**
 * Updates top-level fields of a pbc_document.
 * @param documentId - Document UUID.
 * @param updates - Partial header fields.
 * @returns Updated document.
 */
export async function updatePbcDocument(
  documentId: string,
  updates: Partial<{
    committerDisplayName: string | null
    departmentLabel: string | null
    positionLabel: string | null
    overallDirection: string | null
    validFrom: string | null
    validTo: string | null
  }>,
): Promise<PbcDocument> {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured')

  const payload: {
    committer_display_name?: string | null
    department_label?: string | null
    position_label?: string | null
    overall_direction?: string | null
    valid_from?: string | null
    valid_to?: string | null
  } = {}
  if ('committerDisplayName' in updates) {
    payload.committer_display_name = updates.committerDisplayName
  }
  if ('departmentLabel' in updates) payload.department_label = updates.departmentLabel
  if ('positionLabel' in updates) payload.position_label = updates.positionLabel
  if ('overallDirection' in updates) payload.overall_direction = updates.overallDirection
  if ('validFrom' in updates) payload.valid_from = updates.validFrom
  if ('validTo' in updates) payload.valid_to = updates.validTo

  const { data, error } = await supabase
    .from('pbc_documents')
    .update(payload)
    .eq('id', documentId)
    .select()
    .single()
  if (error) throw error
  return mapDocumentRow(data as Record<string, unknown>)
}

/**
 * Fetches all pbc_rows for a document, sorted by sort_order.
 * @param documentId - Parent document UUID.
 * @returns Rows.
 */
export async function fetchPbcRows(documentId: string): Promise<PbcRow[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { data, error } = await supabase
    .from('pbc_rows')
    .select('*')
    .eq('document_id', documentId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapPbcRow)
}

/**
 * Updates progress / admin fields on a single pbc_row.
 * @param rowId - Row UUID.
 * @param updates - Fields to update.
 * @returns Updated row.
 */
export async function updatePbcRowFields(
  rowId: string,
  updates: PbcRowProgressUpdate | PbcRowAdminUpdate,
): Promise<PbcRow> {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured')

  const payload: {
    current_progress?: string | null
    definition?: string | null
    self_evaluation?: string | null
    manager_evaluation?: string | null
    code?: string | null
    annual_target?: string | null
    weight_percent?: number | null
    evaluation_period?: string | null
    title?: string | null
    milestones?: Json | null
  } = {}
  if ('currentProgress' in updates) payload.current_progress = updates.currentProgress
  if ('definition' in updates) payload.definition = updates.definition
  if ('selfEvaluation' in updates) payload.self_evaluation = updates.selfEvaluation
  if ('managerEvaluation' in updates) {
    payload.manager_evaluation = (updates as PbcRowAdminUpdate).managerEvaluation
  }
  if ('code' in updates) payload.code = (updates as PbcRowAdminUpdate).code
  if ('annualTarget' in updates) {
    payload.annual_target = (updates as PbcRowAdminUpdate).annualTarget
  }
  if ('weightPercent' in updates) {
    payload.weight_percent = (updates as PbcRowAdminUpdate).weightPercent
  }
  if ('evaluationPeriod' in updates) {
    payload.evaluation_period = (updates as PbcRowAdminUpdate).evaluationPeriod
  }
  if ('title' in updates) payload.title = (updates as PbcRowAdminUpdate).title
  if ('milestones' in updates) {
    payload.milestones = ((updates as PbcRowAdminUpdate).milestones ??
      null) as Json | null
  }

  const { data, error } = await supabase
    .from('pbc_rows')
    .update(payload)
    .eq('id', rowId)
    .select()
    .single()
  if (error) throw error
  return mapPbcRow(data as Record<string, unknown>)
}
