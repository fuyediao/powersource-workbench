/**
 * Supabase CRUD for shop homepage hero banners and featured product picks.
 * Admin UI: Workbench /admin/obm. Consumed by the shop frontend homepage.
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { fromLoose } from '@/lib/supabase-loose'
import {
  productCatalogObmLabel,
  type ProductCatalogItem,
} from '@/services/product-catalog-api'
import { getShopHomePublicUrl } from '@/services/shop-home-storage'

/** One hero carousel slide on the shop homepage. */
export interface ShopHomeBanner {
  id: string
  imagePath: string
  publicUrl: string
  thumbnailPath: string | null
  thumbnailPublicUrl: string | null
  href: string | null
  sortOrder: number
  isActive: boolean
}

export type ShopHomeBannerInput = {
  imagePath: string
  thumbnailPath: string | null
  href: string | null
  sortOrder: number
  isActive: boolean
}

/** One story card on the shop homepage. */
export interface ShopHomeStory {
  id: string
  imagePath: string
  publicUrl: string
  thumbnailPath: string | null
  thumbnailPublicUrl: string | null
  title: string
  href: string | null
  sortOrder: number
  isActive: boolean
}

export type ShopHomeStoryInput = {
  imagePath: string
  thumbnailPath: string | null
  title: string
  href: string | null
  sortOrder: number
  isActive: boolean
}

/** One featured product pick, joined with its product_catalog SKU. */
export interface ShopFeaturedProduct {
  id: string
  productId: string
  sortOrder: number
  itemCode: string
  name: string
  imageUrl: string | null
  customerPriceUsd: number | null
  isActive: boolean
}

const BANNER_SELECT = 'id, image_path, thumbnail_path, href, sort_order, is_active'

const STORY_SELECT = 'id, image_path, thumbnail_path, title, href, sort_order, is_active'

const FEATURED_SELECT =
  'id, product_id, sort_order, ' +
  'product_catalog ( id, item_code, item_name, obm_display_name, obm_image_urls, customer_price_usd, is_active )'

/**
 * Map a raw banner row from PostgREST.
 *
 * @param row - Raw record
 * @returns Normalized banner
 */
function mapBanner(row: Record<string, unknown>): ShopHomeBanner {
  const imagePath = String(row.image_path ?? '')
  const thumbnailPath = typeof row.thumbnail_path === 'string' ? row.thumbnail_path : null
  return {
    id: String(row.id),
    imagePath,
    publicUrl: getShopHomePublicUrl(imagePath) ?? '',
    thumbnailPath,
    thumbnailPublicUrl: thumbnailPath ? getShopHomePublicUrl(thumbnailPath) : null,
    href: typeof row.href === 'string' && row.href.trim() ? row.href.trim() : null,
    sortOrder: typeof row.sort_order === 'number' ? row.sort_order : 0,
    isActive: row.is_active !== false,
  }
}

/**
 * Map a raw story row from PostgREST.
 *
 * @param row - Raw record
 * @returns Normalized story card
 */
function mapStory(row: Record<string, unknown>): ShopHomeStory {
  const imagePath = String(row.image_path ?? '')
  const thumbnailPath = typeof row.thumbnail_path === 'string' ? row.thumbnail_path : null
  return {
    id: String(row.id),
    imagePath,
    publicUrl: getShopHomePublicUrl(imagePath) ?? '',
    thumbnailPath,
    thumbnailPublicUrl: thumbnailPath ? getShopHomePublicUrl(thumbnailPath) : null,
    title: typeof row.title === 'string' ? row.title : '',
    href: typeof row.href === 'string' && row.href.trim() ? row.href.trim() : null,
    sortOrder: typeof row.sort_order === 'number' ? row.sort_order : 0,
    isActive: row.is_active !== false,
  }
}

/**
 * Map a raw featured-product link row (joined with product_catalog).
 *
 * @param row - Raw record
 * @returns Normalized featured product, or null when the catalog SKU is missing
 */
function mapFeaturedProduct(row: Record<string, unknown>): ShopFeaturedProduct | null {
  const catalog = row.product_catalog as Record<string, unknown> | null
  if (!catalog) return null
  const imageUrls = Array.isArray(catalog.obm_image_urls) ? (catalog.obm_image_urls as string[]) : []
  const price = catalog.customer_price_usd
  return {
    id: String(row.id),
    productId: String(row.product_id ?? catalog.id ?? ''),
    sortOrder: typeof row.sort_order === 'number' ? row.sort_order : 0,
    itemCode: String(catalog.item_code ?? ''),
    name: productCatalogObmLabel({
      obmDisplayName: (catalog.obm_display_name as string | null) ?? null,
      itemName: String(catalog.item_name ?? ''),
    }),
    imageUrl: imageUrls[0] ?? null,
    customerPriceUsd:
      typeof price === 'number' ? price : price != null ? Number(price) : null,
    isActive: catalog.is_active !== false,
  }
}

