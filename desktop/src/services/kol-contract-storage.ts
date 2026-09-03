import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { convertImageToWebP, isImageSizeWithinLimit } from '@/utils/image-upload'

/** Supabase Storage bucket for KOL contract images (must be public). */
export const KOL_CONTRACT_IMAGES_BUCKET = 'kol-contract-images'

/** Supabase Storage bucket for KOL non-image contract files (must be public). */
export const KOL_CONTRACT_FILES_BUCKET = 'kol-contract-files'

/** Maximum image size before WebP conversion (5 MB). */
const MAX_CONTRACT_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

/** Maximum non-image file size (10 MB). */
export const MAX_CONTRACT_FILE_SIZE_BYTES = 10 * 1024 * 1024

/**
 * Sanitize a filename for use as part of a Storage path.
 * Replaces runs of path-unsafe characters with an underscore.
 * @param name - Original filename.
 * @returns Safe filename string.
 */
function sanitizeName(name: string): string {
  return name.replace(/[/\\?#&"'\s]+/g, '_')
}

/**
 * Build a unique Storage object path: `{groupId}/{kolId}/{timestamp}-{sanitizedFilename}`.
 * @param groupId - KOL's group UUID (first path segment, used by RLS).
 * @param kolId - KOL UUID.
 * @param file - File being uploaded.
 * @returns Storage object path string.
 */
function buildPath(groupId: string, kolId: string, file: File): string {
  return `${groupId}/${kolId}/${Date.now()}-${sanitizeName(file.name)}`
}

/**
 * Upload a KOL contract image as WebP to the `kol-contract-images` bucket.
 * The file is converted to WebP before upload regardless of the original format.
 * @param groupId - KOL's group UUID (must match first path segment for RLS).
 * @param kolId - KOL UUID.
 * @param file - Source image file (must be image/*).
 * @returns Public URL on success, or an error object.
 */
export async function uploadKolContractImage(
  groupId: string,
  kolId: string,
  file: File,
): Promise<{ publicUrl: string } | { error: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Storage is not configured' }
  }
  if (!groupId || !kolId) {
    return { error: 'groupId and kolId are required' }
  }
  if (!file.type.startsWith('image/')) {
    return { error: 'not_image' }
  }
  if (!isImageSizeWithinLimit(file, MAX_CONTRACT_IMAGE_SIZE_BYTES)) {
    return { error: 'file_too_large' }
  }
  try {
    const webpFile = await convertImageToWebP(file)
    const path = buildPath(groupId, kolId, webpFile)
    const { error: uploadError } = await supabase.storage
      .from(KOL_CONTRACT_IMAGES_BUCKET)
      .upload(path, webpFile, { contentType: 'image/webp', upsert: false })
    if (uploadError) {
      console.error('KOL contract image upload error:', uploadError)
      return { error: uploadError.message ?? 'Upload failed' }
    }
    const { data } = supabase.storage
      .from(KOL_CONTRACT_IMAGES_BUCKET)
      .getPublicUrl(path)
    return { publicUrl: data.publicUrl }
  } catch (err) {
    console.warn('KOL contract image convert/upload failed:', err)
    return { error: err instanceof Error ? err.message : 'Upload failed' }
  }
}

/**
 * Upload a KOL non-image contract file as-is to the `kol-contract-files` bucket.
 * @param groupId - KOL's group UUID (must match first path segment for RLS).
 * @param kolId - KOL UUID.
 * @param file - Source file.
 * @returns Public URL on success, or an error object.
 */
export async function uploadKolContractFile(
  groupId: string,
  kolId: string,
  file: File,
): Promise<{ publicUrl: string } | { error: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Storage is not configured' }
  }
  if (!groupId || !kolId) {
    return { error: 'groupId and kolId are required' }
  }
  if (file.type.startsWith('image/')) {
    return { error: 'is_image' }
  }
  if (file.size > MAX_CONTRACT_FILE_SIZE_BYTES) {
    return { error: 'file_too_large' }
  }
  try {
    const path = buildPath(groupId, kolId, file)
    const { error: uploadError } = await supabase.storage
      .from(KOL_CONTRACT_FILES_BUCKET)
      .upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })
    if (uploadError) {
      console.error('KOL contract file upload error:', uploadError)
      return { error: uploadError.message ?? 'Upload failed' }
    }
    const { data } = supabase.storage
      .from(KOL_CONTRACT_FILES_BUCKET)
      .getPublicUrl(path)
    return { publicUrl: data.publicUrl }
  } catch (err) {
    console.warn('KOL contract file upload failed:', err)
    return { error: err instanceof Error ? err.message : 'Upload failed' }
  }
}

/**
 * Delete a KOL contract Storage object by its public URL.
 * Detects the bucket from the URL. No-ops for external (non-Storage) URLs.
 * @param url - Public URL of the object to remove.
 * @returns `{ ok: true }` on success or no-op, or an error object.
 */
export async function deleteKolContractStorageObject(
  url: string,
): Promise<{ ok: true } | { error: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Storage is not configured' }
  }

  let bucket: string
  let pathStart: number

  const imgMarker = `/${KOL_CONTRACT_IMAGES_BUCKET}/`
  const fileMarker = `/${KOL_CONTRACT_FILES_BUCKET}/`

  if (url.includes(imgMarker)) {
    bucket = KOL_CONTRACT_IMAGES_BUCKET
    pathStart = url.indexOf(imgMarker) + imgMarker.length
  } else if (url.includes(fileMarker)) {
    bucket = KOL_CONTRACT_FILES_BUCKET
    pathStart = url.indexOf(fileMarker) + fileMarker.length
  } else {
    return { ok: true }
  }

  const path = url.slice(pathStart)
  try {
    const { error: removeError } = await supabase.storage.from(bucket).remove([path])
    if (removeError) {
      console.error('KOL contract storage delete error:', removeError)
      return { error: removeError.message ?? 'Delete failed' }
    }
    return { ok: true }
  } catch (err) {
    console.warn('KOL contract storage delete failed:', err)
    return { error: err instanceof Error ? err.message : 'Delete failed' }
  }
}
