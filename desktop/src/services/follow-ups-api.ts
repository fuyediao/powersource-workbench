/**
 * Follow-ups (todo list) CRUD against Supabase `follow_ups`.
 * Ported from workbench-web `useFollowUps` + `followUpsCustomerScope`.
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { fromLoose } from '@/lib/supabase-loose'
import { deleteCalendarEvent } from '@/services/calendar-api'
import { listCompetitorShopPickerOptions } from '@/services/competitor-shops-api'
import { listCustomerPickerOptions } from '@/services/customers-api'
import { listKolPickerOptions } from '@/services/kols-api'
import type { CustomerFollowUp } from '@/types/customer'
import type {
  CompleteFollowUpPayload,
  FollowUp,
  FollowUpAssocCompetitor,
  FollowUpAssocCustomer,
  FollowUpAssocKol,
  FollowUpAssocLead,
  FollowUpAssocOpportunity,
  FollowUpEntityType,
  FollowUpFilters,
  FollowUpInput,
  FollowUpListResult,
  FollowUpStatus,
  FollowUpTodoItem,
  FollowUpType,
} from '@/types/follow-up'

/** Default page size for the admin follow-ups list. */
export const FOLLOW_UPS_PAGE_SIZE = 20

/** Page size when walking association picker rows (PostgREST max-rows safe). */
const ASSOC_PICKER_PAGE_SIZE = 1000

const FOLLOW_UP_SELECT =
  '*, leads(company_name), opportunities(name, customers(company_name)), customers(company_name), kols(name, kol_code), competitor_shops(store_name)'

/**
 * Normalizes JSON checklist data from PostgREST.
 * @param value - Raw `todo_items` JSON.
 * @returns Valid todo items only.
 */
export function normalizeFollowUpTodoItems(value: unknown): FollowUpTodoItem[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return []
    }
    const row = item as Record<string, unknown>
    if (typeof row.id !== 'string' || typeof row.text !== 'string') {
      return []
    }
    return [{ id: row.id, text: row.text, completed: row.completed === true }]
  })
}

/**
 * Maps a raw `follow_ups` row (with optional joins) to {@link FollowUp}.
 * @param row - Supabase row.
 * @returns Typed follow-up.
 */
export function mapRowToFollowUp(row: Record<string, unknown>): FollowUp {
  const leadsJoin = row.leads as Record<string, unknown> | null
  const oppsJoin = row.opportunities as Record<string, unknown> | null
  const customersJoin = row.customers as Record<string, unknown> | null
  const oppsCustomersJoin = oppsJoin?.customers as Record<string, unknown> | null
  const kolsJoin = row.kols as Record<string, unknown> | null
  const competitorJoin = row.competitor_shops as Record<string, unknown> | null
  return {
    id: String(row.id),
    type: row.type as FollowUpType,
    status: row.status as FollowUpStatus,
    content: (row.content as string | null) ?? null,
    customTypeLabel: (row.custom_type_label as string | null) ?? null,
    todoItems: normalizeFollowUpTodoItems(row.todo_items),
    scheduledAt: String(row.scheduled_at ?? ''),
    completedAt: (row.completed_at as string | null) ?? null,
    leadId: (row.lead_id as string | null) ?? null,
    opportunityId: (row.opportunity_id as string | null) ?? null,
    customerId: (row.customer_id as string | null) ?? null,
    kolId: (row.kol_id as string | null) ?? null,
    competitorShopId: (row.competitor_shop_id as string | null) ?? null,
    calendarEventId: (row.calendar_event_id as string | null) ?? null,
    checkInLat: row.check_in_lat != null ? Number(row.check_in_lat) : null,
    checkInLng: row.check_in_lng != null ? Number(row.check_in_lng) : null,
    ownerId: String(row.owner_id ?? ''),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
    leadName: leadsJoin ? String(leadsJoin.company_name ?? '') : undefined,
    opportunityName: oppsJoin ? String(oppsJoin.name ?? '') : undefined,
    opportunityCustomerName: oppsCustomersJoin
      ? String(oppsCustomersJoin.company_name ?? '')
      : undefined,
    customerName: customersJoin
      ? String(customersJoin.company_name ?? '')
      : undefined,
    kolName: kolsJoin ? String(kolsJoin.name ?? '') : undefined,
    kolCode: kolsJoin ? String(kolsJoin.kol_code ?? '') : undefined,
    competitorShopName: competitorJoin
      ? String(competitorJoin.store_name ?? '')
      : undefined,
  }
}

