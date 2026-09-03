/**
 * Supabase CRUD for shop Resources CMS (image ZIP packs, PDF documents, blog posts).
 * Admin UI: GeoCRM /admin/obm?tab=resources.
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { fromLoose } from '@/lib/supabase-loose'
import { getShopResourcesPublicUrl } from '@/services/shop-resources-storage'

/** One downloadable image ZIP pack. */
export interface ShopResourceImagePack {
  id: string
  title: string
  description: string | null
  filePath: string
  fileName: string
  fileSize: number
  publicUrl: string
  sortOrder: number
  isActive: boolean
  createdAt: string
}

export type ShopResourceImagePackInput = {
  title: string
  description: string | null
  filePath: string
  fileName: string
  fileSize: number
  sortOrder: number
  isActive: boolean
}

/** One downloadable PDF document. */
export interface ShopResourceDocument {
  id: string
  title: string
  description: string | null
  filePath: string
  fileName: string
  fileSize: number
  publicUrl: string
  sortOrder: number
  isActive: boolean
  createdAt: string
}

export type ShopResourceDocumentInput = {
  title: string
  description: string | null
  filePath: string
  fileName: string
  fileSize: number
  sortOrder: number
  isActive: boolean
}

/** One blog post (markdown body). */
export interface ShopResourceBlogPost {
  id: string
  title: string
  slug: string
  bodyMarkdown: string
  excerpt: string | null
  publishedAt: string | null
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type ShopResourceBlogPostInput = {
  title: string
  slug: string
  bodyMarkdown: string
  excerpt: string | null
  publishedAt: string | null
  sortOrder: number
  isActive: boolean
}

const IMAGE_SELECT =
  'id, title, description, file_path, file_name, file_size, sort_order, is_active, created_at'

const DOC_SELECT =
  'id, title, description, file_path, file_name, file_size, sort_order, is_active, created_at'

const BLOG_SELECT =
  'id, title, slug, body_markdown, excerpt, published_at, sort_order, is_active, created_at, updated_at'

/**
 * Map a raw image-pack row from PostgREST.
 *
 * @param row - Raw record
 * @returns Normalized image pack
 */
function mapImagePack(row: Record<string, unknown>): ShopResourceImagePack {
  const filePath = String(row.file_path ?? '')
  return {
    id: String(row.id),
    title: typeof row.title === 'string' ? row.title : '',
    description: typeof row.description === 'string' && row.description.trim()
      ? row.description.trim()
      : null,
    filePath,
    fileName: typeof row.file_name === 'string' ? row.file_name : '',
    fileSize: typeof row.file_size === 'number' ? row.file_size : Number(row.file_size ?? 0),
    publicUrl: getShopResourcesPublicUrl(filePath) ?? '',
    sortOrder: typeof row.sort_order === 'number' ? row.sort_order : 0,
    isActive: row.is_active !== false,
    createdAt: typeof row.created_at === 'string' ? row.created_at : '',
  }
}

/**
 * Map a raw document row from PostgREST.
 *
 * @param row - Raw record
 * @returns Normalized document
 */
function mapDocument(row: Record<string, unknown>): ShopResourceDocument {
  const filePath = String(row.file_path ?? '')
  return {
    id: String(row.id),
    title: typeof row.title === 'string' ? row.title : '',
    description: typeof row.description === 'string' && row.description.trim()
      ? row.description.trim()
      : null,
    filePath,
    fileName: typeof row.file_name === 'string' ? row.file_name : '',
    fileSize: typeof row.file_size === 'number' ? row.file_size : Number(row.file_size ?? 0),
    publicUrl: getShopResourcesPublicUrl(filePath) ?? '',
    sortOrder: typeof row.sort_order === 'number' ? row.sort_order : 0,
    isActive: row.is_active !== false,
    createdAt: typeof row.created_at === 'string' ? row.created_at : '',
  }
}

/**
 * Map a raw blog post row from PostgREST.
 *
 * @param row - Raw record
 * @returns Normalized blog post
 */
function mapBlogPost(row: Record<string, unknown>): ShopResourceBlogPost {
  return {
    id: String(row.id),
    title: typeof row.title === 'string' ? row.title : '',
    slug: typeof row.slug === 'string' ? row.slug : '',
    bodyMarkdown: typeof row.body_markdown === 'string' ? row.body_markdown : '',
    excerpt: typeof row.excerpt === 'string' && row.excerpt.trim() ? row.excerpt.trim() : null,
    publishedAt: typeof row.published_at === 'string' ? row.published_at : null,
    sortOrder: typeof row.sort_order === 'number' ? row.sort_order : 0,
    isActive: row.is_active !== false,
    createdAt: typeof row.created_at === 'string' ? row.created_at : '',
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : '',
  }
}

/**
 * Build a URL-safe slug from a title string.
 *
 * @param title - Display title
 * @returns Slug candidate
 */
export function slugifyResourceTitle(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || `post-${Date.now()}`
}

/**
 * Format a byte size for admin lists.
 *
 * @param bytes - File size in bytes
 * @returns Human-readable size
 */
export function formatResourceFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

/**
 * Load all image packs for admin (active and inactive).
 *
 * @returns Packs sorted by sort_order
 */
export async function fetchShopResourceImagePacks(): Promise<ShopResourceImagePack[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }
  const { data, error } = await fromLoose('shop_resource_image_packs')
    .select(IMAGE_SELECT)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapImagePack)
}

