/**
 * Supabase reads/writes for the ERP product electronic catalog (`product_catalog`)
 * plus workbench-api ERP sync (`POST /erp/products/sync`).
 */

import { resolveApiBaseUrl } from '@/config/deployment-urls'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { fromLoose } from '@/lib/supabase-loose'

/** One OBM specification label/value row. */
export type ProductCatalogObmSpec = {
  label: string
  value: string
}

/** One product_catalog row mirrored from ERP GetItemStock. */
export type ProductCatalogItem = {
  id: string
  itemCode: string
  itemName: string
  /** T&E customer-facing alias; not overwritten by ERP sync. Distinct from obmDisplayName. */
  displayName: string | null
  /** Internal CRM remarks; not overwritten by ERP sync. */
  notes: string | null
  itemSpec: string | null
  unit: string | null
  qty: number
  /** ERP-owned USD price for customer purchasing. */
  customerPriceUsd: number | null
  /** ERP-owned U.S. retail MSRP for T&E pricing. */
  tePriceUsd: number | null
  isActive: boolean
  syncedAt: string | null
  /** OBM storefront display name; distinct from displayName (T&E). */
  obmDisplayName: string | null
  /** OBM gallery public image URLs (ordered). */
  obmImageUrls: string[]
  /** OBM product intro / description. */
  obmIntro: string | null
  /** OBM long-form product details (paragraph). */
  obmDetails: string | null
  /** OBM specification rows. */
  obmSpecs: ProductCatalogObmSpec[]
  /** OBM feature copy (paragraph). */
  obmFeatures: string | null
  /** OBM warnings / legal disclaimer. */
  obmWarnings: string | null
}

type ProductCatalogRow = {
  id: string
  item_code: string
  item_name: string
  display_name: string | null
  notes: string | null
  item_spec: string | null
  unit: string | null
  qty: number | string
  customer_price_usd: number | string | null
  te_price_usd: number | string | null
  is_active: boolean
  synced_at: string | null
  obm_display_name?: string | null
  obm_image_urls?: string[] | null
  obm_intro?: string | null
  obm_details?: string | null
  obm_specs?: unknown
  /** text (paragraph); legacy text[] may appear until migration is applied. */
  obm_features?: string | string[] | null
  obm_warnings?: string | null
}

export const PRODUCT_CATALOG_PAGE_SIZE = 20

const CATALOG_SELECT =
  'id, item_code, item_name, display_name, notes, item_spec, unit, qty, customer_price_usd, te_price_usd, is_active, synced_at, obm_display_name, obm_image_urls, obm_intro, obm_details, obm_specs, obm_features, obm_warnings'

/** Result of a manual product catalog sync. */
export type ProductCatalogSyncResult = {
  upserted: number
  deactivated: number
}

/**
 * Prefer the customer-facing alias when set; otherwise the ERP item name.
 * @param item - Catalog row.
 * @returns Label for T&E / customer UI.
 */
export function productCatalogCustomerLabel(
  item: Pick<ProductCatalogItem, 'displayName' | 'itemName'>,
): string {
  const alias = item.displayName?.trim()
  if (alias) {
    return alias
  }
  return item.itemName
}

/**
 * Prefer the OBM storefront alias when set; otherwise the ERP item name.
 * Does not use T&E `displayName`.
 * @param item - Catalog row.
 * @returns Label for OBM UI.
 */
export function productCatalogObmLabel(
  item: Pick<ProductCatalogItem, 'obmDisplayName' | 'itemName'>,
): string {
  const alias = item.obmDisplayName?.trim()
  if (alias) {
    return alias
  }
  return item.itemName
}

/**
 * Normalize jsonb/array specs from PostgREST into typed rows.
 * @param raw - Database value.
 * @returns Spec rows.
 */
function mapObmSpecs(raw: unknown): ProductCatalogObmSpec[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const out: ProductCatalogObmSpec[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const record = entry as Record<string, unknown>
    const label = typeof record.label === 'string' ? record.label.trim() : ''
    const value = typeof record.value === 'string' ? record.value.trim() : ''
    if (!label && !value) {
      continue
    }
    out.push({ label, value })
  }
  return out
}

/**
 * Normalize a text[] column into a string array.
 * @param raw - Database value.
 * @returns Trimmed non-empty strings.
 */
function mapStringArray(raw: string[] | null | undefined): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw.map((s) => String(s ?? '').trim()).filter((s) => s.length > 0)
}

/**
 * Normalize OBM features from PostgREST (text, or legacy text[]).
 * @param raw - Database value.
 * @returns Trimmed paragraph or null.
 */
function mapObmFeatures(raw: string | string[] | null | undefined): string | null {
  if (Array.isArray(raw)) {
    const joined = raw
      .map((s) => String(s ?? '').trim())
      .filter((s) => s.length > 0)
      .join('\n')
    return joined.length > 0 ? joined : null
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim()
  }
  return null
}

