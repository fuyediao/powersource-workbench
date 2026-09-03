/**
 * Supabase CRUD for Electron Admin customers (list + full create/edit form).
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type {
  CustomerDetail,
  CustomerFormInput,
  CustomerListFilters,
  CustomerListItem,
  CustomerListResult,
  ListCustomersOptions,
} from '@/types/customer'
import type { Database } from '@/types/database'
import {
  companyStateValuesForUsCode,
  companyStateValuesForUsRegion,
  isUnitedStatesCountryFilter,
} from '@/constants/us-east-west-regions'
import {
  isCustomerCodeAvailable,
  isCustomerCodeUniqueViolation,
} from '@/utils/customer-code-uniqueness'

type CustomerInsert = Database['public']['Tables']['customers']['Insert']
type CustomerUpdate = Database['public']['Tables']['customers']['Update']

/** Default page size (web Admin list parity). */
export const CUSTOMERS_PAGE_SIZE = 20

const LIST_SELECT =
  'id, group_id, owner_user_id, company_name, contact_name, phone, email, note, customer_code, short_name, category, customer_type, company_country, company_state, customer_channel, customer_source, customer_level, created_at, updated_at'

const FORM_SELECT = [
  'id',
  'group_id',
  'created_by_user_id',
  'company_name',
  'contact_name',
  'phone',
  'phone_country',
  'email',
  'note',
  'description',
  'address',
  'latitude',
  'longitude',
  'customer_code',
  'short_name',
  'category',
  'customer_type',
  'owner_user_id',
  'website',
  'tax_id',
  'fax',
  'fax_country',
  'industry',
  'employee_count',
  'primary_contact_name',
  'company_country',
  'company_state',
  'company_city',
  'company_postal_code',
  'company_address_line1',
  'company_address_line2',
  'customer_channel',
  'customer_attribute',
  'market_segment',
  'market_sub_segment',
  'customer_source',
  'customer_level',
  'payment_cycle',
  'relationship_start_date',
  'credit_limit',
  'payment_method',
  'currency',
  'price_type',
  'job_title',
  'handler_department',
  'handler_developer',
  'handler_follower',
  'logo_url',
  'market_region_population',
  'business_type_channel',
  'sales_product_brand',
  'management_philosophy',
  'management_direction',
  'management_policy',
  'management_characteristics',
  'sales_capability',
  'development_potential',
  'owner_future_outlook',
  'company_strategy',
  'order_discount',
  'procurement_amount_product_status',
  'company_business_status',
  'transaction_status',
  'yearly_sales_activity_status_issues',
  'cooperation_status_strategy',
  'ai_summary',
  'ai_summary_en_us',
  'ai_summary_zh_cn',
  'ai_summary_zh_tw',
  'ai_summary_model',
  'ai_summary_generated_at',
  'created_at',
  'updated_at',
].join(', ')

/**
 * Maps a raw customers row to the list item shape.
 * @param row - Supabase row.
 * @returns List item.
 */
