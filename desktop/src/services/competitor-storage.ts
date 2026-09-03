/**
 * Competitor shop / product photo uploads (Vue `competitorStorage` parity).
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { convertImageToWebP, isImageSizeWithinLimit } from '@/utils/image-upload'

/** Supabase Storage bucket for competitor shop on-site photos (must be public). */
export const COMPETITOR_SHOP_PHOTOS_BUCKET = 'competitor-shop-photos'

/** Supabase Storage bucket for competitor product photos (must be public). */
export const COMPETITOR_PRODUCT_PHOTOS_BUCKET = 'competitor-product-photos'

/** Maximum image size before WebP conversion (5 MB). */
const MAX_PHOTO_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

/**
 * Sanitizes a filename for a Storage object path.
 * @param name - Original filename.
 * @returns Path-safe filename.
 */
function sanitizeName(name: string): string {
  return name.replace(/[/\\?#&"'\s]+/g, '_')
}

/**
 * Builds a shop photo path: `{groupId}/{shopId}/{timestamp}-{name}`.
 * @param groupId - Group UUID.
 * @param shopId - Shop UUID.
 * @param file - File being uploaded.
 * @returns Storage object path.
 */
function buildShopPath(groupId: string, shopId: string, file: File): string {
  return `${groupId}/${shopId}/${Date.now()}-${sanitizeName(file.name)}`
}

/**
 * Builds a product photo path: `{groupId}/{shopId}/{lineId}-{timestamp}-{name}`.
 * @param groupId - Group UUID.
 * @param shopId - Shop UUID.
 * @param lineId - Line UUID.
 * @param file - File being uploaded.
 * @returns Storage object path.
 */
function buildProductPath(
  groupId: string,
  shopId: string,
  lineId: string,
  file: File,
): string {
  return `${groupId}/${shopId}/${lineId}-${Date.now()}-${sanitizeName(file.name)}`
}

/**
 * Uploads a competitor shop site photo (WebP) to `competitor-shop-photos`.
 * @param groupId - Group UUID.
 * @param shopId - Shop UUID.
 * @param file - Source image.
 * @returns Public URL on success, or an error object.
 */
export async function uploadCompetitorShopPhoto(
  groupId: string,
  shopId: string,
  file: File,
): Promise<{ publicUrl: string } | { error: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Storage is not configured' }
  }
  if (!groupId || !shopId) {
    return { error: 'groupId and shopId are required' }
  }
  if (!file.type.startsWith('image/')) {
    return { error: 'not_image' }
  }
  if (!isImageSizeWithinLimit(file, MAX_PHOTO_IMAGE_SIZE_BYTES)) {
    return { error: 'file_too_large' }
  }
  try {
    const webpFile = await convertImageToWebP(file)
    const path = buildShopPath(groupId, shopId, webpFile)
    const { error: uploadError } = await supabase.storage
      .from(COMPETITOR_SHOP_PHOTOS_BUCKET)
      .upload(path, webpFile, { contentType: 'image/webp', upsert: false })
    if (uploadError) {
      console.error('[competitor-storage] shop photo upload:', uploadError)
      return { error: uploadError.message ?? 'Upload failed' }
    }
    const { data } = supabase.storage
      .from(COMPETITOR_SHOP_PHOTOS_BUCKET)
      .getPublicUrl(path)
    return { publicUrl: data.publicUrl }
  } catch (err) {
    console.warn('[competitor-storage] shop photo upload failed:', err)
    return { error: err instanceof Error ? err.message : 'Upload failed' }
  }
}

/**
 * Uploads a competitor product photo (WebP) to `competitor-product-photos`.
 * @param groupId - Group UUID.
 * @param shopId - Shop UUID.
 * @param lineId - Line UUID.
 * @param file - Source image.
 * @returns Public URL on success, or an error object.
 */
export async function uploadCompetitorProductPhoto(
  groupId: string,
  shopId: string,
  lineId: string,
  file: File,
): Promise<{ publicUrl: string } | { error: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Storage is not configured' }
  }
  if (!groupId || !shopId || !lineId) {
    return { error: 'groupId, shopId and lineId are required' }
  }
  if (!file.type.startsWith('image/')) {
    return { error: 'not_image' }
  }
  if (!isImageSizeWithinLimit(file, MAX_PHOTO_IMAGE_SIZE_BYTES)) {
    return { error: 'file_too_large' }
  }
  try {
    const webpFile = await convertImageToWebP(file)
    const path = buildProductPath(groupId, shopId, lineId, webpFile)
    const { error: uploadError } = await supabase.storage
      .from(COMPETITOR_PRODUCT_PHOTOS_BUCKET)
      .upload(path, webpFile, { contentType: 'image/webp', upsert: false })
    if (uploadError) {
      console.error('[competitor-storage] product photo upload:', uploadError)
      return { error: uploadError.message ?? 'Upload failed' }
    }
    const { data } = supabase.storage
      .from(COMPETITOR_PRODUCT_PHOTOS_BUCKET)
      .getPublicUrl(path)
    return { publicUrl: data.publicUrl }
  } catch (err) {
    console.warn('[competitor-storage] product photo upload failed:', err)
    return { error: err instanceof Error ? err.message : 'Upload failed' }
  }
}

/**
 * Deletes a competitor Storage object by its public URL.
 * @param url - Public URL of the object to remove.
 * @returns `{ ok: true }` on success or no-op, or an error object.
 */
export async function deleteCompetitorStorageObject(
  url: string,
): Promise<{ ok: true } | { error: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Storage is not configured' }
  }

  const shopMarker = `/${COMPETITOR_SHOP_PHOTOS_BUCKET}/`
  const productMarker = `/${COMPETITOR_PRODUCT_PHOTOS_BUCKET}/`

  let bucket: string
  let pathStart: number
  if (url.includes(shopMarker)) {
    bucket = COMPETITOR_SHOP_PHOTOS_BUCKET
    pathStart = url.indexOf(shopMarker) + shopMarker.length
  } else if (url.includes(productMarker)) {
    bucket = COMPETITOR_PRODUCT_PHOTOS_BUCKET
    pathStart = url.indexOf(productMarker) + productMarker.length
  } else {
    return { ok: true }
  }

  const path = url.slice(pathStart)
  try {
    const { error: removeError } = await supabase.storage.from(bucket).remove([path])
    if (removeError) {
      console.error('[competitor-storage] delete:', removeError)
      return { error: removeError.message ?? 'Delete failed' }
    }
    return { ok: true }
  } catch (err) {
    console.warn('[competitor-storage] delete failed:', err)
    return { error: err instanceof Error ? err.message : 'Delete failed' }
  }
}