/**
 * Map a PostgREST row to the UI model.
 * @param row - Database row.
 * @returns Product catalog item.
 */
function mapRow(row: ProductCatalogRow): ProductCatalogItem {
  const qty = typeof row.qty === 'number' ? row.qty : Number(row.qty)
  const customerPriceUsd =
    row.customer_price_usd == null ? null : Number(row.customer_price_usd)
  const tePriceUsd = row.te_price_usd == null ? null : Number(row.te_price_usd)
  const displayName =
    typeof row.display_name === 'string' && row.display_name.trim()
      ? row.display_name.trim()
      : null
  const notes =
    typeof row.notes === 'string' && row.notes.trim() ? row.notes.trim() : null
  const obmDisplayName =
    typeof row.obm_display_name === 'string' && row.obm_display_name.trim()
      ? row.obm_display_name.trim()
      : null
  const obmIntro =
    typeof row.obm_intro === 'string' && row.obm_intro.trim()
      ? row.obm_intro.trim()
      : null
  const obmDetails =
    typeof row.obm_details === 'string' && row.obm_details.trim()
      ? row.obm_details.trim()
      : null
  const obmWarnings =
    typeof row.obm_warnings === 'string' && row.obm_warnings.trim()
      ? row.obm_warnings.trim()
      : null
  return {
    id: row.id,
    itemCode: row.item_code,
    itemName: row.item_name,
    displayName,
    notes,
    itemSpec: row.item_spec,
    unit: row.unit,
    qty: Number.isFinite(qty) ? qty : 0,
    customerPriceUsd: Number.isFinite(customerPriceUsd) ? customerPriceUsd : null,
    tePriceUsd: Number.isFinite(tePriceUsd) ? tePriceUsd : null,
    isActive: row.is_active,
    syncedAt: row.synced_at,
    obmDisplayName,
    obmImageUrls: mapStringArray(row.obm_image_urls),
    obmIntro,
    obmDetails,
    obmSpecs: mapObmSpecs(row.obm_specs),
    obmFeatures: mapObmFeatures(row.obm_features),
    obmWarnings,
  }
}

export type ListProductCatalogParams = {
  search?: string
  page?: number
  pageSize?: number
  /** When true, only active rows (legacy; prefer `status`). */
  activeOnly?: boolean
  /** Filter by catalog status. Default / `all` = no filter. */
  status?: 'all' | 'active' | 'inactive'
}

export type ListProductCatalogResult = {
  items: ProductCatalogItem[]
  total: number
}

/**
 * List product catalog rows with optional search and pagination.
 * @param params - Filter and page options.
 * @returns Page of items plus total count.
 */
export async function listProductCatalog(
  params: ListProductCatalogParams = {},
): Promise<ListProductCatalogResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.max(1, params.pageSize ?? PRODUCT_CATALOG_PAGE_SIZE)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  const search = params.search?.trim() ?? ''

  let query = fromLoose('product_catalog')
    .select(CATALOG_SELECT, { count: 'exact' })
    .order('item_code', { ascending: true })
    .range(from, to)

  if (params.status === 'active' || params.activeOnly) {
    query = query.eq('is_active', true)
  } else if (params.status === 'inactive') {
    query = query.eq('is_active', false)
  }

  if (search) {
    const escaped = search.replace(/[%_,]/g, '\\$&')
    query = query.or(
      `item_code.ilike.%${escaped}%,item_name.ilike.%${escaped}%,display_name.ilike.%${escaped}%,obm_display_name.ilike.%${escaped}%,item_spec.ilike.%${escaped}%`,
    )
  }

  const { data, error, count } = await query
  if (error) {
    throw new Error(error.message)
  }

  const rows = (data ?? []) as ProductCatalogRow[]
  return {
    items: rows.map(mapRow),
    total: count ?? rows.length,
  }
}

/**
 * Lists every product code, including active and inactive catalog rows.
 * @returns Product codes ordered by their stored catalog code.
 */
export async function listAllProductCatalogCodes(): Promise<string[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const pageSize = 1000
  const productCodes: string[] = []
  let from = 0

  while (true) {
    const { data, error } = await fromLoose('product_catalog')
      .select('item_code')
      .order('item_code', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) {
      throw new Error(error.message)
    }

    const rows = (data ?? []) as Array<{ item_code: string | null }>
    productCodes.push(
      ...rows
        .map((row) => row.item_code?.trim() ?? '')
        .filter((itemCode) => itemCode.length > 0),
    )

    if (rows.length < pageSize) {
      return productCodes
    }
    from += pageSize
  }
}

/**
 * Load one product catalog row by ERP ItemId (primary key).
 * @param id - product_catalog.id (NTNA ItemId UUID).
 * @returns Mapped item or null when missing.
 */
export async function getProductCatalogById(
  id: string,
): Promise<ProductCatalogItem | null> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const trimmed = id.trim()
  if (!trimmed) {
    return null
  }

  const { data, error } = await fromLoose('product_catalog')
    .select(CATALOG_SELECT)
    .eq('id', trimmed)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }
  if (!data) {
    return null
  }
  return mapRow(data as ProductCatalogRow)
}

