import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { CloseIcon, DownloadIcon } from '@/icons/AllIcons'

export interface MailAttachmentPreviewState {
  url: string
  filename: string
  contentType: string | null
}

interface MailAttachmentPreviewProps {
  preview: MailAttachmentPreviewState | null
  onClose: () => void
  onDownload: () => void
}

/**
 * In-app image / PDF attachment lightbox.
 * @param props - Preview blob URL.
 * @returns Dialog, or null.
 */
export function MailAttachmentPreview({
  preview,
  onClose,
  onDownload,
}: MailAttachmentPreviewProps): ReactNode {
  const { t } = useTranslation()
  const presence = useDialogPresence(preview != null, 200)
  if (!presence.mounted || !preview) {
    return null
  }
  const isPdf = (preview.contentType ?? '').toLowerCase().includes('pdf') || /\.pdf$/i.test(preview.filename)
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-6">
      <div
        className={`flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-mail-divider bg-mail-dialog shadow-xl ${
          presence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
        }`}
      >
        <header className="flex items-center gap-2 border-b border-mail-divider px-4 py-3">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{preview.filename}</h2>
          <button type="button" className="rounded-lg p-1.5 text-muted hover:bg-mail-row-hover" aria-label={t('mail.format.attach')} onClick={onDownload}>
            <DownloadIcon className="size-4" />
          </button>
          <button type="button" className="rounded-lg p-1.5 text-muted hover:bg-mail-row-hover" aria-label={t('actions.close')} onClick={onClose}>
            <CloseIcon className="size-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto bg-black/80">
          {isPdf ? (
            <iframe title={preview.filename} src={preview.url} className="h-[70vh] w-full border-0 bg-white" />
          ) : (
            <img src={preview.url} alt={preview.filename} className="mx-auto max-h-[70vh] max-w-full object-contain" />
          )}
        </div>
      </div>
    </div>
  )
}
