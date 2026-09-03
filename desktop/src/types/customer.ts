/**
 * Customer list / form types for Electron Admin.
 */

/** List row used by the Admin customers table (lean columns). */
export interface CustomerListItem {
  id: string
  groupId: string | null
  ownerUserId: string | null
  companyName: string
  contactName: string | null
  phone: string | null
  email: string | null
  note: string | null
  customerCode: string | null
  shortName: string | null
  category: string | null
  customerType: string | null
  companyCountry: string | null
  companyState: string | null
  customerChannel: string | null
  customerSource: string | null
  customerLevel: string | null
  createdAt: string | null
  updatedAt: string | null
}

/**
 * Full create / edit form fields (web `/admin/customers/new` parity).
 * Billing/shipping blocks remain out of scope for the Electron form.
 */
export interface CustomerFormInput {
  companyName: string
  customerCode?: string | null
  shortName?: string | null
  contactName?: string | null
  phone?: string | null
  phoneCountry?: string | null
  email?: string | null
  note?: string | null
  description?: string | null
  address?: string | null
  latitude?: number | null
  longitude?: number | null
  website?: string | null
  taxId?: string | null
  fax?: string | null
  faxCountry?: string | null
  industry?: string | null
  employeeCount?: number | null
  primaryContactName?: string | null
  ownerUserId?: string | null
  companyCountry?: string | null
  companyState?: string | null
  companyCity?: string | null
  companyPostalCode?: string | null
  companyAddressLine1?: string | null
  companyAddressLine2?: string | null
  category?: string | null
  customerType?: string | null
  customerChannel?: string | null
  customerAttribute?: string | null
  marketSegment?: string | null
  marketSubSegment?: string | null
  customerSource?: string | null
  customerLevel?: string | null
  paymentCycle?: string | null
  relationshipStartDate?: string | null
  creditLimit?: number | null
  paymentMethod?: string | null
  currency?: string | null
  priceType?: string | null
  jobTitle?: string | null
  handlerDepartment?: string | null
  handlerDeveloper?: string | null
  handlerFollower?: string | null
  /** Public company logo URL (Storage `customer-logos`). */
  logoUrl?: string | null
}

/** Specific-info long-text fields (detail tab / optional form patch). */
export interface CustomerSpecificInfoFields {
  marketRegionPopulation?: string | null
  businessTypeChannel?: string | null
  salesProductBrand?: string | null
  managementPhilosophy?: string | null
  managementDirection?: string | null
  managementPolicy?: string | null
  managementCharacteristics?: string | null
  salesCapability?: string | null
  developmentPotential?: string | null
  ownerFutureOutlook?: string | null
  companyStrategy?: string | null
  orderDiscount?: string | null
  procurementAmountProductStatus?: string | null
  companyBusinessStatus?: string | null
  transactionStatus?: string | null
  yearlySalesActivityStatusIssues?: string | null
  cooperationStatusStrategy?: string | null
}

/** Detail row returned by getCustomerById (form + ids + specific info). */
export interface CustomerDetail extends CustomerFormInput, CustomerSpecificInfoFields {
  id: string
  groupId: string | null
  createdAt: string | null
  updatedAt: string | null
  /** Legacy single-locale AI summary column. */
  aiSummary?: string | null
  aiSummaryEnUs?: string | null
  aiSummaryZhCn?: string | null
  aiSummaryZhTw?: string | null
  aiSummaryModel?: string | null
  aiSummaryGeneratedAt?: string | null
}

/** Address type for customer_addresses. */
export type CustomerAddressType = 'billing' | 'shipping'

/** One address under a customer. */
export interface CustomerAddress {
  id: string
  customerId: string
  groupId: string | null
  addressType: CustomerAddressType
  country: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  district: string | null
  line1: string | null
  line2: string | null
  createdAt: string
  updatedAt: string
}

/** Address create / edit payload. */
export interface CustomerAddressInput {
  addressType: CustomerAddressType
  country?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  district?: string | null
  line1?: string | null
  line2?: string | null
}

/** Platform key for customer_channels. */
export type CustomerChannelPlatform =
  | 'youtube'
  | 'facebook'
  | 'instagram'
  | 'discord'
  | 'tiktok'
  | 'linkedin'
  | 'twitter-x'
  | 'line'
  | 'reddit'
  | 'other'

/** One social / platform channel under a customer. */
export interface CustomerChannel {
  id: string
  customerId: string
  groupId: string | null
  platformKey: string
  platformCustomName: string | null
  channelUrl: string
  notes: string | null
  createdAt: string
  updatedAt: string
}

/** Channel create / edit payload. */
export interface CustomerChannelInput {
  platformKey: string
  platformCustomName?: string | null
  channelUrl: string
  notes?: string | null
}

/** Audit activity row linked to a customer. */
export interface CustomerActivityLog {
  id: string
  customerId: string
  groupId: string | null
  actorUserId: string | null
  actorEmail: string | null
  entityType:
    | 'customers'
    | 'customer_contacts'
    | 'customer_addresses'
    | 'customer_work_items'
    | 'customer_visit_log'
    | 'orders'
  entityId: string | null
  action: 'insert' | 'update' | 'delete'
  summary: string
  changedFields: Record<string, { old: unknown; new: unknown }>
  createdAt: string
}

