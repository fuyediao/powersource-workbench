/** Native Mail menu commands (macOS application menu). */
export type MailMenuCommand =
  | 'mailbox:add'
  | 'mailbox:test'
  | 'mailbox:disconnect'
  | 'mailbox:delete'
  | 'mail:compose'
  | 'mail:reply'
  | 'mail:reply-all'
  | 'mail:forward'
  | 'mail:star'
  | 'mail:unread'
  | 'mail:archive'
  | 'mail:spam'
  | 'mail:labels'
  | 'mail:snooze'
  | 'mail:trash'
  | 'mail:print'
  | 'mail:eml'
  | 'mail:mbox'
  | 'mail:signature'
  | 'sync:now'
  | 'sync:historical'
  | 'sidebar:expanded'
  | 'sidebar:collapsed'
  | 'sidebar:hover'

/** Native Mail menu action (account radio or command). */
export type MailMenuAction =
  | { type: 'select-account'; accountId: string | null }
  | { type: 'command'; id: MailMenuCommand }

/** One mailbox row in the native Account menu. */
export type MailMenuAccount = {
  id: string
  label: string
}

/**
 * Formats a mailbox row for the Account menu (display name plus address).
 * @param displayName - Optional display name.
 * @param email - Mailbox address.
 * @returns Menu label such as `Jane <jane@example.com>`, or just the address.
 */
export function formatMailAccountMenuLabel(
  displayName: string | null | undefined,
  email: string,
): string {
  const name = displayName?.trim() ?? ''
  if (name.length > 0 && name.toLowerCase() !== email.toLowerCase()) {
    return `${name} <${email}>`
  }
  return email
}

/** Live Mail-menu radios, enablement, and account list. */
export type MailMenuViewState = {
  accountMenuLabel: string
  accounts: MailMenuAccount[]
  selectedAccountId: string | null
  unifiedInbox: boolean
  hasAccount: boolean
  hasMessage: boolean
  isStarred: boolean
  isSpamView: boolean
  isSyncing: boolean
  sidebarMode: 'expanded' | 'collapsed' | 'hover'
}

type MailMenuHandlers = {
  selectAccount?: (accountId: string | null) => void
  addAccount?: () => void
  testAccount?: () => void
  disconnectAccount?: () => void
  deleteAccount?: () => void
  compose?: () => void
  reply?: () => void
  replyAll?: () => void
  forward?: () => void
  toggleStar?: () => void
  markUnread?: () => void
  archive?: () => void
  spam?: () => void
  openLabels?: () => void
  snooze?: () => void
  trash?: () => void
  print?: () => void
  downloadEml?: () => void
  exportMbox?: () => void
  openSignature?: () => void
  syncNow?: () => void
  historicalSync?: () => void
  setSidebarMode?: (mode: MailMenuViewState['sidebarMode']) => void
}

type SnapshotListener = () => void

const DEFAULT_VIEW: MailMenuViewState = {
  accountMenuLabel: 'Account',
  accounts: [],
  selectedAccountId: null,
  unifiedInbox: true,
  hasAccount: false,
  hasMessage: false,
  isStarred: false,
  isSpamView: false,
  isSyncing: false,
  sidebarMode: 'expanded',
}

let handlers: MailMenuHandlers = {}
let snapshot: MailMenuViewState = { ...DEFAULT_VIEW, accounts: [] }
const snapshotListeners = new Set<SnapshotListener>()

/**
 * Returns whether two mailbox rows match.
 * @param left - Current row.
 * @param right - Candidate row.
 * @returns True when id and label match.
 */
function accountEquals(left: MailMenuAccount, right: MailMenuAccount): boolean {
  return left.id === right.id && left.label === right.label
}

/**
 * Returns whether two Mail-menu snapshots are equivalent.
 * @param left - Current snapshot.
 * @param right - Candidate snapshot.
 * @returns True when every field matches.
 */
function viewEquals(left: MailMenuViewState, right: MailMenuViewState): boolean {
  if (
    left.accountMenuLabel !== right.accountMenuLabel ||
    left.selectedAccountId !== right.selectedAccountId ||
    left.unifiedInbox !== right.unifiedInbox ||
    left.hasAccount !== right.hasAccount ||
    left.hasMessage !== right.hasMessage ||
    left.isStarred !== right.isStarred ||
    left.isSpamView !== right.isSpamView ||
    left.isSyncing !== right.isSyncing ||
    left.sidebarMode !== right.sidebarMode ||
    left.accounts.length !== right.accounts.length
  ) {
    return false
  }
  return left.accounts.every((account, index) => {
    const other = right.accounts[index]
    return other !== undefined && accountEquals(account, other)
  })
}

