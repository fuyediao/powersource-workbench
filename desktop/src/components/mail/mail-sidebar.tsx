import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import type { MailSidebarMode } from '@/hooks/use-mail-sidebar-mode'
import { MAIL_SIDEBAR_COLLAPSED_PX, MAIL_SIDEBAR_EXPANDED_PX } from '@/hooks/use-mail-sidebar-mode'
import type { MailSidebarItem } from '@/hooks/use-mail'
import {
  ArchiveIcon,
  BellIcon,
  FileTextIcon,
  InboxIcon,
  SendIcon,
  ShieldIcon,
  SidebarIcon,
  StarIcon,
  PencilIcon,
  PlusIcon,
  TagIcon,
  TrashIcon,
  UploadIcon,
} from '@/icons/AllIcons'
import type { MailNavId } from '@/types/mail'

const MODE_OPTIONS: { value: MailSidebarMode; labelKey: string }[] = [
  { value: 'expanded', labelKey: 'mail.sidebar.mode.expanded' },
  { value: 'collapsed', labelKey: 'mail.sidebar.mode.collapsed' },
  { value: 'hover', labelKey: 'mail.sidebar.mode.hover' },
]

interface MailSidebarProps {
  items: MailSidebarItem[]
  customItems: MailSidebarItem[]
  navId: MailNavId
  expanded: boolean
  mode: MailSidebarMode
  onSelectNav: (navId: MailNavId) => void
  onCreateLabel?: () => void
  onRenameLabel?: (navId: MailNavId) => void
  onDeleteLabel?: (navId: MailNavId) => void
  canEditLabels?: boolean
  onSetMode: (mode: MailSidebarMode) => void
  onPointerEnter: () => void
  onPointerLeave: () => void
  onFocusIn: () => void
  onFocusOut: (event: {
    currentTarget: EventTarget | null
    relatedTarget: EventTarget | null
  }) => void
}

/**
 * Resolves a sidebar row label.
 * @param item - Sidebar item.
 * @param translate - i18n function.
 * @returns Visible name.
 */
function sidebarItemLabel(item: MailSidebarItem, translate: (key: string) => string): string {
  if (item.i18nKey) {
    return translate(`mail.folder.${item.i18nKey}`)
  }
  return item.name ?? ''
}

/**
 * Folder icon for a sidebar row.
 * @param i18nKey - Folder role key.
 * @returns Icon.
 */
function sidebarItemIcon(i18nKey: string | undefined): ReactNode {
  const iconClass = 'size-3.5 shrink-0'
  switch (i18nKey) {
    case 'starred':
      return <StarIcon className={`${iconClass} text-mail-star`} aria-hidden />
    case 'unreadFolder':
      return <InboxIcon className={`${iconClass} text-mail-unread`} aria-hidden />
    case 'important':
      return <StarIcon className={`${iconClass} opacity-70`} aria-hidden />
    case 'snoozed':
      return <BellIcon className={`${iconClass} opacity-70`} aria-hidden />
    case 'sent':
      return <SendIcon className={`${iconClass} opacity-70`} aria-hidden />
    case 'drafts':
      return <FileTextIcon className={`${iconClass} opacity-70`} aria-hidden />
    case 'outbox':
      return <UploadIcon className={`${iconClass} opacity-70`} aria-hidden />
    case 'allMail':
      return <InboxIcon className={`${iconClass} opacity-70`} aria-hidden />
    case 'spam':
      return <ShieldIcon className={`${iconClass} opacity-70`} aria-hidden />
    case 'trash':
      return <TrashIcon className={`${iconClass} opacity-70`} aria-hidden />
    case 'archive':
      return <ArchiveIcon className={`${iconClass} opacity-70`} aria-hidden />
    default:
      return <InboxIcon className={`${iconClass} opacity-70`} aria-hidden />
  }
}

/**
 * Unread count badge; compact overlay when the rail is collapsed.
 * @param unread - Count.
 * @param overlay - Whether to pin on the icon chip.
 * @returns Badge, or null.
 */
function UnreadBadge({ unread, overlay }: { unread: number; overlay: boolean }): ReactNode {
  if (unread <= 0) {
    return null
  }
  const label = unread > 99 ? '99+' : String(unread)
  if (overlay) {
    return (
      <span className="absolute -top-0.5 -right-0.5 grid h-3.5 min-w-3.5 shrink-0 place-items-center rounded-full bg-mail-unread px-0.5 text-[8px] font-bold text-brand-fg tabular-nums">
        {label}
      </span>
    )
  }
  return (
    <span className="shrink-0 rounded-full bg-mail-unread px-1.5 text-[10px] font-bold text-brand-fg tabular-nums">
      {label}
    </span>
  )
}

/**
 * Left Mailspring-style folder column with Vue Admin expand / collapse / hover modes.
 * The bottom mode control hides on macOS (native application menu).
 * @param props - Folder nav and sidebar mode.
 * @returns Sidebar.
 */
