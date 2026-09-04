import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import i18n from '@/i18n'
import {
  addImapAccount,
  bulkMailMessages,
  createMailLabel,
  deleteMailAccount,
  deleteMailDraft,
  deleteMailLabel,
  disconnectMailAccount,
  downloadMailAttachment,
  downloadMailEml,
  emptyMailFolder,
  fetchMailFolderCounts,
  fetchMailUnreadSummary,
  getMailMessageDetail,
  isMailApiConfigured,
  listMailAccounts,
  listMailFolders,
  listMailLabels,
  listMailMessages,
  listMailSyncTasks,
  markMailMessageRead,
  pollMailSyncJobUntilDone,
  renameMailLabel,
  saveMailDraft,
  sendMail,
  startHistoricalMailSync,
  syncMailAccount,
  testMailAccount,
  toggleMailMessageStar,
  updateMailAccount,
  updateMailDraft,
} from '@/services/mail-api'
import type {
  MailAccount,
  MailAccountTestResult,
  MailBulkAction,
  MailDraftRequest,
  MailFolderCountsResponse,
  MailFolderInfo,
  MailImapSmtpConfig,
  MailLabel,
  MailMessage,
  MailMessageDetail,
  MailNavId,
  MailProvider,
  MailSendRequest,
  MailSyncTask,
  MailUndoKind,
} from '@/types/mail'
import { saveBlobFile } from '@/utils/mail/save-blob'
import {
  loadMailAccountSelectionPref,
  saveMailAccountSelectionPref,
} from '@/utils/mail/mail-prefs'
import {
  officeKindFromFileName,
  openOfficeDocument,
} from '@/utils/office/office-document-request'

const GMAIL_SYSTEM_LABELS: Array<{ id: string; i18nKey: string; countId?: string }> = [
  { id: 'INBOX', i18nKey: 'inbox' },
  { id: 'UNREAD', i18nKey: 'unreadFolder' },
  { id: 'STARRED', i18nKey: 'starred' },
  { id: 'IMPORTANT', i18nKey: 'important' },
  { id: 'SNOOZED', i18nKey: 'snoozed' },
  { id: 'SENT', i18nKey: 'sent' },
  { id: 'DRAFT', i18nKey: 'drafts' },
  { id: 'OUTBOX', i18nKey: 'outbox' },
  { id: 'ALL', i18nKey: 'allMail', countId: 'ALL_MAIL' },
  { id: 'SPAM', i18nKey: 'spam' },
  { id: 'TRASH', i18nKey: 'trash' },
  { id: 'ARCHIVE', i18nKey: 'archive' },
]

const FOLDER_ROLE_ORDER = ['inbox', 'sent', 'drafts', 'spam', 'trash', 'archive'] as const

/**
 * Maps AliMail mail_folders.role values to the virtual label tokens used by
 * `/mail/messages?label=`. AliMail sync writes those labels on each message
 * but historically left `folder_id` null, so filtering by folder UUID returns
 * an empty list even when the mailbox has mail.
 */
const ALI_ROLE_TO_LABEL: Record<string, string> = {
  inbox: 'INBOX',
  sent: 'SENT',
  drafts: 'DRAFT',
  draft: 'DRAFT',
  spam: 'SPAM',
  trash: 'TRASH',
  archive: 'ARCHIVE',
}

/**
 * Builds the sidebar nav id for one AliMail folder.
 * @param folder - Folder row from `/mail/folders`.
 * @returns Label-based nav when the role is known; otherwise folder id.
 */
function aliFolderNavId(folder: MailFolderInfo): MailNavId {
  const label = folder.role ? ALI_ROLE_TO_LABEL[folder.role] : undefined
  if (label) {
    return `label:${label}`
  }
  return `folder:${folder.id}`
}

/** Sidebar row for the Mailspring-style folder column. */
export interface MailSidebarItem {
  navId: MailNavId
  i18nKey?: string
  name?: string
  unread: number
}

export interface MailUndoState {
  kind: MailUndoKind
  ids: string[]
}

