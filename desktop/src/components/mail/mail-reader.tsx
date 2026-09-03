import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  DownloadIcon,
  EyeIcon,
  ForwardIcon,
  InboxIcon,
  MailIcon,
  PaperclipIcon,
  PrinterIcon,
  ReplyAllIcon,
  ReplyIcon,
  SearchIcon,
  ShieldIcon,
  StarIcon,
  TrashIcon,
} from '@/icons/AllIcons'
import { StatusLoading } from '@/components/common/status-loading'
import type { MailMessageDetail } from '@/types/mail'
import { formatMailDetailDate } from '@/utils/mail/format-mail-date'
import { loadMailRemoteImagesPref, saveMailRemoteImagesPref } from '@/utils/mail/mail-prefs'
import { highlightMailHtml, splitQuotedMailHtml } from '@/utils/mail/quoted-html'
import { MailBodyIframe } from '@/components/mail/mail-body-iframe'
import { AppTooltip } from '@/components/ui/app-tooltip'
import { canPreviewMailAttachment, rewriteRemoteMailImages } from '@/utils/mail/remote-images'
import { officeKindFromFileName } from '@/utils/office/office-document-request'
import { isMailSpam } from '@/utils/mail/is-mail-spam'
import { sanitizeMailHtml } from '@/utils/mail/sanitize-mail-html'

interface MailReaderProps {
  message: MailMessageDetail | null
  threadMessages: MailMessageDetail[]
  leaving: boolean
  isLoading: boolean
  locale: string
  onToggleStar: (messageId: string, starred: boolean) => void
  isSpamView: boolean
  onSpam: () => void
  onNotSpam: () => void
  onTrash: () => void
  onMarkUnread: () => void
  onReply: () => void
  onReplyAll: () => void
  onForward: () => void
  onDownloadAttachment: (messageId: string, attachmentId: string, filename: string) => void
  onOpenOfficeAttachment: (messageId: string, attachmentId: string, filename: string) => void
  onPreviewAttachment: (
    messageId: string,
    attachmentId: string,
    filename: string,
    contentType: string | null,
  ) => void
  onDownloadEml: () => void
  footer?: ReactNode
}

/**
 * Builds a standalone HTML document for the sandboxed mail iframe.
 * @param html - Sanitized body HTML.
 * @returns Full document string.
 */
function buildMailDocument(html: string): string {
  return `<!DOCTYPE html><html lang=""><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
html,body{margin:0;padding:0;height:100%}body{color:#18181b;font:14px/1.55 "Plus Jakarta Sans",sans-serif;word-break:break-word;overflow:auto}a{color:#0ea5e9}img{max-width:100%;height:auto;vertical-align:middle}img[data-mail-remote-src]{background:#f4f4f5;outline:1px dashed #d4d4d8}table{max-width:100%;border-collapse:collapse}mark.mail-find-hit{background:#fde68a;color:inherit;padding:0 1px;border-radius:2px}
</style></head><body>${html}</body></html>`
}

/**
 * Right Mailspring-style reading pane with thread collapse, attachments, and find-in-thread.
 * @param props - Active message and actions.
 * @returns Reader, empty state, or loading.
 */
