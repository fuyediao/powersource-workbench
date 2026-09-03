/** Suspense boundary that keeps Edgeless code out of the Folio page entry. */

import { lazy, Suspense } from 'react'
import type { FolioEdgelessEditorProps } from '@/components/folio/folio-edgeless-editor'
import { StatusLoading } from '@/components/common/status-loading'

const LazyEdgelessEditor = lazy(async () => {
  const module = await import('@/components/folio/folio-edgeless-editor')
  return { default: module.FolioEdgelessEditor }
})

/** Lazy Edgeless loading boundary. */
export function FolioEdgelessLoader(props: FolioEdgelessEditorProps) {
  return (
    <Suspense fallback={<StatusLoading />}>
      <LazyEdgelessEditor {...props} />
    </Suspense>
  )
}