function mapListRow(row: Record<string, unknown>): CustomerListItem {
  return {
    id: String(row.id),
    groupId: (row.group_id as string | null) ?? null,
    ownerUserId: (row.owner_user_id as string | null) ?? null,
    companyName: String(row.company_name ?? ''),
    contactName: (row.contact_name as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    customerCode: (row.customer_code as string | null) ?? null,
    shortName: (row.short_name as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    customerType: (row.customer_type as string | null) ?? null,
    companyCountry: (row.company_country as string | null) ?? null,
    companyState: (row.company_state as string | null) ?? null,
    customerChannel: (row.customer_channel as string | null) ?? null,
    customerSource: (row.customer_source as string | null) ?? null,
    customerLevel: (row.customer_level as string | null) ?? null,
    createdAt: (row.created_at as string | null) ?? null,
    updatedAt: (row.updated_at as string | null) ?? null,
  }
}

/**
 * Maps a raw customers row to the detail / form shape.
 * @param row - Supabase row.
 * @returns Detail.
 */
function mapDetailRow(row: Record<string, unknown>): CustomerDetail {
  return {
    id: String(row.id),
    groupId: (row.group_id as string | null) ?? null,
    companyName: String(row.company_name ?? ''),
    contactName: (row.contact_name as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    phoneCountry: (row.phone_country as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    latitude: (row.latitude as number | null) ?? null,
    longitude: (row.longitude as number | null) ?? null,
    customerCode: (row.customer_code as string | null) ?? null,
    shortName: (row.short_name as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    customerType: (row.customer_type as string | null) ?? null,
    ownerUserId: (row.owner_user_id as string | null) ?? null,
    website: (row.website as string | null) ?? null,
    taxId: (row.tax_id as string | null) ?? null,
    fax: (row.fax as string | null) ?? null,
    faxCountry: (row.fax_country as string | null) ?? null,
    industry: (row.industry as string | null) ?? null,
    employeeCount: (row.employee_count as number | null) ?? null,
    primaryContactName: (row.primary_contact_name as string | null) ?? null,
    companyCountry: (row.company_country as string | null) ?? null,
    companyState: (row.company_state as string | null) ?? null,
    companyCity: (row.company_city as string | null) ?? null,
    companyPostalCode: (row.company_postal_code as string | null) ?? null,
    companyAddressLine1: (row.company_address_line1 as string | null) ?? null,
    companyAddressLine2: (row.company_address_line2 as string | null) ?? null,
    customerChannel: (row.customer_channel as string | null) ?? null,
    customerAttribute: (row.customer_attribute as string | null) ?? null,
    marketSegment: (row.market_segment as string | null) ?? null,
    marketSubSegment: (row.market_sub_segment as string | null) ?? null,
    customerSource: (row.customer_source as string | null) ?? null,
    customerLevel: (row.customer_level as string | null) ?? null,
    paymentCycle: (row.payment_cycle as string | null) ?? null,
    relationshipStartDate: (row.relationship_start_date as string | null) ?? null,
    creditLimit: (row.credit_limit as number | null) ?? null,
    paymentMethod: (row.payment_method as string | null) ?? null,
    currency: (row.currency as string | null) ?? null,
    priceType: (row.price_type as string | null) ?? null,
    jobTitle: (row.job_title as string | null) ?? null,
    handlerDepartment: (row.handler_department as string | null) ?? null,
    handlerDeveloper: (row.handler_developer as string | null) ?? null,
    handlerFollower: (row.handler_follower as string | null) ?? null,
    logoUrl: (row.logo_url as string | null) ?? null,
    marketRegionPopulation: (row.market_region_population as string | null) ?? null,
    businessTypeChannel: (row.business_type_channel as string | null) ?? null,
    salesProductBrand: (row.sales_product_brand as string | null) ?? null,
    managementPhilosophy: (row.management_philosophy as string | null) ?? null,
    managementDirection: (row.management_direction as string | null) ?? null,
    managementPolicy: (row.management_policy as string | null) ?? null,
    managementCharacteristics: (row.management_characteristics as string | null) ?? null,
    salesCapability: (row.sales_capability as string | null) ?? null,
    developmentPotential: (row.development_potential as string | null) ?? null,
    ownerFutureOutlook: (row.owner_future_outlook as string | null) ?? null,
    companyStrategy: (row.company_strategy as string | null) ?? null,
    orderDiscount: (row.order_discount as string | null) ?? null,
    procurementAmountProductStatus:
      (row.procurement_amount_product_status as string | null) ?? null,
    companyBusinessStatus: (row.company_business_status as string | null) ?? null,
    transactionStatus: (row.transaction_status as string | null) ?? null,
    yearlySalesActivityStatusIssues:
      (row.yearly_sales_activity_status_issues as string | null) ?? null,
    cooperationStatusStrategy: (row.cooperation_status_strategy as string | null) ?? null,
    aiSummary: (row.ai_summary as string | null) ?? null,
    aiSummaryEnUs: (row.ai_summary_en_us as string | null) ?? null,
    aiSummaryZhCn: (row.ai_summary_zh_cn as string | null) ?? null,
    aiSummaryZhTw: (row.ai_summary_zh_tw as string | null) ?? null,
    aiSummaryModel: (row.ai_summary_model as string | null) ?? null,
    aiSummaryGeneratedAt: (row.ai_summary_generated_at as string | null) ?? null,
    createdAt: (row.created_at as string | null) ?? null,
    updatedAt: (row.updated_at as string | null) ?? null,
  }
}

/**
 * Trims and converts empty strings to null.
 * @param value - Optional string.
 * @returns Trimmed string or null.
 */
function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Builds insert/update payload for full create form fields.
 * @param input - Form values.
 * @returns Typed column map (without created_by / group_id).
 */
function formToUpdatePayload(input: CustomerFormInput): CustomerUpdate {
  const employeeCount =
    input.employeeCount != null && !Number.isNaN(Number(input.employeeCount))
      ? Number(input.employeeCount)
      : null
  const creditLimit =
    input.creditLimit != null && !Number.isNaN(Number(input.creditLimit))
      ? Number(input.creditLimit)
      : null

  return {
    company_name: input.companyName.trim(),
    contact_name: emptyToNull(input.contactName),
    phone: emptyToNull(input.phone),
    phone_country: emptyToNull(input.phoneCountry),
    email: emptyToNull(input.email),
    note: emptyToNull(input.note),
    description: emptyToNull(input.description),
    address: emptyToNull(input.address),
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    customer_code: emptyToNull(input.customerCode),
    short_name: emptyToNull(input.shortName),
    category: emptyToNull(input.category),
    customer_type: emptyToNull(input.customerType),
    owner_user_id: emptyToNull(input.ownerUserId),
    website: emptyToNull(input.website),
    tax_id: emptyToNull(input.taxId),
    fax: emptyToNull(input.fax),
    fax_country: emptyToNull(input.faxCountry),
    industry: emptyToNull(input.industry),
    employee_count: employeeCount,
    primary_contact_name: emptyToNull(input.primaryContactName),
    company_country: emptyToNull(input.companyCountry),
    company_state: emptyToNull(input.companyState),
    company_city: emptyToNull(input.companyCity),
    company_postal_code: emptyToNull(input.companyPostalCode),
    company_address_line1: emptyToNull(input.companyAddressLine1),
    company_address_line2: emptyToNull(input.companyAddressLine2),
    customer_channel: emptyToNull(input.customerChannel),
    customer_attribute: emptyToNull(input.customerAttribute),
    market_segment: emptyToNull(input.marketSegment),
    market_sub_segment: emptyToNull(input.marketSubSegment),
    customer_source: emptyToNull(input.customerSource),
    customer_level: emptyToNull(input.customerLevel),
    payment_cycle: emptyToNull(input.paymentCycle),
    relationship_start_date: emptyToNull(input.relationshipStartDate),
    credit_limit: creditLimit,
    payment_method: emptyToNull(input.paymentMethod),
    currency: emptyToNull(input.currency),
    price_type: emptyToNull(input.priceType),
    job_title: emptyToNull(input.jobTitle),
    handler_department: emptyToNull(input.handlerDepartment),
    handler_developer: emptyToNull(input.handlerDeveloper),
    handler_follower: emptyToNull(input.handlerFollower),
    logo_url: emptyToNull(input.logoUrl),
  } as CustomerUpdate
}

/**
 * Minimal chainable shape used by list filter helpers.
 */
interface CustomerListQuery {
  eq: (column: string, value: string) => CustomerListQuery
  or: (filters: string) => CustomerListQuery
  in: (column: string, values: readonly string[]) => CustomerListQuery
}

/**
 * Applies toolbar filters to a customers query (web `applyCustomerListFilters` parity).
 * @param query - Supabase query builder.
 * @param filters - Optional toolbar filters.
 * @returns Query with filters applied.
 */
function applyListFilters(
  query: CustomerListQuery,
  filters: CustomerListFilters | undefined,
): CustomerListQuery {
  if (!filters) {
    return query
  }
  let next = query
  if (filters.filterGroupId) {
    next = next.eq('group_id', filters.filterGroupId)
  }
  if (filters.customerType === '__empty__') {
    next = next.or('customer_type.is.null,customer_type.eq.')
  } else if (filters.customerType) {
    next = next.eq('customer_type', filters.customerType)
  }
  if (filters.country === '__empty__') {
    next = next.or('company_country.is.null,company_country.eq.')
  } else if (filters.country) {
    next = next.eq('company_country', filters.country)
  }
  if (isUnitedStatesCountryFilter(filters.country)) {
    if (filters.usState) {
      const stateValues = companyStateValuesForUsCode(filters.usState)
      if (stateValues.length > 0) {
        next = next.in('company_state', stateValues)
      }
    } else if (filters.usRegion === 'west' || filters.usRegion === 'east') {
      const regionValues = companyStateValuesForUsRegion(filters.usRegion)
      if (regionValues.length > 0) {
        next = next.in('company_state', regionValues)
      }
    }
  }
  if (filters.channel) {
    next = next.eq('customer_channel', filters.channel)
  }
  if (filters.level) {
    next = next.eq('customer_level', filters.level)
  }
  if (filters.source) {
    next = next.eq('customer_source', filters.source)
  }
  return next
}

/**
 * Lists customers with pagination and filters.
 * @param options - List options.
 * @returns Rows and total count.
 */
export async function listCustomers(
  options: ListCustomersOptions,
): Promise<CustomerListResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const page = Math.max(1, options.page)
  const pageSize = Math.max(1, options.pageSize)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('customers')
    .select(LIST_SELECT, { count: 'exact' })
    .order('created_at', { ascending: Boolean(options.sortAscending) })

  if (!options.isSystemAdmin) {
    if (!options.groupId) {
      return { rows: [], totalCount: 0 }
    }
    query = query.eq('group_id', options.groupId)
  }

  query = applyListFilters(query as unknown as CustomerListQuery, options.filters) as typeof query

  const q = options.searchQuery?.trim()
  if (q) {
    const pattern = `%${q}%`
    query = query.or(
      `company_name.ilike.${pattern},contact_name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern},customer_code.ilike.${pattern}`,
    )
  }

  const { data, count, error } = await query.range(from, to)
  if (error) {
    console.error('[customers-api] listCustomers:', error)
    throw error
  }

  return {
    rows: (data ?? []).map((row) => mapListRow(row as Record<string, unknown>)),
    totalCount: count ?? 0,
  }
}

/** Compact customer row for visit-log / association / lead pickers. */
export interface CustomerPickerOption {
  id: string
  companyName: string
  customerCode: string | null
  website: string | null
  companyCountry: string | null
  companyState: string | null
  companyCity: string | null
  companyAddressLine1: string | null
  companyAddressLine2: string | null
  companyPostalCode: string | null
  latitude: number | null
  longitude: number | null
  primaryContactName: string | null
  contactName: string | null
  phone: string | null
  email: string | null
}

/** Page size when walking all picker rows (PostgREST max-rows safe). */
const CUSTOMER_PICKER_PAGE_SIZE = 1000

/**
 * Lists every customer visible for a picker (Vue `fetchMobileCustomers({ loadAll: true })` parity).
 * System admins are not scoped to the current workspace group; other users are.
 * Ordered by newest `created_at` first (same as the Admin customers list).
 * @param options - Auth scope.
 * @returns Options newest-first.
 */
export async function listCustomerPickerOptions(options: {
  isSystemAdmin: boolean
  groupId: string | null
  /**
   * Optional hard filter (e.g. system admin creating a shop into one group).
   * When set, results are limited to this `customers.group_id`.
   */
  filterGroupId?: string | null
}): Promise<CustomerPickerOption[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  if (!options.isSystemAdmin && !options.groupId) {
    return []
  }

  const scopeGroupId = options.filterGroupId ?? (
    options.isSystemAdmin ? null : options.groupId
  )

  const rows: CustomerPickerOption[] = []
  let from = 0
  for (;;) {
    let query = supabase
      .from('customers')
      .select(
        'id, company_name, customer_code, website, company_country, company_state, company_city, company_address_line1, company_address_line2, company_postal_code, latitude, longitude, primary_contact_name, contact_name, phone, email',
      )
      .order('created_at', { ascending: false })
      .range(from, from + CUSTOMER_PICKER_PAGE_SIZE - 1)

    if (scopeGroupId) {
      query = query.eq('group_id', scopeGroupId)
    }

    const { data, error } = await query
    if (error) {
      console.error('[customers-api] listCustomerPickerOptions:', error)
      throw error
    }
    const batch = data ?? []
    for (const row of batch) {
      rows.push({
        id: String(row.id),
        companyName: String(row.company_name ?? ''),
        customerCode: (row.customer_code as string | null) ?? null,
        website: (row.website as string | null) ?? null,
        companyCountry: (row.company_country as string | null) ?? null,
        companyState: (row.company_state as string | null) ?? null,
        companyCity: (row.company_city as string | null) ?? null,
        companyAddressLine1: (row.company_address_line1 as string | null) ?? null,
        companyAddressLine2: (row.company_address_line2 as string | null) ?? null,
        companyPostalCode: (row.company_postal_code as string | null) ?? null,
        latitude:
          row.latitude != null && Number.isFinite(Number(row.latitude))
            ? Number(row.latitude)
            : null,
        longitude:
          row.longitude != null && Number.isFinite(Number(row.longitude))
            ? Number(row.longitude)
            : null,
        primaryContactName: (row.primary_contact_name as string | null) ?? null,
        contactName: (row.contact_name as string | null) ?? null,
        phone: (row.phone as string | null) ?? null,
        email: (row.email as string | null) ?? null,
      })
    }
    if (batch.length < CUSTOMER_PICKER_PAGE_SIZE) {
      break
    }
    from += CUSTOMER_PICKER_PAGE_SIZE
  }
  return rows
}

/**
 * Loads one customer by id (full form fields).
 * @param id - Customer uuid.
 * @returns Detail row, or null when missing.
 */
export async function getCustomerById(id: string): Promise<CustomerDetail | null> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { data, error } = await supabase
    .from('customers')
    .select(FORM_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[customers-api] getCustomerById:', error)
    throw error
  }
  if (!data) {
    return null
  }
  return mapDetailRow(data as unknown as Record<string, unknown>)
}

/**
 * Creates a customer row.
 * @param userId - Auth user id (created_by).
 * @param groupId - Workspace group id.
 * @param input - Form values.
 * @returns Created detail.
 */
export async function createCustomer(
  userId: string,
  groupId: string | null,
  input: CustomerFormInput,
): Promise<CustomerDetail> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const companyName = input.companyName.trim()
  if (!companyName) {
    throw new Error('company_name_required')
  }

  const payload: CustomerInsert = {
    ...formToUpdatePayload(input),
    company_name: companyName,
    created_by_user_id: userId,
    group_id: groupId,
  }

  const { data, error } = await supabase
    .from('customers')
    .insert(payload)
    .select(FORM_SELECT)
    .single()

  if (error) {
    console.error('[customers-api] createCustomer:', error)
    throw error
  }
  return mapDetailRow(data as unknown as Record<string, unknown>)
}

/**
 * Updates core form fields on a customer row.
 * @param id - Customer id.
 * @param input - Form values.
 * @returns Updated detail.
 */
export async function updateCustomer(
  id: string,
  input: CustomerFormInput,
): Promise<CustomerDetail> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const companyName = input.companyName.trim()
  if (!companyName) {
    throw new Error('company_name_required')
  }

  const { data, error } = await supabase
    .from('customers')
    .update(formToUpdatePayload(input))
    .eq('id', id)
    .select(FORM_SELECT)
    .single()

  if (error) {
    console.error('[customers-api] updateCustomer:', error)
    throw error
  }
  return mapDetailRow(data as unknown as Record<string, unknown>)
}

/**
 * Patches specific-info long-text fields on a customer.
 * @param id - Customer id.
 * @param fields - Specific-info payload.
 * @returns Updated detail.
 */
export async function updateCustomerSpecificInfo(
  id: string,
  fields: import('@/types/customer').CustomerSpecificInfoFields,
): Promise<CustomerDetail> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const payload: Record<string, string | null> = {
    market_region_population: emptyToNull(fields.marketRegionPopulation),
    business_type_channel: emptyToNull(fields.businessTypeChannel),
    sales_product_brand: emptyToNull(fields.salesProductBrand),
    management_philosophy: emptyToNull(fields.managementPhilosophy),
    management_direction: emptyToNull(fields.managementDirection),
    management_policy: emptyToNull(fields.managementPolicy),
    management_characteristics: emptyToNull(fields.managementCharacteristics),
    sales_capability: emptyToNull(fields.salesCapability),
    development_potential: emptyToNull(fields.developmentPotential),
    owner_future_outlook: emptyToNull(fields.ownerFutureOutlook),
    company_strategy: emptyToNull(fields.companyStrategy),
    order_discount: emptyToNull(fields.orderDiscount),
    procurement_amount_product_status: emptyToNull(
      fields.procurementAmountProductStatus,
    ),
    company_business_status: emptyToNull(fields.companyBusinessStatus),
    transaction_status: emptyToNull(fields.transactionStatus),
    yearly_sales_activity_status_issues: emptyToNull(
      fields.yearlySalesActivityStatusIssues,
    ),
    cooperation_status_strategy: emptyToNull(fields.cooperationStatusStrategy),
  }
  const { data, error } = await supabase
    .from('customers')
    .update(payload as CustomerUpdate)
    .eq('id', id)
    .select(FORM_SELECT)
    .single()
  if (error) {
    console.error('[customers-api] updateCustomerSpecificInfo:', error)
    throw error
  }
  return mapDetailRow(data as unknown as Record<string, unknown>)
}

