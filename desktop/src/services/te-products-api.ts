import { fromLoose } from '@/lib/supabase-loose'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

/**
 * A selectable T&E evaluation SKU: a te_evaluation_products link row joined
 * with its product_catalog SKU. `id` is the product_catalog.id (ERP ItemId)
 * stored on te_submissions.product; `linkId` is the underlying
 * te_evaluation_products row id (used for unlink/reorder).
 */
export interface TeEvaluationProduct {
  id: string
  linkId: string
  categoryId: string
  itemCode: string
  /** Customer-facing label (display_name, else ERP item_name). */
  name: string
  /** ERP item_name (always the catalog source name). */
  itemName: string
  /** ERP-owned U.S. retail MSRP (product_catalog.te_price_usd). */
  tePriceUsd: number | null
  /** Internal CRM notes from product_catalog. */
  notes: string | null
  /** Whether the linked product_catalog SKU is currently active. */
  isActive: boolean
  sortOrder: number
}

/** Category heading grouping evaluation products in te Step 4. */
export interface TeProductCategory {
  id: string
  name: string
  sortOrder: number
  isActive: boolean
  products: TeEvaluationProduct[]
}

export type TeProductCategoryInput = {
  name: string
  sortOrder: number
  isActive: boolean
}

/** Link an existing product_catalog SKU into a category. */
export type TeEvaluationProductInput = {
  categoryId: string
  productId: string
  sortOrder: number
}

const CATEGORY_SELECT =
  'id, name, sort_order, is_active, ' +
  'te_evaluation_products ( id, category_id, sort_order, product_id, ' +
  'product_catalog ( id, item_code, item_name, display_name, notes, te_price_usd, is_active ) )'

/**
 * Prefer display_name alias when set; otherwise ERP item_name.
 *
 * @param catalog - Embedded product_catalog fields
 * @returns Customer-facing label
 */
function catalogCustomerName(catalog: Record<string, unknown>): string {
  const alias = typeof catalog.display_name === 'string' ? catalog.display_name.trim() : ''
  if (alias) return alias
  return String(catalog.item_name ?? '')
}

/**
 * Map a nested link row (joined with its product_catalog SKU) from PostgREST.
 *
 * @param row - Raw link record
 * @returns Normalized product
 */
function mapProduct(row: Record<string, unknown>): TeEvaluationProduct {
  const catalog = (row.product_catalog ?? {}) as Record<string, unknown>
  const itemName = String(catalog.item_name ?? '')
  const notesRaw = typeof catalog.notes === 'string' ? catalog.notes.trim() : ''
  const tePriceRaw = catalog.te_price_usd == null ? null : Number(catalog.te_price_usd)
  return {
    id: String(catalog.id ?? row.product_id ?? ''),
    linkId: String(row.id),
    categoryId: String(row.category_id ?? ''),
    itemCode: String(catalog.item_code ?? ''),
    name: catalogCustomerName(catalog),
    itemName,
    tePriceUsd: tePriceRaw != null && Number.isFinite(tePriceRaw) ? tePriceRaw : null,
    notes: notesRaw || null,
    isActive: catalog.is_active !== false,
    sortOrder: typeof row.sort_order === 'number' ? row.sort_order : 0,
  }
}

/**
 * Map a category row with nested products.
 *
 * @param row - Raw PostgREST record
 * @returns Normalized category
 */
export function mapTeProductCategoryFromRow(row: Record<string, unknown>): TeProductCategory {
  const productsRaw = Array.isArray(row.te_evaluation_products) ? row.te_evaluation_products : []
  const products = (productsRaw as Record<string, unknown>[])
    .map(mapProduct)
    // Hide SKUs deactivated in product_catalog (ERP sync); matches workbench-api /te/products.
    .filter((product) => product.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))

  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    sortOrder: typeof row.sort_order === 'number' ? row.sort_order : 0,
    isActive: row.is_active !== false,
    products,
  }
}

/**
 * Load all T&E product categories with nested products for admin.
 *
 * @returns Categories sorted by sort_order
 */
