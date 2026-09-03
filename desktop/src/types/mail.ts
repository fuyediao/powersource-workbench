/** Mail provider ids returned by workbench-api `/mail/*`. */
export type MailProvider = 'gmail' | 'alibaba' | 'imap'

/** Mailbox connection status. */
export type MailAccountStatus = 'active' | 'error' | 'reauth_required' | 'disconnected'

/** Folder role used by IMAP / sidebar grouping. */
export type MailFolderRole = 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive' | 'custom'

/** Connected mailbox visible to the signed-in user. */
export interface MailAccount {
  id: string
  provider: MailProvider
  email: string
  displayName: string | null
  avatarUrl: string | null
  status: MailAccountStatus
  errorMessage: string | null
  lastSyncAt: string | null
}

/** Sidebar folder row from `GET /mail/folders`. */
export interface MailFolderInfo {
  id: string
  providerId: string
  name: string
  role: MailFolderRole | null
  unreadCount: number
  totalCount: number
}

/** User-defined Gmail label. */
export interface MailLabel {
  id: string
  name: string
}

/** Unread counts keyed by virtual label / folder id. */
export type MailFolderCounts = Record<string, number>

/** Sidebar / folder-count payload. */
export interface MailFolderCountsResponse {
  counts: MailFolderCounts
  labelCounts: MailFolderCounts
  folderIdCounts: MailFolderCounts
}

/** Address on a message. */
export interface MailAddress {
  email: string
  name?: string
}

/** Message list row. */
export interface MailMessage {
  id: string
  /** Owning mailbox; used for account color swatches in the thread list. */
  mailAccountId: string | null
  threadId: string | null
  folderId: string | null
  subject: string | null
  fromAddress: string
  fromName: string | null
  toAddresses: MailAddress[]
  snippet: string | null
  receivedAt: string | null
  isRead: boolean
  isStarred: boolean
  isSent: boolean
  isDraft: boolean
  hasAttachments: boolean
  labels: string[]
}

/** Paginated `GET /mail/messages` response. */
export interface MailMessagePage {
  items: MailMessage[]
  page: number
  pageSize: number
  total: number
  hasMore: boolean
  unreadInboxCount?: number
}

/** Full message body + attachments. */
export interface MailMessageDetail extends MailMessage {
  ccAddresses: MailAddress[]
  bccAddresses: MailAddress[]
  bodyHtml: string | null
  bodyText: string | null
  attachments: Array<{
    id: string
    filename: string
    contentType: string | null
    sizeBytes: number | null
  }>
}

/** Incremental / historical sync job snapshot. */
export interface MailSyncJobStatus {
  jobId: string
  accountId: string
  kind: 'incremental' | 'historical'
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled'
  progress: number
  totalEstimated: number | null
  messagesSynced: number
  errorMessage: string | null
}

/** Sidebar navigation target (Gmail label or IMAP folder). */
export type MailNavId = `label:${string}` | `folder:${string}`

/** IMAP/SMTP credentials for AliMail (and similar password providers). */
export interface MailImapSmtpConfig {
  imapHost: string
  imapPort: number
  imapSsl: boolean
  smtpHost: string
  smtpPort: number
  smtpSsl: boolean
  username: string
  password: string
}

/** Host/port preset from `GET /mail/provider-presets`. */
export interface MailProviderPreset {
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
  smtpSsl: boolean
}

/** Outgoing MIME attachment (base64 payload). */
export interface MailSendAttachment {
  filename: string
  contentType: string
  dataBase64: string
}

/** Undoable list action shown in the toast. */
export type MailUndoKind = 'archive' | 'trash' | 'spam'

/** Bulk mailbox action. */
export type MailBulkAction =
  | 'read'
  | 'unread'
  | 'star'
  | 'unstar'
  | 'trash'
  | 'untrash'
  | 'delete_forever'
  | 'archive'
  | 'unarchive'
  | 'spam'
  | 'unspam'
  | 'important'
  | 'unimportant'
  | 'apply_label'
  | 'remove_label'
  | 'snooze'
  | 'unsnooze'

/** `POST /mail/send` body. */
export interface MailSendRequest {
  mailAccountId: string
  fromAddress: string
  replyTo?: string
  to: MailAddress[]
  cc?: MailAddress[]
  bcc?: MailAddress[]
  subject: string
  bodyHtml?: string
  bodyText?: string
  inReplyToMessageId?: string
  draftId?: string
  scheduledAt?: string
  attachments?: MailSendAttachment[]
}

/** `POST /mail/drafts` body. */
export interface MailDraftRequest {
  mailAccountId: string
  fromAddress?: string
  to?: MailAddress[]
  cc?: MailAddress[]
  bcc?: MailAddress[]
  subject?: string
  bodyHtml?: string
  bodyText?: string
}

/** Account connection test result. */
export interface MailAccountTestResult {
  ok: boolean
  error?: string | null
}

/** Remote-mirror / send retry row from `GET /mail/sync-tasks` (Outbox). */
export interface MailSyncTask {
  id: string
  mailAccountId: string
  kind: string
  status: 'pending_remote' | 'failed' | 'done' | 'cancelled'
  attempts: number
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  messageCount: number
  label: string | null
  sendJobId: string | null
  subject?: string | null
}

/** `GET /mail/sync-tasks` response. */
export interface MailSyncTaskPage {
  items: MailSyncTask[]
  total: number
}
