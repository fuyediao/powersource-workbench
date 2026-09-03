import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  ArchiveIcon,
  CheckIcon,
  CheckSquareIcon,
  ClockIcon,
  InboxIcon,
  PaperclipIcon,
  SearchIcon,
  ShieldIcon,
  StarIcon,
  TagIcon,
  TrashIcon,
} from '@/icons/AllIcons'
import type { MailMessage } from '@/types/mail'
import { formatMailListDate } from '@/utils/mail/format-mail-date'
import { isMailSpam } from '@/utils/mail/is-mail-spam'
import {
  applyMailSearchSuggestion,
  mailSearchSuggestions,
  type MailSearchSuggestion,
} from '@/utils/mail/search-query'
import { openCalendarCreateEvent } from '@/utils/calendar/calendar-event-request'

interface MailThreadListProps {
  listKey: string
  messages: MailMessage[]
  activeId: string | null
  selectedIds: string[]
  searchQuery: string
  isLoading: boolean
  isLoadingMore?: boolean
  hasMore?: boolean
  error: string | null
  locale: string
  onSearchChange: (query: string) => void
  onOpen: (messageId: string) => void
  onToggleStar: (messageId: string, starred: boolean) => void
  onToggleSelect: (messageId: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onArchive: (ids: string[]) => void
  onTrash: (ids: string[]) => void
  onSpam: (ids: string[]) => void
  onNotSpam: (ids: string[]) => void
  onSnooze: (ids: string[]) => void
  onOpenLabels: (ids: string[]) => void
  onEmptyFolder?: () => void
  isSpamView?: boolean
  isTrashView?: boolean
  onReply: (messageId: string) => void
  onReplyAll: (messageId: string) => void
  onForward: (messageId: string) => void
  onMarkRead: (ids: string[], isRead: boolean) => void
  onContextSearch: (query: string) => void
  onLoadMore?: () => void | Promise<void>
}

/**
 * Center Mailspring-style thread column: search tokens, Select-mode multi-select, hover + context actions.
 * @param props - List state and handlers.
 * @returns Thread list.
 */
export function MailThreadList({
  listKey,
  messages,
  activeId,
  selectedIds,
  searchQuery,
  isLoading,
  isLoadingMore = false,
  hasMore = false,
  error,
  locale,
  onSearchChange,
  onOpen,
  onToggleStar,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onArchive,
  onTrash,
  onSpam,
  onNotSpam,
  onSnooze,
  onOpenLabels,
  onEmptyFolder,
  isSpamView = false,
  isTrashView = false,
  onReply,
  onReplyAll,
  onForward,
  onMarkRead,
  onContextSearch,
  onLoadMore,
}: MailThreadListProps): ReactNode {
  const { t } = useTranslation()
  const [menu, setMenu] = useState<{ x: number; y: number; message: MailMessage } | null>(null)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const suggestions = useMemo(() => mailSearchSuggestions(searchQuery), [searchQuery])
  const searchRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    /**
     * Closes the context menu on outside click.
     */
    function onPointerDown(): void {
      setMenu(null)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [])

  useEffect(() => {
    setIsSelectionMode(false)
    onClearSelection()
  }, [listKey, onClearSelection])

  useEffect(() => {
    if (!hasMore || !onLoadMore) {
      return
    }
    const root = scrollRef.current
    const sentinel = loadMoreSentinelRef.current
    if (!root || !sentinel) {
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void onLoadMore()
        }
      },
      { root, rootMargin: '160px 0px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, onLoadMore, messages.length, isLoadingMore])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const allSelected = messages.length > 0 && selectedIds.length === messages.length

  /**
   * Enters or leaves multi-select. Leaving clears the current selection.
   */
  function toggleSelectMode(): void {
    if (isSelectionMode) {
      onClearSelection()
      setIsSelectionMode(false)
      return
    }
    setIsSelectionMode(true)
  }

  /**
   * Opens the row context menu at the pointer (viewport coords; menu is portaled).
   * @param event - Mouse event.
   * @param message - Target row.
   */
  function onContextMenu(event: MouseEvent, message: MailMessage): void {
    event.preventDefault()
    setMenu({ x: event.clientX, y: event.clientY, message })
  }

  return (
    <section className="relative flex h-full min-h-0 w-full shrink-0 flex-col border-r border-mail-divider bg-mail-list backdrop-blur-xl">
      <div className="flex items-center border-b border-mail-divider px-2 py-2">
        <label className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted" />
          <input
            ref={searchRef}
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            onFocus={() => setSuggestionsOpen(true)}
            onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 180)}
            placeholder={t('mail.searchPlaceholder')}
            className="w-full rounded-lg border-0 bg-transparent py-1.5 pr-2 pl-8 text-sm font-medium text-ink outline-none placeholder:text-muted"
          />
        </label>
      </div>
      {suggestionsOpen && suggestions.length > 0 ? (
        <div className="absolute top-[46px] right-2 left-2 z-20 overflow-hidden rounded-xl border border-mail-divider bg-mail-menu py-1 text-[13px] shadow-xl backdrop-blur-xl">
          {suggestions.map((row) => (
            <button
              key={`${row.token ?? 'free'}-${row.term}-${row.description}`}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-mail-row-hover"
              onMouseDown={(event) => {
                event.preventDefault()
                onSearchChange(applyMailSearchSuggestion(searchQuery, row as MailSearchSuggestion))
                searchRef.current?.focus()
              }}
            >
              <span className="font-semibold text-brand">{row.token ? `${row.token}:` : t('mail.search')}</span>
              <span className="truncate text-muted">{row.term || row.description}</span>
            </button>
          ))}
        </div>
      ) : null}
      {(isTrashView || isSpamView) && onEmptyFolder && messages.length > 0 ? (
        <div className="flex items-center justify-between gap-2 border-b border-mail-divider px-3 py-2 text-[12px]">
          <span className="text-muted">{t('mail.emptyFolderBar', { count: messages.length, role: isSpamView ? t('mail.folder.spam') : t('mail.folder.trash') })}</span>
          <button type="button" className="rounded-md bg-mail-selected px-2 py-1 font-semibold text-brand hover:bg-mail-row-hover" onClick={onEmptyFolder}>
            {t('mail.emptyNow', { role: isSpamView ? t('mail.folder.spam') : t('mail.folder.trash') })}
          </button>
        </div>
      ) : null}
      {messages.length > 0 ? (
        <div className="flex items-center gap-2 border-b border-mail-divider px-3 py-1.5 text-[12px] text-muted">
          <button
            type="button"
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 font-medium transition-colors ${
              isSelectionMode
                ? 'bg-mail-selected text-brand'
                : 'hover:bg-mail-row-hover hover:text-ink'
            }`}
            onClick={toggleSelectMode}
          >
            <CheckSquareIcon className="size-3.5" aria-hidden />
            {isSelectionMode ? t('mail.done') : t('mail.select')}
          </button>
          {isSelectionMode ? (
            <>
              <button
                type="button"
                className="flex min-w-0 items-center gap-1.5 hover:text-ink"
                onClick={() => (allSelected ? onClearSelection() : onSelectAll())}
              >
                <MailCheckBox checked={allSelected} />
                <span className="truncate">
                  {allSelected ? t('mail.deselectAll') : t('mail.selectAll')}
                </span>
              </button>
              <span className="shrink-0 tabular-nums">
                {t('mail.selectedCount', { count: selectedIds.length })}
              </span>
              {selectedIds.length > 0 ? (
                <div className="ml-auto flex items-center gap-1">
                  <button type="button" className="rounded p-1 hover:bg-mail-row-hover hover:text-ink" title={t('mail.archive')} onClick={() => onArchive(selectedIds)}>
                    <ArchiveIcon className="size-3.5" />
                  </button>
                  {isSpamView ? (
                    <button type="button" className="rounded p-1 hover:bg-mail-row-hover hover:text-ink" title={t('mail.notSpam')} onClick={() => onNotSpam(selectedIds)}>
                      <InboxIcon className="size-3.5" />
                    </button>
                  ) : (
                    <button type="button" className="rounded p-1 hover:bg-mail-row-hover hover:text-ink" title={t('mail.spam')} onClick={() => onSpam(selectedIds)}>
                      <ShieldIcon className="size-3.5" />
                    </button>
                  )}
                  <button type="button" className="rounded p-1 hover:bg-mail-row-hover hover:text-ink" title={t('mail.snooze')} onClick={() => onSnooze(selectedIds)}>
                    <ClockIcon className="size-3.5" />
                  </button>
                  <button type="button" className="rounded p-1 hover:bg-mail-row-hover hover:text-ink" title={t('mail.applyLabel')} onClick={() => onOpenLabels(selectedIds)}>
                    <TagIcon className="size-3.5" />
                  </button>
                  <button type="button" className="rounded p-1 hover:bg-mail-row-hover hover:text-ink" title={t('mail.trash')} onClick={() => onTrash(selectedIds)}>
                    <TrashIcon className="size-3.5" />
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {error ? <p className="px-4 py-3 text-sm font-medium text-red-500">{error}</p> : null}
        {isLoading && messages.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">{t('status.loading')}</p>
        ) : null}
        {!isLoading && messages.length === 0 ? (
          <div className="mail-empty-in px-4 py-10 text-center text-sm text-muted">
            <p>{t('mail.emptyFolder')}</p>
          </div>
        ) : (
          <ul key={listKey} className="mail-list-in">
            {messages.map((message) => {
              const active = message.id === activeId
              const selected = selectedSet.has(message.id)
              const from = message.fromName || message.fromAddress
              return (
                <li
                  key={message.id}
                  className={`mail-thread-row group flex items-start gap-1 border-b border-mail-divider pl-3 ${
                    active || selected ? 'bg-mail-selected' : 'hover:bg-mail-row-hover'
                  }`}
                  onContextMenu={(event) => onContextMenu(event, message)}
                >
                  <div
                    className={`grid shrink-0 transition-[grid-template-columns,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      isSelectionMode
                        ? 'grid-cols-[1fr] opacity-100'
                        : 'pointer-events-none grid-cols-[0fr] opacity-0'
                    }`}
                  >
                    <div className="min-w-0 overflow-hidden">
                      <button
                        type="button"
                        tabIndex={isSelectionMode ? 0 : -1}
                        className="mt-3"
                        aria-pressed={selected}
                        aria-label={t('mail.select')}
                        onClick={() => onToggleSelect(message.id)}
                      >
                        <MailCheckBox checked={selected} />
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="mt-3 flex h-5 shrink-0 items-center justify-center text-mail-star"
                    aria-label={t('mail.star')}
                    onClick={() => void onToggleStar(message.id, !message.isStarred)}
                  >
                    <StarIcon className="size-3.5" filled={message.isStarred} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 flex-col py-3 pr-2 text-left"
                    onClick={() => {
                      if (isSelectionMode) {
                        onToggleSelect(message.id)
                        return
                      }
                      onOpen(message.id)
                    }}
                  >
                    <span className="flex h-5 min-w-0 items-center gap-3">
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${message.isRead ? 'bg-transparent' : 'bg-mail-unread'}`}
                        aria-hidden
                      />
                      <span
                        className={`min-w-0 flex-1 truncate text-sm text-brand ${
                          message.isRead ? 'font-medium' : 'font-bold'
                        }`}
                      >
                        {from || t('mail.unknownSender')}
                      </span>
                      <span className="mail-thread-row-date shrink-0 pl-1 text-[11px] leading-5 text-muted">
                        {formatMailListDate(message.receivedAt, locale)}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1">
                      <span
                        className={`min-w-0 flex-1 truncate text-[13px] ${message.isRead ? 'text-muted' : 'font-semibold text-ink'}`}
                      >
                        {message.subject || t('mail.noSubject')}
                      </span>
                      {message.hasAttachments ? (
                        <PaperclipIcon className="size-3 shrink-0 text-muted" aria-hidden />
                      ) : null}
                    </span>
                    {message.snippet ? (
                      <span className="mt-0.5 line-clamp-1 text-xs text-muted">{message.snippet}</span>
                    ) : null}
                  </button>
                  <div
                    className="mail-thread-row-actions-slot"
                    data-hidden={isSelectionMode ? 'true' : undefined}
                  >
                    <div className="mail-thread-row-actions">
                      <button
                        type="button"
                        className="rounded p-1 text-muted hover:bg-mail-chrome hover:text-ink"
                        title={t('mail.archive')}
                        onClick={() => onArchive([message.id])}
                      >
                        <ArchiveIcon className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        className="rounded p-1 text-muted hover:bg-mail-chrome hover:text-ink"
                        title={t('mail.trash')}
                        onClick={() => onTrash([message.id])}
                      >
                        <TrashIcon className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {messages.length > 0 && (hasMore || isLoadingMore) ? (
          <div
            ref={loadMoreSentinelRef}
            className="px-4 py-3 text-center text-xs text-muted"
            aria-hidden={!isLoadingMore}
          >
            {isLoadingMore ? t('mail.loadingMore') : null}
          </div>
        ) : null}
      </div>
      {menu
        ? createPortal(
            <div
              className="fixed z-50 min-w-48 rounded-xl border border-mail-divider bg-mail-menu py-1 text-[13px] shadow-xl backdrop-blur-xl"
              style={{ left: menu.x, top: menu.y }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <ContextItem label={t('mail.reply')} onClick={() => { onReply(menu.message.id); setMenu(null) }} />
              <ContextItem label={t('mail.replyAll')} onClick={() => { onReplyAll(menu.message.id); setMenu(null) }} />
              <ContextItem label={t('mail.forward')} onClick={() => { onForward(menu.message.id); setMenu(null) }} />
              <div className="my-1 border-t border-mail-divider" />
              <ContextItem label={t('mail.archive')} onClick={() => { onArchive([menu.message.id]); setMenu(null) }} />
              <ContextItem
                label={menu.message.isRead ? t('mail.unread') : t('mail.markRead')}
                onClick={() => { onMarkRead([menu.message.id], !menu.message.isRead); setMenu(null) }}
              />
              <ContextItem
                label={menu.message.isStarred ? t('mail.unstar') : t('mail.star')}
                onClick={() => { void onToggleStar(menu.message.id, !menu.message.isStarred); setMenu(null) }}
              />
              <div className="my-1 border-t border-mail-divider" />
              <ContextItem label={t('mail.trash')} onClick={() => { onTrash([menu.message.id]); setMenu(null) }} />
              <ContextItem
                label={isMailSpam(menu.message.labels, isSpamView) ? t('mail.notSpam') : t('mail.spam')}
                onClick={() => {
                  if (isMailSpam(menu.message.labels, isSpamView)) {
                    onNotSpam([menu.message.id])
                  } else {
                    onSpam([menu.message.id])
                  }
                  setMenu(null)
                }}
              />
              <ContextItem label={t('mail.snooze')} onClick={() => { onSnooze([menu.message.id]); setMenu(null) }} />
              <ContextItem label={t('mail.applyLabel')} onClick={() => { onOpenLabels([menu.message.id]); setMenu(null) }} />
              <ContextItem
                label={t('mail.addToCalendar')}
                onClick={() => {
                  const from =
                    menu.message.fromName?.trim() ||
                    menu.message.fromAddress.trim() ||
                    ''
                  const subject =
                    menu.message.subject?.trim() || t('mail.noSubject')
                  const lines = [
                    from ? `${t('mail.calendarMailFrom')}: ${from}` : null,
                    menu.message.fromAddress
                      ? `${t('mail.calendarMailEmail')}: ${menu.message.fromAddress}`
                      : null,
                    menu.message.receivedAt
                      ? `${t('mail.calendarMailDate')}: ${formatMailListDate(menu.message.receivedAt, locale)}`
                      : null,
                    menu.message.snippet?.trim()
                      ? `${t('mail.calendarMailPreview')}: ${menu.message.snippet.trim()}`
                      : null,
                  ].filter((line): line is string => Boolean(line))
                  openCalendarCreateEvent({
                    title: subject,
                    description: lines.join('\n'),
                  })
                  setMenu(null)
                }}
              />
              <div className="my-1 border-t border-mail-divider" />
              <ContextItem
                label={t('mail.findFrom')}
                onClick={() => {
                  onContextSearch(`from:${menu.message.fromAddress}`)
                  setMenu(null)
                }}
              />
              <ContextItem
                label={t('mail.findSubject')}
                onClick={() => {
                  onContextSearch(`subject:"${(menu.message.subject || '').replaceAll('"', '')}"`)
                  setMenu(null)
                }}
              />
            </div>,
            document.body,
          )
        : null}
    </section>
  )
}

/**
 * Mail-token checkbox chip (avoids native system accent).
 * @param props - Checked state.
 * @returns Checkbox.
 */
function MailCheckBox({ checked }: { checked: boolean }): ReactNode {
  return (
    <span
      className={`grid size-4 place-items-center rounded border ${
        checked ? 'border-brand bg-mail-selected text-brand' : 'border-mail-divider'
      }`}
      aria-hidden
    >
      {checked ? <CheckIcon className="size-3" /> : null}
    </span>
  )
}

/**
 * One context-menu row.
 * @param props - Label and click handler.
 * @returns Button.
 */
function ContextItem({ label, onClick }: { label: string; onClick: () => void }): ReactNode {
  return (
    <button type="button" className="block w-full px-3 py-1.5 text-left text-ink hover:bg-mail-row-hover" onClick={onClick}>
      {label}
    </button>
  )
}
