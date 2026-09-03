/**
 * Shared HTML5 row-reorder helpers for product category tables.
 */

import { useCallback, useState, type DragEvent } from 'react'

/**
 * Drag-and-drop reordering for table rows keyed by id.
 * @param onReorder - Persists the new id order.
 * @returns Drag handlers and state flags.
 */
export function useTableRowReorder(onReorder: (orderedIds: string[]) => Promise<void>) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [isReordering, setIsReordering] = useState(false)

  const onDragStart = useCallback((event: DragEvent, id: string): void => {
    setDraggingId(id)
    event.dataTransfer.setData('text/plain', id)
    event.dataTransfer.effectAllowed = 'move'
  }, [])

  const onDragOver = useCallback((event: DragEvent, targetId: string): void => {
    event.preventDefault()
    setDraggingId((current) => {
      if (current && current !== targetId) {
        setDragOverId(targetId)
      }
      return current
    })
  }, [])

  const onDragLeave = useCallback((): void => {
    setDragOverId(null)
  }, [])

  const onDragEnd = useCallback((): void => {
    setDraggingId(null)
    setDragOverId(null)
  }, [])

  /**
   * Commits reorder when dropped on a target row.
   * @param event - Drop event.
   * @param targetId - Row id dropped onto.
   * @param getOrderedIds - Current row order.
   */
  const onDrop = useCallback(
    async (
      event: DragEvent,
      targetId: string,
      getOrderedIds: () => string[],
    ): Promise<void> => {
      event.preventDefault()
      const sourceId =
        draggingId ?? event.dataTransfer.getData('text/plain') ?? null
      setDraggingId(null)
      setDragOverId(null)
      if (!sourceId || sourceId === targetId) {
        return
      }
      const ids = getOrderedIds()
      const fromIndex = ids.indexOf(sourceId)
      const toIndex = ids.indexOf(targetId)
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
        return
      }
      const next = [...ids]
      next.splice(fromIndex, 1)
      next.splice(toIndex, 0, sourceId)
      setIsReordering(true)
      try {
        await onReorder(next)
      } finally {
        setIsReordering(false)
      }
    },
    [draggingId, onReorder],
  )

  return {
    isReordering,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
    isDragging: (id: string) => draggingId === id,
    isDragOver: (id: string) => dragOverId === id,
  }
}