export function MailSidebar({
  items,
  customItems,
  navId,
  expanded,
  mode,
  onSelectNav,
  onCreateLabel,
  onRenameLabel,
  onDeleteLabel,
  canEditLabels = false,
  onSetMode,
  onPointerEnter,
  onPointerLeave,
  onFocusIn,
  onFocusOut,
}: MailSidebarProps) {
  const { t } = useTranslation()
  const nativeApplicationMenu = Boolean(window.workbench?.window?.usesNativeApplicationMenu)
  const asideRef = useRef<HTMLElement>(null)
  const controlRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [controlOpen, setControlOpen] = useState(false)
  const control = useDialogPresence(controlOpen, 180)
  const [panelPos, setPanelPos] = useState<{ left: number; bottom: number } | null>(null)

  useLayoutEffect(() => {
    if (!control.mounted) {
      setPanelPos(null)
      return
    }
    /**
     * Anchors the mode card above the trigger (portal so it stays on top).
     */
    function updatePanelPos(): void {
      const button = controlRef.current
      if (!button) {
        return
      }
      const buttonRect = button.getBoundingClientRect()
      setPanelPos({
        left: buttonRect.left,
        bottom: window.innerHeight - buttonRect.top + 8,
      })
    }
    updatePanelPos()
    window.addEventListener('resize', updatePanelPos)
    window.addEventListener('scroll', updatePanelPos, true)
    return () => {
      window.removeEventListener('resize', updatePanelPos)
      window.removeEventListener('scroll', updatePanelPos, true)
    }
  }, [control.mounted, expanded])

  useEffect(() => {
    /**
     * Close the mode card when clicking outside trigger and panel.
     * @param event - Pointer event.
     */
    function onPointerDown(event: PointerEvent): void {
      if (!controlOpen) {
        return
      }
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }
      if (controlRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return
      }
      setControlOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [controlOpen])

  const hoverOverlay = mode === 'hover'

  return (
    <aside
      ref={asideRef}
      className={[
        'flex h-full min-h-0 flex-col border-r border-mail-divider bg-mail-sidebar backdrop-blur-xl transition-[width,box-shadow] duration-300 ease-out',
        hoverOverlay ? 'absolute inset-y-0 left-0 z-20' : 'w-full',
        hoverOverlay && expanded ? 'shadow-mail-chrome' : '',
      ].join(' ')}
      style={
        hoverOverlay
          ? { width: expanded ? MAIL_SIDEBAR_EXPANDED_PX : MAIL_SIDEBAR_COLLAPSED_PX }
          : undefined
      }
      onPointerEnter={onPointerEnter}
      onPointerLeave={(event) => {
        onPointerLeave()
        if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') {
          return
        }
        const root = asideRef.current
        const active = document.activeElement
        if (root && active instanceof HTMLElement && root.contains(active)) {
          active.blur()
        }
      }}
      onFocusCapture={onFocusIn}
      onBlurCapture={(event) =>
        onFocusOut({
          currentTarget: asideRef.current,
          relatedTarget: event.relatedTarget,
        })
      }
    >
      <nav
        className={[
          'min-h-0 flex-1 overflow-x-hidden overflow-y-auto py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
          expanded ? 'px-1.5 pr-2.5' : 'px-1.5',
        ].join(' ')}
        aria-label={t('mail.mailboxes')}
      >
        {items.map((item) => {
          const active = item.navId === navId
          const label = sidebarItemLabel(item, t)
          return (
            <button
              key={item.navId}
              type="button"
              title={expanded ? undefined : label}
              className={[
                'mail-nav-item flex min-h-8 w-full items-center text-left text-sm',
                expanded && active
                  ? 'rounded-lg bg-mail-selected pr-1 font-semibold text-brand'
                  : expanded
                    ? 'rounded-lg pr-1 font-medium text-ink hover:bg-mail-row-hover'
                    : 'text-ink',
              ].join(' ')}
              onClick={() => onSelectNav(item.navId)}
            >
              <span
                className={[
                  'relative box-border grid size-8 shrink-0 place-items-center border border-transparent',
                  expanded
                    ? ''
                    : `rounded-md ${active ? 'bg-mail-selected text-brand' : 'hover:bg-mail-row-hover'}`,
                ].join(' ')}
              >
                {sidebarItemIcon(item.i18nKey)}
                {!expanded ? <UnreadBadge unread={item.unread} overlay /> : null}
              </span>
              <span
                className={`min-w-0 truncate transition-[max-width,opacity,padding] duration-300 ease-out ${
                  expanded
                    ? 'flex-1 pr-2 pl-2 opacity-100'
                    : 'pointer-events-none w-0 max-w-0 flex-none overflow-hidden pr-0 pl-0 opacity-0'
                }`}
                aria-hidden={!expanded}
              >
                {label}
              </span>
              {expanded ? <UnreadBadge unread={item.unread} overlay={false} /> : null}
            </button>
          )
        })}
        {customItems.length > 0 ? (
          <>
            <div className="mt-3 flex h-5 shrink-0 items-center gap-1">
              {expanded ? (
                <>
                  <p className="min-w-0 flex-1 text-[10px] font-bold tracking-wide text-muted uppercase">
                    {t('mail.labels')}
                  </p>
                  {canEditLabels && onCreateLabel ? (
                    <button
                      type="button"
                      className="rounded p-0.5 text-muted hover:bg-mail-row-hover hover:text-ink"
                      aria-label={t('mail.newLabel')}
                      onClick={onCreateLabel}
                    >
                      <PlusIcon className="size-3.5" />
                    </button>
                  ) : null}
                </>
              ) : (
                <span className="mx-1 block h-px w-full bg-mail-divider" role="separator" />
              )}
            </div>
            {customItems.map((item) => {
              const active = item.navId === navId
              const label = item.name ?? ''
              return (
                <div
                  key={item.navId}
                  className={[
                    'mail-nav-item group flex min-h-8 w-full items-center text-sm',
                    expanded && active
                      ? 'rounded-lg bg-mail-selected pr-1 font-semibold text-brand'
                      : expanded
                        ? 'rounded-lg pr-1 font-medium text-ink hover:bg-mail-row-hover'
                        : 'text-ink',
                  ].join(' ')}
                >
                  <button
                    type="button"
                    title={expanded ? undefined : label}
                    className="flex min-h-8 min-w-0 flex-1 items-center text-left"
                    onClick={() => onSelectNav(item.navId)}
                  >
                    <span
                      className={[
                        'relative box-border grid size-8 shrink-0 place-items-center border border-transparent',
                        expanded
                          ? ''
                          : `rounded-md ${active ? 'bg-mail-selected text-brand' : 'hover:bg-mail-row-hover'}`,
                      ].join(' ')}
                    >
                      <TagIcon className="size-3.5 shrink-0 opacity-70" aria-hidden />
                      {!expanded ? <UnreadBadge unread={item.unread} overlay /> : null}
                    </span>
                    <span
                      className={`min-w-0 truncate transition-[max-width,opacity,padding] duration-300 ease-out ${
                        expanded
                          ? 'flex-1 pr-2 pl-2 opacity-100'
                          : 'pointer-events-none w-0 max-w-0 flex-none overflow-hidden pr-0 pl-0 opacity-0'
                      }`}
                      aria-hidden={!expanded}
                    >
                      {label}
                    </span>
                    {expanded ? <UnreadBadge unread={item.unread} overlay={false} /> : null}
                  </button>
                  {expanded && canEditLabels ? (
                    <span className="flex shrink-0 items-center opacity-0 group-hover:opacity-100">
                      {onRenameLabel ? (
                        <button
                          type="button"
                          className="rounded p-1 text-muted hover:text-ink"
                          aria-label={t('mail.renameLabel')}
                          onClick={() => onRenameLabel(item.navId)}
                        >
                          <PencilIcon className="size-3" />
                        </button>
                      ) : null}
                      {onDeleteLabel ? (
                        <button
                          type="button"
                          className="rounded p-1 text-muted hover:text-ink"
                          aria-label={t('mail.deleteLabel')}
                          onClick={() => onDeleteLabel(item.navId)}
                        >
                          <TrashIcon className="size-3" />
                        </button>
                      ) : null}
                    </span>
                  ) : null}
                </div>
              )
            })}
          </>
        ) : null}
      </nav>

      {nativeApplicationMenu ? null : (
      <div className="relative shrink-0 px-1.5 py-2">
        <button
          ref={controlRef}
          type="button"
          className="grid size-8 place-items-center rounded-md text-muted transition-colors hover:bg-mail-row-hover hover:text-ink"
          title={t('mail.sidebar.mode.control')}
          aria-label={t('mail.sidebar.mode.control')}
          aria-expanded={controlOpen}
          onClick={() => setControlOpen((open) => !open)}
        >
          <SidebarIcon collapsed={!expanded} />
        </button>
        {control.mounted && panelPos
          ? createPortal(
              <div
                ref={panelRef}
                className={[
                  'fixed z-[80] w-44 rounded-xl border border-mail-divider bg-mail-menu p-2 shadow-xl backdrop-blur-xl',
                  control.leaving || !controlOpen ? 'animate-dropdown-out' : 'animate-dropdown-in',
                ].join(' ')}
                style={{ bottom: panelPos.bottom, left: panelPos.left }}
              >
                <p className="mb-1.5 text-[11px] font-medium text-muted">
                  {t('mail.sidebar.mode.control')}
                </p>
                <div className="flex flex-col gap-1">
                  {MODE_OPTIONS.map((option) => {
                    const selected = mode === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition-colors ${
                          selected
                            ? 'bg-mail-selected text-brand'
                            : 'text-ink hover:bg-mail-row-hover'
                        }`}
                        onClick={() => {
                          onSetMode(option.value)
                          setControlOpen(false)
                        }}
                      >
                        <span
                          className={`size-2 shrink-0 rounded-full ${selected ? 'bg-brand' : 'bg-muted/50'}`}
                        />
                        <span>{t(option.labelKey)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>,
              document.body,
            )
          : null}
      </div>
      )}
    </aside>
  )
}
