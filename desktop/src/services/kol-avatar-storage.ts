import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import {
  convertImageToWebP,
  isImageSizeWithinLimit,
  MAX_CUSTOMER_LOGO_SIZE_BYTES,
} from '@/utils/image-upload'

/** Supabase Storage bucket for KOL avatar images (create as public in Dashboard). */
export const KOL_AVATARS_BUCKET = 'kol-avatars'

/**
 * Upload a KOL avatar image as WebP under `{userId}/{kolId}/avatar.webp` (upsert).
 * After a successful upload, write the returned publicUrl to `kols.avatar_url`.
 *
 * The returned public URL is suffixed with a `?v={timestamp}` cache buster so
 * that re-uploads to the same storage path are not masked by the browser /
 * CDN HTTP cache.
 *
 * @param userId - Current auth user id (must match first path segment for RLS).
 * @param kolId - KOL UUID.
 * @param file - Source image (JPEG, PNG, etc.).
 * @returns Cache-busted public URL on success, or an error message string.
 */
export async function uploadKolAvatarToStorage(
  userId: string,
  kolId: string,
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
    const path = `${userId}/${kolId}/avatar.webp`
    const { error: uploadError } = await supabase.storage
      .from(KOL_AVATARS_BUCKET)
      .upload(path, webpFile, { contentType: 'image/webp', upsert: true })
    if (uploadError) {
      console.error('KOL avatar upload error:', uploadError)
      return { error: uploadError.message ?? 'Upload failed' }
    }
    const { data } = supabase.storage.from(KOL_AVATARS_BUCKET).getPublicUrl(path)
    const publicUrl = `${data.publicUrl}?v=${Date.now()}`
    return { publicUrl }
  } catch (err) {
    console.warn('KOL avatar convert/upload failed:', err)
    return { error: err instanceof Error ? err.message : 'Upload failed' }
  }
}
