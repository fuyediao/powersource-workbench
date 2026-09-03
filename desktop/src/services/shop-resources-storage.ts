/**
 * Supabase Storage helpers for shop Resources CMS files (ZIP packs, PDFs).
 * Paths: images/{uuid}.zip, documents/{uuid}.pdf. Admin UI: /admin/obm?tab=resources.
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'

/** Public bucket for shop resource downloads. */
export const SHOP_RESOURCES_BUCKET = 'shop-resources'

export type ShopResourcesFileUploadResult = {
  publicUrl: string
  path: string
  fileName: string
  fileSize: number
}

/**
 * New UUID segment for the uploaded object name.
 *
 * @returns UUID or fallback id
 */
function newObjectId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Public URL for an object path in the shop-resources bucket.
 *
 * @param path - Object path
 * @returns Public URL or null when Storage is not configured
 */
export function getShopResourcesPublicUrl(path: string): string | null {
  if (!isSupabaseConfigured || !supabase) return null
  const { data } = supabase.storage.from(SHOP_RESOURCES_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

/**
 * Whether a file looks like a ZIP archive by name or MIME.
 *
 * @param file - Browser File
 * @returns True when ZIP
 */
export function isZipFile(file: File): boolean {
  const name = file.name.toLowerCase()
  if (name.endsWith('.zip')) return true
  const type = file.type.toLowerCase()
  return (
    type === 'application/zip' ||
    type === 'application/x-zip-compressed' ||
    type === 'application/octet-stream'
  )
}

/**
 * Whether a file looks like a PDF by name or MIME.
 *
 * @param file - Browser File
 * @returns True when PDF
 */
export function isPdfFile(file: File): boolean {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) return true
  return file.type.toLowerCase() === 'application/pdf'
}

/**
 * Whether a file looks like a Markdown document by name or MIME.
 *
 * @param file - Browser File
 * @returns True when Markdown
 */
export function isMarkdownFile(file: File): boolean {
  const name = file.name.toLowerCase()
  if (name.endsWith('.md') || name.endsWith('.markdown')) return true
  const type = file.type.toLowerCase()
  return type === 'text/markdown' || type === 'text/x-markdown' || type === 'text/plain'
}

/**
 * Upload a raw file into the shop-resources bucket under the given folder.
 *
 * @param file - Source file
 * @param folder - Bucket subfolder (`images` or `documents`)
 * @param extension - Forced extension without dot (e.g. `zip`, `pdf`)
 * @param contentType - Content-Type for Storage
 * @returns Paths/URLs for the stored file, or an error
 */
export async function uploadShopResourcesFile(
  file: File,
  folder: 'images' | 'documents',
  extension: string,
  contentType: string,
): Promise<ShopResourcesFileUploadResult | { error: string }> {
  if (!isSupabaseConfigured || !supabase) return { error: 'Storage is not configured' }

  const objectId = newObjectId()
  const path = `${folder}/${objectId}.${extension}`
  const { error } = await supabase.storage.from(SHOP_RESOURCES_BUCKET).upload(path, file, {
    contentType,
    upsert: false,
  })
  if (error) return { error: error.message }

  return {
    publicUrl: getShopResourcesPublicUrl(path) ?? '',
    path,
    fileName: file.name,
    fileSize: file.size,
  }
}

/**
 * Remove one or more objects from the shop-resources bucket.
 *
 * @param paths - Object paths to delete
 */
export async function removeShopResourcesObjects(paths: string[]): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return
  const cleaned = paths.map((p) => p.trim()).filter(Boolean)
  if (cleaned.length === 0) return
  await supabase.storage.from(SHOP_RESOURCES_BUCKET).remove(cleaned)
}
