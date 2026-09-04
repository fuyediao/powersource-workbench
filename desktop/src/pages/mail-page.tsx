import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MailAddAccount } from '@/components/mail/mail-add-account'
import {
  MailAttachmentPreview,
  type MailAttachmentPreviewState,
} from '@/components/mail/mail-attachment-preview'
import { MailComposer, type MailComposeDraft, type MailComposeVariant } from '@/components/mail/mail-composer'
import { MailLabelPicker } from '@/components/mail/mail-label-picker'
import { MailMenubar } from '@/components/mail/mail-menubar'
import { MailOutboxList } from '@/components/mail/mail-outbox-list'
import { MailReader } from '@/components/mail/mail-reader'
import { MailScheduleMenu } from '@/components/mail/mail-schedule-menu'
import { MailSidebar } from '@/components/mail/mail-sidebar'
import { MailSignatureEditor } from '@/components/mail/mail-signature-editor'
import { MailThreadList } from '@/components/mail/mail-thread-list'
import { MailUndoToast } from '@/components/mail/mail-undo-toast'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { useMail } from '@/hooks/use-mail'
import { useMailSidebarMode } from '@/hooks/use-mail-sidebar-mode'
import type { MailMessageDetail } from '@/types/mail'
import { wrapQuotedMailHtml } from '@/utils/mail/compose-quote'
import { formatMailDetailDate } from '@/utils/mail/format-mail-date'
import {
  loadMailListWidth,
  MAIL_LIST_WIDTH_MAX,
  MAIL_LIST_WIDTH_MIN,
  saveMailListWidth,
} from '@/utils/mail/mail-prefs'
import { buildMbox } from '@/utils/mail/mbox-export'
import { formatReplyAddress } from '@/utils/mail/parse-mail-recipients'
import { saveBlobFile } from '@/utils/mail/save-blob'
import {
  formatMailAccountMenuLabel,
  patchMailMenuHandlers,
  setMailMenuView,
  unregisterMailMenuHost,
} from '@/utils/mail/mail-menu'
import {
  consumePendingMailCompose,
  subscribeMailComposeRequest,
  type MailComposeRequest,
} from '@/utils/mail/mail-compose-request'
import { sanitizeMailHtml } from '@/utils/mail/sanitize-mail-html'

const READER_LEAVE_MS = 220

/**
 * Builds a blank compose draft for the active mailbox.
 * @param accountId - Sender account id.
 * @returns Draft.
 */
function emptyComposeDraft(accountId: string): MailComposeDraft {
  return { mailAccountId: accountId, to: '', cc: '', bcc: '', subject: '', body: '' }
}

/**
 * Builds a reply or reply-all draft from the open message.
 * @param accountId - Sender account id.
 * @param message - Message being replied to.
 * @param replyAll - Include To/Cc participants.
 * @param locale - Date locale.
 * @returns Draft.
 */
function replyComposeDraft(
  accountId: string,
  message: MailMessageDetail,
  replyAll: boolean,
  locale: string,
): MailComposeDraft {
  const subject = message.subject?.trim() ?? ''
  const to = formatReplyAddress(message.fromName, message.fromAddress)
  const cc = replyAll
    ? [...message.toAddresses, ...message.ccAddresses]
        .map((row) => formatReplyAddress(row.name ?? null, row.email))
        .filter((row) => row && !row.toLowerCase().includes(message.fromAddress.toLowerCase()))
        .join(', ')
    : ''
  const cite = `${message.fromName || message.fromAddress} — ${formatMailDetailDate(message.receivedAt, locale)}`
  const quoted = wrapQuotedMailHtml(sanitizeMailHtml(message.bodyHtml ?? ''), message.bodyText ?? message.snippet ?? '', cite)
  return {
    mailAccountId: accountId,
    to,
    cc,
    bcc: '',
    subject: !subject || subject.toLowerCase().startsWith('re:') ? subject || 'Re:' : `Re: ${subject}`,
    body: quoted,
    inReplyToMessageId: message.id,
  }
}