/**
 * Deletes a customer by id.
 * @param id - Customer id.
 * @returns Nothing.
 */
export async function deleteCustomer(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { error } = await supabase.from('customers').delete().eq('id', id)
  if (error) {
    console.error('[customers-api] deleteCustomer:', error)
    throw error
  }
}

/**
 * Persists trilingual AI customer summaries (and model / timestamp).
 * @param id - Customer UUID.
 * @param summaries - English / zh-CN / zh-TW Markdown.
 * @param model - Model slug that produced the summary.
 * @returns Updated detail row.
 */
export async function saveCustomerAiSummary(
  id: string,
  summaries: { enUs: string; zhCn: string; zhTw: string },
  model: string,
): Promise<CustomerDetail> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const now = new Date().toISOString()
  // Columns exist in DB but may lag behind generated `Database` types.
  const payload = {
    ai_summary_en_us: summaries.enUs,
    ai_summary_zh_cn: summaries.zhCn,
    ai_summary_zh_tw: summaries.zhTw,
    ai_summary: summaries.zhTw,
    ai_summary_model: model,
    ai_summary_generated_at: now,
  } as CustomerUpdate
  const { data, error } = await supabase
    .from('customers')
    .update(payload)
    .eq('id', id)
    .select(FORM_SELECT)
    .single()
  if (error) {
    console.error('[customers-api] saveCustomerAiSummary:', error)
    throw error
  }
  return mapDetailRow(data as unknown as Record<string, unknown>)
}

/**
 * True when delete failed because of FK dependencies.
 * @param err - Unknown error.
 * @returns Whether dependency related.
 */
export function isCustomerDeleteDependencyError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false
  }
  const code = 'code' in err ? String((err as { code?: string }).code ?? '') : ''
  return code === '23503'
}

/**
 * Updates only the company logo URL after Storage upload (or clear).
 * @param id - Customer id.
 * @param logoUrl - Public URL or null to clear.
 * @returns Updated detail.
 */
export async function updateCustomerLogoUrl(
  id: string,
  logoUrl: string | null,
): Promise<CustomerDetail> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  // `logo_url` exists in DB but may lag behind generated `Database` types.
  const { data, error } = await supabase
    .from('customers')
    .update({ logo_url: logoUrl } as CustomerUpdate)
    .eq('id', id)
    .select(FORM_SELECT)
    .single()
  if (error) {
    console.error('[customers-api] updateCustomerLogoUrl:', error)
    throw error
  }
  return mapDetailRow(data as unknown as Record<string, unknown>)
}

export { isCustomerCodeAvailable, isCustomerCodeUniqueViolation }
