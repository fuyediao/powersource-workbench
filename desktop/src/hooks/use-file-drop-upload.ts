import { useCallback, useState, type DragEvent } from 'react'

/** Props to spread on the page root that owns the drop overlay. */
export interface FileDropUploadBind {
  onDragEnter: (event: DragEvent<HTMLElement>) => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDragLeave: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
}

export interface UseFileDropUploadOptions {
  /** When false, file drags are ignored (no overlay, no upload). */
  enabled: boolean
  /** True when this page should handle the drag (extension / MIME). */
  isAcceptedDrag: (dataTransfer: DataTransfer) => boolean
  /** True when a dropped File should be uploaded. */
  isAcceptedFile: (file: File) => boolean
  /** Called when the drop had files but none matched `isAcceptedFile`. */
  onRejectedFiles?: (files: File[]) => void
  /** Upload accepted files. Overlay stays up until this settles. */
  onFiles: (files: File[]) => Promise<void>
}

export interface UseFileDropUploadResult {
  /** True while an OS file drag is hovering the page. */
  isDragging: boolean
  /** True while `onFiles` is running. */
  isUploading: boolean
  /** Spread on the page root. */
  dropBind: FileDropUploadBind
}

/**
 * Returns whether the drag payload is OS files (not an in-app reorder).
 * @param dataTransfer - Drag payload.
 * @returns True for Finder / Explorer file drags.
 */
export function isOsFileDrag(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) {
    return false
  }
  return Array.from(dataTransfer.types).includes('Files')
}

/**
 * File-drop zone that stays invisible until an OS file drag enters, then
 * covers the page (including an OnlyOffice iframe) so release uploads.
 * @param options - Enable flag, accept filters, and upload handler.
 * @returns Drag state and bindable handlers.
 */
export function useFileDropUpload(options: UseFileDropUploadOptions): UseFileDropUploadResult {
  const { enabled, isAcceptedDrag, isAcceptedFile, onFiles, onRejectedFiles } = options
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const resetDrag = useCallback((): void => {
    setIsDragging(false)
  }, [])

  const onDragEnter = useCallback(
    (event: DragEvent<HTMLElement>): void => {
      if (!enabled || !isOsFileDrag(event.dataTransfer) || !isAcceptedDrag(event.dataTransfer)) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      setIsDragging(true)
    },
    [enabled, isAcceptedDrag],
  )

  const onDragOver = useCallback(
    (event: DragEvent<HTMLElement>): void => {
      if (!enabled || !isOsFileDrag(event.dataTransfer) || !isAcceptedDrag(event.dataTransfer)) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = 'copy'
    },
    [enabled, isAcceptedDrag],
  )

  const onDragLeave = useCallback(
    (event: DragEvent<HTMLElement>): void => {
      event.preventDefault()
      event.stopPropagation()
      const next = event.relatedTarget
      if (next instanceof Node && event.currentTarget.contains(next)) {
        return
      }
      resetDrag()
    },
    [resetDrag],
  )

  const onDrop = useCallback(
    (event: DragEvent<HTMLElement>): void => {
      const transfer = event.dataTransfer
      if (!enabled || !isOsFileDrag(transfer) || !isAcceptedDrag(transfer)) {
        resetDrag()
        return
      }
      event.preventDefault()
      event.stopPropagation()
      resetDrag()
      if (isUploading) {
        return
      }
      const dropped = Array.from(transfer.files)
      const files = dropped.filter(isAcceptedFile)
      if (files.length === 0) {
        if (dropped.length > 0) {
          onRejectedFiles?.(dropped)
        }
        return
      }
      setIsUploading(true)
      void onFiles(files).finally(() => {
        setIsUploading(false)
      })
    },
    [enabled, isAcceptedDrag, isAcceptedFile, isUploading, onFiles, onRejectedFiles, resetDrag],
  )

  return {
    isDragging,
    isUploading,
    dropBind: { onDragEnter, onDragOver, onDragLeave, onDrop },
  }
}
