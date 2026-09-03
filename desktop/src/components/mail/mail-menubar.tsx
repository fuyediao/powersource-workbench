import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { CheckIcon } from '@/icons/AllIcons'
import type { MailAccount, MailMessageDetail } from '@/types/mail'

type MenuItem =
  | {
      type: 'item'
      id: string
      label: string
      hint?: string
      shortcut?: string
      disabled?: boolean
      selected?: boolean
      onSelect: () => void
    }
  | { type: 'separator'; id: string }

type MenuGroup = {
  id: string
  label: string
  items: MenuItem[]
}

interface MailMenubarProps {
  accounts: MailAccount[]
  selectedAccount: MailAccount | null
  activeMessage: MailMessageDetail | null
  unifiedInbox: boolean
  isSyncing: boolean
  isSpamView: boolean
  onSelectAccount: (accountId: string) => void
  onUnifiedInbox: () => void
  onAddAccount: () => void
  onCompose: () => void
  onReply: () => void
  onReplyAll: () => void
  onForward: () => void
  onToggleStar: () => void
  onMarkUnread: () => void
  onArchive: () => void
  onSpam: () => void
  onNotSpam: () => void
  onTrash: () => void
  onSnooze: () => void
  onOpenLabels: () => void
  onOpenSignature: () => void
  onPrint: () => void
  onDownloadEml: () => void
  onExportMbox: () => void
  onSync: () => void
  onHistoricalSync: () => void
  onTestAccount: () => void
  onDisconnectAccount: () => void
  onDeleteAccount: () => void
}

/**
 * One menubar group with Aura-style enter/leave dropdown animation.
 * @param props - Group data and open-state handlers.
 * @returns Menu trigger and animated panel.
 */
