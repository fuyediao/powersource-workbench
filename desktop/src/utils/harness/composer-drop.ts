/**
 * ChatGPT-style OS file drops for the Harness composer.
 */

import { useEffect, useRef, useState } from 'react'
import {
  isHarnessAttachmentFileName,
  isHarnessAttachmentImageName,
  isHarnessAttachmentMimeType,
} from '@/utils/harness/harness-attachments'
import type { HarnessComposerAttachment } from '@/types/harness'

/** One dropped composer attachment, with an optional image thumbnail. */
export interface ComposerDropItem extends HarnessComposerAttachment {
  previewUrl?: string
}

/**
 * Resolves the absolute path for a File dropped in Electron.
 * @param file - OS file from DataTransfer.
 * @returns Absolute path, or an empty string when unavailable.
 */
function droppedFilePath(file: File): string {
  return window.geocrm?.harness?.getPathForFile?.(file)?.trim() ?? ''
}

/**
 * Returns whether the drag payload is OS files.
 * @param dataTransfer - Drag payload.
 * @returns True for Explorer / Finder file drags.
 */
function isOsFileDrag(dataTransfer: DataTransfer | null): boolean {
  return Boolean(dataTransfer && Array.from(dataTransfer.types).includes('Files'))
}

/**
 * Collects attachable files and folders from a drop payload.
 * @param dataTransfer - Drop payload.
 * @returns Paths the composer can attach.
 */
export function collectComposerDropItems(dataTransfer: DataTransfer): ComposerDropItem[] {
  const items: ComposerDropItem[] = []
  const seen = new Set<string>()

  /**
   * Adds one dropped File when it is a folder or an allowed attachment.
   * @param file - Browser File from the drop.
   * @param isDirectory - True when the entry is a folder.
   * @returns Nothing.
   */
  function push(file: File, isDirectory: boolean): void {
    const path = droppedFilePath(file)
    if (!path || seen.has(path)) return
    if (isDirectory) {
      seen.add(path)
      items.push({ path, kind: 'folder' })
      return
    }
    const named = file.name || path
    if (!isHarnessAttachmentFileName(named) && !isHarnessAttachmentMimeType(file.type)) return
    seen.add(path)
    items.push({
      path,
      kind: 'file',
      previewUrl: isHarnessAttachmentImageName(named) || file.type.startsWith('image/')
        ? URL.createObjectURL(file)
        : undefined,
    })
  }

  const transferItems = Array.from(dataTransfer.items)
  if (transferItems.length > 0) {
    for (const item of transferItems) {
      if (item.kind !== 'file') continue
      const file = item.getAsFile()
      if (!file) continue
      const entry = item.webkitGetAsEntry?.() ?? null
      push(file, Boolean(entry?.isDirectory))
    }
    return items
  }

  for (const file of Array.from(dataTransfer.files)) {
    push(file, false)
  }
  return items
}

/**
 * Listens for OS file drags on the window and reports ChatGPT-style drop state.
 * @param enabled - When false, drags are ignored.
 * @param onItems - Accepted files and folders.
 * @param onRejected - Drop contained files but none were attachable.
 * @returns True while a file drag is hovering the window.
 */
export function useComposerAttachmentDrop(
  enabled: boolean,
  onItems: (items: ComposerDropItem[]) => void,
  onRejected: () => void,
): boolean {
  const [isDragging, setIsDragging] = useState(false)
  const depthRef = useRef(0)
  const onItemsRef = useRef(onItems)
  const onRejectedRef = useRef(onRejected)
  onItemsRef.current = onItems
  onRejectedRef.current = onRejected

  useEffect(() => {
    if (!enabled) {
      depthRef.current = 0
      setIsDragging(false)
      return
    }

    /**
     * Starts the drop overlay when OS files enter the window.
     * @param event - Window dragenter.
     * @returns Nothing.
     */
    function onEnter(event: DragEvent): void {
      if (!isOsFileDrag(event.dataTransfer)) return
      event.preventDefault()
      depthRef.current += 1
      setIsDragging(true)
    }

    /**
     * Keeps the drop allowed while files hover the window.
     * @param event - Window dragover.
     * @returns Nothing.
     */
    function onOver(event: DragEvent): void {
      if (!isOsFileDrag(event.dataTransfer)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }

    /**
     * Clears the overlay after the drag leaves the window.
     * @param event - Window dragleave.
     * @returns Nothing.
     */
    function onLeave(event: DragEvent): void {
      if (!isOsFileDrag(event.dataTransfer)) return
      depthRef.current = Math.max(0, depthRef.current - 1)
      if (depthRef.current === 0) setIsDragging(false)
    }

    /**
     * Attaches dropped documents, Office files, and images.
     * @param event - Window drop.
     * @returns Nothing.
     */
    function onDrop(event: DragEvent): void {
      const transfer = event.dataTransfer
      if (!isOsFileDrag(transfer) || !transfer) {
        depthRef.current = 0
        setIsDragging(false)
        return
      }
      event.preventDefault()
      depthRef.current = 0
      setIsDragging(false)
      const collected = collectComposerDropItems(transfer)
      if (collected.length === 0) onRejectedRef.current()
      else onItemsRef.current(collected)
    }

    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [enabled])

  return isDragging
}