/**
 * Maps a full follow-up to the thinner customer-detail list shape.
 * @param fu - Full follow-up.
 * @returns Customer detail row.
 */
export function toCustomerFollowUp(fu: FollowUp): CustomerFollowUp {
  return {
    id: fu.id,
    type: fu.type,
    status: fu.status,
    content: fu.content,
    todoItems: fu.todoItems,
    scheduledAt: fu.scheduledAt,
    completedAt: fu.completedAt,
    leadId: fu.leadId,
    opportunityId: fu.opportunityId,
    customerId: fu.customerId,
    ownerId: fu.ownerId,
    createdAt: fu.createdAt,
    updatedAt: fu.updatedAt,
    leadName: fu.leadName,
    opportunityName: fu.opportunityName,
    customerName: fu.customerName,
  }
}

/**
 * Loads follow-ups linked to a CRM customer (direct + via lead / opportunity).
 * @param customerId - `customers.id`.
 * @param options - Optional owner filter (matches list behaviour).
 * @returns Deduped rows sorted by `scheduledAt` ascending.
 */
export async function fetchFollowUpsLinkedToCustomer(
  customerId: string,
  options?: { ownerId?: string },
): Promise<FollowUp[]> {
  const cid = customerId.trim()
  if (!cid) {
    return []
  }
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }

  const [leadsRes, oppsRes] = await Promise.all([
    fromLoose('leads').select('id').eq('customer_id', cid),
    fromLoose('opportunities').select('id').eq('customer_id', cid),
  ])

  const leadIds = (leadsRes.data ?? []).map((r) => String(r.id))
  const oppIds = (oppsRes.data ?? []).map((r) => String(r.id))
  const ownerId = options?.ownerId

  /**
   * Builds a base follow_ups select with optional owner scope.
   * @returns Query builder.
   */
  const buildBase = () => {
    let q = fromLoose('follow_ups').select(FOLLOW_UP_SELECT).limit(500)
    if (ownerId) {
      q = q.eq('owner_id', ownerId)
    }
    return q
  }

  const tasks = [buildBase().eq('customer_id', cid)]
  if (leadIds.length > 0) {
    tasks.push(buildBase().in('lead_id', leadIds))
  }
  if (oppIds.length > 0) {
    tasks.push(buildBase().in('opportunity_id', oppIds))
  }

  const results = await Promise.all(tasks)
  const seen = new Set<string>()
  const merged: FollowUp[] = []
  for (const res of results) {
    if (res.error) {
      console.error('[follow-ups-api] linked customer query:', res.error)
      continue
    }
    for (const row of res.data ?? []) {
      const fu = mapRowToFollowUp(row)
      if (!seen.has(fu.id)) {
        seen.add(fu.id)
        merged.push(fu)
      }
    }
  }
  merged.sort(
    (a, b) =>
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
  )
  return merged
}

/**
 * Lists owner-scoped follow-ups with optional filters, search, and pagination.
 * @param ownerId - Auth user id (`follow_ups.owner_id`).
 * @param options - Page, search, filters.
 * @returns Rows and total count.
 */