/**
 * Load all hero banners for admin (active and inactive).
 *
 * @returns Banners sorted by sort_order
 */
export async function fetchShopHomeBanners(): Promise<ShopHomeBanner[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { data, error } = await fromLoose('shop_home_banners')
    .select(BANNER_SELECT)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapBanner)
}

/**
 * Insert a new hero banner row.
 *
 * @param input - Banner fields
 * @returns Created banner id
 */
export async function createShopHomeBanner(input: ShopHomeBannerInput): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { data, error } = await fromLoose('shop_home_banners')
    .insert({
      image_path: input.imagePath,
      thumbnail_path: input.thumbnailPath,
      href: input.href,
      sort_order: input.sortOrder,
      is_active: input.isActive,
    })
    .select('id')
    .single()

  if (error) throw error
  return String(data.id)
}

/**
 * Update an existing hero banner row.
 *
 * @param id - Banner id
 * @param fields - Partial fields to update
 */
export async function updateShopHomeBanner(
  id: string,
  fields: Partial<Pick<ShopHomeBannerInput, 'href' | 'sortOrder' | 'isActive'>>,
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const payload: Record<string, unknown> = {}
  if (fields.href !== undefined) payload.href = fields.href
  if (fields.sortOrder !== undefined) payload.sort_order = fields.sortOrder
  if (fields.isActive !== undefined) payload.is_active = fields.isActive

  const { error } = await fromLoose('shop_home_banners').update(payload).eq('id', id)
  if (error) throw error
}

/**
 * Delete a hero banner row (caller removes the Storage objects separately).
 *
 * @param id - Banner id
 */
export async function deleteShopHomeBanner(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { error } = await fromLoose('shop_home_banners').delete().eq('id', id)
  if (error) throw error
}

/**
 * Persist a new global order for banners (sort_order = 1…n).
 *
 * @param orderedIds - Banner ids in display order
 */
export async function reorderShopHomeBanners(orderedIds: string[]): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const results = await Promise.all(
    orderedIds.map((id, index) =>
      fromLoose('shop_home_banners').update({ sort_order: index + 1 }).eq('id', id),
    ),
  )
  for (const { error } of results) {
    if (error) throw error
  }
}

/**
 * Load all story cards for admin (active and inactive).
 *
 * @returns Stories sorted by sort_order
 */
export async function fetchShopHomeStories(): Promise<ShopHomeStory[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { data, error } = await fromLoose('shop_home_stories')
    .select(STORY_SELECT)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapStory)
}

/**
 * Insert a new story card row.
 *
 * @param input - Story fields
 * @returns Created story id
 */
export async function createShopHomeStory(input: ShopHomeStoryInput): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { data, error } = await fromLoose('shop_home_stories')
    .insert({
      image_path: input.imagePath,
      thumbnail_path: input.thumbnailPath,
      title: input.title,
      href: input.href,
      sort_order: input.sortOrder,
      is_active: input.isActive,
    })
    .select('id')
    .single()

  if (error) throw error
  return String(data.id)
}

/**
 * Update an existing story card row.
 *
 * @param id - Story id
 * @param fields - Partial fields to update
 */
export async function updateShopHomeStory(
  id: string,
  fields: Partial<Pick<ShopHomeStoryInput, 'title' | 'href' | 'sortOrder' | 'isActive'>>,
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const payload: Record<string, unknown> = {}
  if (fields.title !== undefined) payload.title = fields.title
  if (fields.href !== undefined) payload.href = fields.href
  if (fields.sortOrder !== undefined) payload.sort_order = fields.sortOrder
  if (fields.isActive !== undefined) payload.is_active = fields.isActive

  const { error } = await fromLoose('shop_home_stories').update(payload).eq('id', id)
  if (error) throw error
}

/**
 * Delete a story card row (caller removes the Storage objects separately).
 *
 * @param id - Story id
 */
export async function deleteShopHomeStory(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { error } = await fromLoose('shop_home_stories').delete().eq('id', id)
  if (error) throw error
}

/**
 * Persist a new global order for story cards (sort_order = 1…n).
 *
 * @param orderedIds - Story ids in display order
 */
