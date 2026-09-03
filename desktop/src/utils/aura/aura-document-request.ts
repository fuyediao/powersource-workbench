/**
 * Cross-page handoff: upload Markdown as a personal Aura library file, then
 * open the Editor tab. Mirrors {@link import('@/utils/office/office-document-request')}.
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { createAuraFile } from '@/services/aura-files-api'

const OPEN_AURA_EVENT = 'geocrm:open-aura'
const AURA_DOCUMENT_EVENT = 'geocrm:aura-document'
const AURA_DOCUMENT_ERROR_EVENT = 'geocrm:aura-document-error'

/** A Markdown file uploaded to Aura and ready for the editor to open. */
export interface AuraDocumentReady {
  fileId: string
}

let pendingReady: AuraDocumentReady | null = null

/**
 * Builds a short Aura display name from Markdown (first non-empty line).
 * @param markdown - Message body.
 * @returns Title without a file extension (createAuraFile strips `.md`).
 */
export function auraTitleFromMarkdown(markdown: string): string {
  for (const raw of markdown.split('\n')) {
    const line = raw.replace(/^#{1,6}\s+/, '').replace(/^[-*+]\s+/, '').trim()
    if (line) {
      return line.slice(0, 80)
    }
  }
  return 'Untitled'
}

/**
 * Reads and clears a document waiting for the Aura tab to mount.
 * @returns Pending file, or null.
 */
export function consumePendingAuraDocument(): AuraDocumentReady | null {
  const ready = pendingReady
  pendingReady = null
  return ready
}

/**
 * Returns a queued Aura file without clearing it (so the editor can still consume).
 * @returns Pending file, or null.
 */
export function peekPendingAuraDocument(): AuraDocumentReady | null {
  return pendingReady
}

/**
 * Uploads Markdown as a new personal `aura_files` row, then activates the
 * Aura Editor tab. Fire and forget — failures dispatch
 * {@link subscribeAuraDocumentError}.
 * @param markdown - Message Markdown to save.
 * @param title - Optional display name; derived from the first line when omitted.
 * @returns Nothing.
 */
export function exportMarkdownToAura(markdown: string, title?: string): void {
  void (async () => {
    try {
      if (!isSupabaseConfigured || !supabase) {
        throw new Error('supabase_not_configured')
      }
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('not_authenticated')
      }
      const body = markdown.trim()
      if (!body) {
        throw new Error('empty_markdown')
      }
      const name = (title?.trim() || auraTitleFromMarkdown(body)).slice(0, 80) || 'Untitled'
      const created = await createAuraFile(name, { ownerUserId: user.id }, body)
      const ready: AuraDocumentReady = { fileId: created.id }
      pendingReady = ready
      window.dispatchEvent(new CustomEvent(AURA_DOCUMENT_EVENT, { detail: ready }))
      window.dispatchEvent(new CustomEvent(OPEN_AURA_EVENT))
    } catch (error) {
      console.error('[aura-document-request] exportMarkdownToAura:', error)
      window.dispatchEvent(new CustomEvent(AURA_DOCUMENT_ERROR_EVENT))
    }
  })()
}

/**
 * Subscribes to requests that activate the Aura Editor tab.
 * @param listener - Invoked with no payload.
 * @returns Unsubscribe function.
 */
export function subscribeOpenAuraRequest(listener: () => void): () => void {
  /**
   * Forwards the open-Aura tab request.
   * @returns Nothing.
   */
  function handler(): void {
    listener()
  }
  window.addEventListener(OPEN_AURA_EVENT, handler)
  return () => window.removeEventListener(OPEN_AURA_EVENT, handler)
}

/**
 * Subscribes to a newly uploaded Aura file while the Editor tab is mounted.
 * @param listener - Receives the ready file.
 * @returns Unsubscribe function.
 */
export function subscribeAuraDocumentRequest(
  listener: (ready: AuraDocumentReady) => void,
): () => void {
  /**
   * Delivers the ready file and clears its pending copy.
   * @param event - Aura document event.
   */
  function handler(event: Event): void {
    const ready = (event as CustomEvent<AuraDocumentReady>).detail
    if (!ready?.fileId) {
      return
    }
    pendingReady = null
    listener(ready)
  }
  window.addEventListener(AURA_DOCUMENT_EVENT, handler)
  return () => window.removeEventListener(AURA_DOCUMENT_EVENT, handler)
}

/**
 * Subscribes to Aura export failures (caller shows a generic error).
 * @param listener - Invoked with no payload.
 * @returns Unsubscribe function.
 */
export function subscribeAuraDocumentError(listener: () => void): () => void {
  /**
   * Forwards an export failure.
   * @returns Nothing.
   */
  function handler(): void {
    listener()
  }
  window.addEventListener(AURA_DOCUMENT_ERROR_EVENT, handler)
  return () => window.removeEventListener(AURA_DOCUMENT_ERROR_EVENT, handler)
}