/**
 * Insert a new image pack row.
 *
 * @param input - Pack fields
 * @returns Created id
 */
export async function createShopResourceImagePack(
  input: ShopResourceImagePackInput,
): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }
  const { data, error } = await fromLoose('shop_resource_image_packs')
    .insert({
      title: input.title,
      description: input.description,
      file_path: input.filePath,
      file_name: input.fileName,
      file_size: input.fileSize,
      sort_order: input.sortOrder,
      is_active: input.isActive,
    })
    .select('id')
    .single()
  if (error) throw error
  return String(data.id)
}

/**
 * Update an image pack row.
 *
 * @param id - Pack id
 * @param fields - Partial fields
 */
export async function updateShopResourceImagePack(
  id: string,
  fields: Partial<Pick<ShopResourceImagePackInput, 'title' | 'description' | 'sortOrder' | 'isActive'>>,
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (fields.title !== undefined) payload.title = fields.title
  if (fields.description !== undefined) payload.description = fields.description
  if (fields.sortOrder !== undefined) payload.sort_order = fields.sortOrder
  if (fields.isActive !== undefined) payload.is_active = fields.isActive
  const { error } = await fromLoose('shop_resource_image_packs').update(payload).eq('id', id)
  if (error) throw error
}

/**
 * Delete an image pack row (caller removes Storage object separately).
 *
 * @param id - Pack id
 */
export async function deleteShopResourceImagePack(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }
  const { error } = await fromLoose('shop_resource_image_packs').delete().eq('id', id)
  if (error) throw error
}

/**
 * Persist a new global order for image packs.
 *
 * @param orderedIds - Pack ids in display order
 */
export async function reorderShopResourceImagePacks(orderedIds: string[]): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      fromLoose('shop_resource_image_packs').update({ sort_order: index + 1 }).eq('id', id),
    ),
  )
  for (const { error } of results) {
    if (error) throw error
  }
}

/**
 * Load all documents for admin.
 *
 * @returns Documents sorted by sort_order
 */
export async function fetchShopResourceDocuments(): Promise<ShopResourceDocument[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }
  const { data, error } = await fromLoose('shop_resource_documents')
    .select(DOC_SELECT)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapDocument)
}

/**
 * Insert a new document row.
 *
 * @param input - Document fields
 * @returns Created id
 */
export async function createShopResourceDocument(
  input: ShopResourceDocumentInput,
): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }
  const { data, error } = await fromLoose('shop_resource_documents')
    .insert({
      title: input.title,
      description: input.description,
      file_path: input.filePath,
      file_name: input.fileName,
      file_size: input.fileSize,
      sort_order: input.sortOrder,
      is_active: input.isActive,
    })
    .select('id')
    .single()
  if (error) throw error
  return String(data.id)
}

