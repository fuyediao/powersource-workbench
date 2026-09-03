/**
 * Supabase Storage helpers for OBM product gallery images on product_catalog.
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { convertImageToWebP, isImageSizeWithinLimit } from '@/utils/image-upload'

/** Public bucket for OBM catalog product images. */
export const PRODUCT_CATALOG_OBM_BUCKET = 'product-catalog-obm'

/** Max images per product. */
export const MAX_PRODUCT_CATALOG_OBM_IMAGES = 10

/** Max source file size before WebP conversion (5 MB). */
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

/**
 * Builds a storage path `{productId}/{uuid}.webp`.
 * @param productId - product_catalog.id (ERP ItemId).
 * @returns Object path.
 */
function buildPath(productId: string): string {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `${productId.trim()}/${id}.webp`
}

/**
 * Extracts the storage object path from a public URL for this bucket.
 * @param publicUrl - Full public URL.
 * @returns Object path or null when not from this bucket.
 */
export function productCatalogObmPathFromUrl(publicUrl: string): string | null {
  const marker = `/object/public/${PRODUCT_CATALOG_OBM_BUCKET}/`
  const idx = publicUrl.indexOf(marker)
  if (idx < 0) {
    return null
  }
  const path = publicUrl.slice(idx + marker.length).split('?')[0] ?? ''
  return path.length > 0 ? decodeURIComponent(path) : null
}

/**
 * Uploads one OBM gallery image (converted to WebP).
 * @param productId - product_catalog.id.
 * @param file - Source image.
 * @returns Public URL or error.
 */
export async function uploadProductCatalogObmImage(
  productId: string,
  file: File,
): Promise<{ publicUrl: string } | { error: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Storage is not configured' }
  }
  const id = productId.trim()
  if (!id) {
    return { error: 'productId is required' }
  }
  if (!file.type.startsWith('image/')) {
    return { error: 'not_image' }
  }
  if (!isImageSizeWithinLimit(file, MAX_IMAGE_SIZE_BYTES)) {
    return { error: 'file_too_large' }
  }

  try {
    const webpFile = await convertImageToWebP(file)
    const path = buildPath(id)
    const { error: uploadError } = await supabase.storage
      .from(PRODUCT_CATALOG_OBM_BUCKET)
      .upload(path, webpFile, { contentType: 'image/webp', upsert: false })
    if (uploadError) {
      console.error('Product catalog OBM image upload error:', uploadError)
      return { error: uploadError.message ?? 'Upload failed' }
    }
    const { data } = supabase.storage.from(PRODUCT_CATALOG_OBM_BUCKET).getPublicUrl(path)
    return { publicUrl: data.publicUrl }
  } catch (err) {
    console.warn('Product catalog OBM image upload failed:', err)
    return { error: err instanceof Error ? err.message : 'Upload failed' }
  }
}

/**
 * Removes an OBM gallery image from Storage when the URL belongs to this bucket.
 * @param publicUrl - Public image URL.
 * @returns Error message or null on success / skip.
 */
export async function removeProductCatalogObmImage(
  publicUrl: string,
): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) {
    return 'Storage is not configured'
  }
  const path = productCatalogObmPathFromUrl(publicUrl)
  if (!path) {
    return null
  }
  const { error } = await supabase.storage.from(PRODUCT_CATALOG_OBM_BUCKET).remove([path])
  if (error) {
    console.error('Product catalog OBM image remove error:', error)
    return error.message ?? 'Remove failed'
  }
  return null
}
