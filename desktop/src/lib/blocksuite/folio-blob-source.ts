/**
 * Folio Yjs blob storage (attachments, pasted/dropped images) backed by the Supabase
 * Storage bucket `folio-attachments`, instead of BlockSuite's default in-memory
 * `MemoryBlobSource` (which drops every blob on reload). One instance per open page;
 * objects live under `{pageId}/{key}` so `storage.objects` RLS can mirror `folio_pages`
 * access (see migration `20260809_folio_attachments_bucket.sql`).
 */

import type { BlobSource } from '@blocksuite/affine/sync'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

const BUCKET = 'folio-attachments'

export class SupabaseFolioBlobSource implements BlobSource {
  readonly name = 'supabase-folio'

  /**
   * @param pageId - Owning `folio_pages` id (object path prefix).
   * @param readonly - Mirrors the page's edit permission; blocks writes when true.
   */
  constructor(
    private readonly pageId: string,
    readonly readonly: boolean,
  ) {}

  private path(key: string): string {
    return `${this.pageId}/${key}`
  }

  async get(key: string): Promise<Blob | null> {
    if (!isSupabaseConfigured || !supabase) {
      return null
    }
    const { data, error } = await supabase.storage.from(BUCKET).download(this.path(key))
    if (error || !data) {
      return null
    }
    return data
  }

  async set(key: string, value: Blob): Promise<string> {
    if (!isSupabaseConfigured || !supabase || this.readonly) {
      throw new Error('folio blob source is read-only or Supabase is not configured')
    }
    const { error } = await supabase.storage.from(BUCKET).upload(this.path(key), value, {
      upsert: true,
      contentType: value.type || 'application/octet-stream',
    })
    if (error) {
      throw error
    }
    return key
  }

  async delete(key: string): Promise<void> {
    if (!isSupabaseConfigured || !supabase || this.readonly) {
      return
    }
    await supabase.storage.from(BUCKET).remove([this.path(key)])
  }

  async list(): Promise<string[]> {
    if (!isSupabaseConfigured || !supabase) {
      return []
    }
    const { data, error } = await supabase.storage.from(BUCKET).list(this.pageId)
    if (error || !data) {
      return []
    }
    return data.map((file) => file.name)
  }
}