export async function reorderShopHomeStories(orderedIds: string[]): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const results = await Promise.all(
    orderedIds.map((id, index) =>
      fromLoose('shop_home_stories').update({ sort_order: index + 1 }).eq('id', id),
    ),
  )
  for (const { error } of results) {
    if (error) throw error
  }
}

/**
 * Load all featured product picks for admin, joined with product_catalog.
 *
 * @returns Featured products sorted by sort_order
 */
export async function fetchShopFeaturedProducts(): Promise<ShopFeaturedProduct[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { data, error } = await fromLoose('shop_featured_products')
    .select(FEATURED_SELECT)
    .order('sort_order', { ascending: true })

  if (error) throw error
  const rows = (data ?? []) as unknown as Record<string, unknown>[]
  return rows
    .map(mapFeaturedProduct)
    .filter((item): item is ShopFeaturedProduct => item !== null)
}

/**
 * Add a product_catalog SKU to the featured list.
 *
 * @param product - Catalog item to feature
 * @param sortOrder - Sort order for the new row
 * @returns Created link row id
 */
export async function createShopFeaturedProduct(
  product: ProductCatalogItem,
  sortOrder: number,
): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { data, error } = await fromLoose('shop_featured_products')
    .insert({ product_id: product.id, sort_order: sortOrder })
    .select('id')
    .single()

  if (error) throw error
  return String(data.id)
}

/**
 * Remove a featured product pick.
 *
 * @param id - shop_featured_products row id
 */
export async function deleteShopFeaturedProduct(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { error } = await fromLoose('shop_featured_products').delete().eq('id', id)
  if (error) throw error
}

/**
 * Persist a new global order for featured products (sort_order = 1…n).
 *
 * @param orderedIds - shop_featured_products row ids in display order
 */
export async function reorderShopFeaturedProducts(orderedIds: string[]): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const results = await Promise.all(
    orderedIds.map((id, index) =>
      fromLoose('shop_featured_products').update({ sort_order: index + 1 }).eq('id', id),
    ),
  )
  for (const { error } of results) {
    if (error) throw error
  }
}

/** Singleton shop footer contact + social links. */
export type ShopFooterSocialChannel =
  | 'instagram'
  | 'facebook'
  | 'youtube'
  | 'tiktok'
  | 'linkedin'
  | 'twitter'
  | 'website'

/** Default Follow-us icon order when CMS has no/partial `social_order`. */
export const DEFAULT_FOOTER_SOCIAL_ORDER: readonly ShopFooterSocialChannel[] = [
  'instagram',
  'facebook',
  'youtube',
  'tiktok',
  'linkedin',
  'twitter',
  'website',
] as const

const FOOTER_SOCIAL_CHANNEL_SET = new Set<string>(DEFAULT_FOOTER_SOCIAL_ORDER)

/**
 * Normalize a social channel order: known keys first (deduped), then append missing.
 *
 * @param order - Raw order from CMS
 * @returns Complete stable channel list
 */
export function normalizeFooterSocialOrder(
  order: readonly string[] | null | undefined,
): ShopFooterSocialChannel[] {
  const seen = new Set<string>()
  const next: ShopFooterSocialChannel[] = []
  for (const raw of order ?? []) {
    if (!FOOTER_SOCIAL_CHANNEL_SET.has(raw) || seen.has(raw)) continue
    seen.add(raw)
    next.push(raw as ShopFooterSocialChannel)
  }
  for (const channel of DEFAULT_FOOTER_SOCIAL_ORDER) {
    if (seen.has(channel)) continue
    next.push(channel)
  }
  return next
}

/**
 * Parse a Postgres text[] / JSON array column into string keys.
 *
 * @param value - Raw column value
 * @returns String list (may be empty)
 */
function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

export interface ShopFooterSettings {
  address: string
  email: string
  phone: string
  instagramUrl: string
  facebookUrl: string
  youtubeUrl: string
  tiktokUrl: string
  linkedinUrl: string
  twitterUrl: string
  websiteUrl: string
  instagramEnabled: boolean
  facebookEnabled: boolean
  youtubeEnabled: boolean
  tiktokEnabled: boolean
  linkedinEnabled: boolean
  twitterEnabled: boolean
  websiteEnabled: boolean
  socialOrder: ShopFooterSocialChannel[]
}

export type ShopFooterSettingsInput = ShopFooterSettings

const FOOTER_SELECT =
  'id, address, email, phone, instagram_url, facebook_url, youtube_url, tiktok_url, linkedin_url, twitter_url, website_url, instagram_enabled, facebook_enabled, youtube_enabled, tiktok_enabled, linkedin_enabled, twitter_enabled, website_enabled, social_order'

