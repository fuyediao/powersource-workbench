/**
 * Supabase Storage helpers for shared CRM media (images + PDFs) used by OBM and T&E.
 * Image originals keep their format; each upload also stores a JPEG thumbnail.
 * Paths: images/{groupId}/… or pdfs/{groupId}/… in bucket shared-media.
 * Admin UI: /te-admin/media.
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { createImageThumbnail } from '@/utils/image-upload'

/** Public bucket for shared CRM media (OBM + T&E). */
export const SHARED_MEDIA_BUCKET = 'shared-media'

export type SharedMediaKind = 'image' | 'pdf'

export type SharedMediaUploadResult = {
  publicUrl: string
  path: string
  fileName: string
  fileSize: number
  thumbnailPath: string | null
  thumbnailPublicUrl: string | null
}

/**
 * Sanitize a filename for use as part of a Storage path.
 *
 * @param name - Original filename
 * @returns Safe filename segment
 */
function sanitizeName(name: string): string {
  return name.replace(/[/\\?#&"'\s]+/g, '_').slice(0, 120)
}

/**
 * New UUID segment for pairing original + thumbnail filenames.
 *
 * @returns UUID or fallback id
 */
function newObjectId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Build an object path under images/{groupId}/ or pdfs/{groupId}/.
 *
 * @param kind - image | pdf
 * @param groupId - Album id
 * @param objectId - Shared id for original + thumb pair
 * @param filename - Sanitized filename with extension
 * @returns Object path
 */
function buildPath(
  kind: SharedMediaKind,
  groupId: string,
  objectId: string,
  filename: string,
): string {
  const folder = kind === 'image' ? 'images' : 'pdfs'
  return `${folder}/${groupId.trim()}/${objectId}-${sanitizeName(filename)}`
}

/**
 * Public URL for an object path in the shared media bucket.
 *
 * @param path - Object path
 * @returns Public URL or null when Storage is not configured
 */
export function getSharedMediaPublicUrl(path: string): string | null {
  if (!isSupabaseConfigured || !supabase) return null
  const { data } = supabase.storage.from(SHARED_MEDIA_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

/**
 * Extract the storage object path from a public URL for this bucket.
 *
 * @param publicUrl - Full public URL
 * @returns Object path or null
 */
export function sharedMediaPathFromUrl(publicUrl: string): string | null {
  const marker = `/object/public/${SHARED_MEDIA_BUCKET}/`
  const idx = publicUrl.indexOf(marker)
  if (idx < 0) return null
  const path = publicUrl.slice(idx + marker.length).split('?')[0] ?? ''
  return path.length > 0 ? decodeURIComponent(path) : null
}

/**
 * Upload an image in its original format plus a generated JPEG thumbnail.
 * No client-side size or count limits.
 *
 * @param groupId - Album id
 * @param file - Source image (format preserved)
 * @returns Paths/URLs for original + thumbnail, or error
 */
export async function uploadSharedMediaImage(
  groupId: string,
  file: File,
): Promise<SharedMediaUploadResult | { error: string }> {
  if (!isSupabaseConfigured || !supabase) return { error: 'Storage is not configured' }
  const id = groupId.trim()
  if (!id) return { error: 'groupId is required' }
  if (!file.type.startsWith('image/')) return { error: 'not_image' }

  const objectId = newObjectId()
  const originalName = sanitizeName(file.name || 'image')
  const path = buildPath('image', id, objectId, originalName)
  let thumbnailPath: string | null = null

  try {
    const contentType = file.type || 'application/octet-stream'
    const { error: uploadError } = await supabase.storage.from(SHARED_MEDIA_BUCKET).upload(path, file, {
      contentType,
      upsert: false,
    })
    if (uploadError) {
      console.error('Shared media image upload error:', uploadError)
      return { error: uploadError.message ?? 'Upload failed' }
    }

    try {
      const thumbFile = await createImageThumbnail(file)
      const baseName = originalName.includes('.')
        ? originalName.slice(0, originalName.lastIndexOf('.'))
        : originalName
      thumbnailPath = buildPath('image', id, objectId, `${baseName}.thumb.jpg`)
      const { error: thumbError } = await supabase.storage
        .from(SHARED_MEDIA_BUCKET)
        .upload(thumbnailPath, thumbFile, { contentType: 'image/jpeg', upsert: false })
      if (thumbError) {
        console.error('Shared media thumbnail upload error:', thumbError)
        await removeSharedMedia(path)
        return { error: thumbError.message ?? 'Thumbnail upload failed' }
      }
    } catch (thumbErr) {
      console.warn('Shared media thumbnail generation failed:', thumbErr)
      await removeSharedMedia(path)
      return {
        error: thumbErr instanceof Error ? thumbErr.message : 'Thumbnail generation failed',
      }
    }

    const publicUrl = getSharedMediaPublicUrl(path)
    const thumbnailPublicUrl = thumbnailPath ? getSharedMediaPublicUrl(thumbnailPath) : null
    if (!publicUrl || !thumbnailPublicUrl || !thumbnailPath) {
      await removeSharedMediaObjects(
        [path, thumbnailPath].filter((p): p is string => typeof p === 'string' && p.length > 0),
      )
      return { error: 'Upload failed' }
    }
    return {
      publicUrl,
      path,
      fileName: originalName,
      fileSize: file.size,
      thumbnailPath,
      thumbnailPublicUrl,
    }
  } catch (err) {
    console.warn('Shared media image upload failed:', err)
    await removeSharedMediaObjects(
      [path, thumbnailPath].filter((p): p is string => typeof p === 'string' && p.length > 0),
    )
    return { error: err instanceof Error ? err.message : 'Upload failed' }
  }
}

/**
 * Upload a PDF into an album folder (no client-side size limit).
 *
 * @param groupId - Album id
 * @param file - Source PDF
 * @returns Path, public URL, size — or error code/message
 */
export async function uploadSharedMediaPdf(
  groupId: string,
  file: File,
): Promise<SharedMediaUploadResult | { error: string }> {
  if (!isSupabaseConfigured || !supabase) return { error: 'Storage is not configured' }
  const id = groupId.trim()
  if (!id) return { error: 'groupId is required' }
  const isPdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) return { error: 'not_pdf' }

  try {
    const fileName = sanitizeName(file.name.endsWith('.pdf') ? file.name : `${file.name}.pdf`)
    const path = buildPath('pdf', id, newObjectId(), fileName)
    const { error: uploadError } = await supabase.storage.from(SHARED_MEDIA_BUCKET).upload(path, file, {
      contentType: 'application/pdf',
      upsert: false,
    })
    if (uploadError) {
      console.error('Shared media PDF upload error:', uploadError)
      return { error: uploadError.message ?? 'Upload failed' }
    }
    const publicUrl = getSharedMediaPublicUrl(path)
    if (!publicUrl) return { error: 'Upload failed' }
    return {
      publicUrl,
      path,
      fileName,
      fileSize: file.size,
      thumbnailPath: null,
      thumbnailPublicUrl: null,
    }
  } catch (err) {
    console.warn('Shared media PDF upload failed:', err)
    return { error: err instanceof Error ? err.message : 'Upload failed' }
  }
}

/**
 * Remove one shared media object by storage path.
 *
 * @param path - Object path inside the bucket
 * @returns Error message or null on success
 */
export async function removeSharedMedia(path: string): Promise<string | null> {
  return removeSharedMediaObjects([path])
}

/**
 * Remove one or more shared media objects.
 *
 * @param paths - Object paths inside the bucket
 * @returns Error message or null on success
 */
export async function removeSharedMediaObjects(paths: string[]): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return 'Storage is not configured'
  const cleaned = [...new Set(paths.map((p) => p.trim()).filter((p) => p.length > 0))]
  if (cleaned.length === 0) return null
  const { error } = await supabase.storage.from(SHARED_MEDIA_BUCKET).remove(cleaned)
  if (error) {
    console.error('Shared media remove error:', error)
    return error.message ?? 'Remove failed'
  }
  return null
}