function MenubarMenuGroup({
  group,
  open,
  anyOpen,
  onOpen,
  onClose,
}: {
  group: MenuGroup
  open: boolean
  anyOpen: boolean
  onOpen: () => void
  onClose: () => void
}): ReactNode {
  const presence = useDialogPresence(open, 180)

  return (
    <div className="relative">
      <button
        type="button"
        className={[
          'h-full max-w-56 truncate rounded-lg px-2.5 text-[13px] font-semibold transition-colors duration-200 hover:bg-mail-row-hover',
          open ? 'bg-mail-selected text-brand' : 'text-ink',
        ].join(' ')}
        aria-haspopup="true"
        aria-expanded={open}
        title={group.label}
        onClick={() => {
          if (open) {
            onClose()
          } else {
            onOpen()
          }
        }}
        onMouseEnter={() => {
          if (anyOpen) {
            onOpen()
          }
        }}
      >
        {group.label}
      </button>
      {presence.mounted ? (
        <div
          role="menu"
          className={[
            'pointer-events-none absolute left-0 top-full z-50 mt-0.5 min-w-56 origin-top rounded-xl border border-mail-divider bg-mail-menu py-1 text-[13px] font-normal shadow-xl backdrop-blur-xl',
            presence.leaving || !open ? 'animate-dropdown-out' : 'animate-dropdown-in',
          ].join(' ')}
        >
          {group.items.map((item) => {
            if (item.type === 'separator') {
              return (
                <div
                  key={item.id}
                  className="my-1 border-t border-mail-divider"
                  role="separator"
                />
              )
            }
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={[
                  'pointer-events-auto flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] font-normal leading-snug transition-colors hover:bg-mail-row-hover disabled:cursor-not-allowed disabled:opacity-40',
                  item.selected ? 'bg-mail-selected text-brand' : 'text-ink',
                ].join(' ')}
                onClick={() => {
                  if (item.disabled) {
                    return
                  }
                  onClose()
                  item.onSelect()
                }}
              >
                {item.selected !== undefined ? (
                  <CheckIcon
                    className={`size-3.5 shrink-0 ${item.selected ? 'opacity-100' : 'opacity-0'}`}
                    aria-hidden
                  />
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{item.label}</span>
                  {item.hint ? (
                    <span className="block truncate text-[11px] text-muted">{item.hint}</span>
                  ) : null}
                </span>
                {item.shortcut ? (
                  <span className="shrink-0 text-[11px] text-muted">{item.shortcut}</span>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Aura-style in-page menubar for Mail: account switch, mailbox admin, compose, sync.
 * Chrome uses mail glass tokens, not Aura editor variables.
 * Hidden on macOS where those commands live on the native application menu.
 * @param props - Mailbox, message, and sync handlers.
 * @returns Menubar element, or null when the native application menu is used.
 */
export function MailMenubar({
  accounts,
  selectedAccount,
  activeMessage,
  unifiedInbox,
  isSpamView,
  isSyncing,
  onSelectAccount,
  onUnifiedInbox,
  onAddAccount,
  onCompose,
  onReply,
  onReplyAll,
  onForward,
  onToggleStar,
  onMarkUnread,
  onArchive,
  onSpam,
  onNotSpam,
  onTrash,
  onSnooze,
  onOpenLabels,
  onOpenSignature,
  onPrint,
  onDownloadEml,
  onExportMbox,
  onSync,
  onHistoricalSync,
  onTestAccount,
  onDisconnectAccount,
  onDeleteAccount,
}: MailMenubarProps): ReactNode {
  const { t, i18n } = useTranslation()
  const rootRef = useRef<HTMLDivElement>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const nativeApplicationMenu = Boolean(window.workbench?.window?.usesNativeApplicationMenu)
  const hasMessage = activeMessage != null
  const accountMenuLabel = unifiedInbox
    ? t('mail.unifiedInbox')
    : selectedAccount?.displayName || selectedAccount?.email || t('mail.menu.account')

  const menus: MenuGroup[] = [
    {
      id: 'account',
      label: accountMenuLabel,
      items: [
        {
          type: 'item' as const,
          id: 'unified',
          label: t('mail.unifiedInbox'),
          selected: unifiedInbox,
          onSelect: onUnifiedInbox,
        },
        ...(accounts.length > 0 ? [{ type: 'separator' as const, id: 'account-unified-sep' }] : []),
        ...accounts.map((account) => ({
          type: 'item' as const,
          id: `account-${account.id}`,
          label: account.displayName || account.email,
          hint: account.displayName ? account.email : undefined,
          selected: !unifiedInbox && account.id === selectedAccount?.id,
          onSelect: () => onSelectAccount(account.id),
        })),
      ],
    },
    {
      id: 'mailbox',
      label: t('mail.menu.mailbox'),
      items: [
        {
          type: 'item' as const,
          id: 'add-account',
          label: `${t('mail.addAccount')}…`,
          selected: false,
          onSelect: onAddAccount,
        },
        {
          type: 'item' as const,
          id: 'test-account',
          label: t('mail.testAccount'),
          disabled: !selectedAccount,
          selected: false,
          onSelect: onTestAccount,
        },
        {
          type: 'item' as const,
          id: 'disconnect-account',
          label: t('mail.disconnectAccount'),
          disabled: !selectedAccount,
          selected: false,
          onSelect: onDisconnectAccount,
        },
        {
          type: 'item' as const,
          id: 'delete-account',
          label: t('mail.deleteAccount'),
          disabled: !selectedAccount,
          selected: false,
          onSelect: onDeleteAccount,
        },
      ],
    },
    {
      id: 'mail',
      label: t('mail.menu.mail'),
      items: [
        {
          type: 'item',
          id: 'compose',
          label: t('mail.compose'),
          shortcut: /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘N' : 'Ctrl+N',
          onSelect: onCompose,
        },
        {
          type: 'item',
          id: 'reply',
          label: t('mail.reply'),
          disabled: !hasMessage,
          onSelect: onReply,
        },
        {
          type: 'item',
          id: 'reply-all',
          label: t('mail.replyAll'),
          disabled: !hasMessage,
          onSelect: onReplyAll,
        },
        {
          type: 'item',
          id: 'forward',
          label: t('mail.forward'),
          disabled: !hasMessage,
          onSelect: onForward,
        },
        { type: 'separator', id: 'mail-sep' },
        {
          type: 'item',
          id: 'star',
          label: activeMessage?.isStarred ? t('mail.unstar') : t('mail.star'),
          disabled: !hasMessage,
          onSelect: onToggleStar,
        },
        {
          type: 'item',
          id: 'unread',
          label: t('mail.unread'),
          disabled: !hasMessage,
          onSelect: onMarkUnread,
        },
        {
          type: 'item',
          id: 'archive',
          label: t('mail.archive'),
          disabled: !hasMessage,
          onSelect: onArchive,
        },
        {
          type: 'item',
          id: 'spam',
          label: isSpamView ? t('mail.notSpam') : t('mail.spam'),
          disabled: !hasMessage,
          onSelect: isSpamView ? onNotSpam : onSpam,
        },
        {
          type: 'item',
          id: 'labels',
          label: t('mail.applyLabel'),
          disabled: !hasMessage,
          onSelect: onOpenLabels,
        },
        {
          type: 'item',
          id: 'snooze',
          label: t('mail.snooze'),
          disabled: !hasMessage,
          onSelect: onSnooze,
        },
        {
          type: 'item',
          id: 'trash',
          label: t('mail.trash'),
          disabled: !hasMessage,
          onSelect: onTrash,
        },
        { type: 'separator', id: 'mail-sep-2' },
        {
          type: 'item',
          id: 'print',
          label: t('mail.print'),
          disabled: !hasMessage,
          onSelect: onPrint,
        },
        {
          type: 'item',
          id: 'eml',
          label: t('mail.downloadEml'),
          disabled: !hasMessage,
          onSelect: onDownloadEml,
        },
        {
          type: 'item',
          id: 'mbox',
          label: t('mail.exportMbox'),
          onSelect: onExportMbox,
        },
        { type: 'separator', id: 'mail-sep-3' },
        {
          type: 'item',
          id: 'signature',
          label: t('mail.signatureEditor'),
          onSelect: onOpenSignature,
        },
      ],
    },
    {
      id: 'sync',
      label: t('mail.menu.sync'),
      items: [
        {
          type: 'item',
          id: 'sync-now',
          label: isSyncing ? t('mail.syncing') : t('mail.menu.syncNow'),
          disabled: isSyncing || !selectedAccount,
          onSelect: onSync,
        },
        {
          type: 'item',
          id: 'sync-historical',
          label: t('mail.historicalSync'),
          disabled: isSyncing || !selectedAccount,
          onSelect: onHistoricalSync,
        },
      ],
    },
  ]

  useEffect(() => {
    setOpenId(null)
  }, [i18n.language])

  useEffect(() => {
    /**
     * Close the open menu when clicking outside.
     * @param event - Pointer event.
     */
    function onPointerDown(event: PointerEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenId(null)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  useEffect(() => {
    /**
     * Close the open menu on Escape.
     * @param event - Keyboard event.
     */
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpenId(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (nativeApplicationMenu) {
    return null
  }

  return (
    <div
      ref={rootRef}
      className="relative z-30 flex h-9 shrink-0 items-stretch gap-0.5 rounded-2xl border border-mail-divider bg-mail-menubar px-1.5 text-[13px] text-ink shadow-mail-chrome backdrop-blur-xl"
      role="menubar"
    >
      {menus.map((group) => (
        <MenubarMenuGroup
          key={group.id}
          group={group}
          open={openId === group.id}
          anyOpen={openId !== null}
          onOpen={() => setOpenId(group.id)}
          onClose={() => setOpenId(null)}
        />
      ))}
    </div>
  )
}