/**
 * Coerce a database boolean (or null) to a JS boolean.
 *
 * @param value - Raw column value
 * @param fallback - Default when missing
 * @returns Normalized boolean
 */
function asBool(value: unknown, fallback = true): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/**
 * Map a raw shop_footer_settings row.
 *
 * @param row - Raw record
 * @returns Normalized footer settings
 */
function mapFooterSettings(row: Record<string, unknown>): ShopFooterSettings {
  return {
    address: typeof row.address === 'string' ? row.address : '',
    email: typeof row.email === 'string' ? row.email : '',
    phone: typeof row.phone === 'string' ? row.phone : '',
    instagramUrl: typeof row.instagram_url === 'string' ? row.instagram_url : '',
    facebookUrl: typeof row.facebook_url === 'string' ? row.facebook_url : '',
    youtubeUrl: typeof row.youtube_url === 'string' ? row.youtube_url : '',
    tiktokUrl: typeof row.tiktok_url === 'string' ? row.tiktok_url : '',
    linkedinUrl: typeof row.linkedin_url === 'string' ? row.linkedin_url : '',
    twitterUrl: typeof row.twitter_url === 'string' ? row.twitter_url : '',
    websiteUrl: typeof row.website_url === 'string' ? row.website_url : '',
    instagramEnabled: asBool(row.instagram_enabled),
    facebookEnabled: asBool(row.facebook_enabled),
    youtubeEnabled: asBool(row.youtube_enabled),
    tiktokEnabled: asBool(row.tiktok_enabled),
    linkedinEnabled: asBool(row.linkedin_enabled),
    twitterEnabled: asBool(row.twitter_enabled),
    websiteEnabled: asBool(row.website_enabled),
    socialOrder: normalizeFooterSocialOrder(asStringArray(row.social_order)),
  }
}

/**
 * Empty footer settings used when the singleton row is missing.
 *
 * @returns Blank settings
 */
export function emptyShopFooterSettings(): ShopFooterSettings {
  return {
    address: '',
    email: '',
    phone: '',
    instagramUrl: '',
    facebookUrl: '',
    youtubeUrl: '',
    tiktokUrl: '',
    linkedinUrl: '',
    twitterUrl: '',
    websiteUrl: '',
    instagramEnabled: true,
    facebookEnabled: true,
    youtubeEnabled: true,
    tiktokEnabled: true,
    linkedinEnabled: true,
    twitterEnabled: true,
    websiteEnabled: true,
    socialOrder: [...DEFAULT_FOOTER_SOCIAL_ORDER],
  }
}

/**
 * Load the singleton shop footer settings row.
 *
 * @returns Footer settings (blank when none)
 */
export async function fetchShopFooterSettings(): Promise<ShopFooterSettings> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { data, error } = await fromLoose('shop_footer_settings')
    .select(FOOTER_SELECT)
    .eq('id', 1)
    .maybeSingle()
  if (error) throw error
  if (!data) return emptyShopFooterSettings()
  return mapFooterSettings(data as Record<string, unknown>)
}

/**
 * Upsert the singleton shop footer settings row.
 *
 * @param input - Contact and social URL values
 * @returns Saved settings
 */
export async function upsertShopFooterSettings(
  input: ShopFooterSettingsInput,
): Promise<ShopFooterSettings> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const payload = {
    id: 1,
    address: input.address.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    instagram_url: input.instagramUrl.trim(),
    facebook_url: input.facebookUrl.trim(),
    youtube_url: input.youtubeUrl.trim(),
    tiktok_url: input.tiktokUrl.trim(),
    linkedin_url: input.linkedinUrl.trim(),
    twitter_url: input.twitterUrl.trim(),
    website_url: input.websiteUrl.trim(),
    instagram_enabled: input.instagramEnabled,
    facebook_enabled: input.facebookEnabled,
    youtube_enabled: input.youtubeEnabled,
    tiktok_enabled: input.tiktokEnabled,
    linkedin_enabled: input.linkedinEnabled,
    twitter_enabled: input.twitterEnabled,
    website_enabled: input.websiteEnabled,
    social_order: normalizeFooterSocialOrder(input.socialOrder),
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await fromLoose('shop_footer_settings')
    .upsert(payload, { onConflict: 'id' })
    .select(FOOTER_SELECT)
    .single()
  if (error) throw error
  return mapFooterSettings(data as Record<string, unknown>)
}
