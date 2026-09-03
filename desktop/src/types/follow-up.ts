/**
 * Follow-up (todo list) types aligned with workbench-web CRM `FollowUp` models.
 */

/** Interaction channel; matches `follow_up_type_enum`. */
export type FollowUpType =
  | 'call'
  | 'email'
  | 'online_meeting'
  | 'site_visit'
  | 'follow_up_plan'
  | 'other'

/** Lifecycle status; matches `follow_up_status_enum`. */
export type FollowUpStatus = 'planned' | 'completed' | 'cancelled'

/** CRM entity linked to a follow-up row. */
export type FollowUpEntityType =
  | 'customer'
  | 'lead'
  | 'opportunity'
  | 'kol'
  | 'competitor'

/** One checklist item on a follow-up plan. */
export interface FollowUpTodoItem {
  /** Stable client-generated item id. */
  id: string
  /** Todo text. */
  text: string
  /** Whether the item is done. */
  completed: boolean
}

/**
 * Follow-up activity row (record or visit plan).
 * At least one association FK is expected (customer / lead / opportunity / KOL / competitor shop).
 */
export interface FollowUp {
  id: string
  type: FollowUpType
  status: FollowUpStatus
  content: string | null
  customTypeLabel: string | null
  todoItems: FollowUpTodoItem[]
  scheduledAt: string
  completedAt: string | null
  leadId: string | null
  opportunityId: string | null
  customerId: string | null
  kolId: string | null
  competitorShopId: string | null
  /** Linked calendar event created with this plan (optional). */
  calendarEventId: string | null
  checkInLat: number | null
  checkInLng: number | null
  ownerId: string
  createdAt: string
  updatedAt: string
  /** Denormalised lead company name from join. */
  leadName?: string
  /** Denormalised opportunity name from join. */
  opportunityName?: string
  /** Customer company when opportunity has `customer_id`. */
  opportunityCustomerName?: string
  /** Denormalised CRM customer company name from join. */
  customerName?: string
  /** Denormalised KOL name from join. */
  kolName?: string
  /** Denormalised KOL code from join. */
  kolCode?: string
  /** Denormalised competitor shop store name from join. */
  competitorShopName?: string
}

/** Payload for creating a follow-up. */
export interface FollowUpInput {
  type: FollowUpType
  scheduledAt: string
  leadId?: string | null
  opportunityId?: string | null
  customerId?: string | null
  kolId?: string | null
  competitorShopId?: string | null
  content?: string | null
  customTypeLabel?: string | null
  todoItems?: FollowUpTodoItem[]
  status?: FollowUpStatus
}

/** Payload for completing a follow-up (optional check-in coords). */
export interface CompleteFollowUpPayload {
  content?: string | null
  checkInLat?: number | null
  checkInLng?: number | null
}

/** Optional filters when listing follow-ups. */
export interface FollowUpFilters {
  status?: FollowUpStatus
  leadId?: string
  opportunityId?: string
  customerId?: string
  kolId?: string
  competitorShopId?: string
  /** Inclusive start on `scheduled_at`. */
  scheduledAtFrom?: string
  /** Inclusive end on `scheduled_at`. */
  scheduledAtTo?: string
}

/** Paginated list result. */
export interface FollowUpListResult {
  rows: FollowUp[]
  totalCount: number
}

/** Compact lead option for create-association pickers. */
export interface FollowUpAssocLead {
  id: string
  companyName: string
}

/** Compact opportunity option for create-association pickers. */
export interface FollowUpAssocOpportunity {
  id: string
  name: string
}

/** Compact customer option for create-association pickers. */
export interface FollowUpAssocCustomer {
  id: string
  companyName: string
  customerCode: string
}

/** Compact KOL option for create-association pickers. */
export interface FollowUpAssocKol {
  id: string
  name: string
  kolCode: string
}

/** Compact competitor shop option for create-association pickers. */
export interface FollowUpAssocCompetitor {
  id: string
  storeName: string
}
