import { fromLoose } from '@/lib/supabase-loose'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

/**
 * A selectable OBM catalog SKU: an `obm_products` link row joined with its
 * `product_catalog` SKU. `id` is `product_catalog.id` (ERP ItemId); `linkId` is
 * the underlying `obm_products` row id (used for unlink/reorder).
 */
export interface ObmLinkedProduct {
  id: string
  linkId: string
  categoryId: string
  itemCode: string
  /** OBM-facing label (`obm_display_name`, else ERP `item_name`). */
  name: string
  /** ERP item_name (always the catalog source name). */
  itemName: string
  /** Internal CRM notes from product_catalog. */
  notes: string | null
  /** Whether the linked product_catalog SKU is currently active. */
  isActive: boolean
  sortOrder: number
}

/** Category heading grouping OBM storefront products. */
export interface ObmProductCategory {
  id: string
  name: string
  sortOrder: number
  isActive: boolean
  products: ObmLinkedProduct[]
}

export type ObmProductCategoryInput = {
  name: string
  sortOrder: number
  isActive: boolean
}

/** Link an existing product_catalog SKU into an OBM category. */
export type ObmLinkedProductInput = {
  categoryId: string
  productId: string
  sortOrder: number
}

const CATEGORY_SELECT =
  'id, name, sort_order, is_active, ' +
  'obm_products ( id, category_id, sort_order, product_id, ' +
  'product_catalog ( id, item_code, item_name, obm_display_name, notes, is_active ) )'

/**
 * Prefer OBM display name when set; otherwise ERP item_name.
 * Does not use T&E `display_name`.
 *
 * @param catalog - Embedded product_catalog fields
 * @returns OBM-facing label
 */
function catalogObmName(catalog: Record<string, unknown>): string {
  const alias = typeof catalog.obm_display_name === 'string' ? catalog.obm_display_name.trim() : ''
  if (alias) return alias
  return String(catalog.item_name ?? '')
}

/**
 * Map a nested link row (joined with its product_catalog SKU) from PostgREST.
 *
 * @param row - Raw link record
 * @returns Normalized product
 */
function mapProduct(row: Record<string, unknown>): ObmLinkedProduct {
  const catalog = (row.product_catalog ?? {}) as Record<string, unknown>
  const itemName = String(catalog.item_name ?? '')
  const notesRaw = typeof catalog.notes === 'string' ? catalog.notes.trim() : ''
  return {
    id: String(catalog.id ?? row.product_id ?? ''),
    linkId: String(row.id),
    categoryId: String(row.category_id ?? ''),
    itemCode: String(catalog.item_code ?? ''),
    name: catalogObmName(catalog),
    itemName,
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
export function mapObmProductCategoryFromRow(row: Record<string, unknown>): ObmProductCategory {
  const productsRaw = Array.isArray(row.obm_products) ? row.obm_products : []
  const products = (productsRaw as Record<string, unknown>[])
    .map(mapProduct)
    // Hide SKUs deactivated in product_catalog (ERP sync).
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
 * Load all OBM product categories with nested products for admin.
 *
 * @returns Categories sorted by sort_order
 */
export async function fetchObmProductCategories(): Promise<ObmProductCategory[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { data, error } = await fromLoose('obm_product_categories')
    .select(CATEGORY_SELECT)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error

  const rows = (data ?? []) as unknown as Record<string, unknown>[]
  return rows
    .map((row) => mapObmProductCategoryFromRow(row))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

/**
 * Insert a new OBM product category.
 *
 * @param input - Category fields
 * @returns Created category id
 */
export async function createObmProductCategory(input: ObmProductCategoryInput): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { data, error } = await fromLoose('obm_product_categories')
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
 * Update an existing OBM product category.
 *
 * @param id - Category id
 * @param input - Category fields
 */
export async function updateObmProductCategory(id: string, input: ObmProductCategoryInput): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { error } = await fromLoose('obm_product_categories')
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
 * Link a product_catalog SKU into an OBM category.
 *
 * @param input - Category id, product_catalog id, and sort order
 * @returns Created link row id
 */
export async function createObmLinkedProduct(input: ObmLinkedProductInput): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { data, error } = await fromLoose('obm_products')
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
export async function deleteObmProductCategory(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { error } = await fromLoose('obm_product_categories').delete().eq('id', id)

  if (error) throw error
}

/**
 * Unlink a product from a category.
 *
 * @param linkId - obm_products row id
 */
export async function deleteObmLinkedProduct(linkId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { error } = await fromLoose('obm_products').delete().eq('id', linkId)

  if (error) throw error
}

/**
 * Persist a new global order for product categories (sort_order = 1…n).
 *
 * @param orderedIds - Category ids in display order
 */
export async function reorderObmProductCategories(orderedIds: string[]): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const updatedAt = new Date().toISOString()
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      fromLoose('obm_product_categories')
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
 * @param orderedLinkIds - obm_products row ids in display order
 */
export async function reorderObmLinkedProducts(orderedLinkIds: string[]): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const updatedAt = new Date().toISOString()
  const results = await Promise.all(
    orderedLinkIds.map((id, index) =>
      fromLoose('obm_products')
        .update({ sort_order: index + 1, updated_at: updatedAt })
        .eq('id', id),
    ),
  )

  for (const { error } of results) {
    if (error) throw error
  }
}

/**
 * Build a product id → OBM display name map from loaded categories.
 *
 * @param categories - Loaded categories
 * @returns Lookup map
 */
export function buildObmProductIdLabelMap(categories: ObmProductCategory[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const cat of categories) {
    for (const product of cat.products) {
      map[product.id] = product.name
    }
  }
  return map
}
