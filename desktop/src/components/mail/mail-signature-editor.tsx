import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { MailComposerEditor } from '@/components/mail/mail-composer-editor'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { CloseIcon } from '@/icons/AllIcons'
import { loadMailSignature, saveMailSignature } from '@/utils/mail/mail-prefs'

interface MailSignatureEditorProps {
  open: boolean
  onClose: () => void
}

/**
 * Local signature editor persisted in localStorage.
 * @param props - Open state.
 * @returns Dialog, or null.
 */
export function MailSignatureEditor({ open, onClose }: MailSignatureEditorProps): ReactNode {
  const { t } = useTranslation()
  const presence = useDialogPresence(open, 200)
  const [html, setHtml] = useState(() => loadMailSignature())

  if (!presence.mounted) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 p-6">
      <div
        className={`flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-mail-divider bg-mail-dialog shadow-xl ${
          presence.leaving || !open ? 'animate-dropdown-out' : 'animate-dropdown-in'
        }`}
      >
        <header className="flex items-center justify-between border-b border-mail-divider px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">{t('mail.signatureEditor')}</h2>
          <button type="button" className="rounded-lg p-1 text-muted hover:bg-mail-row-hover" aria-label={t('actions.close')} onClick={onClose}>
            <CloseIcon className="size-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
          <MailComposerEditor html={html} placeholder={t('mail.signaturePlaceholder')} onChange={setHtml} />
        </div>
        <footer className="flex justify-end gap-2 border-t border-mail-divider px-4 py-3">
          <button type="button" className="rounded-lg px-3 py-1.5 text-[13px] text-muted hover:bg-mail-row-hover" onClick={onClose}>
            {t('actions.cancel')}
          </button>
          <button
            type="button"
            className="rounded-lg bg-brand px-3 py-1.5 text-[13px] font-semibold text-brand-fg"
            onClick={() => {
              saveMailSignature(html)
              onClose()
            }}
          >
            {t('mail.save')}
          </button>
        </footer>
      </div>
    </div>
  )
}