export interface UseMailResult {
  configured: boolean
  accounts: MailAccount[]
  selectedAccount: MailAccount | null
  selectedAccountId: string | null
  unifiedInbox: boolean
  navId: MailNavId
  folders: MailFolderInfo[]
  sidebarItems: MailSidebarItem[]
  customLabelItems: MailSidebarItem[]
  labels: MailLabel[]
  messages: MailMessage[]
  activeMessage: MailMessageDetail | null
  threadMessages: MailMessageDetail[]
  selectedIds: string[]
  searchQuery: string
  recentAddresses: string[]
  isTrashNav: boolean
  isSpamNav: boolean
  isOutboxNav: boolean
  syncTasks: MailSyncTask[]
  canEditLabels: boolean
  inboxUnread: number
  isLoadingAccounts: boolean
  isLoadingMessages: boolean
  isLoadingMoreMessages: boolean
  messagesHasMore: boolean
  isLoadingDetail: boolean
  isSyncing: boolean
  accountError: string | null
  messageError: string | null
  undo: MailUndoState | null
  selectAccount: (accountId: string | null) => void
  setUnifiedInbox: (on: boolean) => void
  selectNav: (navId: MailNavId) => void
  setSearchQuery: (query: string) => void
  openMessage: (messageId: string) => Promise<void>
  closeMessage: () => void
  focusRelativeMessage: (delta: number) => void
  toggleStar: (messageId: string, starred: boolean) => Promise<void>
  trashActive: () => Promise<void>
  markActiveUnread: () => Promise<void>
  toggleSelect: (messageId: string) => void
  selectAllVisible: () => void
  clearSelection: () => void
  bulkAction: (
    action: MailBulkAction,
    ids?: string[],
    extra?: { label?: string; snoozeUntil?: string },
  ) => Promise<void>
  undoLast: () => Promise<void>
  dismissUndo: () => void
  emptyCurrentFolder: () => Promise<void>
  reloadOutbox: () => Promise<void>
  loadMoreMessages: () => Promise<void>
  createLabel: (name: string) => Promise<MailLabel | null>
  renameLabel: (labelId: string, name: string) => Promise<boolean>
  deleteLabel: (labelId: string) => Promise<boolean>
  previewAttachment: (
    messageId: string,
    attachmentId: string,
    filename: string,
    contentType: string | null,
  ) => Promise<{ url: string; filename: string; contentType: string | null }>
  syncActiveAccount: () => Promise<void>
  historicalSync: (since?: string) => Promise<void>
  reloadAccounts: () => Promise<void>
  connectImap: (
    provider: MailProvider,
    email: string,
    displayName: string | null,
    config: MailImapSmtpConfig,
  ) => Promise<boolean>
  sendMessage: (req: MailSendRequest) => Promise<boolean>
  saveDraft: (req: MailDraftRequest) => Promise<string | null>
  updateDraft: (draftId: string, req: MailDraftRequest) => Promise<boolean>
  discardDraft: (draftId: string) => Promise<void>
  downloadAttachment: (messageId: string, attachmentId: string, filename: string) => Promise<void>
  openOfficeAttachment: (messageId: string, attachmentId: string, filename: string) => Promise<void>
  downloadEml: (messageId: string, filename: string) => Promise<void>
  disconnectAccount: (accountId: string) => Promise<boolean>
  deleteAccount: (accountId: string) => Promise<boolean>
  testAccount: (accountId: string) => Promise<MailAccountTestResult>
  renameAccount: (accountId: string, displayName: string | null) => Promise<boolean>
  isSending: boolean
  sendError: string | null
}

/**
 * Parses a sidebar nav id into list filters.
 * @param navId - Encoded nav id.
 * @returns Folder or label filter.
 */
function navToFilters(navId: MailNavId): { folderId?: string; label?: string } {
  if (navId.startsWith('folder:')) {
    return { folderId: navId.slice('folder:'.length) }
  }
  return { label: navId.slice('label:'.length) }
}

/**
 * Electron mail workspace state against workbench-api `/mail/*`.
 * @returns Mailbox, folder, list, and reader controls.
 */