/**
 * Update CRM-owned catalog fields (T&E display name + notes).
 * Empty strings clear the values. ERP sync does not overwrite these columns.
 * @param id - product_catalog.id.
 * @param fields - Editable T&E / CRM fields.
 */
export async function updateProductCatalogCrmFields(
  id: string,
  fields: { displayName: string; notes: string },
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const displayName = fields.displayName.trim()
  const notes = fields.notes.trim()
  const { error } = await fromLoose('product_catalog')
    .update({
      display_name: displayName.length > 0 ? displayName : null,
      notes: notes.length > 0 ? notes : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id.trim())

  if (error) {
    throw new Error(error.message)
  }
}

export type ProductCatalogObmFieldsUpdate = {
  displayName: string
  imageUrls: string[]
  intro: string
  details: string
  specs: ProductCatalogObmSpec[]
  features: string
  warnings: string
}

/**
 * Update CRM-owned OBM storefront fields on a catalog row.
 * ERP sync does not overwrite these columns.
 * @param id - product_catalog.id.
 * @param fields - OBM display name, gallery, intro, details, specs, features, and warnings.
 */
export async function updateProductCatalogObmFields(
  id: string,
  fields: ProductCatalogObmFieldsUpdate,
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const displayName = fields.displayName.trim()
  const imageUrls = fields.imageUrls.map((u) => u.trim()).filter((u) => u.length > 0)
  const intro = fields.intro.trim()
  const details = fields.details.trim()
  const specs = fields.specs
    .map((row) => ({
      label: row.label.trim(),
      value: row.value.trim(),
    }))
    .filter((row) => row.label.length > 0 || row.value.length > 0)
  const features = fields.features.trim()
  const warnings = fields.warnings.trim()

  const { error } = await fromLoose('product_catalog')
    .update({
      obm_display_name: displayName.length > 0 ? displayName : null,
      obm_image_urls: imageUrls,
      obm_intro: intro.length > 0 ? intro : null,
      obm_details: details.length > 0 ? details : null,
      obm_specs: specs,
      obm_features: features.length > 0 ? features : null,
      obm_warnings: warnings.length > 0 ? warnings : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id.trim())

  if (error) {
    throw new Error(error.message)
  }
}

/**
 * Returns true when the unified Workbench API origin is configured.
 * @returns Whether product catalog sync can run.
 */
export function isProductCatalogApiConfigured(): boolean {
  return Boolean(resolveApiBaseUrl())
}

/**
 * Supabase access token for authenticated workbench-api calls.
 * @returns Access token or null when not signed in.
 */
async function getToken(): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null
  }

  const { error: userError } = await supabase.auth.getUser()
  if (userError) {
    const { data: refreshed, error: refError } = await supabase.auth.refreshSession()
    if (refError || !refreshed.session?.access_token) {
      return null
    }
    return refreshed.session.access_token
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    const { data: refreshed, error: refError } = await supabase.auth.refreshSession()
    if (refError || !refreshed.session?.access_token) {
      return null
    }
    return refreshed.session.access_token
  }

  const exp = session.expires_at
  if (exp != null && exp * 1000 < Date.now() + 120_000) {
    const { data: refreshed, error } = await supabase.auth.refreshSession()
    if (!error && refreshed.session?.access_token) {
      return refreshed.session.access_token
    }
  }

  return session.access_token
}

/**
 * Authenticated JSON fetch to workbench-api.
 * @param path - Absolute API path.
 * @param init - Fetch init options.
 * @returns Parsed JSON body.
 */
async function workbenchFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = resolveApiBaseUrl()
  if (!base) {
    throw new Error('VITE_DEPLOYMENT_DOMAIN is not configured')
  }

  const runFetch = async (accessToken: string | null): Promise<Response> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string>),
    }
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }
    return fetch(`${base}${path}`, { ...init, headers, mode: 'cors' })
  }

  const authRoundsMax = 3
  let res!: Response
  for (let authRound = 0; authRound < authRoundsMax; authRound++) {
    const token = await getToken()
    try {
      res = await runFetch(token)
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'Network error'
      throw new Error(`${reason}. Cannot reach workbench-api (${base}).`)
    }
    if (res.status !== 401 || !supabase) {
      break
    }
    await supabase.auth.refreshSession()
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: res.statusText }))) as {
      error?: string
    }
    throw new Error(body.error ?? `Request failed: ${res.status}`)
  }

  return res.json() as Promise<T>
}

/**
 * Pull GetItemStock and GetItemPrice from ERP and upsert into product_catalog.
 * @returns Sync counts.
 */
export async function syncProductCatalog(): Promise<ProductCatalogSyncResult> {
  const data = await workbenchFetch<{ ok: boolean; result: ProductCatalogSyncResult }>(
    '/erp/products/sync',
    { method: 'POST' },
  )
  return data.result
}