/**
 * Builds a forward draft from the open message.
 * @param accountId - Sender account id.
 * @param message - Message being forwarded.
 * @param locale - Date locale.
 * @returns Draft.
 */
function forwardComposeDraft(accountId: string, message: MailMessageDetail, locale: string): MailComposeDraft {
  const subject = message.subject?.trim() ?? ''
  const cite = `${message.fromName || message.fromAddress} — ${formatMailDetailDate(message.receivedAt, locale)}`
  const quoted = wrapQuotedMailHtml(sanitizeMailHtml(message.bodyHtml ?? ''), message.bodyText ?? message.snippet ?? '', cite)
  return {
    mailAccountId: accountId,
    to: '',
    cc: '',
    bcc: '',
    subject: !subject || subject.toLowerCase().startsWith('fwd:') ? subject || 'Fwd:' : `Fwd: ${subject}`,
    body: quoted,
  }
}

interface MailPageProps {
  /** Signed-in user id for CRM compose recipient picker. */
  userId: string
}

/**
 * Electron mail workspace: Aura-style menubar over Mailspring three panes.
 * On macOS the four menubar groups live on the native application menu.
 * @param props - Auth identity for CRM recipient lookup.
 * @returns Mail page.
 */
export function MailPage({ userId }: MailPageProps) {
  const { t, i18n } = useTranslation()
  const mail = useMail()
  const sidebar = useMailSidebarMode()
  const readerPresence = useDialogPresence(mail.activeMessage != null, READER_LEAVE_MS)
  const lastMessageRef = useRef<MailMessageDetail | null>(null)
  if (mail.activeMessage) {
    lastMessageRef.current = mail.activeMessage
  }
  const readerMessage = mail.activeMessage ?? (readerPresence.leaving ? lastMessageRef.current : null)
  const locale = i18n.resolvedLanguage || i18n.language || 'en'

  const [addAccountOpen, setAddAccountOpen] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeVariant, setComposeVariant] = useState<MailComposeVariant>('popout')
  const [composeDraft, setComposeDraft] = useState<MailComposeDraft | null>(null)
  const [composeRequest, setComposeRequest] = useState<MailComposeRequest | null>(null)
  const [signatureOpen, setSignatureOpen] = useState(false)
  const [scheduleIds, setScheduleIds] = useState<string[] | null>(null)
  const [labelIds, setLabelIds] = useState<string[] | null>(null)
  const [preview, setPreview] = useState<MailAttachmentPreviewState | null>(null)
  const [listWidth, setListWidth] = useState(() => loadMailListWidth())

  const accountIdForCompose = mail.selectedAccount?.id ?? mail.accounts[0]?.id

  const openCompose = useCallback((): void => {
    if (!accountIdForCompose) {
      setAddAccountOpen(true)
      return
    }
    setComposeDraft(emptyComposeDraft(accountIdForCompose))
    setComposeVariant('popout')
    setComposeOpen(true)
  }, [accountIdForCompose])

  /**
   * Applies an external compose request once a mailbox account is ready.
   */
  useEffect(() => {
    const pending = consumePendingMailCompose()
    if (pending) {
      setComposeRequest(pending)
    }
    return subscribeMailComposeRequest((request) => {
      setComposeRequest(request)
    })
  }, [])

  useEffect(() => {
    if (!composeRequest) {
      return
    }
    if (mail.isLoadingAccounts) {
      return
    }
    if (!accountIdForCompose) {
      setAddAccountOpen(true)
      return
    }
    setComposeDraft({
      ...emptyComposeDraft(accountIdForCompose),
      to: composeRequest.to,
      subject: composeRequest.subject ?? '',
      body: composeRequest.body ?? '',
    })
    setComposeVariant('popout')
    setComposeOpen(true)
    setComposeRequest(null)
  }, [accountIdForCompose, composeRequest, mail.isLoadingAccounts])

  const openReply = useCallback(
    (replyAll = false, messageId?: string): void => {
      const message =
        (messageId ? mail.threadMessages.find((row) => row.id === messageId) : null) ??
        mail.activeMessage ??
        lastMessageRef.current
      if (!message || !accountIdForCompose) {
        return
      }
      setComposeDraft(replyComposeDraft(accountIdForCompose, message, replyAll, locale))
      setComposeVariant('inline')
      setComposeOpen(true)
    },
    [accountIdForCompose, locale, mail.activeMessage, mail.threadMessages],
  )

  const openForward = useCallback(
    (messageId?: string): void => {
      const message =
        (messageId ? mail.threadMessages.find((row) => row.id === messageId) : null) ??
        mail.activeMessage ??
        lastMessageRef.current
      if (!message || !accountIdForCompose) {
        return
      }
      setComposeDraft(forwardComposeDraft(accountIdForCompose, message, locale))
      setComposeVariant('popout')
      setComposeOpen(true)
    },
    [accountIdForCompose, locale, mail.activeMessage, mail.threadMessages],
  )

  const closeCompose = useCallback((): void => {
    setComposeOpen(false)
  }, [])

  /**
   * Clears the popout draft after the leave animation so no full-page shell remains.
   */
  useEffect(() => {
    if (composeOpen || !composeDraft || composeVariant !== 'popout') {
      return undefined
    }
    const timer = window.setTimeout(() => {
      setComposeDraft(null)
    }, 240)
    return () => window.clearTimeout(timer)
  }, [composeDraft, composeOpen, composeVariant])

  useEffect(() => {
    /**
     * j/k list navigation and e/archive, #/trash, r/reply.
     * @param event - Keyboard event.
     */
    function onKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return
      }
      if (event.key === 'j') {
        mail.focusRelativeMessage(1)
        return
      }
      if (event.key === 'k') {
        mail.focusRelativeMessage(-1)
        return
      }
      if (event.key === 'e') {
        void mail.bulkAction('archive')
        return
      }
      if (event.key === '#') {
        void mail.bulkAction('trash')
        return
      }
      if (event.key === 'r') {
        openReply(false)
        return
      }
      if (event.key === 'a' && !event.metaKey && !event.ctrlKey) {
        openReply(true)
        return
      }
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        openCompose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mail, openCompose, openReply])

  useEffect(() => {
    return () => unregisterMailMenuHost()
  }, [])

  useEffect(() => {
    patchMailMenuHandlers({
      selectAccount: (accountId) => {
        if (accountId === null) {
          mail.setUnifiedInbox(true)
          return
        }
        mail.selectAccount(accountId)
      },
      addAccount: () => setAddAccountOpen(true),
      testAccount: () => {
        if (!mail.selectedAccount) {
          return
        }
        void mail.testAccount(mail.selectedAccount.id).then((result) => {
          window.alert(result.ok ? t('mail.testOk') : result.error || t('mail.testFailed'))
        })
      },
      disconnectAccount: () => {
        if (!mail.selectedAccount) {
          return
        }
        if (window.confirm(t('mail.confirmDisconnect'))) {
          void mail.disconnectAccount(mail.selectedAccount.id)
        }
      },
      deleteAccount: () => {
        if (!mail.selectedAccount) {
          return
        }
        if (window.confirm(t('mail.confirmDeleteAccount'))) {
          void mail.deleteAccount(mail.selectedAccount.id)
        }
      },
      compose: openCompose,
      reply: () => openReply(false),
      replyAll: () => openReply(true),
      forward: () => openForward(),
      toggleStar: () => {
        if (!mail.activeMessage) {
          return
        }
        void mail.toggleStar(mail.activeMessage.id, !mail.activeMessage.isStarred)
      },
      markUnread: () => {
        void mail.markActiveUnread()
      },
      archive: () => {
        void mail.bulkAction('archive')
      },
      spam: () => {
        void mail.bulkAction(mail.isSpamNav ? 'unspam' : 'spam')
      },
      openLabels: () =>
        setLabelIds(
          mail.selectedIds.length > 0
            ? mail.selectedIds
            : mail.activeMessage
              ? [mail.activeMessage.id]
              : [],
        ),
      snooze: () =>
        setScheduleIds(
          mail.selectedIds.length > 0
            ? mail.selectedIds
            : mail.activeMessage
              ? [mail.activeMessage.id]
              : [],
        ),
      trash: () => {
        void mail.trashActive()
      },
      print: () => window.print(),
      downloadEml: () => {
        if (!mail.activeMessage) {
          return
        }
        void mail.downloadEml(mail.activeMessage.id, mail.activeMessage.subject || 'message')
      },
      exportMbox: () => {
        const blob = new Blob(
          [buildMbox(mail.threadMessages.length > 0 ? mail.threadMessages : mail.messages)],
          { type: 'text/plain' },
        )
        saveBlobFile(blob, 'mailbox.mbox')
      },
      openSignature: () => setSignatureOpen(true),
      syncNow: () => {
        void mail.syncActiveAccount()
      },
      historicalSync: () => {
        void mail.historicalSync()
      },
      setSidebarMode: sidebar.setMode,
    })
  }, [mail, openCompose, openForward, openReply, sidebar.setMode, t])

  useEffect(() => {
    const selected = mail.selectedAccount
    setMailMenuView({
      accountMenuLabel: mail.unifiedInbox
        ? t('mail.unifiedInbox')
        : selected?.displayName || selected?.email || t('mail.menu.account'),
      accounts: mail.accounts.map((account) => ({
        id: account.id,
        label: formatMailAccountMenuLabel(account.displayName, account.email),
      })),
      selectedAccountId: selected?.id ?? null,
      unifiedInbox: mail.unifiedInbox,
      hasAccount: Boolean(selected),
      hasMessage: mail.activeMessage != null,
      isStarred: Boolean(mail.activeMessage?.isStarred),
      isSpamView: mail.isSpamNav,
      isSyncing: mail.isSyncing,
      sidebarMode: sidebar.mode,
    })
  }, [
    mail.accounts,
    mail.activeMessage,
    mail.isSpamNav,
    mail.isSyncing,
    mail.selectedAccount,
    mail.unifiedInbox,
    sidebar.mode,
    t,
  ])

  if (!mail.configured) {
    return (
      <div className="mail-page flex h-dvh max-h-dvh items-center justify-center text-ink">
        <p className="max-w-md px-6 text-center text-sm font-medium text-muted">{t('mail.notConfigured')}</p>
      </div>
    )
  }

  if (!mail.isLoadingAccounts && mail.accounts.length === 0) {
    return (
      <div className="mail-page relative h-dvh max-h-dvh text-ink">
        <MailAddAccount
          open
          variant="onboarding"
          error={mail.accountError}
          onClose={() => undefined}
          onConnectImap={mail.connectImap}
        />
      </div>
    )
  }

  const inlineComposer =
    composeDraft && composeVariant === 'inline' ? (
      <MailComposer
        open={composeOpen}
        variant="inline"
        draft={composeDraft}
        accounts={mail.accounts}
        userId={userId}
        isSending={mail.isSending}
        sendError={mail.sendError}
        recentAddresses={mail.recentAddresses}
        onDraftChange={setComposeDraft}
        onClose={closeCompose}
        onPopout={() => setComposeVariant('popout')}
        onSend={mail.sendMessage}
        onSaveDraft={mail.saveDraft}
        onUpdateDraft={mail.updateDraft}
        onEditSignature={() => setSignatureOpen(true)}
      />
    ) : null

  return (
    <div className="mail-page relative flex h-dvh max-h-dvh min-h-0 flex-col gap-3 overflow-hidden p-3 text-ink">
      <MailMenubar
        accounts={mail.accounts}
        selectedAccount={mail.selectedAccount}
        activeMessage={mail.activeMessage}
        unifiedInbox={mail.unifiedInbox}
        isSyncing={mail.isSyncing}
        onSelectAccount={mail.selectAccount}
        onUnifiedInbox={() => mail.setUnifiedInbox(true)}
        onAddAccount={() => setAddAccountOpen(true)}
        onCompose={openCompose}
        onReply={() => openReply(false)}
        onReplyAll={() => openReply(true)}
        onForward={() => openForward()}
        onToggleStar={() => {
          if (!mail.activeMessage) {
            return
          }
          void mail.toggleStar(mail.activeMessage.id, !mail.activeMessage.isStarred)
        }}
        onMarkUnread={() => void mail.markActiveUnread()}
        onArchive={() => void mail.bulkAction('archive')}
        onSpam={() => void mail.bulkAction('spam')}
        onNotSpam={() => void mail.bulkAction('unspam')}
        onTrash={() => void mail.trashActive()}
        onSnooze={() =>
          setScheduleIds(
            mail.selectedIds.length > 0
              ? mail.selectedIds
              : mail.activeMessage
                ? [mail.activeMessage.id]
                : [],
          )
        }
        onOpenLabels={() =>
          setLabelIds(
            mail.selectedIds.length > 0
              ? mail.selectedIds
              : mail.activeMessage
                ? [mail.activeMessage.id]
                : [],
          )
        }
        onOpenSignature={() => setSignatureOpen(true)}
        isSpamView={mail.isSpamNav}
        onPrint={() => window.print()}
        onDownloadEml={() => {
          if (!mail.activeMessage) {
            return
          }
          void mail.downloadEml(mail.activeMessage.id, mail.activeMessage.subject || 'message')
        }}
        onExportMbox={() => {
          const blob = new Blob([buildMbox(mail.threadMessages.length > 0 ? mail.threadMessages : mail.messages)], {
            type: 'text/plain',
          })
          saveBlobFile(blob, 'mailbox.mbox')
        }}
        onSync={() => void mail.syncActiveAccount()}
        onHistoricalSync={() => void mail.historicalSync()}
        onTestAccount={() => {
          if (!mail.selectedAccount) {
            return
          }
          void mail.testAccount(mail.selectedAccount.id).then((result) => {
            window.alert(result.ok ? t('mail.testOk') : result.error || t('mail.testFailed'))
          })
        }}
        onDisconnectAccount={() => {
          if (!mail.selectedAccount) {
            return
          }
          if (window.confirm(t('mail.confirmDisconnect'))) {
            void mail.disconnectAccount(mail.selectedAccount.id)
          }
        }}
        onDeleteAccount={() => {
          if (!mail.selectedAccount) {
            return
          }
          if (window.confirm(t('mail.confirmDeleteAccount'))) {
            void mail.deleteAccount(mail.selectedAccount.id)
          }
        }}
      />
      <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-mail-divider bg-mail-workspace backdrop-blur-xl">
        <div
          className="relative h-full shrink-0 transition-[width] duration-300 ease-out"
          style={{ width: sidebar.reservedPx }}
        >
          <MailSidebar
            items={mail.sidebarItems}
            customItems={mail.customLabelItems}
            navId={mail.navId}
            expanded={sidebar.expanded}
            mode={sidebar.mode}
            canEditLabels={mail.canEditLabels}
            onSelectNav={mail.selectNav}
            onCreateLabel={() => {
              const name = window.prompt(t('mail.newLabel'))
              if (name?.trim()) {
                void mail.createLabel(name.trim())
              }
            }}
            onRenameLabel={(navId) => {
              const current = mail.customLabelItems.find((row) => row.navId === navId)
              const name = window.prompt(t('mail.renameLabel'), current?.name ?? '')
              if (!name?.trim() || !navId.startsWith('label:')) {
                return
              }
              void mail.renameLabel(navId.slice('label:'.length), name.trim())
            }}
            onDeleteLabel={(navId) => {
              if (!navId.startsWith('label:') || !window.confirm(t('mail.confirmDeleteLabel'))) {
                return
              }
              void mail.deleteLabel(navId.slice('label:'.length))
            }}
            onSetMode={sidebar.setMode}
            onPointerEnter={sidebar.onPointerEnter}
            onPointerLeave={sidebar.onPointerLeave}
            onFocusIn={sidebar.onFocusIn}
            onFocusOut={sidebar.onFocusOut}
          />
        </div>
        <div className="relative flex h-full min-h-0 shrink-0" style={{ width: listWidth }}>
          {mail.isOutboxNav ? (
            <MailOutboxList
              tasks={mail.syncTasks}
              isLoading={mail.isLoadingMessages}
              error={mail.messageError}
              locale={locale}
              onRefresh={() => void mail.reloadOutbox()}
            />
          ) : (
          <MailThreadList
            listKey={mail.navId}
            messages={mail.messages}
            activeId={mail.activeMessage?.id ?? null}
            selectedIds={mail.selectedIds}
            searchQuery={mail.searchQuery}
            isLoading={mail.isLoadingMessages}
            isLoadingMore={mail.isLoadingMoreMessages}
            hasMore={mail.messagesHasMore}
            error={mail.messageError}
            locale={locale}
            isSpamView={mail.isSpamNav}
            isTrashView={mail.isTrashNav}
            onSearchChange={mail.setSearchQuery}
            onOpen={(id) => void mail.openMessage(id)}
            onToggleStar={(id, starred) => void mail.toggleStar(id, starred)}
            onToggleSelect={mail.toggleSelect}
            onSelectAll={mail.selectAllVisible}
            onClearSelection={mail.clearSelection}
            onArchive={(ids) => void mail.bulkAction('archive', ids)}
            onTrash={(ids) => void mail.bulkAction('trash', ids)}
            onSpam={(ids) => void mail.bulkAction('spam', ids)}
            onNotSpam={(ids) => void mail.bulkAction('unspam', ids)}
            onSnooze={(ids) => setScheduleIds(ids)}
            onOpenLabels={(ids) => setLabelIds(ids)}
            onEmptyFolder={() => {
              if (window.confirm(t('mail.confirmEmptyFolder'))) {
                void mail.emptyCurrentFolder()
              }
            }}
            onReply={(id) => {
              void mail.openMessage(id).then(() => openReply(false, id))
            }}
            onReplyAll={(id) => {
              void mail.openMessage(id).then(() => openReply(true, id))
            }}
            onForward={(id) => {
              void mail.openMessage(id).then(() => openForward(id))
            }}
            onMarkRead={(ids, isRead) => void mail.bulkAction(isRead ? 'read' : 'unread', ids)}
            onContextSearch={mail.setSearchQuery}
            onLoadMore={mail.loadMoreMessages}
          />
          )}
          <button
            type="button"
            aria-label={t('mail.resizeList')}
            className="absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-brand/30"
            onPointerDown={(event) => {
              event.preventDefault()
              const startX = event.clientX
              const startWidth = listWidth
              let latest = startWidth
              const onMove = (move: PointerEvent): void => {
                latest = Math.min(
                  MAIL_LIST_WIDTH_MAX,
                  Math.max(MAIL_LIST_WIDTH_MIN, startWidth + (move.clientX - startX)),
                )
                setListWidth(latest)
              }
              const onUp = (): void => {
                window.removeEventListener('pointermove', onMove)
                window.removeEventListener('pointerup', onUp)
                saveMailListWidth(latest)
              }
              window.addEventListener('pointermove', onMove)
              window.addEventListener('pointerup', onUp)
            }}
          />
        </div>
        <MailReader
          message={readerPresence.mounted ? readerMessage : null}
          threadMessages={mail.threadMessages}
          leaving={readerPresence.leaving}
          isLoading={mail.isLoadingDetail}
          locale={locale}
          onToggleStar={(id, starred) => void mail.toggleStar(id, starred)}
          isSpamView={mail.isSpamNav}
          onSpam={() => void mail.bulkAction('spam', mail.activeMessage ? [mail.activeMessage.id] : undefined)}
          onNotSpam={() => void mail.bulkAction('unspam', mail.activeMessage ? [mail.activeMessage.id] : undefined)}
          onTrash={() => void mail.trashActive()}
          onMarkUnread={() => void mail.markActiveUnread()}
          onReply={() => openReply(false)}
          onReplyAll={() => openReply(true)}
          onForward={() => openForward()}
          onDownloadAttachment={(messageId, attachmentId, filename) =>
            void mail.downloadAttachment(messageId, attachmentId, filename)
          }
          onOpenOfficeAttachment={(messageId, attachmentId, filename) =>
            void mail.openOfficeAttachment(messageId, attachmentId, filename)
          }
          onPreviewAttachment={(messageId, attachmentId, filename, contentType) => {
            void mail.previewAttachment(messageId, attachmentId, filename, contentType).then(setPreview)
          }}
          onDownloadEml={() => {
            if (!mail.activeMessage) {
              return
            }
            void mail.downloadEml(mail.activeMessage.id, mail.activeMessage.subject || 'message')
          }}
          footer={inlineComposer}
        />
        {mail.undo ? (
          <div className="pointer-events-none absolute right-4 bottom-4 z-30">
            <MailUndoToast
              kind={mail.undo.kind}
              count={mail.undo.ids.length}
              onUndo={() => void mail.undoLast()}
              onDismiss={mail.dismissUndo}
            />
          </div>
        ) : null}
        {scheduleIds && scheduleIds.length > 0 ? (
          <>
            <button type="button" className="absolute inset-0 z-30 cursor-default bg-transparent" aria-label={t('actions.close')} onClick={() => setScheduleIds(null)} />
            <div className="absolute top-12 left-1/2 z-40 -translate-x-1/2">
              <MailScheduleMenu
                onPick={(iso) => {
                  void mail.bulkAction('snooze', scheduleIds, { snoozeUntil: iso })
                  setScheduleIds(null)
                }}
                onClose={() => setScheduleIds(null)}
              />
            </div>
          </>
        ) : null}
        {labelIds && labelIds.length > 0 ? (
          <>
            <button type="button" className="absolute inset-0 z-30 cursor-default bg-transparent" aria-label={t('actions.close')} onClick={() => setLabelIds(null)} />
            <div className="absolute top-12 left-1/2 z-40 -translate-x-1/2">
              <MailLabelPicker
                labels={mail.labels}
                messages={mail.messages.filter((row) => labelIds.includes(row.id))}
                canCreate={mail.canEditLabels}
                onToggle={(labelId, add) => {
                  void mail.bulkAction(add ? 'apply_label' : 'remove_label', labelIds, { label: labelId })
                }}
                onCreate={async (name) => {
                  const created = await mail.createLabel(name)
                  if (created) {
                    await mail.bulkAction('apply_label', labelIds, { label: created.id })
                  }
                }}
                onClose={() => setLabelIds(null)}
              />
            </div>
          </>
        ) : null}
      </div>
      {composeDraft && composeVariant === 'popout' ? (
        <div
          className={`absolute inset-0 z-40 ${composeOpen ? '' : 'pointer-events-none'}`}
          aria-hidden={!composeOpen}
        >
          <MailComposer
            open={composeOpen}
            variant="popout"
            draft={composeDraft}
            accounts={mail.accounts}
            userId={userId}
            sidebarInsetPx={0}
            isSending={mail.isSending}
            sendError={mail.sendError}
            recentAddresses={mail.recentAddresses}
            onDraftChange={setComposeDraft}
            onClose={closeCompose}
            onSend={mail.sendMessage}
            onSaveDraft={mail.saveDraft}
            onUpdateDraft={mail.updateDraft}
            onEditSignature={() => setSignatureOpen(true)}
          />
        </div>
      ) : null}
      <MailSignatureEditor open={signatureOpen} onClose={() => setSignatureOpen(false)} />
      <MailAttachmentPreview
        preview={preview}
        onClose={() => {
          if (preview) {
            URL.revokeObjectURL(preview.url)
          }
          setPreview(null)
        }}
        onDownload={() => {
          if (!preview || !mail.activeMessage) {
            return
          }
          const att = mail.activeMessage.attachments.find((row) => row.filename === preview.filename)
          if (!att) {
            return
          }
          void mail.downloadAttachment(mail.activeMessage.id, att.id, att.filename)
        }}
      />
      <MailAddAccount
        open={addAccountOpen}
        variant="add"
        error={mail.accountError}
        onClose={() => setAddAccountOpen(false)}
        onConnectImap={mail.connectImap}
      />
    </div>
  )
}
