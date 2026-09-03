import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { MailUndoKind } from '@/types/mail'

interface MailUndoToastProps {
  kind: MailUndoKind
  count: number
  onUndo: () => void
  onDismiss: () => void
}

/**
 * Undo toast for archive / trash / spam.
 * @param props - Kind and handlers.
 * @returns Toast.
 */
export function MailUndoToast({ kind, count, onUndo, onDismiss }: MailUndoToastProps): ReactNode {
  const { t } = useTranslation()
  const labelKey =
    kind === 'archive' ? 'mail.undo.archived' : kind === 'trash' ? 'mail.undo.trashed' : 'mail.undo.spammed'
  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-mail-divider bg-mail-menu px-3 py-2 text-[13px] shadow-xl backdrop-blur-xl">
      <span className="font-medium text-ink">{t(labelKey, { count })}</span>
      <button type="button" className="font-semibold text-brand hover:underline" onClick={onUndo}>
        {t('mail.undo.action')}
      </button>
      <button type="button" className="text-muted hover:text-ink" onClick={onDismiss}>
        {t('actions.close')}
      </button>
    </div>
  )
}