export async function fetchTeProductCategories(): Promise<TeProductCategory[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { data, error } = await fromLoose('te_product_categories')
    .select(CATEGORY_SELECT)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error

  // The two-level nested embed (categories -> links -> catalog) is beyond
  // what supabase-js's select-string type parser resolves without a
  // generated Database type, so widen through unknown before mapping.
  const rows = (data ?? []) as unknown as Record<string, unknown>[]
  return rows
    .map((row) => mapTeProductCategoryFromRow(row))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

/**
 * Insert a new product category.
 *
 * @param input - Category fields
 * @returns Created category id
 */
export async function createTeProductCategory(input: TeProductCategoryInput): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { data, error } = await fromLoose('te_product_categories')
    .insert({
      name: input.name.trim(),
      sort_order: input.sortOrder,
      is_active: input.isActive,
    })
    .select('id')
    .single()

  if (error) throw error
  return String(data.id)
}

/**
 * Update an existing product category.
 *
 * @param id - Category id
 * @param input - Category fields
 */
export async function updateTeProductCategory(id: string, input: TeProductCategoryInput): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { error } = await fromLoose('te_product_categories')
    .update({
      name: input.name.trim(),
      sort_order: input.sortOrder,
      is_active: input.isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) throw error
}

/**
 * Link a product_catalog SKU into a category.
 *
 * @param input - Category id, product_catalog id, and sort order
 * @returns Created link row id
 */
export async function createTeEvaluationProduct(input: TeEvaluationProductInput): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { data, error } = await fromLoose('te_evaluation_products')
    .insert({
      category_id: input.categoryId,
      product_id: input.productId,
      sort_order: input.sortOrder,
    })
    .select('id')
    .single()

  if (error) throw error
  return String(data.id)
}

/**
 * Delete a product category. Nested products are removed via ON DELETE CASCADE.
 *
 * @param id - Category id
 */
export async function deleteTeProductCategory(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { error } = await fromLoose('te_product_categories').delete().eq('id', id)

  if (error) throw error
}

/**
 * Unlink a product from a category.
 *
 * @param linkId - te_evaluation_products row id
 */
export async function deleteTeEvaluationProduct(linkId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { error } = await fromLoose('te_evaluation_products').delete().eq('id', linkId)

  if (error) throw error
}

/**
 * Persist a new global order for product categories (sort_order = 1…n).
 *
 * @param orderedIds - Category ids in display order
 */
export async function reorderTeProductCategories(orderedIds: string[]): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const updatedAt = new Date().toISOString()
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      fromLoose('te_product_categories')
        .update({ sort_order: index + 1, updated_at: updatedAt })
        .eq('id', id),
    ),
  )

  for (const { error } of results) {
    if (error) throw error
  }
}

/**
 * Persist a new order for links within one category (sort_order = 1…n).
 *
 * @param orderedLinkIds - te_evaluation_products row ids in display order
 */
export async function reorderTeEvaluationProducts(orderedLinkIds: string[]): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const updatedAt = new Date().toISOString()
  const results = await Promise.all(
    orderedLinkIds.map((id, index) =>
      fromLoose('te_evaluation_products')
        .update({ sort_order: index + 1, updated_at: updatedAt })
        .eq('id', id),
    ),
  )

  for (const { error } of results) {
    if (error) throw error
  }
}

/**
 * Build a product id → display name map from the admin catalog.
 *
 * @param categories - Loaded categories
 * @returns Lookup map
 */
export function buildTeProductIdLabelMap(categories: TeProductCategory[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const cat of categories) {
    for (const product of cat.products) {
      map[product.id] = product.name
    }
  }
  return map
}

/**
 * Normalize stored product values to product_catalog UUID strings.
 *
 * @param productIds - UUID strings or legacy `{ productId }` objects
 * @returns Deduplicated id list
 */
export function normalizeTeProductIdList(productIds: unknown): string[] {
  if (!Array.isArray(productIds) || productIds.length === 0) return []
  const ids: string[] = []
  for (const entry of productIds) {
    if (typeof entry === 'string' && entry.trim()) {
      ids.push(entry.trim())
      continue
    }
    if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>
      const raw = record.productId ?? record.product_id ?? record.id
      if (typeof raw === 'string' && raw.trim()) {
        ids.push(raw.trim())
      }
    }
  }
  return [...new Set(ids)]
}

/**
 * Resolve stored product ids to comma-separated display names.
 *
 * @param productIds - Stored submission product ids or legacy object rows
 * @param labelMap - Product id → name map
 * @returns Comma-separated labels or em dash when empty
 */
export function formatTeProductIds(
  productIds: unknown,
  labelMap: Record<string, string>,
): string {
  const ids = normalizeTeProductIdList(productIds)
  if (!ids.length) return '—'
  return ids.map((id) => labelMap[id] ?? id).join(', ')
}
