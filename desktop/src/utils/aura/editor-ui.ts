/**
 * Editor UI façade used by the Aura WYSIWYG kernel.
 *
 * Re-exports toast / hint / image-preview store APIs so core modules import
 * one Workbench module instead of a ports injection layer.
 */
import { showToast } from '@/hooks/aura/toast-store'
import {
  setHintFillHandler,
  setHintState,
  hideHint,
  moveHintSelection,
  commitHintSelection,
  isHintVisible,
  type HintState,
} from '@/hooks/aura/hint-store'
import { openImagePreview } from '@/hooks/aura/image-preview-store'

export type EditorImageTheme = 'classic' | 'dark'

export type EditorHintState = Partial<
  HintState & {
    right?: number | 'auto'
  }
>

/**
 * Imperative UI hooks for toast, autocomplete hint, and image lightbox.
 */
export const editorUi = {
  showToast,
  setHintFillHandler,
  setHintState: (next: EditorHintState) => {
    setHintState(next)
  },
  hideHint,
  moveHintSelection,
  commitHintSelection,
  isHintVisible,
  openImagePreview: (img: HTMLImageElement, theme: EditorImageTheme = 'classic') => {
    openImagePreview(img, theme)
  },
} as const
