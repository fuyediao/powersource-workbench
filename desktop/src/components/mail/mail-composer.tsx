import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  MailComposerEditor,
  type MailComposerEditorHandle,
} from '@/components/mail/mail-composer-editor'
import { MailCrmRecipientPicker } from '@/components/mail/mail-crm-recipient-picker'
import { MailRecipientChips } from '@/components/mail/mail-recipient-chips'
import { MailScheduleMenu } from '@/components/mail/mail-schedule-menu'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { useMailCrmChipSuggestions } from '@/hooks/use-mail-crm-chip-suggestions'
import { MAIL_SIDEBAR_EXPANDED_PX } from '@/hooks/use-mail-sidebar-mode'
import { ChevronDownIcon, CloseIcon, ClockIcon, ExternalLinkIcon, PaperclipIcon, SendIcon, TrashIcon } from '@/icons/AllIcons'
import type { MailAccount, MailDraftRequest, MailSendAttachment, MailSendRequest } from '@/types/mail'
import {
  htmlToPlainText,
  isInlineComposeImage,
  isInlineImageSizeOk,
  sanitizeComposeHtml,
} from '@/utils/mail/compose-html'
import { composeHasQuotedText, removeQuotedMailHtml } from '@/utils/mail/compose-quote'
import { loadMailSignature, loadMailTemplates, saveMailTemplates, type MailTemplate } from '@/utils/mail/mail-prefs'
import {
  escapeHtml,
  parseCommaSeparatedMailAddresses,
  splitRecipientList,
} from '@/utils/mail/parse-mail-recipients'

type PendingAttach = {
  id: string
  name: string
  contentType: string
  dataBase64: string
}

export interface MailComposeDraft {
  mailAccountId: string
  to: string
  cc: string
  bcc: string
  replyTo?: string
  subject: string
  body: string
  inReplyToMessageId?: string
  draftId?: string
}

export type MailComposeVariant = 'popout' | 'inline'

interface MailComposerProps {
  open: boolean
  variant: MailComposeVariant
  draft: MailComposeDraft
  accounts: MailAccount[]
  /** Signed-in user id (CRM recipient picker + desktop Admin gate). */
  userId?: string | null
  /** Reserved folder-rail width so popout stays over list + reader. Use `0` to cover the rail too. */
  sidebarInsetPx?: number
  isSending: boolean
  sendError: string | null
  recentAddresses?: string[]
  onDraftChange: (draft: MailComposeDraft) => void
  onClose: () => void
  onPopout?: () => void
  onSend: (req: MailSendRequest) => Promise<boolean>
  onSaveDraft?: (req: MailDraftRequest) => Promise<string | null>
  onUpdateDraft?: (draftId: string, req: MailDraftRequest) => Promise<boolean>
  onEditSignature?: () => void
}

interface ComposerFieldProps {
  label?: string
  children: ReactNode
}

/**
 * One addressing row (To / Cc / Bcc / From) with Mailspring hairline.
 * @param props - Optional label and field control.
 * @returns Row.
 */
