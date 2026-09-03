import { CloudUploadIcon } from '@/icons/AllIcons'

export interface FileDropOverlayProps {
  /** True while a matching file drag is over the page. */
  active: boolean
  /** True while the drop is being uploaded. */
  uploading: boolean
  /** Short status shown only while `active` (i18n already resolved). */
  label: string
}

/**
 * Full-page drop veil. Renders nothing when idle so the workspace stays
 * visually unchanged until the user drags a file in.
 * @param props - Active / uploading flags and label.
 * @returns Overlay, or null when idle.
 */
export function FileDropOverlay({ active, uploading, label }: FileDropOverlayProps) {
  if (!active && !uploading) {
    return null
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-canvas/80 backdrop-blur-sm"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-brand/50 bg-brand/5 px-10 py-8">
        <CloudUploadIcon className="size-8 text-brand" aria-hidden />
        <p className="text-sm font-semibold text-ink">{label}</p>
      </div>
    </div>
  )
}