export async function listFollowUps(
  ownerId: string,
  options: {
    page?: number
    pageSize?: number
    searchQuery?: string
    filters?: FollowUpFilters
  } = {},
): Promise<FollowUpListResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const filters = options.filters ?? {}
  const pageSize = Math.max(1, options.pageSize ?? FOLLOW_UPS_PAGE_SIZE)
  const page = Math.max(1, options.page ?? 1)

  // Broad customer scope: direct + leads/opportunities pointing at this customer.
  if (filters.customerId && !filters.leadId && !filters.opportunityId) {
    let list = await fetchFollowUpsLinkedToCustomer(filters.customerId, {
      ownerId,
    })
    if (filters.status) {
      list = list.filter((f) => f.status === filters.status)
    }
    if (filters.scheduledAtFrom) {
      const from = new Date(filters.scheduledAtFrom).getTime()
      list = list.filter((f) => new Date(f.scheduledAt).getTime() >= from)
    }
    if (filters.scheduledAtTo) {
      const to = new Date(filters.scheduledAtTo).getTime()
      list = list.filter((f) => new Date(f.scheduledAt).getTime() <= to)
    }
    const q = options.searchQuery?.trim().toLowerCase()
    if (q) {
      list = list.filter((f) => (f.content ?? '').toLowerCase().includes(q))
    }
    return { rows: list, totalCount: list.length }
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = fromLoose('follow_ups')
    .select(FOLLOW_UP_SELECT, { count: 'exact' })
    .eq('owner_id', ownerId)

  if (filters.status) {
    query = query.eq('status', filters.status)
  }
  if (filters.leadId) {
    query = query.eq('lead_id', filters.leadId)
  }
  if (filters.opportunityId) {
    query = query.eq('opportunity_id', filters.opportunityId)
  }
  if (filters.customerId) {
    query = query.eq('customer_id', filters.customerId)
  }
  if (filters.kolId) {
    query = query.eq('kol_id', filters.kolId)
  }
  if (filters.competitorShopId) {
    query = query.eq('competitor_shop_id', filters.competitorShopId)
  }
  if (filters.scheduledAtFrom) {
    query = query.gte('scheduled_at', filters.scheduledAtFrom)
  }
  if (filters.scheduledAtTo) {
    query = query.lte('scheduled_at', filters.scheduledAtTo)
  }
  const q = options.searchQuery?.trim()
  if (q) {
    const pattern = `%${q}%`
    query = query.or(
      `content.ilike.${pattern},custom_type_label.ilike.${pattern}`,
    )
  }

  let { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    // Retry without association embeds when PostgREST cannot resolve new FKs.
    let plain = fromLoose('follow_ups')
      .select('*', { count: 'exact' })
      .eq('owner_id', ownerId)
    if (filters.status) {
      plain = plain.eq('status', filters.status)
    }
    if (filters.leadId) {
      plain = plain.eq('lead_id', filters.leadId)
    }
    if (filters.opportunityId) {
      plain = plain.eq('opportunity_id', filters.opportunityId)
    }
    if (filters.customerId) {
      plain = plain.eq('customer_id', filters.customerId)
    }
    if (filters.kolId) {
      plain = plain.eq('kol_id', filters.kolId)
    }
    if (filters.competitorShopId) {
      plain = plain.eq('competitor_shop_id', filters.competitorShopId)
    }
    if (filters.scheduledAtFrom) {
      plain = plain.gte('scheduled_at', filters.scheduledAtFrom)
    }
    if (filters.scheduledAtTo) {
      plain = plain.lte('scheduled_at', filters.scheduledAtTo)
    }
    if (q) {
      const pattern = `%${q}%`
      plain = plain.or(
        `content.ilike.${pattern},custom_type_label.ilike.${pattern}`,
      )
    }
    const retry = await plain
      .order('created_at', { ascending: false })
      .range(from, to)
    data = retry.data
    count = retry.count
    error = retry.error
  }

  if (error) {
    console.error('[follow-ups-api] listFollowUps:', error)
    throw error
  }

  return {
    rows: (data ?? []).map((row) => mapRowToFollowUp(row)),
    totalCount: count ?? 0,
  }
}

/**
 * Fetches follow-ups for multiple entities and returns a merged sorted list.
 * @param ownerId - Auth user id.
 * @param entities - Customer / lead / opportunity refs.
 * @returns Merged follow-ups.
 */
export async function fetchFollowUpsForEntities(
  ownerId: string,
  entities: { type: FollowUpEntityType; id: string }[],
): Promise<FollowUp[]> {
  if (!isSupabaseConfigured || !supabase || !entities.length) {
    return []
  }
  const all: FollowUp[] = []
  const seen = new Set<string>()

  for (const { type, id } of entities) {
    if (type === 'customer') {
      const list = await fetchFollowUpsLinkedToCustomer(id, { ownerId })
      for (const fu of list) {
        if (!seen.has(fu.id)) {
          seen.add(fu.id)
          all.push(fu)
        }
      }
      continue
    }

    let query = fromLoose('follow_ups')
      .select(FOLLOW_UP_SELECT)
      .eq('owner_id', ownerId)
      .order('scheduled_at', { ascending: true })
    if (type === 'lead') {
      query = query.eq('lead_id', id)
    } else if (type === 'opportunity') {
      query = query.eq('opportunity_id', id)
    } else if (type === 'kol') {
      query = query.eq('kol_id', id)
    } else if (type === 'competitor') {
      query = query.eq('competitor_shop_id', id)
    } else {
      continue
    }
    const { data, error } = await query
    if (error) {
      console.error('[follow-ups-api] fetchFollowUpsForEntities:', error)
      continue
    }
    for (const row of data ?? []) {
      const fu = mapRowToFollowUp(row)
      if (!seen.has(fu.id)) {
        seen.add(fu.id)
        all.push(fu)
      }
    }
  }

  all.sort(
    (a, b) =>
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
  )
  return all
}