/**
 * Notify Mail-menu snapshot subscribers.
 * @returns Nothing.
 */
function emitSnapshot(): void {
  snapshotListeners.forEach((listener) => listener())
}

/**
 * Latest Mail menu snapshot for the macOS application menu.
 * @returns View state.
 */
export function getMailMenuSnapshot(): MailMenuViewState {
  return snapshot
}

/**
 * Subscribe to Mail menu snapshot changes.
 * @param listener - Callback invoked when radios or enablement change.
 * @returns Unsubscribe function.
 */
export function subscribeMailMenuSnapshot(listener: SnapshotListener): () => void {
  snapshotListeners.add(listener)
  return () => {
    snapshotListeners.delete(listener)
  }
}

/**
 * Merges live Mail-menu radios and enablement.
 * @param patch - Fields to update.
 * @returns Nothing.
 */
export function setMailMenuView(patch: Partial<MailMenuViewState>): void {
  const next: MailMenuViewState = {
    ...snapshot,
    ...patch,
    accounts: patch.accounts ? patch.accounts.map((row) => ({ ...row })) : snapshot.accounts,
  }
  if (viewEquals(snapshot, next)) {
    return
  }
  snapshot = next
  emitSnapshot()
}

/**
 * Merges Mail-menu command handlers from the Mail page.
 * @param next - Handler patch.
 * @returns Nothing.
 */
export function patchMailMenuHandlers(next: MailMenuHandlers): void {
  handlers = { ...handlers, ...next }
}

/**
 * Clears Mail-menu handlers and snapshot when the Mail page unmounts.
 * @returns Nothing.
 */
export function unregisterMailMenuHost(): void {
  handlers = {}
  const empty: MailMenuViewState = { ...DEFAULT_VIEW, accounts: [] }
  if (viewEquals(snapshot, empty)) {
    return
  }
  snapshot = empty
  emitSnapshot()
}

/**
 * Runs a native Mail menu command.
 * @param action - Menu action.
 * @returns Nothing.
 */
export function dispatchMailMenuAction(action: MailMenuAction): void {
  if (action.type === 'select-account') {
    handlers.selectAccount?.(action.accountId)
    return
  }
  switch (action.id) {
    case 'mailbox:add':
      handlers.addAccount?.()
      return
    case 'mailbox:test':
      handlers.testAccount?.()
      return
    case 'mailbox:disconnect':
      handlers.disconnectAccount?.()
      return
    case 'mailbox:delete':
      handlers.deleteAccount?.()
      return
    case 'mail:compose':
      handlers.compose?.()
      return
    case 'mail:reply':
      handlers.reply?.()
      return
    case 'mail:reply-all':
      handlers.replyAll?.()
      return
    case 'mail:forward':
      handlers.forward?.()
      return
    case 'mail:star':
      handlers.toggleStar?.()
      return
    case 'mail:unread':
      handlers.markUnread?.()
      return
    case 'mail:archive':
      handlers.archive?.()
      return
    case 'mail:spam':
      handlers.spam?.()
      return
    case 'mail:labels':
      handlers.openLabels?.()
      return
    case 'mail:snooze':
      handlers.snooze?.()
      return
    case 'mail:trash':
      handlers.trash?.()
      return
    case 'mail:print':
      handlers.print?.()
      return
    case 'mail:eml':
      handlers.downloadEml?.()
      return
    case 'mail:mbox':
      handlers.exportMbox?.()
      return
    case 'mail:signature':
      handlers.openSignature?.()
      return
    case 'sync:now':
      handlers.syncNow?.()
      return
    case 'sync:historical':
      handlers.historicalSync?.()
      return
    case 'sidebar:expanded':
      handlers.setSidebarMode?.('expanded')
      return
    case 'sidebar:collapsed':
      handlers.setSidebarMode?.('collapsed')
      return
    case 'sidebar:hover':
      handlers.setSidebarMode?.('hover')
      return
    default:
      return
  }
}