function ComposerField({ label, children }: ComposerFieldProps) {
  return (
    <div className="mail-composer-field relative flex items-start gap-3 px-[22px] py-2.5">
      {label ? <span className="w-10 shrink-0 pt-0.5 text-[13px] text-muted">{label}</span> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/**
 * Mailspring composer: header fields, body, format toolbar below the body, Send / attach / discard.
 * Popout fills the list+reader; inline docks under the reading pane.
 * @param props - Draft, variant, and send handlers.
 * @returns Composer, or null when unmounted.
 */
export function MailComposer({
  open,
  variant,
  draft,
  accounts,
  userId = null,
  sidebarInsetPx = MAIL_SIDEBAR_EXPANDED_PX,
  isSending,
  sendError,
  recentAddresses = [],
  onDraftChange,
  onClose,
  onPopout,
  onSend,
  onSaveDraft,
  onUpdateDraft,
  onEditSignature,
}: MailComposerProps) {
  const { t } = useTranslation()
  const presence = useDialogPresence(open, 220)
  const crmChips = useMailCrmChipSuggestions(userId)
  const isReply = Boolean(draft.inReplyToMessageId)
  const [showCc, setShowCc] = useState(draft.cc.length > 0)
  const [showBcc, setShowBcc] = useState(draft.bcc.length > 0)
  const [showReplyTo, setShowReplyTo] = useState(Boolean(draft.replyTo))
  const [showSubject, setShowSubject] = useState(!isReply || draft.subject.trim().length === 0)
  const [fromOpen, setFromOpen] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<PendingAttach[]>([])
  const [attachError, setAttachError] = useState<string | null>(null)
  const [dropActive, setDropActive] = useState(false)
  const [sendLaterOpen, setSendLaterOpen] = useState(false)
  const [undoUntil, setUndoUntil] = useState<number | null>(null)
  const undoTimerRef = useRef<number | null>(null)
  const pendingSendRef = useRef<MailSendRequest | null>(null)
  const attachInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<MailComposerEditorHandle>(null)

  const sender = useMemo(
    () => accounts.find((account) => account.id === draft.mailAccountId) ?? accounts[0] ?? null,
    [accounts, draft.mailAccountId],
  )
  const toAddresses = useMemo(() => parseCommaSeparatedMailAddresses(draft.to), [draft.to])
  const canSend = Boolean(sender && toAddresses.length > 0 && draft.subject.trim() && !isSending && !undoUntil)
  const [templates, setTemplates] = useState<MailTemplate[]>(() => loadMailTemplates())

  useEffect(() => {
    if (!onSaveDraft && !onUpdateDraft) {
      return undefined
    }
    const timer = window.setTimeout(() => {
      const req: MailDraftRequest = {
        mailAccountId: draft.mailAccountId,
        fromAddress: sender?.email,
        to: toAddresses,
        cc: showCc ? parseCommaSeparatedMailAddresses(draft.cc) : [],
        bcc: showBcc ? parseCommaSeparatedMailAddresses(draft.bcc) : [],
        subject: draft.subject,
        bodyHtml: sanitizeComposeHtml(draft.body),
        bodyText: htmlToPlainText(draft.body),
      }
      if (draft.draftId && onUpdateDraft) {
        void onUpdateDraft(draft.draftId, req)
        return
      }
      if (!draft.draftId && onSaveDraft && (draft.subject.trim() || draft.to.trim() || htmlToPlainText(draft.body))) {
        void onSaveDraft(req).then((id) => {
          if (id) {
            onDraftChange({ ...draft, draftId: id })
          }
        })
      }
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [draft, onDraftChange, onSaveDraft, onUpdateDraft, sender?.email, showBcc, showCc, toAddresses])

  useEffect(() => {
    /**
     * Composer shortcuts: send, cc/bcc, signature.
     * @param event - Keyboard event.
     */
    function onKeyDown(event: KeyboardEvent): void {
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key === 'Enter') {
        event.preventDefault()
        void handleSend()
        return
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        setShowCc(true)
        return
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        setShowBcc(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canSend, draft, pendingFiles, showBcc, showCc, showReplyTo])

  if (!presence.mounted || !sender) {
    return null
  }

  const fromAccount = sender
  const leaveClass = presence.leaving ? 'mail-compose-out' : 'mail-compose-in'

  /**
   * Inserts an image into the composer as inline HTML.
   * @param file - Image file.
   */
  function insertInlineImage(file: File): void {
    const reader = new FileReader()
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : ''
      if (!url) {
        return
      }
      editorRef.current?.insertHtml(`<img src="${url}" alt="${escapeHtml(file.name)}" />`)
    }
    reader.readAsDataURL(file)
  }

  /**
   * Reads a file into a pending MIME attachment.
   * @param file - Picked file.
   */
  function readFileAsAttachment(file: File): void {
    if (file.size > 25 * 1024 * 1024) {
      setAttachError(t('mail.format.attachTooLargeFile'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const comma = result.indexOf(',')
      const dataBase64 = comma >= 0 ? result.slice(comma + 1) : result
      if (!dataBase64) {
        return
      }
      setPendingFiles((current) => [
        ...current,
        {
          id: `${file.name}-${file.size}-${file.lastModified}-${current.length}`,
          name: file.name,
          contentType: file.type || 'application/octet-stream',
          dataBase64,
        },
      ])
    }
    reader.readAsDataURL(file)
  }

  /**
   * Handles dropped or picked files (images can inline; others attach).
   * @param files - File list.
   */
  function ingestFiles(files: File[]): void {
    if (files.length === 0) {
      return
    }
    let error: string | null = null
    for (const file of files) {
      if (isInlineComposeImage(file.type) && isInlineImageSizeOk(file.size)) {
        insertInlineImage(file)
        continue
      }
      if (isInlineComposeImage(file.type) && !isInlineImageSizeOk(file.size)) {
        error = t('mail.format.attachTooLarge')
        continue
      }
      readFileAsAttachment(file)
    }
    setAttachError(error)
  }

  /**
   * Handles the attach-file picker.
   * @param event - File input change.
   */
  function onAttachChange(event: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    ingestFiles(files)
  }

  /**
   * Builds the outbound send payload from the current draft.
   * @param scheduledAt - Optional ISO send-later time.
   * @returns Request body.
   */
  function buildSendRequest(scheduledAt?: string): MailSendRequest {
    const bodyHtml = sanitizeComposeHtml(draft.body)
    const attachments: MailSendAttachment[] = pendingFiles.map((file) => ({
      filename: file.name,
      contentType: file.contentType,
      dataBase64: file.dataBase64,
    }))
    return {
      mailAccountId: fromAccount.id,
      fromAddress: fromAccount.email,
      replyTo: showReplyTo ? draft.replyTo?.trim() || undefined : undefined,
      to: toAddresses,
      cc: showCc ? parseCommaSeparatedMailAddresses(draft.cc) : [],
      bcc: showBcc ? parseCommaSeparatedMailAddresses(draft.bcc) : [],
      subject: draft.subject.trim(),
      bodyText: htmlToPlainText(bodyHtml),
      bodyHtml,
      inReplyToMessageId: draft.inReplyToMessageId,
      draftId: draft.draftId,
      scheduledAt,
      attachments: attachments.length > 0 ? attachments : undefined,
    }
  }

  /**
   * Sends immediately or after a short undo window.
   * @param scheduledAt - Optional ISO send-later time.
   */
  async function handleSend(scheduledAt?: string): Promise<void> {
    if (toAddresses.length === 0 || !draft.subject.trim()) {
      return
    }
    const req = buildSendRequest(scheduledAt)
    if (scheduledAt) {
      const ok = await onSend(req)
      if (ok) {
        onClose()
      }
      return
    }
    pendingSendRef.current = req
    setUndoUntil(Date.now() + 5000)
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current)
    }
    undoTimerRef.current = window.setTimeout(() => {
      const pending = pendingSendRef.current
      pendingSendRef.current = null
      setUndoUntil(null)
      if (!pending) {
        return
      }
      void onSend(pending).then((ok) => {
        if (ok) {
          onClose()
        }
      })
    }, 5000)
  }

  /**
   * Cancels the undo-send timer.
   */
  function cancelUndoSend(): void {
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current)
      undoTimerRef.current = null
    }
    pendingSendRef.current = null
    setUndoUntil(null)
  }

  /**
   * Appends CRM picks to the To field without duplicating tokens.
   * @param tokens - Formatted recipient strings.
   */
  function appendToRecipients(tokens: string[]): void {
    const merged = [...splitRecipientList(draft.to), ...tokens]
    onDraftChange({ ...draft, to: merged.join(', ') })
  }

  const headerActions = (
    <div className="mail-composer-header-actions flex items-center gap-1 text-[13px] text-muted">
      {userId ? (
        <MailCrmRecipientPicker
          userId={userId}
          existingRecipients={draft.to}
          onAddRecipients={appendToRecipients}
        />
      ) : null}
      {!showCc ? (
        <button type="button" className="px-1.5 py-1 hover:text-brand" onClick={() => setShowCc(true)}>
          {t('mail.cc')}
        </button>
      ) : null}
      {!showBcc ? (
        <button type="button" className="px-1.5 py-1 hover:text-brand" onClick={() => setShowBcc(true)}>
          {t('mail.bcc')}
        </button>
      ) : null}
      {!showReplyTo ? (
        <button type="button" className="px-1.5 py-1 hover:text-brand" onClick={() => setShowReplyTo(true)}>
          {t('mail.replyTo')}
        </button>
      ) : null}
      {!showSubject ? (
        <button type="button" className="px-1.5 py-1 hover:text-brand" onClick={() => setShowSubject(true)}>
          {t('mail.subject')}
        </button>
      ) : null}
      {variant === 'inline' && onPopout ? (
        <button
          type="button"
          className="px-1.5 py-1 hover:text-brand"
          aria-label={t('mail.popoutComposer')}
          onClick={onPopout}
        >
          <ExternalLinkIcon className="size-3.5" />
        </button>
      ) : null}
      {variant === 'popout' ? (
        <button type="button" className="px-1.5 py-1 hover:text-ink" aria-label={t('actions.close')} onClick={onClose}>
          <CloseIcon className="size-3.5" />
        </button>
      ) : null}
    </div>
  )

  const shell = (
    <section
      className={`flex min-h-0 flex-1 flex-col bg-mail-compose-sheet ${leaveClass} ${
        variant === 'inline' ? 'mail-composer-inline rounded-xl border border-mail-divider' : ''
      }`}
    >
      <div className="relative shrink-0 pt-1">
        <div className="absolute top-2 right-4 z-10">{headerActions}</div>
        <ComposerField label={t('mail.to')}>
          <MailRecipientChips
            value={draft.to}
            placeholder={t('mail.toPlaceholder')}
            suggestions={recentAddresses}
            extraSuggestions={crmChips.suggestions}
            onQueryChange={crmChips.setQuery}
            onChange={(to) => onDraftChange({ ...draft, to })}
          />
        </ComposerField>
        {showCc ? (
          <ComposerField label={t('mail.cc')}>
            <MailRecipientChips
              value={draft.cc}
              suggestions={recentAddresses}
              extraSuggestions={crmChips.suggestions}
              onQueryChange={crmChips.setQuery}
              onChange={(cc) => onDraftChange({ ...draft, cc })}
            />
          </ComposerField>
        ) : null}
        {showBcc ? (
          <ComposerField label={t('mail.bcc')}>
            <MailRecipientChips
              value={draft.bcc}
              suggestions={recentAddresses}
              extraSuggestions={crmChips.suggestions}
              onQueryChange={crmChips.setQuery}
              onChange={(bcc) => onDraftChange({ ...draft, bcc })}
            />
          </ComposerField>
        ) : null}
        {showReplyTo ? (
          <ComposerField label={t('mail.replyTo')}>
            <input
              type="text"
              value={draft.replyTo ?? ''}
              onChange={(event) => onDraftChange({ ...draft, replyTo: event.target.value })}
              className="w-full bg-transparent text-[13px] text-ink outline-none"
            />
          </ComposerField>
        ) : null}
        <ComposerField label={t('mail.from')}>
          <div className="relative">
            <button
              type="button"
              className="flex w-full items-center gap-1 text-left text-[13px] text-ink"
              onClick={() => setFromOpen((value) => !value)}
            >
              <span className="min-w-0 flex-1 truncate">
                {sender.displayName ? `${sender.displayName} <${sender.email}>` : sender.email}
              </span>
              {accounts.length > 1 ? <ChevronDownIcon className="size-3.5 shrink-0 text-muted" /> : null}
            </button>
            {fromOpen && accounts.length > 1 ? (
              <div className="absolute top-full left-0 z-20 mt-1 min-w-full overflow-hidden rounded-lg border border-mail-divider bg-mail-menu-solid py-1 shadow-xl">
                {accounts.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    className={`block w-full truncate px-3 py-1.5 text-left text-[13px] hover:bg-mail-row-hover ${
                      account.id === sender.id ? 'bg-mail-selected font-semibold text-brand' : 'text-ink'
                    }`}
                    onClick={() => {
                      onDraftChange({ ...draft, mailAccountId: account.id })
                      setFromOpen(false)
                    }}
                  >
                    {account.displayName || account.email} &lt;{account.email}&gt;
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </ComposerField>
        {showSubject ? (
          <div className="mail-composer-field relative px-[22px] py-2.5">
            <input
              type="text"
              value={draft.subject}
              onChange={(event) => onDraftChange({ ...draft, subject: event.target.value })}
              placeholder={t('mail.subjectPlaceholder')}
              className="w-full bg-transparent text-[13px] font-medium text-ink outline-none placeholder:text-muted"
            />
          </div>
        ) : null}
      </div>

      <div
        className={`relative flex min-h-0 flex-1 flex-col ${dropActive ? 'ring-2 ring-brand/40' : ''}`}
        onDragOver={(event: DragEvent) => {
          event.preventDefault()
          setDropActive(true)
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={(event: DragEvent) => {
          event.preventDefault()
          setDropActive(false)
          ingestFiles(Array.from(event.dataTransfer.files ?? []))
        }}
      >
        <MailComposerEditor
          ref={editorRef}
          html={draft.body}
          placeholder={t('mail.bodyPlaceholder')}
          onChange={(html) => onDraftChange({ ...draft, body: html })}
        />
        {dropActive ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-mail-overlay text-sm font-semibold text-ink">
            {t('mail.dropToAttach')}
          </div>
        ) : null}
      </div>
      {composeHasQuotedText(draft.body) ? (
        <div className="flex justify-end px-[22px] py-1">
          <button
            type="button"
            className="text-[12px] text-muted hover:text-ink"
            onClick={() => onDraftChange({ ...draft, body: removeQuotedMailHtml(draft.body) })}
          >
            {t('mail.removeQuoted')}
          </button>
        </div>
      ) : null}

      {pendingFiles.length > 0 ? (
        <div className="flex flex-wrap gap-2 px-[22px] py-2">
          {pendingFiles.map((file) => (
            <span
              key={file.id}
              className="flex items-center gap-1 rounded-md border border-mail-divider bg-mail-chrome px-2 py-1 text-[12px] text-ink"
            >
              <PaperclipIcon className="size-3 text-muted" aria-hidden />
              <span className="max-w-40 truncate">{file.name}</span>
              <button
                type="button"
                className="text-muted hover:text-ink"
                aria-label={t('mail.format.attachRemove')}
                onClick={() =>
                  setPendingFiles((current) => current.filter((item) => item.id !== file.id))
                }
              >
                <CloseIcon className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <footer className="mail-composer-action-bar flex shrink-0 items-center gap-1 px-[22px] py-2.5">
        {undoUntil ? (
          <button type="button" className="rounded-md bg-mail-selected px-3 py-1.5 text-[13px] font-semibold text-brand" onClick={cancelUndoSend}>
            {t('mail.undoSend')}
          </button>
        ) : (
          <div className="relative flex items-center">
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-semibold text-brand-fg disabled:opacity-50"
              disabled={!canSend}
              onClick={() => void handleSend()}
            >
              <SendIcon className="size-3.5" aria-hidden />
              {isSending ? t('mail.sending') : t('mail.send')}
            </button>
            <button
              type="button"
              className="ml-0.5 rounded-md p-1.5 text-muted hover:bg-mail-row-hover hover:text-ink"
              aria-label={t('mail.sendLater')}
              onClick={() => setSendLaterOpen((value) => !value)}
            >
              <ClockIcon className="size-4" />
            </button>
            {sendLaterOpen ? (
              <div className="absolute bottom-full left-0 z-20 mb-1">
                <MailScheduleMenu
                  onPick={(iso) => {
                    void handleSend(iso)
                  }}
                  onClose={() => setSendLaterOpen(false)}
                />
              </div>
            ) : null}
          </div>
        )}
        <input
          ref={attachInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={onAttachChange}
        />
        <button
          type="button"
          className="rounded-md p-1.5 text-muted hover:bg-mail-row-hover hover:text-ink"
          aria-label={t('mail.format.attach')}
          title={t('mail.format.attach')}
          onClick={() => attachInputRef.current?.click()}
        >
          <PaperclipIcon className="size-4" />
        </button>
        <button
          type="button"
          className="rounded-md p-1.5 text-muted hover:bg-mail-row-hover hover:text-ink"
          aria-label={t('mail.discard')}
          title={t('mail.discard')}
          onClick={onClose}
        >
          <TrashIcon className="size-4" />
        </button>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-[12px] text-muted hover:bg-mail-row-hover hover:text-ink"
          onClick={() => {
            const signature = loadMailSignature()
            if (signature) {
              onDraftChange({ ...draft, body: `${draft.body}${signature}` })
              return
            }
            onEditSignature?.()
          }}
        >
          {t('mail.insertSignature')}
        </button>
        {onEditSignature ? (
          <button
            type="button"
            className="rounded-md px-2 py-1 text-[12px] text-muted hover:bg-mail-row-hover hover:text-ink"
            onClick={onEditSignature}
          >
            {t('mail.editSignature')}
          </button>
        ) : null}
        <select
          className="max-w-36 rounded-md border-0 bg-transparent text-[12px] text-muted outline-none"
          defaultValue=""
          onChange={(event) => {
            const value = event.target.value
            event.target.value = ''
            if (value === '__save__') {
              const name = window.prompt(t('mail.templateNamePrompt'))
              if (!name?.trim()) {
                return
              }
              const next: MailTemplate[] = [
                ...templates,
                { id: `${Date.now()}`, name: name.trim(), body: draft.body },
              ]
              saveMailTemplates(next)
              setTemplates(next)
              return
            }
            const template = templates.find((row) => row.id === value)
            if (template) {
              onDraftChange({ ...draft, body: `${draft.body}${template.body}` })
            }
          }}
        >
          <option value="">{t('mail.templates')}</option>
          <option value="__save__">{t('mail.saveTemplate')}</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
        <p className="min-w-0 flex-1 truncate text-xs text-red-500">{attachError || sendError}</p>
      </footer>
    </section>
  )

  if (variant === 'inline') {
    return <div className="shrink-0 px-3 pb-3 pt-1">{shell}</div>
  }

  const flushFullPage = sidebarInsetPx <= 0

  return (
    <div
      className={
        flushFullPage
          ? 'absolute inset-0 z-40 flex min-h-0 flex-col bg-mail-compose backdrop-blur-xl'
          : 'absolute inset-y-0 right-0 z-40 flex min-h-0 flex-col border-l border-mail-divider bg-mail-compose backdrop-blur-xl'
      }
      style={flushFullPage ? undefined : { left: sidebarInsetPx }}
    >
      {shell}
    </div>
  )
}