/**
 * Resolves denormalized `group_id` for a new follow-up insert.
 * @param data - Create payload associations.
 * @returns Group uuid or null.
 */
async function resolveFollowUpGroupId(
  data: FollowUpInput,
): Promise<string | null> {
  if (data.customerId) {
    const { data: row } = await fromLoose('customers')
      .select('group_id')
      .eq('id', data.customerId)
      .maybeSingle()
    const gid = row?.group_id
    if (typeof gid === 'string' && gid) {
      return gid
    }
  }
  if (data.opportunityId) {
    const { data: row } = await fromLoose('opportunities')
      .select('group_id')
      .eq('id', data.opportunityId)
      .maybeSingle()
    const gid = row?.group_id
    if (typeof gid === 'string' && gid) {
      return gid
    }
  }
  if (data.leadId) {
    const { data: leadRow } = await fromLoose('leads')
      .select('customer_id')
      .eq('id', data.leadId)
      .maybeSingle()
    const leadCustomerId =
      typeof leadRow?.customer_id === 'string' ? leadRow.customer_id : null
    if (leadCustomerId) {
      const { data: custRow } = await fromLoose('customers')
        .select('group_id')
        .eq('id', leadCustomerId)
        .maybeSingle()
      const gid = custRow?.group_id
      if (typeof gid === 'string' && gid) {
        return gid
      }
    }
  }
  if (data.kolId) {
    const { data: row } = await fromLoose('kols')
      .select('group_id')
      .eq('id', data.kolId)
      .maybeSingle()
    const gid = row?.group_id
    if (typeof gid === 'string' && gid) {
      return gid
    }
  }
  if (data.competitorShopId) {
    const { data: row } = await fromLoose('competitor_shops')
      .select('group_id')
      .eq('id', data.competitorShopId)
      .maybeSingle()
    const gid = row?.group_id
    if (typeof gid === 'string' && gid) {
      return gid
    }
  }
  return null
}

/**
 * Creates a follow-up owned by the signed-in user.
 * @param ownerId - Auth user id.
 * @param data - Create payload (needs at least one association).
 * @returns Created follow-up.
 */
export async function createFollowUp(
  ownerId: string,
  data: FollowUpInput,
): Promise<FollowUp> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  if (
    !data.leadId &&
    !data.opportunityId &&
    !data.customerId &&
    !data.kolId &&
    !data.competitorShopId
  ) {
    throw new Error('follow_up_association_required')
  }

  const resolvedGroupId = await resolveFollowUpGroupId(data)
  const payload = {
    type: data.type,
    status: data.status ?? 'planned',
    content: data.content ?? null,
    custom_type_label:
      data.type === 'other' ? data.customTypeLabel?.trim() || null : null,
    todo_items: (data.todoItems ?? []).map((item) => ({
      id: item.id,
      text: item.text.trim(),
      completed: item.completed,
    })),
    scheduled_at: data.scheduledAt,
    lead_id: data.leadId ?? null,
    opportunity_id: data.opportunityId ?? null,
    customer_id: data.customerId ?? null,
    kol_id: data.kolId ?? null,
    competitor_shop_id: data.competitorShopId ?? null,
    owner_id: ownerId,
    group_id: resolvedGroupId,
  }

  const { data: created, error } = await fromLoose('follow_ups')
    .insert(payload)
    .select('*')
    .single()

  if (error) {
    console.error('[follow-ups-api] createFollowUp:', error)
    throw error
  }

  const createdId = String((created as { id?: string }).id ?? '')
  if (createdId) {
    const { data: rich, error: richError } = await fromLoose('follow_ups')
      .select(FOLLOW_UP_SELECT)
      .eq('id', createdId)
      .maybeSingle()
    if (!richError && rich) {
      return mapRowToFollowUp(rich)
    }
  }
  return mapRowToFollowUp(created as Record<string, unknown>)
}

/**
 * Stores the calendar event id created alongside a follow-up plan.
 * @param ownerId - Auth user id.
 * @param followUpId - Follow-up row id.
 * @param calendarEventId - Calendar event uuid.
 * @returns Nothing.
 */
