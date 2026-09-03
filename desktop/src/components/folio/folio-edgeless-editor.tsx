/** Lazy Folio Edgeless editor host on the same persisted Yjs document. */

import { useEffect, useRef } from 'react'
import { BlockStdScope } from '@blocksuite/affine/std'
import { GfxControllerIdentifier } from '@blocksuite/affine/std/gfx'
import { Bound, getBoundFromPoints, inflateBound } from '@blocksuite/affine/global/gfx'
import { mergeUpdates } from 'yjs'
import { createFolioBlocksuiteSession, ensureFolioSurface } from '@/lib/blocksuite/folio-workspace'
import { getFolioEdgelessViewExtensions } from '@/lib/blocksuite/folio-edgeless-workspace'
import { appendFolioPageUpdate, updateFolioPage } from '@/services/folio-api'

export interface FolioEdgelessEditorProps {
  pageId: string
  initialYjsState: string | null
  readOnly: boolean
  userLabel: string
  onPersisted?: () => void
}

/**
 * Mount an Edgeless BlockStdScope; this module is only reached by dynamic import.
 * @param props - Page document and capability state.
 * @returns Canvas viewport.
 */
export function FolioEdgelessEditor({
  pageId,
  initialYjsState,
  readOnly,
  userLabel,
  onPersisted,
}: FolioEdgelessEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const onPersistedRef = useRef(onPersisted)

  useEffect(() => {
    onPersistedRef.current = onPersisted
  }, [onPersisted])

  useEffect(() => {
    const container = hostRef.current
    if (!container) return
    const session = createFolioBlocksuiteSession(pageId, initialYjsState, { readonly: readOnly })
    const seededSurface = !readOnly && ensureFolioSurface(session.store)
    if (seededSurface) {
      void updateFolioPage(pageId, { yjsState: session.encodeState() })
    }
    session.awareness.setLocalStateField('user', { name: userLabel })
    const std = new BlockStdScope({
      store: session.store,
      extensions: getFolioEdgelessViewExtensions(),
    })
    const host = std.render()
    host.classList.add('folio-affine-host')
    container.replaceChildren(host)
    const gfx = std.get(GfxControllerIdentifier)
    for (const element of gfx.surface?.elementModels ?? []) {
      if (element.type !== 'brush') continue
      const brush = element as typeof element & {
        points: [number, number, ...number[]][]
        lineWidth: number
        xywh?: string
      }
      let validBound = false
      if (brush.xywh) {
        try {
          const bound = Bound.deserialize(brush.xywh)
          validBound = bound.w > 0 || bound.h > 0
        } catch {
          validBound = false
        }
      }
      if (validBound || brush.points.length === 0) continue
      const bound = inflateBound(getBoundFromPoints(brush.points.map(([x, y]) => [x, y])), brush.lineWidth)
      const relativePoints = brush.points.map(([x, y, ...rest]) => [x - bound.x, y - bound.y, ...rest])
      gfx.updateElement(element, { xywh: bound.serialize(), points: relativePoints })
    }
    let timer: number | null = null
    let pending: Uint8Array[] = []
    const persist = (update: Uint8Array, origin: unknown) => {
      if (readOnly || origin === 'remote') return
      pending.push(update)
      if (timer != null) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const merged = pending.length === 1 ? pending[0]! : mergeUpdates(pending)
        pending = []
        void appendFolioPageUpdate(pageId, merged).then((id) => {
          if (id != null) onPersistedRef.current?.()
        })
      }, 800)
    }
    session.store.spaceDoc.on('update', persist)

    return () => {
      if (timer != null) window.clearTimeout(timer)
      session.store.spaceDoc.off('update', persist)
      std.unmount()
      host.remove()
      session.dispose()
      container.replaceChildren()
    }
  }, [initialYjsState, pageId, readOnly, userLabel])

  return <div ref={hostRef} className="affine-edgeless-viewport folio-blocksuite-viewport h-full min-h-0 max-h-full w-full flex-1 overflow-hidden" />
}
