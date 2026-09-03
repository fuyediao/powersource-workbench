/**
 * Related-mail detail overlay: headers plus sanitized body.
 */

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { MailBodyIframe } from '@/components/mail/mail-body-iframe'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { CloseIcon } from '@/icons/AllIcons'
import { getMailMessageDetail } from '@/services/mail-api'
import type { MailAddress, MailMessageDetail } from '@/types/mail'
import { formatMailDetailDate } from '@/utils/mail/format-mail-date'
import { formatReplyAddress, plainTextToMailHtml } from '@/utils/mail/parse-mail-recipients'
import { sanitizeMailHtml } from '@/utils/mail/sanitize-mail-html'

interface MailMessageDialogProps {
  messageId: string | null
  onClose: () => void
}

/**
 * Builds a sandboxed HTML document for the mail body iframe.
 * @param html - Sanitized body HTML.
 * @returns Full document string.
 */
function buildMailDocument(html: string): string {
  return `<!DOCTYPE html><html lang=""><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
html,body{margin:0;padding:0;height:100%}body{color:#18181b;font:14px/1.55 "Plus Jakarta Sans",sans-serif;word-break:break-word;overflow:auto}a{color:#0ea5e9}img{max-width:100%;height:auto;vertical-align:middle}table{max-width:100%;border-collapse:collapse}
</style></head><body>${html}</body></html>`
}

/**
 * Formats To / Cc lines for the header.
 * @param rows - Address list.
 * @returns Comma-separated display, or empty.
 */
function formatAddressList(rows: MailAddress[]): string {
  return rows
    .map((row) => formatReplyAddress(row.name ?? null, row.email))
    .filter((value) => value.length > 0)
    .join(', ')
}

/**
 * Picks HTML for the iframe: provider HTML, then plain text, then snippet.
 * @param detail - Loaded message.
 * @returns Sanitized HTML, or empty when nothing is available.
 */
function bodyHtmlFromDetail(detail: MailMessageDetail): string {
  if (detail.bodyHtml?.trim()) {
    return sanitizeMailHtml(detail.bodyHtml)
  }
  const plain = detail.bodyText?.trim() || detail.snippet?.trim() || ''
  return plain ? plainTextToMailHtml(plain) : ''
}

/**
 * Customer related-mail reader dialog.
 * @param props - Selected message id and close handler.
 * @returns Portal overlay, or null when unmounted.
 */
export function MailMessageDialog({ messageId, onClose }: MailMessageDialogProps) {
  const { t, i18n } = useTranslation()
  const presence = useDialogPresence(Boolean(messageId))
  const [detail, setDetail] = useState<MailMessageDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!messageId) {
      setDetail(null)
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void getMailMessageDetail(messageId)
      .then((row) => {
        if (!cancelled) {
          setDetail(row)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.error('[MailMessageDialog] load:', err)
          setDetail(null)
          setError(err instanceof Error ? err.message : t('admin.customers.detail.mailDetailError'))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [messageId, t])

  useEffect(() => {
    if (!messageId) {
      return
    }
    /**
     * Closes on Escape.
     * @param event - Keyboard event.
     * @returns Nothing.
     */
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [messageId, onClose])

  const srcDoc = useMemo(() => {
    if (!detail) {
      return null
    }
    const html = bodyHtmlFromDetail(detail)
    return html ? buildMailDocument(html) : null
  }, [detail])

  if (!presence.mounted) {
    return null
  }

          const title = detail?.subject?.trim() || t('admin.customers.detail.mailNoSubject', { defaultValue: '(No subject)' })
  const fromLine = detail
    ? formatReplyAddress(detail.fromName, detail.fromAddress)
    : ''
  const toLine = detail ? formatAddressList(detail.toAddresses) : ''
  const ccLine = detail ? formatAddressList(detail.ccAddresses) : ''

  return createPortal(
    <div
      className={`fixed inset-0 z-[130] flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px] ${
        presence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-ink/10 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-extrabold text-ink">{title}</h2>
            {detail ? (
              <p className="mt-0.5 text-xs font-medium text-muted">
                {formatMailDetailDate(detail.receivedAt, i18n.language)}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-muted hover:bg-ink/5 hover:text-ink"
            aria-label={t('actions.close')}
            onClick={onClose}
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-sm font-medium text-muted">{t('admin.customers.detail.mailLoading')}</p>
          ) : null}

          {error ? <p className="text-sm font-medium text-rose-500">{error}</p> : null}

          {!loading && detail ? (
            <dl className="mb-4 space-y-1.5 text-xs">
              <div>
                <dt className="inline font-semibold text-ink">
                  {t('admin.customers.detail.mailFrom', { defaultValue: 'From' })}:{' '}
                </dt>
                <dd className="inline text-muted">{fromLine || '—'}</dd>
              </div>
              <div>
                <dt className="inline font-semibold text-ink">
                  {t('admin.customers.detail.mailTo', { defaultValue: 'To' })}:{' '}
                </dt>
                <dd className="inline text-muted">{toLine || '—'}</dd>
              </div>
              {ccLine ? (
                <div>
                  <dt className="inline font-semibold text-ink">
                    {t('admin.customers.detail.mailCc', { defaultValue: 'Cc' })}:{' '}
                  </dt>
                  <dd className="inline text-muted">{ccLine}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          {!loading && detail && srcDoc ? (
            <div className="h-[min(52vh,520px)] overflow-hidden rounded-xl border border-ink/10 bg-white">
              <MailBodyIframe title={title} srcDoc={srcDoc} fill />
            </div>
          ) : null}

          {!loading && detail && !srcDoc ? (
            <p className="text-sm font-medium text-muted">
              {t('admin.customers.detail.mailEmptyBody', { defaultValue: 'This message has no body.' })}
            </p>
          ) : null}

          {!loading && detail && detail.attachments.length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs font-medium text-muted">
              {detail.attachments.map((file) => (
                <li key={file.id}>{file.filename}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}
