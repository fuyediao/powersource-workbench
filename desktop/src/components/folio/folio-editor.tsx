/**
 * Folio BlockSuite page editor: mounts AFFiNE's PageEditor lifecycle wrapper.
 * Persistence = page `spaceDoc` Yjs update on `folio_pages.yjs_state`.
 * Live sync = Supabase Realtime channel `folio-page:{id}` (Yjs + awareness).
 */

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Text } from '@blocksuite/affine/store'
import {
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness'
import { applyUpdate, mergeUpdates } from 'yjs'
import '@toeverything/theme/style.css'
import {
  createFolioBlocksuiteSession,
  getFolioPageViewExtensions,
  type FolioBlocksuiteSession,
} from '@/lib/blocksuite/folio-workspace'
import { pickFolioRemoteColor } from '@/lib/blocksuite/folio-remote-cursor'
import '@/vendor/affine/page-editor'
import type { PageEditor } from '@/vendor/affine/page-editor'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import {
  appendFolioPageUpdate,
  compactFolioPageUpdates,
  decodeYjsState,
  fetchFolioPageUpdates,
  updateFolioPage,
} from '@/services/folio-api'

/** Fold pending `folio_page_updates` rows into `folio_pages.yjs_state` after this many flushes. */
const COMPACT_EVERY_N_FLUSHES = 20

export interface FolioEditorProps {
  pageId: string
  /** Raw yjs_state from Supabase (hex/base64). */
  initialYjsState: string | null
  readOnly: boolean
  /** Unused for BlockSuite (slash menu / empty paragraph handle empty UX). */
  placeholder?: string
  userLabel: string
  /** Called after a successful local persist. */
  onPersisted?: () => void
}

/** Heading exposed to the Folio table-of-contents panel. */
export interface FolioHeading {
  id: string
  text: string
  level: number
}

/** Imperative editor operations used by page chrome. */
export interface FolioEditorHandle {
  encodeState: () => Uint8Array | null
  exportText: (format: 'markdown' | 'html') => string
  importText: (format: 'markdown' | 'html', content: string) => void
  headings: () => FolioHeading[]
  scrollToBlock: (blockId: string) => void
}

interface TextBlockProjection {
  id: string
  flavour: string
  text: string
  type: string
}

/**
 * Project text-bearing blocks without depending on gfx view modules.
 * @param session - Active BlockSuite session.
 * @returns Ordered text block projections.
 */
function projectTextBlocks(session: FolioBlocksuiteSession | null): TextBlockProjection[] {
  if (!session?.store.root) return []
  const output: TextBlockProjection[] = []
  const visit = (model: typeof session.store.root): void => {
    if (!model) return
    const props = model.props as { text?: { toString: () => string }; type?: string }
    output.push({
      id: model.id,
      flavour: model.flavour,
      text: props.text?.toString() ?? '',
      type: props.type ?? '',
    })
    for (const child of model.children) visit(child)
  }
  visit(session.store.root)
  return output
}

/**
 * Mount a collaborative BlockSuite Folio editor for one page.
 * Parent should remount with `key={pageId}` when switching pages.
 * @param props - Page id, seed state, and capability flags.
 * @returns Editor host container.
 */
export const FolioEditor = forwardRef<FolioEditorHandle, FolioEditorProps>(function FolioEditor({
  pageId,
  initialYjsState,
  readOnly,
  userLabel,
  onPersisted,
}: FolioEditorProps, ref) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const sessionRef = useRef<FolioBlocksuiteSession | null>(null)
  const persistTimer = useRef<number | null>(null)
  const applyingRemote = useRef(false)
  const onPersistedRef = useRef(onPersisted)
  onPersistedRef.current = onPersisted

  useImperativeHandle(ref, () => ({
    encodeState: () => sessionRef.current?.encodeState() ?? null,
    exportText: (format) => {
      const blocks = projectTextBlocks(sessionRef.current).filter((block) => block.text)
      if (format === 'html') {
        return blocks.map((block) => {
          const safe = block.text
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
          const tag = /^h[1-6]$/.test(block.type) ? block.type : 'p'
          return `<${tag}>${safe}</${tag}>`
        }).join('\n')
      }
      return blocks.map((block) => {
        const match = /^h([1-6])$/.exec(block.type)
        return match ? `${'#'.repeat(Number(match[1]))} ${block.text}` : block.text
      }).join('\n\n')
    },
    importText: (format, content) => {
      const store = sessionRef.current?.store
      if (!store?.root || readOnly) return
      const note = store.root.children.find((child) => child.flavour === 'affine:note')
      if (!note) return
      const source = format === 'html'
        ? new DOMParser().parseFromString(content, 'text/html').body.innerText
        : content
      for (const line of source.split(/\r?\n/).filter((item) => item.trim())) {
        const heading = /^(#{1,6})\s+(.+)$/.exec(line)
        store.addBlock(
          'affine:paragraph',
          heading
            ? { text: new Text(heading[2]!), type: `h${heading[1]!.length}` }
            : { text: new Text(line) },
          note.id,
        )
      }
    },
    headings: () => projectTextBlocks(sessionRef.current)
      .filter((block) => /^h[1-6]$/.test(block.type) && block.text)
      .map((block) => ({ id: block.id, text: block.text, level: Number(block.type.slice(1)) })),
    scrollToBlock: (blockId) => {
      hostRef.current?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    },
  }), [readOnly])

  useEffect(() => {
    const container = hostRef.current
    if (!container) {
      return
    }

    // Ensure view providers run effects (customElements.define) before mount.
    const viewSpecs = getFolioPageViewExtensions()
    const session = createFolioBlocksuiteSession(pageId, initialYjsState, {
      readonly: readOnly,
    })
    sessionRef.current = session
    session.awareness.setLocalStateField('user', {
      name: userLabel,
      // Keyed by clientID (per browser tab/session), not userLabel, so two windows
      // signed in as the same person still render distinguishable remote cursors.
      color: pickFolioRemoteColor(session.awareness.clientID),
    })

    const pageEditor = document.createElement('page-editor') as PageEditor
    pageEditor.doc = session.store
    pageEditor.specs = viewSpecs
    container.replaceChildren(pageEditor)

    const spaceDoc = session.store.spaceDoc
    const awareness = session.awareness

    let disposed = false
    let pendingDeltas: Uint8Array[] = []
    let flushesSinceCompact = 0
    let lastAppendedId = 0

    // Replay any pending incremental updates not yet folded into yjs_state (e.g. after a
    // crash between append and compaction). `initialYjsState` is only the compacted baseline.
    void fetchFolioPageUpdates(pageId).then((rows) => {
      if (disposed || rows.length === 0) {
        return
      }
      applyingRemote.current = true
      try {
        for (const row of rows) {
          const bytes = decodeYjsState(row.updateBase64)
          if (bytes && bytes.length > 0) {
            applyUpdate(spaceDoc, bytes, 'remote')
          }
        }
      } finally {
        applyingRemote.current = false
      }
      const upToId = rows[rows.length - 1]!.id
      lastAppendedId = upToId
      // Eagerly fold stale rows (e.g. left over from a crash) into the baseline instead
      // of leaving them for the next session; read-only viewers lack write grant, skip.
      if (!readOnly) {
        void compactFolioPageUpdates(pageId, session.encodeState(), upToId)
      }
    })

    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null
    const client = isSupabaseConfigured ? supabase : null

    if (client) {
      channel = client.channel(`folio-page:${pageId}`)
      channel
        .on('broadcast', { event: 'yjs' }, ({ payload }) => {
          const updateB64 = (payload as { update?: string } | null)?.update
          if (!updateB64 || typeof updateB64 !== 'string') {
            return
          }
          try {
            const binary = atob(updateB64)
            const bytes = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i += 1) {
              bytes[i] = binary.charCodeAt(i)
            }
            applyingRemote.current = true
            applyUpdate(spaceDoc, bytes, 'remote')
          } catch (error) {
            console.error('folio blocksuite realtime apply', error)
          } finally {
            applyingRemote.current = false
          }
        })
        .on('broadcast', { event: 'awareness' }, ({ payload }) => {
          const updateB64 = (payload as { update?: string } | null)?.update
          if (!updateB64 || typeof updateB64 !== 'string') {
            return
          }
          try {
            const binary = atob(updateB64)
            const bytes = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i += 1) {
              bytes[i] = binary.charCodeAt(i)
            }
            applyAwarenessUpdate(awareness, bytes, 'remote')
          } catch (error) {
            console.error('folio awareness apply', error)
          }
        })
        .subscribe()
    }

    /**
     * Encode bytes as base64 for Realtime broadcast.
     * @param bytes - Binary payload.
     * @returns Base64 string.
     */
    const toB64 = (bytes: Uint8Array): string => {
      let binary = ''
      for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]!)
      }
      return btoa(binary)
    }

    /**
     * Append the accumulated deltas since the last flush, then every
     * {@link COMPACT_EVERY_N_FLUSHES} flushes fold the log back into `yjs_state`.
     */
    const flushPendingDeltas = () => {
      if (pendingDeltas.length === 0) {
        return
      }
      const merged = pendingDeltas.length === 1 ? pendingDeltas[0]! : mergeUpdates(pendingDeltas)
      pendingDeltas = []
      void appendFolioPageUpdate(pageId, merged).then((id) => {
        if (id == null || disposed) {
          return
        }
        lastAppendedId = id
        onPersistedRef.current?.()
        flushesSinceCompact += 1
        if (flushesSinceCompact >= COMPACT_EVERY_N_FLUSHES) {
          flushesSinceCompact = 0
          void compactFolioPageUpdates(pageId, session.encodeState(), lastAppendedId)
        }
      })
    }

    const onYjsUpdate = (update: Uint8Array, origin: unknown) => {
      if (applyingRemote.current || origin === 'remote') {
        return
      }
      if (channel) {
        void channel.send({
          type: 'broadcast',
          event: 'yjs',
          payload: { update: toB64(update) },
        })
      }
      if (readOnly) {
        return
      }
      pendingDeltas.push(update)
      if (persistTimer.current != null) {
        window.clearTimeout(persistTimer.current)
      }
      persistTimer.current = window.setTimeout(flushPendingDeltas, 800)
    }

    const onAwarenessChange = (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      if (origin === 'remote' || !channel) {
        return
      }
      const changed = added.concat(updated, removed)
      if (changed.length === 0) {
        return
      }
      const encoded = encodeAwarenessUpdate(awareness, changed)
      void channel.send({
        type: 'broadcast',
        event: 'awareness',
        payload: { update: toB64(encoded) },
      })
    }

    spaceDoc.on('update', onYjsUpdate)
    awareness.on('update', onAwarenessChange)

    return () => {
      disposed = true
      spaceDoc.off('update', onYjsUpdate)
      awareness.off('update', onAwarenessChange)
      if (persistTimer.current != null) {
        window.clearTimeout(persistTimer.current)
        persistTimer.current = null
      }
      // Fold any un-compacted deltas back into yjs_state so the page doesn't leave a
      // dangling update log behind after the editor unmounts.
      if (!readOnly && (pendingDeltas.length > 0 || flushesSinceCompact > 0)) {
        const merged =
          pendingDeltas.length === 0
            ? null
            : pendingDeltas.length === 1
              ? pendingDeltas[0]!
              : mergeUpdates(pendingDeltas)
        const full = session.encodeState()
        const finalize = merged
          ? appendFolioPageUpdate(pageId, merged).then((id) => id ?? lastAppendedId)
          : Promise.resolve(lastAppendedId)
        void finalize.then((upToId) => {
          if (upToId > 0) {
            void compactFolioPageUpdates(pageId, full, upToId)
          } else {
            void updateFolioPage(pageId, { yjsState: full })
          }
        })
      }
      removeAwarenessStates(awareness, [awareness.clientID], 'local')
      if (client && channel) {
        void client.removeChannel(channel)
      }
      pageEditor.std.unmount()
      pageEditor.remove()
      session.dispose()
      sessionRef.current = null
      container.replaceChildren()
    }
  }, [pageId, initialYjsState, readOnly, userLabel])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={hostRef}
        className="folio-blocksuite-viewport min-h-0 flex-1 overflow-hidden"
      />
    </div>
  )
})