export function useMail(): UseMailResult {
  const configured = isMailApiConfigured()
  const initialSelection = loadMailAccountSelectionPref()
  const [accounts, setAccounts] = useState<MailAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(initialSelection.accountId)
  const [folders, setFolders] = useState<MailFolderInfo[]>([])
  const [labels, setLabels] = useState<MailLabel[]>([])
  const [counts, setCounts] = useState<MailFolderCountsResponse>({
    counts: {},
    labelCounts: {},
    folderIdCounts: {},
  })
  const [navId, setNavId] = useState<MailNavId>('label:INBOX')
  const [messages, setMessages] = useState<MailMessage[]>([])
  const [messagesPage, setMessagesPage] = useState(0)
  const [messagesHasMore, setMessagesHasMore] = useState(false)
  const [activeMessage, setActiveMessage] = useState<MailMessageDetail | null>(null)
  const [threadMessages, setThreadMessages] = useState<MailMessageDetail[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [unifiedInbox, setUnifiedInboxState] = useState(initialSelection.mode === 'unified')
  const [searchQuery, setSearchQueryState] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [messageError, setMessageError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [undo, setUndo] = useState<MailUndoState | null>(null)
  const [syncTasks, setSyncTasks] = useState<MailSyncTask[]>([])
  const previewUrlRef = useRef<string | null>(null)
  const loadingMoreRef = useRef(false)

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId],
  )

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(searchQuery.trim()), 280)
    return () => window.clearTimeout(timer)
  }, [searchQuery])

  const loadAccounts = useCallback(async (): Promise<void> => {
    if (!configured) {
      return
    }
    setIsLoadingAccounts(true)
    setAccountError(null)
    try {
      const next = await listMailAccounts()
      setAccounts(next)
      const pref = loadMailAccountSelectionPref()
      const prefAccountId =
        pref.accountId && next.some((account) => account.id === pref.accountId)
          ? pref.accountId
          : null
      if (pref.mode === 'unified') {
        setUnifiedInboxState(true)
        setSelectedAccountId((current) => {
          if (current && next.some((account) => account.id === current)) {
            return current
          }
          return prefAccountId ?? next[0]?.id ?? null
        })
      } else {
        setUnifiedInboxState(false)
        setSelectedAccountId((current) => {
          if (prefAccountId) {
            return prefAccountId
          }
          if (current && next.some((account) => account.id === current)) {
            return current
          }
          return next[0]?.id ?? null
        })
      }
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'Failed to load accounts')
    } finally {
      setIsLoadingAccounts(false)
    }
  }, [configured])

  useEffect(() => {
    if (!configured) {
      return
    }
    saveMailAccountSelectionPref({
      mode: unifiedInbox ? 'unified' : 'account',
      accountId: selectedAccountId,
    })
  }, [configured, selectedAccountId, unifiedInbox])

  const loadSidebar = useCallback(async (accountId: string): Promise<void> => {
    const [nextFolders, nextLabels, nextCounts] = await Promise.all([
      listMailFolders(accountId).catch(() => [] as MailFolderInfo[]),
      listMailLabels(accountId).catch(() => [] as MailLabel[]),
      fetchMailFolderCounts(accountId).catch(
        (): MailFolderCountsResponse => ({ counts: {}, labelCounts: {}, folderIdCounts: {} }),
      ),
    ])
    setFolders(nextFolders)
    setLabels(nextLabels)
    setCounts(nextCounts)
    try {
      const outbox = await listMailSyncTasks({
        accountId,
        status: 'pending_remote,failed',
        limit: 100,
      })
      setSyncTasks(outbox.items)
    } catch {
      // Badge stays stale until Outbox is opened.
    }
  }, [])

  const loadMessages = useCallback(
    async (accountId: string | null, nextNav: MailNavId, query: string, unified: boolean): Promise<void> => {
      if (nextNav === 'label:OUTBOX') {
        setMessages([])
        setMessagesPage(0)
        setMessagesHasMore(false)
        setSelectedIds([])
        setIsLoadingMessages(true)
        setMessageError(null)
        try {
          const page = await listMailSyncTasks({
            accountId: unified ? null : accountId,
            status: 'pending_remote,failed',
            limit: 100,
          })
          setSyncTasks(page.items)
        } catch (error) {
          setMessageError(error instanceof Error ? error.message : 'Failed to load outbox')
          setSyncTasks([])
        } finally {
          setIsLoadingMessages(false)
        }
        return
      }
      if (!accountId && !unified) {
        setMessages([])
        setMessagesPage(0)
        setMessagesHasMore(false)
        return
      }
      setIsLoadingMessages(true)
      setMessageError(null)
      try {
        const filters = navToFilters(nextNav)
        const page = await listMailMessages(unified || !accountId ? 'all' : accountId, {
          ...filters,
          q: query.length >= 2 ? query : undefined,
          page: 0,
        })
        setMessages(page.items)
        setMessagesPage(page.page)
        setMessagesHasMore(page.hasMore)
        setSelectedIds([])
      } catch (error) {
        setMessageError(error instanceof Error ? error.message : 'Failed to load messages')
        setMessages([])
        setMessagesPage(0)
        setMessagesHasMore(false)
      } finally {
        setIsLoadingMessages(false)
      }
    },
    [],
  )

  /**
   * Appends the next message page when the thread list scrolls near the end.
   */
  const loadMoreMessages = useCallback(async (): Promise<void> => {
    if (navId === 'label:OUTBOX') {
      return
    }
    if (!messagesHasMore || loadingMoreRef.current || isLoadingMessages) {
      return
    }
    if (!selectedAccountId && !unifiedInbox) {
      return
    }
    loadingMoreRef.current = true
    setIsLoadingMoreMessages(true)
    try {
      const filters = navToFilters(navId)
      const page = await listMailMessages(unifiedInbox || !selectedAccountId ? 'all' : selectedAccountId, {
        ...filters,
        q: debouncedQuery.length >= 2 ? debouncedQuery : undefined,
        page: messagesPage + 1,
      })
      setMessages((prev) => {
        const seen = new Set(prev.map((row) => row.id))
        return [...prev, ...page.items.filter((row) => !seen.has(row.id))]
      })
      setMessagesPage(page.page)
      setMessagesHasMore(page.hasMore)
    } catch {
      // Keep hasMore so the sentinel can retry on the next intersection.
    } finally {
      loadingMoreRef.current = false
      setIsLoadingMoreMessages(false)
    }
  }, [
    debouncedQuery,
    isLoadingMessages,
    messagesHasMore,
    messagesPage,
    navId,
    selectedAccountId,
    unifiedInbox,
  ])

  const reloadOutbox = useCallback(async (): Promise<void> => {
    await loadMessages(selectedAccountId, 'label:OUTBOX', debouncedQuery, unifiedInbox)
  }, [debouncedQuery, loadMessages, selectedAccountId, unifiedInbox])

  useEffect(() => {
    void loadAccounts()
  }, [loadAccounts])

  useEffect(() => {
    if (!configured) {
      return
    }
    let cancelled = false
    let lastUnread = -1
    /**
     * Polls unread growth for desktop notifications only (no Dock / taskbar badge).
     */
    async function tick(): Promise<void> {
      try {
        const total = await fetchMailUnreadSummary()
        if (cancelled) {
          return
        }
        void window.workbench?.app?.setBadgeCount?.(0)
        if (
          lastUnread >= 0 &&
          total > lastUnread &&
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted'
        ) {
          new Notification('Workbench Mail', {
            body: i18n.t('mail.notifyNew', { count: total }),
          })
        }
        lastUnread = total
      } catch {
        // ignore transient unread-summary errors
      }
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission()
    }
    void tick()
    const timer = window.setInterval(() => {
      void tick()
    }, 45_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      void window.workbench?.app?.setBadgeCount?.(0)
    }
  }, [configured])

  useEffect(() => {
    if (!selectedAccountId) {
      setFolders([])
      setLabels([])
      setCounts({ counts: {}, labelCounts: {}, folderIdCounts: {} })
      setMessages([])
      setActiveMessage(null)
      return
    }
    // Drop the previous account's folders/messages immediately so a stale
    // folder UUID cannot be queried against the newly selected account.
    setFolders([])
    setLabels([])
    setCounts({ counts: {}, labelCounts: {}, folderIdCounts: {} })
    setMessages([])
    setNavId('label:INBOX')
    setActiveMessage(null)
    void loadSidebar(selectedAccountId)
  }, [loadSidebar, selectedAccountId])

  useEffect(() => {
    if (!selectedAccountId) {
      return
    }
    void loadMessages(selectedAccountId, navId, debouncedQuery, unifiedInbox)
  }, [debouncedQuery, loadMessages, navId, selectedAccountId, unifiedInbox])

  const sidebarItems = useMemo((): MailSidebarItem[] => {
    if (selectedAccount?.provider === 'alibaba' || selectedAccount?.provider === 'imap') {
      const folderItems = [...folders]
        .sort((a, b) => {
          const aRank =
            !a.role || a.role === 'custom' ? 99 : FOLDER_ROLE_ORDER.indexOf(a.role)
          const bRank =
            !b.role || b.role === 'custom' ? 99 : FOLDER_ROLE_ORDER.indexOf(b.role)
          if (aRank !== bRank) {
            return aRank - bRank
          }
          return a.name.localeCompare(b.name)
        })
        .map((folder) => ({
          navId: aliFolderNavId(folder),
          i18nKey: folder.role && folder.role !== 'custom' ? folder.role : undefined,
          name: folder.role && folder.role !== 'custom' ? undefined : folder.name,
          unread:
            counts.counts[ALI_ROLE_TO_LABEL[folder.role ?? ''] ?? ''] ??
            counts.folderIdCounts[folder.id] ??
            folder.unreadCount,
        }))
      const outboxItem: MailSidebarItem = {
        navId: 'label:OUTBOX',
        i18nKey: 'outbox',
        unread: syncTasks.filter((task) => task.status === 'pending_remote' || task.status === 'failed').length,
      }
      const draftsIndex = folderItems.findIndex((item) => item.i18nKey === 'drafts' || item.navId === 'label:DRAFT')
      if (draftsIndex >= 0) {
        return [...folderItems.slice(0, draftsIndex + 1), outboxItem, ...folderItems.slice(draftsIndex + 1)]
      }
      return [outboxItem, ...folderItems]
    }
    return GMAIL_SYSTEM_LABELS.map((row) => ({
      navId: `label:${row.id}` as const,
      i18nKey: row.i18nKey,
      unread:
        row.id === 'OUTBOX'
          ? syncTasks.filter((task) => task.status === 'pending_remote' || task.status === 'failed').length
          : (counts.counts[row.countId ?? row.id] ?? counts.labelCounts[row.id] ?? 0),
    }))
  }, [counts, folders, selectedAccount?.provider, syncTasks])

  const customLabelItems = useMemo((): MailSidebarItem[] => {
    if (selectedAccount?.provider !== 'gmail') {
      return []
    }
    const system = new Set(GMAIL_SYSTEM_LABELS.map((row) => row.id))
    return labels
      .filter((label) => !system.has(label.id) && !label.id.startsWith('CATEGORY_'))
      .map((label) => ({
        navId: `label:${label.id}` as const,
        name: label.name,
        unread: counts.labelCounts[label.id] ?? 0,
      }))
  }, [counts.labelCounts, labels, selectedAccount?.provider])

  const isTrashNav = useMemo(() => {
    if (navId === 'label:TRASH') {
      return true
    }
    if (!navId.startsWith('folder:')) {
      return false
    }
    return folders.find((folder) => folder.id === navId.slice('folder:'.length))?.role === 'trash'
  }, [folders, navId])

  const isSpamNav = useMemo(() => {
    if (navId === 'label:SPAM') {
      return true
    }
    if (!navId.startsWith('folder:')) {
      return false
    }
    return folders.find((folder) => folder.id === navId.slice('folder:'.length))?.role === 'spam'
  }, [folders, navId])

  const isOutboxNav = navId === 'label:OUTBOX'

  const canEditLabels = selectedAccount?.provider === 'gmail'
  const inboxUnread =
    counts.counts.INBOX ??
    folders.find((folder) => folder.role === 'inbox')?.unreadCount ??
    0

  const selectAccount = useCallback((accountId: string | null): void => {
    setUnifiedInboxState(false)
    setSelectedAccountId(accountId)
  }, [])

  const setUnifiedInbox = useCallback((on: boolean): void => {
    setUnifiedInboxState(on)
    if (on) {
      setActiveMessage(null)
      setThreadMessages([])
    }
  }, [])

  const selectNav = useCallback((next: MailNavId): void => {
    setNavId(next)
    setActiveMessage(null)
  }, [])

  const setSearchQuery = useCallback((query: string): void => {
    setSearchQueryState(query)
  }, [])

  const openMessage = useCallback(async (messageId: string): Promise<void> => {
    setIsLoadingDetail(true)
    try {
      const detail = await getMailMessageDetail(messageId)
      setActiveMessage(detail)
      let thread: MailMessageDetail[] = [detail]
      if (detail.threadId) {
        const accountId = unifiedInbox ? 'all' : (selectedAccountId ?? 'all')
        const page = await listMailMessages(accountId, { threadId: detail.threadId })
        const details = await Promise.all(
          page.items.map((row) => (row.id === detail.id ? Promise.resolve(detail) : getMailMessageDetail(row.id))),
        )
        thread = details.sort((a, b) => {
          const aTime = a.receivedAt ? Date.parse(a.receivedAt) : 0
          const bTime = b.receivedAt ? Date.parse(b.receivedAt) : 0
          return aTime - bTime
        })
      }
      setThreadMessages(thread)
      if (!detail.isRead) {
        await markMailMessageRead(messageId, true)
        setMessages((rows) => rows.map((row) => (row.id === messageId ? { ...row, isRead: true } : row)))
        setActiveMessage((current) => (current?.id === messageId ? { ...current, isRead: true } : current))
        setThreadMessages((rows) => rows.map((row) => (row.id === messageId ? { ...row, isRead: true } : row)))
      }
    } catch (error) {
      setMessageError(error instanceof Error ? error.message : 'Failed to open message')
    } finally {
      setIsLoadingDetail(false)
    }
  }, [selectedAccountId, unifiedInbox])

  const closeMessage = useCallback((): void => {
    setActiveMessage(null)
    setThreadMessages([])
  }, [])

  const focusRelativeMessage = useCallback(
    (delta: number): void => {
      if (messages.length === 0) {
        return
      }
      const currentId = activeMessage?.id ?? selectedIds[0] ?? null
      const index = currentId ? messages.findIndex((row) => row.id === currentId) : -1
      const nextIndex = index < 0 ? (delta > 0 ? 0 : messages.length - 1) : Math.min(messages.length - 1, Math.max(0, index + delta))
      const next = messages[nextIndex]
      if (next) {
        void openMessage(next.id)
      }
    },
    [activeMessage?.id, messages, openMessage, selectedIds],
  )

  const toggleStar = useCallback(async (messageId: string, starred: boolean): Promise<void> => {
    setMessages((rows) => rows.map((row) => (row.id === messageId ? { ...row, isStarred: starred } : row)))
    setActiveMessage((current) => (current?.id === messageId ? { ...current, isStarred: starred } : current))
    try {
      await toggleMailMessageStar(messageId, starred)
    } catch {
      setMessages((rows) => rows.map((row) => (row.id === messageId ? { ...row, isStarred: !starred } : row)))
      setActiveMessage((current) => (current?.id === messageId ? { ...current, isStarred: !starred } : current))
    }
  }, [])

  const markActiveUnread = useCallback(async (): Promise<void> => {
    if (!activeMessage) {
      return
    }
    const id = activeMessage.id
    await markMailMessageRead(id, false)
    setMessages((rows) => rows.map((row) => (row.id === id ? { ...row, isRead: false } : row)))
    setActiveMessage(null)
  }, [activeMessage])

  const syncActiveAccount = useCallback(async (): Promise<void> => {
    const targetId = selectedAccountId ?? accounts[0]?.id
    if (!targetId) {
      return
    }
    setIsSyncing(true)
    setAccountError(null)
    const previousUnread = messages.filter((row) => !row.isRead).length
    try {
      const { jobId } = await syncMailAccount(targetId)
      await pollMailSyncJobUntilDone(jobId)
      await Promise.all([
        loadSidebar(targetId),
        loadMessages(selectedAccountId, navId, debouncedQuery, unifiedInbox),
      ])
      await loadAccounts()
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const nextUnread = messages.filter((row) => !row.isRead).length
        if (nextUnread > previousUnread) {
          new Notification('Workbench Mail', { body: 'New mail arrived.' })
        }
      } else if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        void Notification.requestPermission()
      }
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'Sync failed')
    } finally {
      setIsSyncing(false)
    }
  }, [accounts, debouncedQuery, loadAccounts, loadMessages, loadSidebar, messages, navId, selectedAccountId, unifiedInbox])

  const connectImap = useCallback(
    async (
      provider: MailProvider,
      email: string,
      displayName: string | null,
      config: MailImapSmtpConfig,
    ): Promise<boolean> => {
      setAccountError(null)
      try {
        const added = await addImapAccount(provider, email, displayName, config)
        await loadAccounts()
        setSelectedAccountId(added.id)
        return true
      } catch (error) {
        setAccountError(error instanceof Error ? error.message : 'Failed to add account')
        return false
      }
    },
    [loadAccounts],
  )

  const sendMessage = useCallback(
    async (req: MailSendRequest): Promise<boolean> => {
      setIsSending(true)
      setSendError(null)
      try {
        await sendMail(req)
        await loadMessages(selectedAccountId, navId, debouncedQuery, unifiedInbox)
        return true
      } catch (error) {
        setSendError(error instanceof Error ? error.message : 'Failed to send')
        return false
      } finally {
        setIsSending(false)
      }
    },
    [debouncedQuery, loadMessages, navId, selectedAccountId, unifiedInbox],
  )

  const recentAddresses = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const message of messages) {
      const candidates = [
        message.fromAddress,
        ...message.toAddresses.map((row) => row.email),
      ]
      for (const email of candidates) {
        const trimmed = email.trim().toLowerCase()
        if (!trimmed || seen.has(trimmed)) {
          continue
        }
        seen.add(trimmed)
        out.push(email.trim())
        if (out.length >= 20) {
          return out
        }
      }
    }
    return out
  }, [messages])

  const toggleSelect = useCallback((messageId: string): void => {
    setSelectedIds((current) =>
      current.includes(messageId) ? current.filter((id) => id !== messageId) : [...current, messageId],
    )
  }, [])

  const selectAllVisible = useCallback((): void => {
    setSelectedIds(messages.map((row) => row.id))
  }, [messages])

  const clearSelection = useCallback((): void => {
    setSelectedIds([])
  }, [])

  const bulkAction = useCallback(
    async (
      action: MailBulkAction,
      ids?: string[],
      extra?: { label?: string; snoozeUntil?: string },
    ): Promise<void> => {
      const targetIds = ids && ids.length > 0 ? ids : selectedIds.length > 0 ? selectedIds : activeMessage ? [activeMessage.id] : []
      if (targetIds.length === 0) {
        return
      }
      await bulkMailMessages(targetIds, action, extra)
      setSelectedIds([])
      if (action === 'archive' || action === 'trash' || action === 'spam') {
        setUndo({ kind: action, ids: targetIds })
      } else {
        setUndo(null)
      }
      if (
        action === 'trash' ||
        action === 'archive' ||
        action === 'spam' ||
        action === 'delete_forever' ||
        action === 'snooze' ||
        (action === 'unspam' && isSpamNav) ||
        (action === 'untrash' && isTrashNav)
      ) {
        setMessages((rows) => rows.filter((row) => !targetIds.includes(row.id)))
        if (activeMessage && targetIds.includes(activeMessage.id)) {
          setActiveMessage(null)
          setThreadMessages([])
        }
      } else {
        await loadMessages(selectedAccountId, navId, debouncedQuery, unifiedInbox)
      }
      if (selectedAccountId) {
        void loadSidebar(selectedAccountId)
      }
    },
    [
      activeMessage,
      debouncedQuery,
      isSpamNav,
      isTrashNav,
      loadMessages,
      loadSidebar,
      navId,
      selectedAccountId,
      selectedIds,
      unifiedInbox,
    ],
  )

  const trashActive = useCallback(async (): Promise<void> => {
    if (!activeMessage) {
      return
    }
    await bulkAction('trash', [activeMessage.id])
  }, [activeMessage, bulkAction])

  const undoLast = useCallback(async (): Promise<void> => {
    if (!undo) {
      return
    }
    const reverse: MailBulkAction =
      undo.kind === 'archive' ? 'unarchive' : undo.kind === 'trash' ? 'untrash' : 'unspam'
    const ids = undo.ids
    setUndo(null)
    await bulkAction(reverse, ids)
  }, [bulkAction, undo])

  const dismissUndo = useCallback((): void => {
    setUndo(null)
  }, [])

  const emptyCurrentFolder = useCallback(async (): Promise<void> => {
    if (!selectedAccountId || (!isTrashNav && !isSpamNav)) {
      return
    }
    await emptyMailFolder(selectedAccountId, isSpamNav ? 'spam' : 'trash')
    setUndo(null)
    setActiveMessage(null)
    setThreadMessages([])
    await Promise.all([
      loadSidebar(selectedAccountId),
      loadMessages(selectedAccountId, navId, debouncedQuery, unifiedInbox),
    ])
  }, [debouncedQuery, isSpamNav, isTrashNav, loadMessages, loadSidebar, navId, selectedAccountId, unifiedInbox])

  const createLabel = useCallback(
    async (name: string): Promise<MailLabel | null> => {
      if (!selectedAccountId || !canEditLabels) {
        return null
      }
      try {
        const created = await createMailLabel(selectedAccountId, name)
        await loadSidebar(selectedAccountId)
        return created
      } catch (error) {
        setAccountError(error instanceof Error ? error.message : 'Failed to create label')
        return null
      }
    },
    [canEditLabels, loadSidebar, selectedAccountId],
  )

  const renameLabel = useCallback(
    async (labelId: string, name: string): Promise<boolean> => {
      if (!selectedAccountId || !canEditLabels) {
        return false
      }
      try {
        await renameMailLabel(selectedAccountId, labelId, name)
        await loadSidebar(selectedAccountId)
        return true
      } catch (error) {
        setAccountError(error instanceof Error ? error.message : 'Failed to rename label')
        return false
      }
    },
    [canEditLabels, loadSidebar, selectedAccountId],
  )

  const deleteLabel = useCallback(
    async (labelId: string): Promise<boolean> => {
      if (!selectedAccountId || !canEditLabels) {
        return false
      }
      try {
        await deleteMailLabel(selectedAccountId, labelId)
        if (navId === `label:${labelId}`) {
          setNavId('label:INBOX')
        }
        await loadSidebar(selectedAccountId)
        return true
      } catch (error) {
        setAccountError(error instanceof Error ? error.message : 'Failed to delete label')
        return false
      }
    },
    [canEditLabels, loadSidebar, navId, selectedAccountId],
  )

  const previewAttachment = useCallback(
    async (
      messageId: string,
      attachmentId: string,
      filename: string,
      contentType: string | null,
    ): Promise<{ url: string; filename: string; contentType: string | null }> => {
      const blob = await downloadMailAttachment(messageId, attachmentId)
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
      }
      const url = URL.createObjectURL(blob)
      previewUrlRef.current = url
      return { url, filename, contentType }
    },
    [],
  )

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
      }
    }
  }, [])

  const historicalSync = useCallback(
    async (since?: string): Promise<void> => {
      if (!selectedAccountId) {
        return
      }
      setIsSyncing(true)
      setAccountError(null)
      try {
        const { jobId } = await startHistoricalMailSync(selectedAccountId, since)
        await pollMailSyncJobUntilDone(jobId)
        await Promise.all([
          loadSidebar(selectedAccountId),
          loadMessages(selectedAccountId, navId, debouncedQuery, unifiedInbox),
        ])
      } catch (error) {
        setAccountError(error instanceof Error ? error.message : 'Historical sync failed')
      } finally {
        setIsSyncing(false)
      }
    },
    [debouncedQuery, loadMessages, loadSidebar, navId, selectedAccountId, unifiedInbox],
  )

  const saveDraft = useCallback(async (req: MailDraftRequest): Promise<string | null> => {
    try {
      const created = await saveMailDraft(req)
      return created.id
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Failed to save draft')
      return null
    }
  }, [])

  const updateDraft = useCallback(async (draftId: string, req: MailDraftRequest): Promise<boolean> => {
    try {
      await updateMailDraft(draftId, req)
      return true
    } catch {
      return false
    }
  }, [])

  const discardDraft = useCallback(async (draftId: string): Promise<void> => {
    await deleteMailDraft(draftId)
  }, [])

  const downloadAttachment = useCallback(
    async (messageId: string, attachmentId: string, filename: string): Promise<void> => {
      const blob = await downloadMailAttachment(messageId, attachmentId)
      saveBlobFile(blob, filename)
    },
    [],
  )

  const openOfficeAttachment = useCallback(
    async (messageId: string, attachmentId: string, filename: string): Promise<void> => {
      const kind = officeKindFromFileName(filename)
      if (!kind) {
        await downloadAttachment(messageId, attachmentId, filename)
        return
      }
      const blob = await downloadMailAttachment(messageId, attachmentId)
      const bytes = new Uint8Array(await blob.arrayBuffer())
      openOfficeDocument({ kind, name: filename, bytes })
    },
    [downloadAttachment],
  )

  const downloadEml = useCallback(async (messageId: string, filename: string): Promise<void> => {
    const blob = await downloadMailEml(messageId)
    saveBlobFile(blob, filename.endsWith('.eml') ? filename : `${filename}.eml`)
  }, [])

  const disconnectAccount = useCallback(
    async (accountId: string): Promise<boolean> => {
      try {
        await disconnectMailAccount(accountId)
        await loadAccounts()
        return true
      } catch (error) {
        setAccountError(error instanceof Error ? error.message : 'Failed to disconnect')
        return false
      }
    },
    [loadAccounts],
  )

  const deleteAccount = useCallback(
    async (accountId: string): Promise<boolean> => {
      try {
        await deleteMailAccount(accountId)
        await loadAccounts()
        return true
      } catch (error) {
        setAccountError(error instanceof Error ? error.message : 'Failed to delete account')
        return false
      }
    },
    [loadAccounts],
  )

  const testAccount = useCallback(async (accountId: string): Promise<MailAccountTestResult> => {
    try {
      return await testMailAccount(accountId)
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Test failed' }
    }
  }, [])

  const renameAccount = useCallback(
    async (accountId: string, displayName: string | null): Promise<boolean> => {
      try {
        await updateMailAccount(accountId, displayName)
        await loadAccounts()
        return true
      } catch (error) {
        setAccountError(error instanceof Error ? error.message : 'Failed to rename account')
        return false
      }
    },
    [loadAccounts],
  )

  return {
    configured,
    accounts,
    selectedAccount,
    selectedAccountId,
    unifiedInbox,
    navId,
    folders,
    sidebarItems,
    customLabelItems,
    labels,
    messages,
    activeMessage,
    threadMessages,
    selectedIds,
    searchQuery,
    recentAddresses,
    isTrashNav,
    isSpamNav,
    isOutboxNav,
    syncTasks,
    canEditLabels,
    inboxUnread,
    isLoadingAccounts,
    isLoadingMessages,
    isLoadingMoreMessages,
    messagesHasMore,
    isLoadingDetail,
    isSyncing,
    accountError,
    messageError,
    undo,
    selectAccount,
    setUnifiedInbox,
    selectNav,
    setSearchQuery,
    openMessage,
    closeMessage,
    focusRelativeMessage,
    toggleStar,
    trashActive,
    markActiveUnread,
    toggleSelect,
    selectAllVisible,
    clearSelection,
    bulkAction,
    undoLast,
    dismissUndo,
    emptyCurrentFolder,
    reloadOutbox,
    loadMoreMessages,
    createLabel,
    renameLabel,
    deleteLabel,
    previewAttachment,
    syncActiveAccount,
    historicalSync,
    reloadAccounts: loadAccounts,
    connectImap,
    sendMessage,
    saveDraft,
    updateDraft,
    discardDraft,
    downloadAttachment,
    openOfficeAttachment,
    downloadEml,
    disconnectAccount,
    deleteAccount,
    testAccount,
    renameAccount,
    isSending,
    sendError,
  }
}