/** Visit log metadata JSON. */
export interface VisitMeta {
  bossName?: string | null
  staffCount?: number | null
  shopType?: string | null
  competitors?: string | null
}

/** Extensible metadata stored in `visit_meta` JSONB. */
export interface VisitMeta {
  bossName?: string | null
  staffCount?: number | null
  shopType?: string | null
  competitors?: string | null
}

/** Visit-log document attachment stored in `document_files` JSONB. */
export interface VisitLogDocumentFile {
  storagePath: string
  fileName: string
  mimeType: string
  byteSize: number
}

/** Visit log list/detail row. */
export interface CustomerVisitLog {
  id: string
  customerId: string | null
  kolId: string | null
  groupId: string | null
  subject: string | null
  visitDate: string | null
  content: string | null
  imageUrls?: string[] | null
  documentFiles?: VisitLogDocumentFile[] | null
  createdByUserId: string | null
  createdByEmail: string | null
  createdByDisplayName?: string | null
  createdAt: string
  companyName?: string | null
  kolName?: string | null
  customerNameText?: string | null
  contactPerson?: string | null
  interestedProducts?: string[] | null
  interestedProductIds?: string[] | null
  visitMeta?: VisitMeta | null
}

/** Input for creating a visit log. */
export interface CustomerVisitLogInput {
  customerId?: string | null
  kolId?: string | null
  customerNameText?: string | null
  subject: string
  visitDate?: string | null
  content?: string | null
  contactPerson?: string | null
  interestedProducts?: string[] | null
  interestedProductIds?: string[] | null
  visitMeta?: VisitMeta | null
}

/** Partial update payload for visit log edit. */
export interface CustomerVisitLogUpdateInput {
  customerId?: string | null
  kolId?: string | null
  customerNameText?: string | null
  subject?: string
  visitDate?: string | null
  content?: string | null
  contactPerson?: string | null
  interestedProducts?: string[] | null
  interestedProductIds?: string[] | null
  visitMeta?: VisitMeta | null
}

/** Minimal customer fields for visit-log “new customer” create. */
export interface VisitLogNewCustomerInput {
  companyName: string
  contactName?: string | null
  address?: string | null
  employeeCount?: number | null
}

/** Follow-up row for customer detail timeline. */
export interface CustomerFollowUp {
  id: string
  type: string
  status: string
  content: string | null
  /** Checklist items from the create form (preferred body when content is empty). */
  todoItems: { id: string; text: string; completed: boolean }[]
  scheduledAt: string
  completedAt: string | null
  leadId: string | null
  opportunityId: string | null
  customerId: string | null
  ownerId: string
  createdAt: string
  updatedAt: string
  leadName?: string
  opportunityName?: string
  customerName?: string
}

/** Shop dealer account linked to a CRM customer. */
export interface ShopDealerAccount {
  id: string
  customerId: string
  groupId: string
  loginUsername: string
  isActive: boolean
  companyName: string
  customerCode: string
  createdAt: string
  updatedAt: string
}

/** Paginated list result. */
export interface CustomerListResult {
  rows: CustomerListItem[]
  totalCount: number
}

/** Toolbar filters (web CustomersView parity). */
export interface CustomerListFilters {
  customerType: string
  country: string
  usRegion: '' | 'west' | 'east'
  usState: string
  channel: string
  level: string
  source: string
  filterGroupId: string | null
}

/** Options for listing customers. */
export interface ListCustomersOptions {
  page: number
  pageSize: number
  searchQuery?: string
  groupId?: string | null
  isSystemAdmin: boolean
  filters?: CustomerListFilters
  /**
   * When true, oldest `created_at` first; default false (newest created first).
   */
  sortAscending?: boolean
}

/** customer_contacts row. */
export interface CustomerContact {
  id: string
  customerId: string
  groupId: string | null
  name: string
  title: string | null
  email: string | null
  phone: string | null
  phoneCountry: string | null
  mobile: string | null
  mobileCountry: string | null
  remarks: string | null
  createdAt: string
  updatedAt: string
}

/** Contact create / edit payload. */
export interface CustomerContactInput {
  name: string
  title?: string | null
  email?: string | null
  phone?: string | null
  phoneCountry?: string | null
  mobile?: string | null
  mobileCountry?: string | null
  remarks?: string | null
}

/** Contact row for the global Admin contacts list (includes parent company name). */
export interface CustomerContactListRow extends CustomerContact {
  companyName: string | null
}

/** customer_work_items row. */
export interface CustomerWorkItem {
  id: string
  customerId: string
  groupId: string | null
  itemCode: string | null
  subject: string
  dueDate: string | null
  startAt: string | null
  expectedEndAt: string | null
  assigneeName: string | null
  importance: string | null
  completed: boolean
  remarks: string | null
  suggestion: string | null
  createdAt: string
  updatedAt: string
}

/** Work item create / edit payload. */
export interface CustomerWorkItemInput {
  subject: string
  dueDate?: string | null
  startAt?: string | null
  expectedEndAt?: string | null
  assigneeName?: string | null
  importance?: string | null
  completed?: boolean
  remarks?: string | null
  suggestion?: string | null
}