export function MailReader({
  message,
  threadMessages,
  leaving,
  isLoading,
  locale,
  onToggleStar,
  isSpamView,
  onSpam,
  onNotSpam,
  onTrash,
  onMarkUnread,
  onReply,
  onReplyAll,
  onForward,
  onDownloadAttachment,
  onOpenOfficeAttachment,
  onPreviewAttachment,
  onDownloadEml,
  footer,
}: MailReaderProps) {
  const { t } = useTranslation()
  const printRef = useRef<HTMLIFrameElement>(null)
  const hitRefs = useRef<Record<string, HTMLElement | null>>({})
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findIndex, setFindIndex] = useState(0)
  const [detailedHeaders, setDetailedHeaders] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [quotedOpen, setQuotedOpen] = useState<Record<string, boolean>>({})
  const [loadRemote, setLoadRemote] = useState(() => loadMailRemoteImagesPref())

  const thread = threadMessages.length > 0 ? threadMessages : message ? [message] : []
  const minify = thread.length > 4

  const findHitIds = useMemo(() => {
    const q = findQuery.trim().toLowerCase()
    if (!q) {
      return [] as string[]
    }
    return thread
      .filter((row) => {
        const hay = `${row.subject ?? ''} ${row.fromAddress} ${row.bodyText ?? ''} ${row.snippet ?? ''} ${row.bodyHtml ?? ''}`.toLowerCase()
        return hay.includes(q)
      })
      .map((row) => row.id)
  }, [findQuery, thread])

  if (isLoading && !message) {
    return (
      <div className="h-full min-h-0 flex-1 bg-mail-reader">
        <StatusLoading />
      </div>
    )
  }

  if (!message) {
    return (
      <div className="mail-empty-in flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-mail-reader text-muted">
        <span className="grid size-14 place-items-center rounded-2xl bg-brand/10 text-brand">
          <MailIcon className="size-7" aria-hidden />
        </span>
        <p className="text-sm font-medium">{t('mail.emptyReader')}</p>
      </div>
    )
  }

  const from = message.fromName
    ? `${message.fromName} <${message.fromAddress}>`
    : message.fromAddress

  /**
   * Prints the active message iframe (requires sandbox `allow-modals`).
   */
  function printActive(): void {
    const frame = printRef.current
    const win = frame?.contentWindow
    if (!win) {
      return
    }
    try {
      win.focus()
      win.print()
    } catch {
      // Sandbox / Electron may reject print; ignore.
    }
  }

  /**
   * Toggles a thread message expanded state.
   * @param id - Message id.
   */
  function toggleExpanded(id: string): void {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <article
      className={`flex h-full min-h-0 flex-1 flex-col bg-mail-reader-open backdrop-blur-xl ${
        leaving ? 'mail-reader-out' : 'mail-reader-in'
      }`}
    >
      <header className="border-b border-mail-divider px-5 py-4">
        <div className="flex items-start gap-3">
          <h1 className="min-w-0 flex-1 text-lg font-extrabold tracking-tight text-brand">
            {message.subject || t('mail.noSubject')}
          </h1>
          <div className="flex shrink-0 items-center gap-0.5">
            <AppTooltip label={t('mail.reply')}>
              <button
                type="button"
                className="rounded-lg p-2 text-muted hover:bg-mail-row-hover hover:text-ink"
                aria-label={t('mail.reply')}
                onClick={onReply}
              >
                <ReplyIcon className="size-4" aria-hidden />
              </button>
            </AppTooltip>
            <AppTooltip label={t('mail.replyAll')}>
              <button
                type="button"
                className="rounded-lg p-2 text-muted hover:bg-mail-row-hover hover:text-ink"
                aria-label={t('mail.replyAll')}
                onClick={onReplyAll}
              >
                <ReplyAllIcon className="size-4" aria-hidden />
              </button>
            </AppTooltip>
            <AppTooltip label={t('mail.forward')}>
              <button
                type="button"
                className="rounded-lg p-2 text-muted hover:bg-mail-row-hover hover:text-ink"
                aria-label={t('mail.forward')}
                onClick={onForward}
              >
                <ForwardIcon className="size-4" aria-hidden />
              </button>
            </AppTooltip>
            <AppTooltip label={message.isStarred ? t('mail.unstar') : t('mail.star')}>
              <button
                type="button"
                className="rounded-lg p-2 text-mail-star hover:bg-mail-row-hover"
                aria-label={message.isStarred ? t('mail.unstar') : t('mail.star')}
                onClick={() => void onToggleStar(message.id, !message.isStarred)}
              >
                <StarIcon className="size-4" filled={message.isStarred} aria-hidden />
              </button>
            </AppTooltip>
            <AppTooltip label={t('mail.unread')}>
              <button
                type="button"
                className="rounded-lg p-2 text-muted hover:bg-mail-row-hover hover:text-ink"
                aria-label={t('mail.unread')}
                onClick={() => void onMarkUnread()}
              >
                {t('mail.unread')}
              </button>
            </AppTooltip>
            <AppTooltip label={t('mail.loadImages')}>
              <button
                type="button"
                className="rounded-lg p-2 text-muted hover:bg-mail-row-hover hover:text-ink"
                aria-label={t('mail.loadImages')}
                onClick={() => {
                  setLoadRemote((current) => {
                    const next = !current
                    saveMailRemoteImagesPref(next)
                    return next
                  })
                }}
              >
                <EyeIcon className={`size-4 ${loadRemote ? 'text-brand' : ''}`} aria-hidden />
              </button>
            </AppTooltip>
            <AppTooltip label={t('mail.findInThread')}>
              <button
                type="button"
                className="rounded-lg p-2 text-muted hover:bg-mail-row-hover hover:text-ink"
                aria-label={t('mail.findInThread')}
                onClick={() => setFindOpen((value) => !value)}
              >
                <SearchIcon className="size-4" aria-hidden />
              </button>
            </AppTooltip>
            <AppTooltip label={t('mail.print')}>
              <button
                type="button"
                className="rounded-lg p-2 text-muted hover:bg-mail-row-hover hover:text-ink"
                aria-label={t('mail.print')}
                onClick={printActive}
              >
                <PrinterIcon className="size-4" aria-hidden />
              </button>
            </AppTooltip>
            <AppTooltip label={t('mail.downloadEml')}>
              <button
                type="button"
                className="rounded-lg p-2 text-muted hover:bg-mail-row-hover hover:text-ink"
                aria-label={t('mail.downloadEml')}
                onClick={onDownloadEml}
              >
                <DownloadIcon className="size-4" aria-hidden />
              </button>
            </AppTooltip>
            {isMailSpam(message.labels, isSpamView) ? (
              <AppTooltip label={t('mail.notSpam')}>
                <button
                  type="button"
                  className="rounded-lg p-2 text-muted hover:bg-mail-row-hover hover:text-ink"
                  aria-label={t('mail.notSpam')}
                  onClick={onNotSpam}
                >
                  <InboxIcon className="size-4" aria-hidden />
                </button>
              </AppTooltip>
            ) : (
              <AppTooltip label={t('mail.spam')}>
                <button
                  type="button"
                  className="rounded-lg p-2 text-muted hover:bg-mail-row-hover hover:text-ink"
                  aria-label={t('mail.spam')}
                  onClick={onSpam}
                >
                  <ShieldIcon className="size-4" aria-hidden />
                </button>
              </AppTooltip>
            )}
            <AppTooltip label={t('mail.trash')}>
              <button
                type="button"
                className="rounded-lg p-2 text-muted hover:bg-mail-row-hover hover:text-ink"
                aria-label={t('mail.trash')}
                onClick={onTrash}
              >
                <TrashIcon className="size-4" aria-hidden />
              </button>
            </AppTooltip>
          </div>
        </div>
        {findOpen ? (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="search"
              value={findQuery}
              onChange={(event) => {
                setFindQuery(event.target.value)
                setFindIndex(0)
              }}
              placeholder={t('mail.findInThread')}
              className="min-w-0 flex-1 rounded-lg border border-mail-divider bg-mail-input px-2 py-1 text-[13px] outline-none"
            />
            <span className="text-[12px] text-muted">{t('mail.findHits', { count: findHitIds.length })}</span>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-[12px] hover:bg-mail-row-hover disabled:opacity-40"
              disabled={findHitIds.length === 0}
              onClick={() => {
                const next = findHitIds.length === 0 ? 0 : (findIndex - 1 + findHitIds.length) % findHitIds.length
                setFindIndex(next)
                hitRefs.current[findHitIds[next]]?.scrollIntoView({ block: 'center' })
              }}
            >
              {t('mail.findPrev')}
            </button>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-[12px] hover:bg-mail-row-hover disabled:opacity-40"
              disabled={findHitIds.length === 0}
              onClick={() => {
                const next = findHitIds.length === 0 ? 0 : (findIndex + 1) % findHitIds.length
                setFindIndex(next)
                hitRefs.current[findHitIds[next]]?.scrollIntoView({ block: 'center' })
              }}
            >
              {t('mail.findNext')}
            </button>
          </div>
        ) : null}
        <button type="button" className="mt-2 text-left text-sm font-semibold text-brand" onClick={() => setDetailedHeaders((value) => !value)}>
          {from}
        </button>
        <p className="mt-0.5 text-xs text-muted">{formatMailDetailDate(message.receivedAt, locale)}</p>
        {detailedHeaders ? (
          <dl className="mt-2 space-y-1 text-[12px] text-muted">
            <div><dt className="inline font-semibold text-ink">{t('mail.to')}: </dt><dd className="inline">{message.toAddresses.map((row) => row.email).join(', ') || '—'}</dd></div>
            {message.ccAddresses.length > 0 ? (
              <div><dt className="inline font-semibold text-ink">{t('mail.cc')}: </dt><dd className="inline">{message.ccAddresses.map((row) => row.email).join(', ')}</dd></div>
            ) : null}
          </dl>
        ) : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-5 py-4">
        {thread.map((row, index) => {
          const isLast = index === thread.length - 1
          const collapsed = !isLast && (minify && index < thread.length - 3) && !expandedIds.has(row.id)
          const sanitized = row.bodyHtml ? sanitizeMailHtml(row.bodyHtml) : ''
          const split = sanitized ? splitQuotedMailHtml(sanitized) : { main: '', quoted: null }
          const remote = rewriteRemoteMailImages(split.main || sanitized, loadRemote)
          const highlighted = highlightMailHtml(remote.html, findQuery)
          const srcDoc = highlighted ? buildMailDocument(highlighted) : null
          const quotedDoc =
            split.quoted && quotedOpen[row.id]
              ? buildMailDocument(highlightMailHtml(rewriteRemoteMailImages(split.quoted, loadRemote).html, findQuery))
              : null
          const hit = findHitIds.includes(row.id)
          const activeHit = hit && findHitIds[findIndex] === row.id
          return (
            <section
              key={row.id}
              ref={(node) => {
                hitRefs.current[row.id] = node
              }}
              className={`flex min-h-0 flex-col rounded-xl border ${isLast && !collapsed ? 'flex-1' : 'shrink-0'} ${activeHit ? 'border-brand' : hit ? 'border-brand/50' : 'border-mail-divider'} bg-mail-chrome/40`}
            >
              <button
                type="button"
                className="flex w-full shrink-0 items-center gap-2 px-3 py-2 text-left text-[13px]"
                onClick={() => toggleExpanded(row.id)}
              >
                {collapsed ? <ChevronRightIcon className="size-3.5 text-muted" /> : <ChevronDownIcon className="size-3.5 text-muted" />}
                <span className="min-w-0 flex-1 truncate font-semibold text-ink">{row.fromName || row.fromAddress}</span>
                <span className="shrink-0 text-[11px] text-muted">{formatMailDetailDate(row.receivedAt, locale)}</span>
              </button>
              {collapsed ? (
                <p className="shrink-0 px-3 pb-2 text-[12px] text-muted line-clamp-2">{row.snippet || row.bodyText || ''}</p>
              ) : (
                <div className={`flex min-h-0 flex-col px-3 pb-3 ${isLast ? 'flex-1' : ''}`}>
                  {!loadRemote && remote.blocked > 0 ? (
                    <button
                      type="button"
                      className="mb-2 shrink-0 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-left text-[12px] font-medium text-brand hover:bg-brand/10"
                      onClick={() => {
                        saveMailRemoteImagesPref(true)
                        setLoadRemote(true)
                      }}
                    >
                      {t('mail.loadImagesCount', { count: remote.blocked })}
                    </button>
                  ) : null}
                  {srcDoc ? (
                    <div className={`min-h-0 ${isLast ? 'flex-1' : 'max-h-80'}`}>
                      <MailBodyIframe
                        fill
                        iframeRef={isLast ? printRef : undefined}
                        title={t('mail.bodyTitle')}
                        srcDoc={srcDoc}
                        className="block h-full w-full rounded-xl border-0 bg-white"
                      />
                    </div>
                  ) : (
                    <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap text-sm leading-relaxed text-ink">
                      {row.bodyText || row.snippet || t('mail.emptyBody')}
                    </pre>
                  )}
                  {split.quoted ? (
                    <button
                      type="button"
                      className="mt-2 shrink-0 text-[12px] tracking-[0.35em] text-muted hover:text-ink"
                      aria-label={t('mail.showQuoted')}
                      onClick={() => setQuotedOpen((current) => ({ ...current, [row.id]: !current[row.id] }))}
                    >
                      •••
                    </button>
                  ) : null}
                  {quotedDoc ? (
                    <MailBodyIframe
                      title={t('mail.showQuoted')}
                      srcDoc={quotedDoc}
                      className="mt-2 block max-h-48 w-full rounded-xl border-0 bg-white"
                    />
                  ) : null}
                  {row.attachments.length > 0 ? (
                    <ul className="mt-2 flex shrink-0 flex-wrap gap-2">
                      {row.attachments.map((att) => (
                        <li key={att.id}>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md border border-mail-divider bg-mail-chrome px-2 py-1 text-[12px] hover:bg-mail-row-hover"
                            onClick={() => {
                              if (canPreviewMailAttachment(att.contentType, att.filename)) {
                                onPreviewAttachment(row.id, att.id, att.filename, att.contentType)
                                return
                              }
                              if (officeKindFromFileName(att.filename)) {
                                onOpenOfficeAttachment(row.id, att.id, att.filename)
                                return
                              }
                              onDownloadAttachment(row.id, att.id, att.filename)
                            }}
                          >
                            <PaperclipIcon className="size-3" />
                            <span className="max-w-40 truncate">{att.filename}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}
            </section>
          )
        })}
      </div>
      {footer}
    </article>
  )
}
