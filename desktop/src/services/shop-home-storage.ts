/**
 * Supabase Storage helpers for shop homepage images (hero banners, story cards).
 * Originals are converted to WebP; each upload also stores a JPEG thumbnail.
 * No client-side size or count limits (Storage bucket shop-home has none either).
 * Paths: banners/{uuid}.webp, stories/{uuid}.webp. Admin UI: /admin/obm.
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { convertImageToWebP, createImageThumbnail } from '@/utils/image-upload'

/** Public bucket for shop homepage images. */
export const SHOP_HOME_BUCKET = 'shop-home'

export type ShopHomeImageUploadResult = {
  publicUrl: string
  path: string
  thumbnailPath: string
  thumbnailPublicUrl: string
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
 * Public URL for an object path in the shop-home bucket.
 *
 * @param path - Object path
 * @returns Public URL or null when Storage is not configured
 */
export function getShopHomePublicUrl(path: string): string | null {
  if (!isSupabaseConfigured || !supabase) return null
  const { data } = supabase.storage.from(SHOP_HOME_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

/**
 * Upload an image into the shop-home bucket under the given folder, converting
 * to WebP and generating a JPEG thumbnail.
 *
 * @param file - Source image (any browser-decodable format)
 * @param folder - Bucket subfolder (e.g. `banners`, `stories`)
 * @returns Paths/URLs for the stored image + thumbnail, or an error
 */
async function uploadShopHomeImage(
  file: File,
  folder: string,
): Promise<ShopHomeImageUploadResult | { error: string }> {
  if (!isSupabaseConfigured || !supabase) return { error: 'Storage is not configured' }
  if (!file.type.startsWith('image/')) return { error: 'not_image' }

  const objectId = newObjectId()
  const path = `${folder}/${objectId}.webp`
  const thumbnailPath = `${folder}/${objectId}.thumb.jpg`

  try {
    const webpFile = await convertImageToWebP(file)
    const { error: uploadError } = await supabase.storage
      .from(SHOP_HOME_BUCKET)
      .upload(path, webpFile, { contentType: 'image/webp', upsert: false })
    if (uploadError) {
      console.error('Shop home image upload error:', uploadError)
      return { error: uploadError.message ?? 'Upload failed' }
    }

    const thumbFile = await createImageThumbnail(file)
    const { error: thumbError } = await supabase.storage
      .from(SHOP_HOME_BUCKET)
      .upload(thumbnailPath, thumbFile, { contentType: 'image/jpeg', upsert: false })
    if (thumbError) {
      console.error('Shop home image thumbnail upload error:', thumbError)
      await removeShopHomeObjects([path])
      return { error: thumbError.message ?? 'Thumbnail upload failed' }
    }

    const publicUrl = getShopHomePublicUrl(path)
    const thumbnailPublicUrl = getShopHomePublicUrl(thumbnailPath)
    if (!publicUrl || !thumbnailPublicUrl) {
      await removeShopHomeObjects([path, thumbnailPath])
      return { error: 'Upload failed' }
    }
    return { publicUrl, path, thumbnailPath, thumbnailPublicUrl }
  } catch (err) {
    console.warn('Shop home image upload failed:', err)
    await removeShopHomeObjects([path, thumbnailPath])
    return { error: err instanceof Error ? err.message : 'Upload failed' }
  }
}

/**
 * Upload a hero banner image, converting to WebP and generating a JPEG thumbnail.
 *
 * @param file - Source image (any browser-decodable format)
 * @returns Paths/URLs for the stored image + thumbnail, or an error
 */
export async function uploadShopHomeBanner(
  file: File,
): Promise<ShopHomeImageUploadResult | { error: string }> {
  return uploadShopHomeImage(file, 'banners')
}

/**
 * Upload a story card image, converting to WebP and generating a JPEG thumbnail.
 *
 * @param file - Source image (any browser-decodable format)
 * @returns Paths/URLs for the stored image + thumbnail, or an error
 */
export async function uploadShopHomeStory(
  file: File,
): Promise<ShopHomeImageUploadResult | { error: string }> {
  return uploadShopHomeImage(file, 'stories')
}

/**
 * Remove one or more shop-home objects by storage path.
 *
 * @param paths - Object paths inside the bucket
 * @returns Error message or null on success
 */
export async function removeShopHomeObjects(paths: string[]): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return 'Storage is not configured'
  const cleaned = [...new Set(paths.map((p) => p.trim()).filter((p) => p.length > 0))]
  if (cleaned.length === 0) return null
  const { error } = await supabase.storage.from(SHOP_HOME_BUCKET).remove(cleaned)
  if (error) {
    console.error('Shop home remove error:', error)
    return error.message ?? 'Remove failed'
  }
  return null
}