/**
 * Update a document row.
 *
 * @param id - Document id
 * @param fields - Partial fields
 */
export async function updateShopResourceDocument(
  id: string,
  fields: Partial<Pick<ShopResourceDocumentInput, 'title' | 'description' | 'sortOrder' | 'isActive'>>,
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (fields.title !== undefined) payload.title = fields.title
  if (fields.description !== undefined) payload.description = fields.description
  if (fields.sortOrder !== undefined) payload.sort_order = fields.sortOrder
  if (fields.isActive !== undefined) payload.is_active = fields.isActive
  const { error } = await fromLoose('shop_resource_documents').update(payload).eq('id', id)
  if (error) throw error
}

/**
 * Delete a document row.
 *
 * @param id - Document id
 */
export async function deleteShopResourceDocument(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }
  const { error } = await fromLoose('shop_resource_documents').delete().eq('id', id)
  if (error) throw error
}

/**
 * Persist a new global order for documents.
 *
 * @param orderedIds - Document ids in display order
 */
export async function reorderShopResourceDocuments(orderedIds: string[]): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      fromLoose('shop_resource_documents').update({ sort_order: index + 1 }).eq('id', id),
    ),
  )
  for (const { error } of results) {
    if (error) throw error
  }
}

/**
 * Load all blog posts for admin.
 *
 * @returns Posts sorted by sort_order
 */
export async function fetchShopResourceBlogPosts(): Promise<ShopResourceBlogPost[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }
  const { data, error } = await fromLoose('shop_resource_blog_posts')
    .select(BLOG_SELECT)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapBlogPost)
}

/**
 * Insert a new blog post row.
 *
 * @param input - Post fields
 * @returns Created id
 */
export async function createShopResourceBlogPost(
  input: ShopResourceBlogPostInput,
): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }
  const { data, error } = await fromLoose('shop_resource_blog_posts')
    .insert({
      title: input.title,
      slug: input.slug,
      body_markdown: input.bodyMarkdown,
      excerpt: input.excerpt,
      published_at: input.publishedAt,
      sort_order: input.sortOrder,
      is_active: input.isActive,
    })
    .select('id')
    .single()
  if (error) throw error
  return String(data.id)
}

/**
 * Update a blog post row.
 *
 * @param id - Post id
 * @param fields - Partial fields
 */
export async function updateShopResourceBlogPost(
  id: string,
  fields: Partial<
    Pick<
      ShopResourceBlogPostInput,
      'title' | 'slug' | 'bodyMarkdown' | 'excerpt' | 'publishedAt' | 'sortOrder' | 'isActive'
    >
  >,
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (fields.title !== undefined) payload.title = fields.title
  if (fields.slug !== undefined) payload.slug = fields.slug
  if (fields.bodyMarkdown !== undefined) payload.body_markdown = fields.bodyMarkdown
  if (fields.excerpt !== undefined) payload.excerpt = fields.excerpt
  if (fields.publishedAt !== undefined) payload.published_at = fields.publishedAt
  if (fields.sortOrder !== undefined) payload.sort_order = fields.sortOrder
  if (fields.isActive !== undefined) payload.is_active = fields.isActive
  const { error } = await fromLoose('shop_resource_blog_posts').update(payload).eq('id', id)
  if (error) throw error
}

/**
 * Delete a blog post row.
 *
 * @param id - Post id
 */
export async function deleteShopResourceBlogPost(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }
  const { error } = await fromLoose('shop_resource_blog_posts').delete().eq('id', id)
  if (error) throw error
}

/**
 * Persist a new global order for blog posts.
 *
 * @param orderedIds - Post ids in display order
 */
export async function reorderShopResourceBlogPosts(orderedIds: string[]): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      fromLoose('shop_resource_blog_posts').update({ sort_order: index + 1 }).eq('id', id),
    ),
  )
  for (const { error } of results) {
    if (error) throw error
  }
}
