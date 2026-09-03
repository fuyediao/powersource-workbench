/**
 * Supabase Storage upload for CRM company logos (`customer-logos` bucket).
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import {
  convertImageToWebP,
  isImageSizeWithinLimit,
  MAX_CUSTOMER_LOGO_SIZE_BYTES,
} from '@/utils/image-upload'

/** Public Storage bucket for company logos. */
export const CUSTOMER_LOGOS_BUCKET = 'customer-logos'

/**
 * Uploads a company logo as WebP under `{userId}/{customerId}/logo.webp` (upsert).
 * @param userId - Auth user id (first path segment for RLS).
 * @param customerId - Customer uuid.
 * @param file - Source image.
 * @returns Cache-busted public URL, or an error code/message.
 */
export async function uploadCustomerLogoToStorage(
  userId: string,
  customerId: string,
  file: File,
): Promise<{ publicUrl: string } | { error: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Storage is not configured' }
  }
  if (!isImageSizeWithinLimit(file, MAX_CUSTOMER_LOGO_SIZE_BYTES)) {
    return { error: 'file_too_large' }
  }
  try {
    const webpFile = await convertImageToWebP(file)
    const path = `${userId}/${customerId}/logo.webp`
    const { error: uploadError } = await supabase.storage
      .from(CUSTOMER_LOGOS_BUCKET)
      .upload(path, webpFile, { contentType: 'image/webp', upsert: true })
    if (uploadError) {
      console.error('[customer-logo-storage] upload:', uploadError)
      return { error: uploadError.message || 'Upload failed' }
    }
    const { data } = supabase.storage.from(CUSTOMER_LOGOS_BUCKET).getPublicUrl(path)
    return { publicUrl: `${data.publicUrl}?v=${Date.now()}` }
  } catch (err) {
    console.warn('[customer-logo-storage] convert/upload failed:', err)
    return { error: err instanceof Error ? err.message : 'Upload failed' }
  }
}