export async function linkFollowUpCalendarEvent(
  ownerId: string,
  followUpId: string,
  calendarEventId: string,
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { error } = await fromLoose('follow_ups')
    .update({ calendar_event_id: calendarEventId })
    .eq('id', followUpId)
    .eq('owner_id', ownerId)
  if (error) {
    console.error('[follow-ups-api] linkFollowUpCalendarEvent:', error)
    throw error
  }
}

/**
 * Deletes the calendar event linked to a follow-up (or a legacy start_at match).
 * @param ownerId - Auth user id.
 * @param followUpId - Follow-up row id.
 * @returns Nothing.
 */
async function deleteCalendarEventForFollowUp(
  ownerId: string,
  followUpId: string,
): Promise<void> {
  const { data, error } = await fromLoose('follow_ups')
    .select('calendar_event_id, scheduled_at')
    .eq('id', followUpId)
    .eq('owner_id', ownerId)
    .maybeSingle()
  if (error) {
    console.error('[follow-ups-api] load calendar link:', error)
    return
  }
  if (!data) {
    return
  }
  const row = data as {
    calendar_event_id?: string | null
    scheduled_at?: string | null
  }
  let eventId =
    typeof row.calendar_event_id === 'string' && row.calendar_event_id
      ? row.calendar_event_id
      : null

  // Legacy plans created before calendar_event_id: match one event by creator + start.
  if (!eventId && typeof row.scheduled_at === 'string' && row.scheduled_at) {
    const { data: matches, error: matchError } = await fromLoose(
      'calendar_events',
    )
      .select('id')
      .eq('created_by', ownerId)
      .eq('start_at', row.scheduled_at)
      .eq('source', 'workbench')
      .limit(2)
    if (matchError) {
      console.error('[follow-ups-api] legacy calendar match:', matchError)
    } else if (Array.isArray(matches) && matches.length === 1) {
      const only = matches[0] as { id?: string }
      if (typeof only.id === 'string' && only.id) {
        eventId = only.id
      }
    }
  }

  if (!eventId) {
    return
  }
  try {
    await deleteCalendarEvent(eventId)
  } catch (calendarErr) {
    console.error('[follow-ups-api] delete calendar event:', calendarErr)
  }
}

/**
 * Marks a follow-up completed and optionally records check-in coordinates.
 * Propagates `last_contact_date` to a linked lead when present.
 * @param ownerId - Auth user id.
 * @param followUpId - Row id.
 * @param payload - Completion notes / coords.
 * @param previous - Prior row (for lead id when not re-fetched).
 * @returns Nothing.
 */
export async function completeFollowUp(
  ownerId: string,
  followUpId: string,
  payload: CompleteFollowUpPayload,
  previous?: Pick<FollowUp, 'leadId'> | null,
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const now = new Date().toISOString()
  const updateData: Record<string, unknown> = {
    status: 'completed',
    completed_at: now,
  }
  if (payload.content !== undefined) {
    updateData.content = payload.content
  }
  if (payload.checkInLat != null) {
    updateData.check_in_lat = payload.checkInLat
  }
  if (payload.checkInLng != null) {
    updateData.check_in_lng = payload.checkInLng
  }

  const { error } = await fromLoose('follow_ups')
    .update(updateData)
    .eq('id', followUpId)
    .eq('owner_id', ownerId)

  if (error) {
    console.error('[follow-ups-api] completeFollowUp:', error)
    throw error
  }

  const leadId = previous?.leadId
  if (leadId) {
    await fromLoose('leads')
      .update({ last_contact_date: now })
      .eq('id', leadId)
      .eq('owner_id', ownerId)
  }
}

/**
 * Replaces the todo checklist for an owned follow-up.
 * @param ownerId - Auth user id.
 * @param followUpId - Row id.
 * @param todoItems - Next checklist state.
 * @returns Nothing.
 */
export async function updateFollowUpTodoItems(
  ownerId: string,
  followUpId: string,
  todoItems: FollowUpTodoItem[],
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { error } = await fromLoose('follow_ups')
    .update({ todo_items: todoItems })
    .eq('id', followUpId)
    .eq('owner_id', ownerId)

  if (error) {
    console.error('[follow-ups-api] updateFollowUpTodoItems:', error)
    throw error
  }
}

/**
 * Cancels a planned follow-up.
 * @param ownerId - Auth user id.
 * @param followUpId - Row id.
 * @returns Nothing.
 */
