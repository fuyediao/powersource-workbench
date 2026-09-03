import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { PROFILE_AVATARS_BUCKET, type ProfileRow } from '@/types/crm-settings'

const MAX_AVATAR_BYTES = 5 * 1024 * 1024

/** Profile columns selected for Settings. */
const PROFILE_SELECT =
  'id, email, display_name, full_name, language, organization, bio, phone_number, phone_country, avatar_url, avatar_index, employee_id, openai_api_key, anthropic_api_key, gemini_api_key, grok_api_key, updated_at'

/**
 * Encodes an image file as WebP (JPEG fallback) for avatar upload.
 * @param file - Source image.
 * @returns Encoded blob and content type.
 */
async function encodeAvatarWebp(file: File): Promise<{ blob: Blob; contentType: string }> {
  const bitmap = await createImageBitmap(file)
  try {
    const maxEdge = 512
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Canvas unavailable')
    }
    ctx.drawImage(bitmap, 0, 0, width, height)
    const webp = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/webp', 0.85)
    })
    if (webp) {
      return { blob: webp, contentType: 'image/webp' }
    }
    const jpeg = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/jpeg', 0.88)
    })
    if (jpeg) {
      return { blob: jpeg, contentType: 'image/jpeg' }
    }
    throw new Error('Encode failed')
  } finally {
    bitmap.close()
  }
}

/**
 * Loads a profile row by user id.
 * @param userId - Auth user id.
 * @returns Profile row or null.
 */
export async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null
  }
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.error('fetchProfile', error)
    return null
  }
  return data as ProfileRow | null
}

/**
 * Creates a minimal profile when none exists.
 * @param input - Initial fields.
 * @returns Created row or null.
 */
export async function createProfile(input: {
  id: string
  email?: string | null
  displayName?: string | null
  avatarUrl?: string | null
  language?: string | null
}): Promise<ProfileRow | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null
  }
  const { error } = await supabase.from('profiles').insert({
    id: input.id,
    email: input.email ?? null,
    full_name: input.displayName ?? null,
    display_name: input.displayName ?? '',
    language: input.language ?? 'en',
    bio: '',
    phone_number: '',
    phone_country: '',
    avatar_url: input.avatarUrl ?? null,
    avatar_index: null,
  })
  if (error) {
    console.error('createProfile', error)
    return null
  }
  return fetchProfile(input.id)
}

/**
 * Upserts editable profile fields.
 * @param userId - Auth user id.
 * @param patch - Fields to write.
 * @returns True on success.
 */
export async function upsertProfileFields(
  userId: string,
  patch: Partial<{
    display_name: string | null
    bio: string | null
    phone_number: string | null
    phone_country: string | null
    email: string | null
    language: string | null
    avatar_url: string | null
    avatar_index: number | null
  }>,
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    return false
  }
  const { error } = await supabase.from('profiles').upsert(
    {
      id: userId,
      ...patch,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )
  if (error) {
    console.error('upsertProfileFields', error)
    return false
  }
  return true
}

/**
 * Uploads a profile avatar to Storage and returns a cache-busted public URL.
 * @param userId - Auth user id.
 * @param file - Image file.
 * @returns Public URL or error code/message.
 */
export async function uploadProfileAvatar(
  userId: string,
  file: File,
): Promise<{ publicUrl: string } | { error: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'not_configured' }
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { error: 'file_too_large' }
  }
  try {
    const { blob, contentType } = await encodeAvatarWebp(file)
    const path = `${userId}/avatar.webp`
    const { error: uploadError } = await supabase.storage
      .from(PROFILE_AVATARS_BUCKET)
      .upload(path, blob, { contentType, upsert: true })
    if (uploadError) {
      return { error: uploadError.message }
    }
    const { data } = supabase.storage.from(PROFILE_AVATARS_BUCKET).getPublicUrl(path)
    return { publicUrl: `${data.publicUrl}?v=${Date.now()}` }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Upload failed' }
  }
}

/**
 * Best-effort delete of the stored avatar object.
 * @param userId - Auth user id.
 * @returns Nothing.
 */
export async function deleteProfileAvatar(userId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    return
  }
  try {
    await supabase.storage.from(PROFILE_AVATARS_BUCKET).remove([`${userId}/avatar.webp`])
  } catch (err) {
    console.warn('deleteProfileAvatar', err)
  }
}
