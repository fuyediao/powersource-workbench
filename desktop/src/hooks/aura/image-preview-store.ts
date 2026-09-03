type Listener = () => void

export interface ImagePreviewState {
  src: string
  naturalWidth: number
  naturalHeight: number
  displayWidth: number
  displayHeight: number
  originLeft: number
  originTop: number
  theme: 'classic' | 'dark'
}

let preview: ImagePreviewState | null = null
const listeners = new Set<Listener>()

/** Notify image-preview subscribers. */
function emit(): void {
  listeners.forEach((listener) => listener())
}

/**
 * Active image preview, or null when closed.
 *
 * @returns Preview state.
 */
export function getImagePreview(): ImagePreviewState | null {
  return preview
}

/**
 * Open the image lightbox from a document image.
 *
 * @param img - Source image element.
 * @param theme - Editor chrome theme pack.
 */
export function openImagePreview(
  img: HTMLImageElement,
  theme: 'classic' | 'dark' = 'classic',
): void {
  const rect = img.getBoundingClientRect()
  preview = {
    src: img.getAttribute('src') ?? '',
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    displayWidth: img.width,
    displayHeight: img.height,
    originLeft: rect.left,
    originTop: rect.top,
    theme,
  }
  emit()
}

/** Close the image lightbox. */
export function closeImagePreview(): void {
  if (!preview) {
    return
  }
  preview = null
  emit()
}

/**
 * Subscribe to image-preview changes.
 *
 * @param listener - Callback on change.
 * @returns Unsubscribe function.
 */
export function subscribeImagePreview(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