export async function cancelFollowUp(
  ownerId: string,
  followUpId: string,
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  await deleteCalendarEventForFollowUp(ownerId, followUpId)
  const { error } = await fromLoose('follow_ups')
    .update({ status: 'cancelled', calendar_event_id: null })
    .eq('id', followUpId)
    .eq('owner_id', ownerId)

  if (error) {
    console.error('[follow-ups-api] cancelFollowUp:', error)
    throw error
  }
}

/**
 * Deletes an owned follow-up.
 * @param ownerId - Auth user id.
 * @param followUpId - Row id.
 * @returns Nothing.
 */
export async function deleteFollowUp(
  ownerId: string,
  followUpId: string,
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  await deleteCalendarEventForFollowUp(ownerId, followUpId)
  const { error } = await fromLoose('follow_ups')
    .delete()
    .eq('id', followUpId)
    .eq('owner_id', ownerId)

  if (error) {
    console.error('[follow-ups-api] deleteFollowUp:', error)
    throw error
  }
}

/**
 * Loads lead options for the create-association picker (RLS-scoped, all pages).
 * Newest `created_at` first.
 * @returns Compact lead rows.
 */
export async function listFollowUpAssocLeads(): Promise<FollowUpAssocLead[]> {
  const rows: FollowUpAssocLead[] = []
  let from = 0
  for (;;) {
    const { data, error } = await fromLoose('leads')
      .select('id, company_name')
      .order('created_at', { ascending: false })
      .range(from, from + ASSOC_PICKER_PAGE_SIZE - 1)
    if (error) {
      console.error('[follow-ups-api] listFollowUpAssocLeads:', error)
      throw error
    }
    const batch = data ?? []
    for (const row of batch) {
      rows.push({
        id: String(row.id),
        companyName: String(row.company_name ?? ''),
      })
    }
    if (batch.length < ASSOC_PICKER_PAGE_SIZE) {
      break
    }
    from += ASSOC_PICKER_PAGE_SIZE
  }
  return rows
}

/**
 * Loads opportunity options for the create-association picker (RLS-scoped, all pages).
 * Newest `created_at` first.
 * @returns Compact opportunity rows.
 */
export async function listFollowUpAssocOpportunities(): Promise<
  FollowUpAssocOpportunity[]
> {
  const rows: FollowUpAssocOpportunity[] = []
  let from = 0
  for (;;) {
    const { data, error } = await fromLoose('opportunities')
      .select('id, name')
      .order('created_at', { ascending: false })
      .range(from, from + ASSOC_PICKER_PAGE_SIZE - 1)
    if (error) {
      console.error('[follow-ups-api] listFollowUpAssocOpportunities:', error)
      throw error
    }
    const batch = data ?? []
    for (const row of batch) {
      rows.push({
        id: String(row.id),
        name: String(row.name ?? ''),
      })
    }
    if (batch.length < ASSOC_PICKER_PAGE_SIZE) {
      break
    }
    from += ASSOC_PICKER_PAGE_SIZE
  }
  return rows
}

/**
 * Loads customer options for the create-association picker (all pages).
 * @param options - Group scope for non–system-admins.
 * @returns Compact customer rows.
 */
export async function listFollowUpAssocCustomers(options: {
  isSystemAdmin: boolean
  groupId: string | null
}): Promise<FollowUpAssocCustomer[]> {
  const rows = await listCustomerPickerOptions(options)
  return rows.map((row) => ({
    id: row.id,
    companyName: row.companyName,
    customerCode: row.customerCode ?? '',
  }))
}

/**
 * Loads KOL options for the create-association picker (all pages).
 * @returns Compact KOL rows.
 */
export async function listFollowUpAssocKols(): Promise<FollowUpAssocKol[]> {
  const rows = await listKolPickerOptions()
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kolCode: row.kolCode ?? '',
  }))
}

/**
 * Loads competitor shop options for the create-association picker (all pages).
 * @param options - Group scope for non–system-admins.
 * @returns Compact competitor shop rows.
 */
export async function listFollowUpAssocCompetitors(options: {
  isSystemAdmin: boolean
  groupId: string | null
}): Promise<FollowUpAssocCompetitor[]> {
  const rows = await listCompetitorShopPickerOptions(options)
  return rows.map((row) => ({
    id: row.id,
    storeName: row.storeName,
  }))
}
