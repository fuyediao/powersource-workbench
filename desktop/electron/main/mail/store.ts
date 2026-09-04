/**
 * Mailboxes, folders, messages, bodies, and attachment files — machine SQLite
 * plus files under Electron userData. Not Supabase Storage.
 */

import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite'
import { app, safeStorage } from 'electron'
import type {
  MailAccount,
  MailAccountStatus,
  MailAddress,
  MailFolderCountsResponse,
  MailFolderInfo,
  MailFolderRole,
  MailImapSmtpConfig,
  MailMessage,
  MailMessageDetail,
  MailMessagePage,
  MailProvider,
  MailSyncJobStatus,
  MailSyncTask,
  MailSyncTaskPage,
} from '../../shared/mail-types'
import {
  VIRTUAL_LABELS,
  inTokenToLabel,
  labelsForImapMessage,
  messageMatchesVirtualLabel,
  toggleLabels,
  type MailFolderRole as QueryFolderRole,
} from './query'

const MAX_USER_ID_LENGTH = 64
const MAX_EMAIL_LENGTH = 320
const MAX_PASSWORD_LENGTH = 512
const PAGE_SIZE = 50
const MAX_BODY_CHARS = 2 * 1024 * 1024
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

type StoreRow = Record<string, SQLOutputValue>

/** IMAP/SMTP config plus encrypted password as stored for an account. */
export interface StoredMailAccountConfig extends MailImapSmtpConfig {
  accountId: string
  email: string
  userId: string
  provider: MailProvider
}

let mailDatabase: DatabaseSync | null = null

/**
 * Returns the lazily opened mail database.
 * @returns Initialized SQLite database.
 */
function getMailDatabase(): DatabaseSync {
  if (mailDatabase) {
    return mailDatabase
  }
  const databasePath = path.join(app.getPath('userData'), 'mail.sqlite')
  const database = new DatabaseSync(databasePath)
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      email TEXT NOT NULL,
      display_name TEXT,
      avatar_url TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      error_message TEXT,
      last_sync_at TEXT,
      imap_host TEXT NOT NULL,
      imap_port INTEGER NOT NULL,
      imap_ssl INTEGER NOT NULL DEFAULT 1,
      smtp_host TEXT NOT NULL,
      smtp_port INTEGER NOT NULL,
      smtp_ssl INTEGER NOT NULL DEFAULT 1,
      username TEXT NOT NULL,
      password_enc TEXT NOT NULL,
      password_sealed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS accounts_user ON accounts (user_id, status);
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT,
      unread_count INTEGER NOT NULL DEFAULT 0,
      total_count INTEGER NOT NULL DEFAULT 0,
      highest_uid INTEGER NOT NULL DEFAULT 0,
      UNIQUE (account_id, provider_id),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      provider_thread_id TEXT,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS threads_account_provider
      ON threads (account_id, provider_thread_id)
      WHERE provider_thread_id IS NOT NULL AND length(provider_thread_id) > 0;
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      thread_id TEXT,
      folder_id TEXT,
      provider_message_id TEXT,
      message_id_header TEXT,
      in_reply_to TEXT,
      uid INTEGER,
      subject TEXT,
      from_address TEXT NOT NULL DEFAULT '',
      from_name TEXT,
      to_addresses_json TEXT NOT NULL DEFAULT '[]',
      cc_addresses_json TEXT NOT NULL DEFAULT '[]',
      bcc_addresses_json TEXT NOT NULL DEFAULT '[]',
      snippet TEXT,
      received_at TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      is_starred INTEGER NOT NULL DEFAULT 0,
      is_sent INTEGER NOT NULL DEFAULT 0,
      is_draft INTEGER NOT NULL DEFAULT 0,
      has_attachments INTEGER NOT NULL DEFAULT 0,
      labels_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS messages_account_provider
      ON messages (account_id, provider_message_id)
      WHERE provider_message_id IS NOT NULL AND length(provider_message_id) > 0;
    CREATE INDEX IF NOT EXISTS messages_account_received
      ON messages (account_id, received_at DESC);
    CREATE TABLE IF NOT EXISTS bodies (
      message_id TEXT PRIMARY KEY,
      body_html TEXT,
      body_text TEXT,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      content_type TEXT,
      size_bytes INTEGER,
      file_path TEXT NOT NULL,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS sync_jobs (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      total_estimated INTEGER,
      messages_synced INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS snoozes (
      message_id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      snoozed_until TEXT NOT NULL,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS sync_tasks (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
  `)
  mailDatabase = database
  return mailDatabase
}

/**
 * Directory for one message's attachment files.
 * @param userId - Auth user id.
 * @param messageId - Message id.
 * @returns Absolute directory path.
 */
function attachmentDir(userId: string, messageId: string): string {
  return path.join(app.getPath('userData'), 'mail-attachments', userId, messageId)
}

/**
 * Validates an auth user id received over IPC.
 * @param value - Candidate id.
 * @returns Trimmed user id.
 */
export function requireMailUserId(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_USER_ID_LENGTH) {
    throw new Error('Mail user id is invalid.')
  }
  return trimmed
}

/**
 * Validates a row id received over IPC.
 * @param value - Candidate id.
 * @param label - Field label.
 * @returns Trimmed id.
 */
function requireId(value: string, label: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 80) {
    throw new Error(`${label} is invalid.`)
  }
  return trimmed
}

/**
 * Reads a SQLite text column.
 * @param value - Raw cell.
 * @returns String, or empty when missing.
 */
function asString(value: SQLOutputValue | undefined): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Reads a SQLite integer column.
 * @param value - Raw cell.
 * @returns Integer, or 0 when missing.
 */
function asInteger(value: SQLOutputValue | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * Reads a SQLite integer column as boolean.
 * @param value - Raw cell.
 * @returns True when the cell is 1.
 */
function asBoolean(value: SQLOutputValue | undefined): boolean {
  return value === 1 || value === BigInt(1)
}

/**
 * Strips characters that are illegal in Windows file names.
 * @param filename - Original attachment name.
 * @returns Safe file name fragment.
 */
function safeAttachmentFileName(filename: string): string {
  const cleaned = [...filename]
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0
      if (code < 32 || '<>:"/\\|?*'.includes(ch)) {
        return '_'
      }
      return ch
    })
    .join('')
    .trim()
  return cleaned || 'attachment'
}

/**
 * Returns the current UTC instant as ISO-8601.
 * @returns ISO timestamp.
 */
function nowIso(): string {
  return new Date().toISOString()
}

/**
 * Seals a mailbox password with OS keychain encryption when available.
 * @param plain - Password text.
 * @returns Ciphertext and whether it was sealed.
 */
function sealPassword(plain: string): { value: string; sealed: boolean } {
  if (plain.length === 0 || plain.length > MAX_PASSWORD_LENGTH) {
    throw new Error('Mail password is invalid.')
  }
  if (safeStorage.isEncryptionAvailable()) {
    return {
      value: safeStorage.encryptString(plain).toString('base64'),
      sealed: true,
    }
  }
  return { value: plain, sealed: false }
}

/**
 * Opens a sealed mailbox password.
 * @param value - Stored cell.
 * @param sealed - Whether the cell is encrypted.
 * @returns Plain password.
 */
function openPassword(value: string, sealed: boolean): string {
  if (!sealed) {
    return value
  }
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  } catch {
    throw new Error('Mail password could not be decrypted on this machine.')
  }
}

/**
 * Parses a JSON array of addresses.
 * @param raw - JSON text.
 * @returns Address list.
 */
function parseAddresses(raw: unknown): MailAddress[] {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return []
      }
      const record = item as Record<string, unknown>
      if (typeof record.email !== 'string' || record.email.trim() === '') {
        return []
      }
      const address: MailAddress = { email: record.email.trim() }
      if (typeof record.name === 'string' && record.name.trim()) {
        address.name = record.name.trim()
      }
      return [address]
    })
  } catch {
    return []
  }
}

/**
 * Parses stored labels JSON.
 * @param raw - JSON text.
 * @returns Label tokens.
 */
function parseLabels(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

/**
 * Maps an accounts row to a public account DTO (no secrets).
 * @param row - Database row.
 * @returns Account, or null when required columns are missing.
 */
function mapAccount(row: StoreRow): MailAccount | null {
  const id = asString(row.id)
  const email = asString(row.email)
  if (!id || !email) {
    return null
  }
  const provider = asString(row.provider)
  return {
    id,
    provider: provider === 'alibaba' || provider === 'gmail' ? provider : 'imap',
    email,
    displayName: asString(row.display_name) || null,
    avatarUrl: asString(row.avatar_url) || null,
    status: (asString(row.status) as MailAccountStatus) || 'active',
    errorMessage: asString(row.error_message) || null,
    lastSyncAt: asString(row.last_sync_at) || null,
  }
}

/**
 * Maps a messages row to a list DTO.
 * @param row - Database row.
 * @returns Message, or null when required columns are missing.
 */
function mapMessage(row: StoreRow): MailMessage | null {
  const id = asString(row.id)
  if (!id) {
    return null
  }
  return {
    id,
    mailAccountId: asString(row.account_id) || null,
    threadId: asString(row.thread_id) || null,
    folderId: asString(row.folder_id) || null,
    subject: asString(row.subject) || null,
    fromAddress: asString(row.from_address),
    fromName: asString(row.from_name) || null,
    toAddresses: parseAddresses(row.to_addresses_json),
    snippet: asString(row.snippet) || null,
    receivedAt: asString(row.received_at) || null,
    isRead: asBoolean(row.is_read),
    isStarred: asBoolean(row.is_starred),
    isSent: asBoolean(row.is_sent),
    isDraft: asBoolean(row.is_draft),
    hasAttachments: asBoolean(row.has_attachments),
    labels: parseLabels(row.labels_json),
  }
}

/**
 * Lists mailboxes the signed-in user can access.
 * @param userId - Auth user id.
 * @returns Active accounts (disconnected rows omitted).
 */
export function listMailAccounts(userId: string): MailAccount[] {
  const owner = requireMailUserId(userId)
  const rows = getMailDatabase()
    .prepare(
      `SELECT * FROM accounts WHERE user_id = ? AND status != 'disconnected' ORDER BY created_at ASC`,
    )
    .all(owner) as StoreRow[]
  return rows.map(mapAccount).filter((row): row is MailAccount => row !== null)
}

/**
 * Loads one owned account row.
 * @param userId - Auth user id.
 * @param accountId - Account id.
 * @returns Account row, or null.
 */
export function getOwnedAccountRow(userId: string, accountId: string): StoreRow | null {
  const row = getMailDatabase()
    .prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?')
    .get(requireId(accountId, 'Mail account id'), requireMailUserId(userId)) as StoreRow | undefined
  return row ?? null
}

/**
 * Loads IMAP/SMTP config for an owned account.
 * @param userId - Auth user id.
 * @param accountId - Account id.
 * @returns Config including plaintext password.
 */
export function loadAccountConfig(userId: string, accountId: string): StoredMailAccountConfig {
  const row = getOwnedAccountRow(userId, accountId)
  if (!row) {
    throw new Error('Account not found or access denied')
  }
  const provider = asString(row.provider)
  return {
    accountId: asString(row.id),
    email: asString(row.email),
    userId: asString(row.user_id),
    provider: provider === 'alibaba' || provider === 'gmail' ? provider : 'imap',
    imapHost: asString(row.imap_host),
    imapPort: asInteger(row.imap_port),
    imapSsl: asBoolean(row.imap_ssl),
    smtpHost: asString(row.smtp_host),
    smtpPort: asInteger(row.smtp_port),
    smtpSsl: asBoolean(row.smtp_ssl),
    username: asString(row.username),
    password: openPassword(asString(row.password_enc), asBoolean(row.password_sealed)),
  }
}

/**
 * Inserts an IMAP/SMTP mailbox for the signed-in user.
 * @param userId - Auth user id.
 * @param provider - Provider id.
 * @param email - Address.
 * @param displayName - Optional label.
 * @param config - Server credentials.
 * @returns Created account id and email.
 */
export function insertImapAccount(
  userId: string,
  provider: MailProvider,
  email: string,
  displayName: string | null,
  config: MailImapSmtpConfig,
): { id: string; email: string; provider: string } {
  const owner = requireMailUserId(userId)
  const address = email.trim().slice(0, MAX_EMAIL_LENGTH)
  if (!address.includes('@')) {
    throw new Error('Email address is invalid.')
  }
  if (provider !== 'alibaba' && provider !== 'imap') {
    throw new Error('Only AliMail and generic IMAP accounts can be added.')
  }
  const sealed = sealPassword(config.password)
  const id = randomUUID()
  const now = nowIso()
  getMailDatabase()
    .prepare(
      `INSERT INTO accounts (
        id, user_id, provider, email, display_name, avatar_url, status, error_message, last_sync_at,
        imap_host, imap_port, imap_ssl, smtp_host, smtp_port, smtp_ssl, username,
        password_enc, password_sealed, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, NULL, 'active', NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      owner,
      provider,
      address,
      displayName?.trim() || null,
      config.imapHost.trim(),
      config.imapPort,
      config.imapSsl ? 1 : 0,
      config.smtpHost.trim(),
      config.smtpPort,
      config.smtpSsl ? 1 : 0,
      config.username.trim() || address,
      sealed.value,
      sealed.sealed ? 1 : 0,
      now,
      now,
    )
  return { id, email: address, provider }
}

/**
 * Lists folders for an owned account.
 * @param userId - Auth user id.
 * @param accountId - Account id.
 * @returns Folders.
 */
export function listMailFolders(userId: string, accountId: string): MailFolderInfo[] {
  if (!getOwnedAccountRow(userId, accountId)) {
    throw new Error('Account not found or access denied')
  }
  const rows = getMailDatabase()
    .prepare('SELECT * FROM folders WHERE account_id = ? ORDER BY name ASC')
    .all(requireId(accountId, 'Mail account id')) as StoreRow[]
  return rows.map((row) => {
    const role = asString(row.role)
    return {
      id: asString(row.id),
      providerId: asString(row.provider_id),
      name: asString(row.name),
      role: (role as MailFolderRole) || null,
      unreadCount: asInteger(row.unread_count),
      totalCount: asInteger(row.total_count),
    }
  })
}

/**
 * Upserts one IMAP folder cursor row.
 * @param accountId - Account id.
 * @param providerId - IMAP mailbox name.
 * @param name - Display name.
 * @param role - Sidebar role.
 * @param highestUid - Highest synced UID.
 * @returns Folder id.
 */
export function upsertFolder(
  accountId: string,
  providerId: string,
  name: string,
  role: QueryFolderRole | '',
  highestUid: number,
): string {
  const database = getMailDatabase()
  const existing = database
    .prepare('SELECT id FROM folders WHERE account_id = ? AND provider_id = ?')
    .get(accountId, providerId) as StoreRow | undefined
  if (existing) {
    const id = asString(existing.id)
    database
      .prepare(
        'UPDATE folders SET name = ?, role = ?, highest_uid = MAX(highest_uid, ?) WHERE id = ?',
      )
      .run(name, role || null, highestUid, id)
    return id
  }
  const id = randomUUID()
  database
    .prepare(
      `INSERT INTO folders (id, account_id, provider_id, name, role, unread_count, total_count, highest_uid)
       VALUES (?, ?, ?, ?, ?, 0, 0, ?)`,
    )
    .run(id, accountId, providerId, name, role || null, highestUid)
  return id
}

/**
 * Returns the highest synced UID for a mailbox.
 * @param accountId - Account id.
 * @param providerId - IMAP mailbox name.
 * @returns UID, or 0.
 */
export function getFolderHighestUid(accountId: string, providerId: string): number {
  const row = getMailDatabase()
    .prepare('SELECT highest_uid FROM folders WHERE account_id = ? AND provider_id = ?')
    .get(accountId, providerId) as StoreRow | undefined
  return row ? asInteger(row.highest_uid) : 0
}

/**
 * Finds a folder id by role for an account.
 * @param accountId - Account id.
 * @param role - Folder role.
 * @returns Folder id, or null.
 */
export function findFolderIdByRole(accountId: string, role: QueryFolderRole): string | null {
  const row = getMailDatabase()
    .prepare('SELECT id FROM folders WHERE account_id = ? AND role = ? LIMIT 1')
    .get(accountId, role) as StoreRow | undefined
  return row ? asString(row.id) : null
}

/**
 * Finds a folder IMAP name by id.
 * @param folderId - Folder id.
 * @returns Provider mailbox name, or null.
 */
export function getFolderProviderId(folderId: string): string | null {
  const row = getMailDatabase()
    .prepare('SELECT provider_id FROM folders WHERE id = ?')
    .get(folderId) as StoreRow | undefined
  return row ? asString(row.provider_id) : null
}

/**
 * Refreshes folder unread/total counts from messages.
 * @param accountId - Account id.
 * @returns Nothing.
 */
export function refreshFolderCounts(accountId: string): void {
  const database = getMailDatabase()
  const folders = database
    .prepare('SELECT id FROM folders WHERE account_id = ?')
    .all(accountId) as StoreRow[]
  for (const folder of folders) {
    const id = asString(folder.id)
    const totals = database
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN is_read = 0 AND is_draft = 0 THEN 1 ELSE 0 END) AS unread
         FROM messages WHERE folder_id = ?`,
      )
      .get(id) as StoreRow
    database
      .prepare('UPDATE folders SET total_count = ?, unread_count = ? WHERE id = ?')
      .run(asInteger(totals.total), asInteger(totals.unread), id)
  }
}

/**
 * Resolves or creates a thread id for a message-id header.
 * @param accountId - Account id.
 * @param providerThreadId - Thread key (usually a Message-ID).
 * @returns Thread id.
 */
function ensureThread(accountId: string, providerThreadId: string): string {
  const database = getMailDatabase()
  const existing = database
    .prepare('SELECT id FROM threads WHERE account_id = ? AND provider_thread_id = ?')
    .get(accountId, providerThreadId) as StoreRow | undefined
  if (existing) {
    return asString(existing.id)
  }
  const id = randomUUID()
  database
    .prepare('INSERT INTO threads (id, account_id, provider_thread_id) VALUES (?, ?, ?)')
    .run(id, accountId, providerThreadId)
  return id
}

/** One IMAP header upsert. */
export interface UpsertImapMessageInput {
  accountId: string
  mailboxName: string
  mailboxRole: QueryFolderRole | ''
  uid: number
  flags: string[]
  subject: string
  fromAddress: string
  fromName: string
  toAddresses: MailAddress[]
  ccAddresses: MailAddress[]
  receivedAt: string | null
  messageIdHeader: string
  inReplyTo: string
}

/**
 * Inserts or updates one IMAP message header.
 * @param input - Normalized FETCH result.
 * @returns Message id.
 */
export function upsertImapMessage(input: UpsertImapMessageInput): string {
  const providerMessageId = `imap:${input.mailboxName}:${input.uid}`
  const labels = labelsForImapMessage(input.mailboxRole, input.flags)
  const lowerFlags = new Set(input.flags.map((flag) => flag.toLowerCase()))
  const isRead = lowerFlags.has('\\seen')
  const isStarred = lowerFlags.has('\\flagged')
  const isDraft = input.mailboxRole === 'drafts' || lowerFlags.has('\\draft')
  const isSent = input.mailboxRole === 'sent'
  const folderId = upsertFolder(
    input.accountId,
    input.mailboxName,
    input.mailboxName,
    input.mailboxRole,
    input.uid,
  )
  const threadKey = input.inReplyTo.trim() || input.messageIdHeader.trim() || providerMessageId
  const threadId = ensureThread(input.accountId, threadKey)
  const database = getMailDatabase()
  const existing = database
    .prepare('SELECT id FROM messages WHERE account_id = ? AND provider_message_id = ?')
    .get(input.accountId, providerMessageId) as StoreRow | undefined
  const now = nowIso()
  if (existing) {
    const id = asString(existing.id)
    database
      .prepare(
        `UPDATE messages SET
          folder_id = ?, thread_id = ?, subject = ?, from_address = ?, from_name = ?,
          to_addresses_json = ?, cc_addresses_json = ?, received_at = ?,
          is_read = ?, is_starred = ?, is_sent = ?, is_draft = ?,
          labels_json = ?, uid = ?, message_id_header = ?, in_reply_to = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        folderId,
        threadId,
        input.subject,
        input.fromAddress,
        input.fromName || null,
        JSON.stringify(input.toAddresses),
        JSON.stringify(input.ccAddresses),
        input.receivedAt,
        isRead ? 1 : 0,
        isStarred ? 1 : 0,
        isSent ? 1 : 0,
        isDraft ? 1 : 0,
        JSON.stringify(labels),
        input.uid,
        input.messageIdHeader || null,
        input.inReplyTo || null,
        now,
        id,
      )
    return id
  }
  const id = randomUUID()
  database
    .prepare(
      `INSERT INTO messages (
        id, account_id, thread_id, folder_id, provider_message_id, message_id_header, in_reply_to,
        uid, subject, from_address, from_name, to_addresses_json, cc_addresses_json, bcc_addresses_json,
        snippet, received_at, is_read, is_starred, is_sent, is_draft, has_attachments, labels_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', NULL, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    )
    .run(
      id,
      input.accountId,
      threadId,
      folderId,
      providerMessageId,
      input.messageIdHeader || null,
      input.inReplyTo || null,
      input.uid,
      input.subject,
      input.fromAddress,
      input.fromName || null,
      JSON.stringify(input.toAddresses),
      JSON.stringify(input.ccAddresses),
      input.receivedAt,
      isRead ? 1 : 0,
      isStarred ? 1 : 0,
      isSent ? 1 : 0,
      isDraft ? 1 : 0,
      JSON.stringify(labels),
      now,
      now,
    )
  return id
}

/**
 * Returns whether a message already has a cached body.
 * @param messageId - Message id.
 * @returns True when a body row exists.
 */
export function hasMessageBody(messageId: string): boolean {
  const row = getMailDatabase()
    .prepare('SELECT message_id FROM bodies WHERE message_id = ?')
    .get(messageId) as StoreRow | undefined
  return Boolean(row)
}

/** One decoded MIME attachment to persist on disk. */
export interface PersistAttachmentInput {
  filename: string
  contentType: string | null
  bytes: Buffer
}

/**
 * Stores a message body and attachment files on this machine.
 * @param userId - Auth user id.
 * @param messageId - Message id.
 * @param bodyHtml - HTML body.
 * @param bodyText - Plain text body.
 * @param attachments - Decoded parts.
 * @returns Nothing.
 */
export function persistMessageBody(
  userId: string,
  messageId: string,
  bodyHtml: string | null,
  bodyText: string | null,
  attachments: PersistAttachmentInput[],
): void {
  const html = bodyHtml && bodyHtml.length > MAX_BODY_CHARS ? bodyHtml.slice(0, MAX_BODY_CHARS) : bodyHtml
  const text = bodyText && bodyText.length > MAX_BODY_CHARS ? bodyText.slice(0, MAX_BODY_CHARS) : bodyText
  const snippet = (text || html || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 200)
  const database = getMailDatabase()
  database
    .prepare(
      `INSERT INTO bodies (message_id, body_html, body_text) VALUES (?, ?, ?)
       ON CONFLICT(message_id) DO UPDATE SET body_html = excluded.body_html, body_text = excluded.body_text`,
    )
    .run(messageId, html, text)
  database.prepare('DELETE FROM attachments WHERE message_id = ?').run(messageId)
  const dir = attachmentDir(userId, messageId)
  fs.rmSync(dir, { recursive: true, force: true })
  let stored = 0
  for (const part of attachments) {
    if (part.bytes.length > MAX_ATTACHMENT_BYTES) {
      continue
    }
    fs.mkdirSync(dir, { recursive: true })
    const id = randomUUID()
    const safeName = safeAttachmentFileName(part.filename)
    const filePath = path.join(dir, `${id}-${safeName}`)
    fs.writeFileSync(filePath, part.bytes)
    database
      .prepare(
        `INSERT INTO attachments (id, message_id, filename, content_type, size_bytes, file_path)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, messageId, safeName, part.contentType, part.bytes.length, filePath)
    stored += 1
  }
  database
    .prepare(
      'UPDATE messages SET snippet = ?, has_attachments = ?, updated_at = ? WHERE id = ?',
    )
    .run(snippet || null, stored > 0 ? 1 : 0, nowIso(), messageId)
}

/**
 * Lists messages for the active folder / label.
 * @param userId - Auth user id.
 * @param accountId - Mailbox id, or empty for unified inbox.
 * @param options - Filters.
 * @returns Page of messages.
 */
export function listMailMessages(
  userId: string,
  accountId: string,
  options: {
    folderId?: string
    label?: string
    q?: string
    page?: number
    threadId?: string
  } = {},
): MailMessagePage {
  const owner = requireMailUserId(userId)
  const accessible = listMailAccounts(owner).map((account) => account.id)
  if (accessible.length === 0) {
    return { items: [], page: 0, pageSize: PAGE_SIZE, total: 0, hasMore: false, unreadInboxCount: 0 }
  }
  const unified = accountId.trim() === '' || accountId.toLowerCase() === 'all'
  const accountIds = unified
    ? accessible
    : accessible.includes(accountId)
      ? [accountId]
      : []
  if (accountIds.length === 0) {
    throw new Error('Forbidden')
  }
  const page = Math.max(0, options.page ?? 0)
  const placeholders = accountIds.map(() => '?').join(',')
  const rows = getMailDatabase()
    .prepare(
      `SELECT * FROM messages WHERE account_id IN (${placeholders}) ORDER BY received_at DESC`,
    )
    .all(...accountIds) as StoreRow[]
  let mapped = rows.map(mapMessage).filter((row): row is MailMessage => row !== null)
  if (options.threadId) {
    mapped = mapped.filter((row) => row.threadId === options.threadId)
  } else if (options.folderId) {
    mapped = mapped.filter((row) => row.folderId === options.folderId)
  } else if (options.label) {
    const label = options.label.toUpperCase()
    mapped = mapped.filter((row) =>
      VIRTUAL_LABELS.has(label)
        ? messageMatchesVirtualLabel(row, label)
        : row.labels.includes(options.label ?? ''),
    )
  }
  const query = options.q?.trim().toLowerCase() ?? ''
  if (query && !options.threadId) {
    mapped = mapped.filter((row) => {
      const haystack = `${row.subject ?? ''} ${row.fromAddress} ${row.fromName ?? ''} ${row.snippet ?? ''}`.toLowerCase()
      if (query.startsWith('in:')) {
        const token = inTokenToLabel(query.slice(3))
        return messageMatchesVirtualLabel(row, token)
      }
      return haystack.includes(query)
    })
  }
  const total = mapped.length
  const start = page * PAGE_SIZE
  const items = mapped.slice(start, start + PAGE_SIZE)
  const unreadInboxCount = unified
    ? 0
    : mapped.filter((row) => messageMatchesVirtualLabel(row, 'UNREAD') && row.mailAccountId === accountId)
        .length
  return {
    items,
    page,
    pageSize: PAGE_SIZE,
    total,
    hasMore: start + PAGE_SIZE < total,
    unreadInboxCount,
  }
}

/**
 * Loads one message body and attachments.
 * @param userId - Auth user id.
 * @param messageId - Message id.
 * @returns Detail, or null when missing.
 */
export function getMailMessageRow(
  userId: string,
  messageId: string,
): { message: MailMessage; row: StoreRow } | null {
  const owner = requireMailUserId(userId)
  const row = getMailDatabase()
    .prepare(
      `SELECT m.* FROM messages m
       INNER JOIN accounts a ON a.id = m.account_id
       WHERE m.id = ? AND a.user_id = ?`,
    )
    .get(requireId(messageId, 'Mail message id'), owner) as StoreRow | undefined
  if (!row) {
    return null
  }
  const message = mapMessage(row)
  if (!message) {
    return null
  }
  return { message, row }
}

/**
 * Builds message detail from a stored row.
 * @param userId - Auth user id.
 * @param messageId - Message id.
 * @returns Detail.
 */
export function getMailMessageDetail(userId: string, messageId: string): MailMessageDetail {
  const loaded = getMailMessageRow(userId, messageId)
  if (!loaded) {
    throw new Error('Message not found')
  }
  const body = getMailDatabase()
    .prepare('SELECT body_html, body_text FROM bodies WHERE message_id = ?')
    .get(messageId) as StoreRow | undefined
  const attachmentRows = getMailDatabase()
    .prepare(
      'SELECT id, filename, content_type, size_bytes FROM attachments WHERE message_id = ? ORDER BY filename',
    )
    .all(messageId) as StoreRow[]
  return {
    ...loaded.message,
    ccAddresses: parseAddresses(loaded.row.cc_addresses_json),
    bccAddresses: parseAddresses(loaded.row.bcc_addresses_json),
    bodyHtml: body ? asString(body.body_html) || null : null,
    bodyText: body ? asString(body.body_text) || null : null,
    attachments: attachmentRows.map((row) => ({
      id: asString(row.id),
      filename: asString(row.filename) || 'attachment',
      contentType: asString(row.content_type) || null,
      sizeBytes: asInteger(row.size_bytes) || null,
    })),
  }
}

/**
 * Reads an attachment file from disk.
 * @param userId - Auth user id.
 * @param messageId - Message id.
 * @param attachmentId - Attachment id.
 * @returns Bytes, filename, and content type.
 */
export function readMailAttachment(
  userId: string,
  messageId: string,
  attachmentId: string,
): { bytes: Buffer; filename: string; contentType: string } {
  if (!getMailMessageRow(userId, messageId)) {
    throw new Error('Message not found')
  }
  const row = getMailDatabase()
    .prepare(
      'SELECT filename, content_type, file_path FROM attachments WHERE id = ? AND message_id = ?',
    )
    .get(requireId(attachmentId, 'Attachment id'), messageId) as StoreRow | undefined
  if (!row) {
    throw new Error('Attachment not found')
  }
  const filePath = asString(row.file_path)
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('Attachment file is missing on this machine')
  }
  return {
    bytes: fs.readFileSync(filePath),
    filename: asString(row.filename) || 'attachment',
    contentType: asString(row.content_type) || 'application/octet-stream',
  }
}

/**
 * Builds a simple .eml snapshot from the stored detail.
 * @param detail - Message detail.
 * @returns RFC 822 text.
 */
export function buildStoredEml(detail: MailMessageDetail): string {
  const to = detail.toAddresses.map((address) => address.email).join(', ')
  const cc = detail.ccAddresses.map((address) => address.email).join(', ')
  const lines = [
    `From: ${detail.fromName ? `${detail.fromName} <${detail.fromAddress}>` : detail.fromAddress}`,
    `To: ${to}`,
    cc ? `Cc: ${cc}` : '',
    `Subject: ${detail.subject ?? ''}`,
    `Date: ${detail.receivedAt ?? nowIso()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    detail.bodyText || detail.bodyHtml || '',
  ]
  return lines.filter((line, index) => line.length > 0 || index > 6).join('\r\n')
}

/**
 * Sidebar unread counts for one mailbox.
 * @param userId - Auth user id.
 * @param accountId - Account id.
 * @returns Count maps.
 */
export function fetchMailFolderCounts(
  userId: string,
  accountId: string,
): MailFolderCountsResponse {
  if (!getOwnedAccountRow(userId, accountId)) {
    throw new Error('Forbidden')
  }
  const rows = getMailDatabase()
    .prepare('SELECT * FROM messages WHERE account_id = ?')
    .all(accountId) as StoreRow[]
  const messages = rows.map(mapMessage).filter((row): row is MailMessage => row !== null)
  const labels = [
    'IMPORTANT',
    'INBOX',
    'DRAFT',
    'SENT',
    'ALL_MAIL',
    'SPAM',
    'TRASH',
    'ARCHIVE',
    'UNREAD',
    'STARRED',
    'SNOOZED',
    'ALI_IMPORTANT',
    'ALI_FOLLOWUP',
    'ALI_COMPLETED',
  ]
  const counts: Record<string, number> = {}
  for (const label of labels) {
    const n = messages.filter((row) => messageMatchesVirtualLabel(row, label)).length
    if (n > 0) {
      counts[label] = n
    }
  }
  const folderIdCounts: Record<string, number> = {}
  for (const row of messages) {
    if (!row.folderId || row.isRead || row.isDraft) {
      continue
    }
    folderIdCounts[row.folderId] = (folderIdCounts[row.folderId] ?? 0) + 1
  }
  return { counts, labelCounts: {}, folderIdCounts }
}

/**
 * Inbox unread count across accessible mailboxes.
 * @param userId - Auth user id.
 * @returns Total unread.
 */
export function fetchMailUnreadSummary(userId: string): number {
  const accounts = listMailAccounts(userId)
  let total = 0
  for (const account of accounts) {
    const counts = fetchMailFolderCounts(userId, account.id)
    total += counts.counts.UNREAD ?? 0
  }
  return total
}

/**
 * Updates local flags for one message.
 * @param messageId - Message id.
 * @param patch - Flag patch.
 * @returns Nothing.
 */
export function patchMessageFlags(
  messageId: string,
  patch: {
    isRead?: boolean
    isStarred?: boolean
    isDraft?: boolean
    isSent?: boolean
    labels?: string[]
    folderId?: string | null
  },
): void {
  const row = getMailDatabase()
    .prepare('SELECT * FROM messages WHERE id = ?')
    .get(messageId) as StoreRow | undefined
  if (!row) {
    throw new Error('Message not found')
  }
  const nextRead = patch.isRead ?? asBoolean(row.is_read)
  const nextStar = patch.isStarred ?? asBoolean(row.is_starred)
  const nextDraft = patch.isDraft ?? asBoolean(row.is_draft)
  const nextSent = patch.isSent ?? asBoolean(row.is_sent)
  const nextLabels = patch.labels ?? parseLabels(row.labels_json)
  const nextFolder = patch.folderId === undefined ? asString(row.folder_id) : patch.folderId
  getMailDatabase()
    .prepare(
      `UPDATE messages SET is_read = ?, is_starred = ?, is_draft = ?, is_sent = ?,
        labels_json = ?, folder_id = ?, updated_at = ? WHERE id = ?`,
    )
    .run(
      nextRead ? 1 : 0,
      nextStar ? 1 : 0,
      nextDraft ? 1 : 0,
      nextSent ? 1 : 0,
      JSON.stringify(nextLabels),
      nextFolder,
      nowIso(),
      messageId,
    )
}

/**
 * Loads owned messages by id.
 * @param userId - Auth user id.
 * @param messageIds - Message ids.
 * @returns Rows.
 */
export function listOwnedMessageRows(userId: string, messageIds: string[]): StoreRow[] {
  if (messageIds.length === 0) {
    return []
  }
  const owner = requireMailUserId(userId)
  return getMailDatabase()
    .prepare(
      `SELECT m.* FROM messages m
       INNER JOIN accounts a ON a.id = m.account_id
       WHERE a.user_id = ? AND m.id IN (${messageIds.map(() => '?').join(',')})`,
    )
    .all(owner, ...messageIds) as StoreRow[]
}

/**
 * Returns IMAP coordinates for mirroring a flag change.
 * @param row - Message row.
 * @returns Mailbox name and UID.
 */
export function imapRefFromRow(row: StoreRow): { mailbox: string; uid: number } | null {
  const providerId = asString(row.provider_message_id)
  const match = /^imap:(.+):(\d+)$/.exec(providerId)
  if (!match) {
    return null
  }
  return { mailbox: match[1], uid: Number(match[2]) }
}

/**
 * Applies a bulk label mutation locally.
 * @param row - Message row.
 * @param action - Bulk action.
 * @param extra - Optional label or snooze time.
 * @returns Next labels and flags.
 */
export function bulkPatchForAction(
  row: StoreRow,
  action: string,
  extra: { label?: string; snoozeUntil?: string } = {},
): {
  labels: string[]
  isRead?: boolean
  isStarred?: boolean
  deleteRow?: boolean
} {
  const labels = parseLabels(row.labels_json)
  switch (action) {
    case 'read':
      return { labels, isRead: true }
    case 'unread':
      return { labels, isRead: false }
    case 'star':
      return { labels: toggleLabels(labels, ['STARRED'], []), isStarred: true }
    case 'unstar':
      return { labels: toggleLabels(labels, [], ['STARRED']), isStarred: false }
    case 'trash':
      return { labels: toggleLabels(labels, ['TRASH'], ['INBOX', 'SPAM', 'ARCHIVE', 'SNOOZED']) }
    case 'untrash':
      return { labels: toggleLabels(labels, ['INBOX'], ['TRASH', 'SPAM', 'ARCHIVE']) }
    case 'delete_forever':
      return { labels, deleteRow: true }
    case 'archive':
      return { labels: toggleLabels(labels, ['ARCHIVE'], ['INBOX', 'TRASH', 'SPAM', 'SNOOZED']) }
    case 'unarchive':
      return { labels: toggleLabels(labels, ['INBOX'], ['ARCHIVE', 'TRASH', 'SPAM']) }
    case 'spam':
      return { labels: toggleLabels(labels, ['SPAM'], ['INBOX', 'TRASH', 'ARCHIVE', 'SNOOZED']) }
    case 'unspam':
      return { labels: toggleLabels(labels, ['INBOX'], ['SPAM', 'TRASH', 'ARCHIVE']) }
    case 'snooze':
      if (extra.snoozeUntil) {
        getMailDatabase()
          .prepare(
            `INSERT INTO snoozes (message_id, account_id, snoozed_until) VALUES (?, ?, ?)
             ON CONFLICT(message_id) DO UPDATE SET snoozed_until = excluded.snoozed_until`,
          )
          .run(asString(row.id), asString(row.account_id), extra.snoozeUntil)
      }
      return { labels: toggleLabels(labels, ['SNOOZED'], ['INBOX', 'ARCHIVE']) }
    case 'unsnooze':
      getMailDatabase().prepare('DELETE FROM snoozes WHERE message_id = ?').run(asString(row.id))
      return { labels: toggleLabels(labels, ['INBOX'], ['SNOOZED', 'ARCHIVE']) }
    case 'apply_label':
      return extra.label ? { labels: toggleLabels(labels, [extra.label], []) } : { labels }
    case 'remove_label':
      return extra.label ? { labels: toggleLabels(labels, [], [extra.label]) } : { labels }
    default:
      return { labels }
  }
}

/**
 * Deletes a message and its attachment files.
 * @param userId - Auth user id.
 * @param messageId - Message id.
 * @returns Nothing.
 */
export function deleteMessageAndFiles(userId: string, messageId: string): void {
  const dir = attachmentDir(userId, messageId)
  fs.rmSync(dir, { recursive: true, force: true })
  getMailDatabase().prepare('DELETE FROM messages WHERE id = ?').run(messageId)
}

/**
 * Empties trash or spam for an account.
 * @param userId - Auth user id.
 * @param accountId - Account id.
 * @param role - Folder role.
 * @returns Deleted count.
 */
export function emptyMailFolder(
  userId: string,
  accountId: string,
  role: 'trash' | 'spam',
): { updated: number } {
  if (!getOwnedAccountRow(userId, accountId)) {
    throw new Error('Forbidden')
  }
  const label = role === 'trash' ? 'TRASH' : 'SPAM'
  const rows = getMailDatabase()
    .prepare('SELECT * FROM messages WHERE account_id = ?')
    .all(accountId) as StoreRow[]
  let updated = 0
  for (const row of rows) {
    const message = mapMessage(row)
    if (!message || !messageMatchesVirtualLabel(message, label)) {
      continue
    }
    deleteMessageAndFiles(userId, message.id)
    updated += 1
  }
  refreshFolderCounts(accountId)
  return { updated }
}

/**
 * Inserts a local draft message.
 * @param userId - Auth user id.
 * @param accountId - Account id.
 * @param fields - Draft fields.
 * @returns Draft id.
 */
export function insertDraft(
  userId: string,
  accountId: string,
  fields: {
    fromAddress: string
    to: MailAddress[]
    cc: MailAddress[]
    bcc: MailAddress[]
    subject: string
    bodyHtml: string
    bodyText: string
  },
): string {
  if (!getOwnedAccountRow(userId, accountId)) {
    throw new Error('Account not found or access denied')
  }
  const folderId = findFolderIdByRole(accountId, 'drafts')
  const now = nowIso()
  const id = randomUUID()
  const snippet = (fields.bodyText || fields.bodyHtml.replace(/<[^>]+>/g, ' ')).trim().slice(0, 200)
  getMailDatabase()
    .prepare(
      `INSERT INTO messages (
        id, account_id, thread_id, folder_id, provider_message_id, subject, from_address, from_name,
        to_addresses_json, cc_addresses_json, bcc_addresses_json, snippet, received_at,
        is_read, is_starred, is_sent, is_draft, has_attachments, labels_json, created_at, updated_at
      ) VALUES (?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 1, 0, 0, 1, 0, ?, ?, ?)`,
    )
    .run(
      id,
      accountId,
      folderId,
      `draft:local:${id}`,
      fields.subject,
      fields.fromAddress,
      JSON.stringify(fields.to),
      JSON.stringify(fields.cc),
      JSON.stringify(fields.bcc),
      snippet || null,
      now,
      JSON.stringify(['DRAFT']),
      now,
      now,
    )
  persistMessageBody(userId, id, fields.bodyHtml || null, fields.bodyText || null, [])
  return id
}

/**
 * Updates an existing draft.
 * @param userId - Auth user id.
 * @param draftId - Draft id.
 * @param fields - Draft fields.
 * @returns Nothing.
 */
export function updateDraft(
  userId: string,
  draftId: string,
  fields: {
    fromAddress?: string
    to?: MailAddress[]
    cc?: MailAddress[]
    bcc?: MailAddress[]
    subject?: string
    bodyHtml?: string
    bodyText?: string
  },
): void {
  const loaded = getMailMessageRow(userId, draftId)
  if (!loaded || !loaded.message.isDraft) {
    throw new Error('Draft not found')
  }
  const subject = fields.subject ?? loaded.message.subject ?? ''
  const fromAddress = fields.fromAddress ?? loaded.message.fromAddress
  const to = fields.to ?? loaded.message.toAddresses
  const cc = fields.cc ?? parseAddresses(loaded.row.cc_addresses_json)
  const bcc = fields.bcc ?? parseAddresses(loaded.row.bcc_addresses_json)
  const snippet = (fields.bodyText || fields.bodyHtml || loaded.message.snippet || '')
    .replace(/<[^>]+>/g, ' ')
    .trim()
    .slice(0, 200)
  getMailDatabase()
    .prepare(
      `UPDATE messages SET subject = ?, from_address = ?, to_addresses_json = ?,
        cc_addresses_json = ?, bcc_addresses_json = ?, snippet = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      subject,
      fromAddress,
      JSON.stringify(to),
      JSON.stringify(cc),
      JSON.stringify(bcc),
      snippet || null,
      nowIso(),
      draftId,
    )
  if (fields.bodyHtml !== undefined || fields.bodyText !== undefined) {
    persistMessageBody(
      userId,
      draftId,
      fields.bodyHtml ?? null,
      fields.bodyText ?? null,
      [],
    )
  }
}

/**
 * Deletes a draft.
 * @param userId - Auth user id.
 * @param draftId - Draft id.
 * @returns Nothing.
 */
export function deleteDraft(userId: string, draftId: string): void {
  const loaded = getMailMessageRow(userId, draftId)
  if (!loaded || !loaded.message.isDraft) {
    throw new Error('Draft not found')
  }
  deleteMessageAndFiles(userId, draftId)
}

/**
 * Inserts a sent-copy after SMTP succeeds.
 * @param userId - Auth user id.
 * @param accountId - Account id.
 * @param fields - Sent message fields.
 * @returns Message id.
 */
export function insertSentCopy(
  userId: string,
  accountId: string,
  fields: {
    fromAddress: string
    to: MailAddress[]
    cc: MailAddress[]
    bcc: MailAddress[]
    subject: string
    bodyHtml: string
    bodyText: string
    attachments: PersistAttachmentInput[]
  },
): string {
  const folderId = findFolderIdByRole(accountId, 'sent')
  const now = nowIso()
  const id = randomUUID()
  const snippet = (fields.bodyText || fields.bodyHtml.replace(/<[^>]+>/g, ' ')).trim().slice(0, 200)
  getMailDatabase()
    .prepare(
      `INSERT INTO messages (
        id, account_id, thread_id, folder_id, provider_message_id, subject, from_address, from_name,
        to_addresses_json, cc_addresses_json, bcc_addresses_json, snippet, received_at,
        is_read, is_starred, is_sent, is_draft, has_attachments, labels_json, created_at, updated_at
      ) VALUES (?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 1, 0, 1, 0, ?, ?, ?, ?)`,
    )
    .run(
      id,
      accountId,
      folderId,
      `sent:local:${id}`,
      fields.subject,
      fields.fromAddress,
      JSON.stringify(fields.to),
      JSON.stringify(fields.cc),
      JSON.stringify(fields.bcc),
      snippet || null,
      now,
      fields.attachments.length > 0 ? 1 : 0,
      JSON.stringify(['SENT']),
      now,
      now,
    )
  persistMessageBody(userId, id, fields.bodyHtml || null, fields.bodyText || null, fields.attachments)
  return id
}

/**
 * Marks last sync time and optional error on an account.
 * @param accountId - Account id.
 * @param status - Account status.
 * @param errorMessage - Optional error.
 * @returns Nothing.
 */
export function markAccountSync(
  accountId: string,
  status: MailAccountStatus,
  errorMessage: string | null,
): void {
  getMailDatabase()
    .prepare(
      `UPDATE accounts SET last_sync_at = ?, status = ?, error_message = ?, updated_at = ? WHERE id = ?`,
    )
    .run(nowIso(), status, errorMessage, nowIso(), accountId)
}

/**
 * Disconnects a mailbox (keeps the row, clears the password).
 * @param userId - Auth user id.
 * @param accountId - Account id.
 * @returns Nothing.
 */
export function disconnectMailAccount(userId: string, accountId: string): void {
  const row = getOwnedAccountRow(userId, accountId)
  if (!row) {
    throw new Error('Account not found or access denied')
  }
  getMailDatabase()
    .prepare(
      `UPDATE accounts SET status = 'disconnected', password_enc = '', password_sealed = 0,
        error_message = NULL, updated_at = ? WHERE id = ?`,
    )
    .run(nowIso(), accountId)
}

/**
 * Permanently deletes a mailbox and its files.
 * @param userId - Auth user id.
 * @param accountId - Account id.
 * @returns Nothing.
 */
export function deleteMailAccount(userId: string, accountId: string): void {
  const row = getOwnedAccountRow(userId, accountId)
  if (!row) {
    throw new Error('Account not found or access denied')
  }
  const owner = requireMailUserId(userId)
  const messageRows = getMailDatabase()
    .prepare('SELECT id FROM messages WHERE account_id = ?')
    .all(accountId) as StoreRow[]
  for (const message of messageRows) {
    fs.rmSync(attachmentDir(owner, asString(message.id)), { recursive: true, force: true })
  }
  getMailDatabase().prepare('DELETE FROM accounts WHERE id = ?').run(accountId)
}

/**
 * Renames an IMAP mailbox display name.
 * @param userId - Auth user id.
 * @param accountId - Account id.
 * @param displayName - New name, or null to clear.
 * @returns Nothing.
 */
export function updateMailAccount(
  userId: string,
  accountId: string,
  displayName: string | null,
): void {
  if (!getOwnedAccountRow(userId, accountId)) {
    throw new Error('Account not found or access denied')
  }
  getMailDatabase()
    .prepare('UPDATE accounts SET display_name = ?, updated_at = ? WHERE id = ?')
    .run(displayName?.trim() || null, nowIso(), accountId)
}

/**
 * Creates a sync job row.
 * @param userId - Auth user id.
 * @param accountId - Account id.
 * @param kind - Incremental or historical.
 * @returns Job id.
 */
export function createSyncJob(
  userId: string,
  accountId: string,
  kind: 'incremental' | 'historical',
): string {
  const id = randomUUID()
  const now = nowIso()
  getMailDatabase()
    .prepare(
      `INSERT INTO sync_jobs (
        id, account_id, user_id, kind, status, progress, total_estimated, messages_synced,
        error_message, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'running', 0, NULL, 0, NULL, ?, ?)`,
    )
    .run(id, accountId, requireMailUserId(userId), kind, now, now)
  return id
}

/**
 * Updates a sync job snapshot.
 * @param jobId - Job id.
 * @param patch - Status fields.
 * @returns Nothing.
 */
export function updateSyncJob(
  jobId: string,
  patch: {
    status?: MailSyncJobStatus['status']
    progress?: number
    totalEstimated?: number | null
    messagesSynced?: number
    errorMessage?: string | null
  },
): void {
  const row = getMailDatabase()
    .prepare('SELECT * FROM sync_jobs WHERE id = ?')
    .get(jobId) as StoreRow | undefined
  if (!row) {
    return
  }
  getMailDatabase()
    .prepare(
      `UPDATE sync_jobs SET status = ?, progress = ?, total_estimated = ?, messages_synced = ?,
        error_message = ?, updated_at = ? WHERE id = ?`,
    )
    .run(
      patch.status ?? asString(row.status),
      patch.progress ?? asInteger(row.progress),
      patch.totalEstimated === undefined ? row.total_estimated : patch.totalEstimated,
      patch.messagesSynced ?? asInteger(row.messages_synced),
      patch.errorMessage === undefined ? row.error_message : patch.errorMessage,
      nowIso(),
      jobId,
    )
}

/**
 * Reads a sync job snapshot.
 * @param userId - Auth user id.
 * @param jobId - Job id.
 * @returns Status.
 */
export function fetchMailSyncJob(userId: string, jobId: string): MailSyncJobStatus {
  const row = getMailDatabase()
    .prepare('SELECT * FROM sync_jobs WHERE id = ? AND user_id = ?')
    .get(requireId(jobId, 'Sync job id'), requireMailUserId(userId)) as StoreRow | undefined
  if (!row) {
    throw new Error('Sync job not found')
  }
  const kind = asString(row.kind)
  const status = asString(row.status) as MailSyncJobStatus['status']
  return {
    jobId: asString(row.id),
    accountId: asString(row.account_id),
    kind: kind === 'historical' ? 'historical' : 'incremental',
    status: status || 'running',
    progress: asInteger(row.progress),
    totalEstimated: row.total_estimated === null ? null : asInteger(row.total_estimated),
    messagesSynced: asInteger(row.messages_synced),
    errorMessage: asString(row.error_message) || null,
  }
}

/**
 * Lists pending / failed remote sync tasks (Outbox). Local IMAP mirrors finish
 * inline, so this is usually empty.
 * @param userId - Auth user id.
 * @param options - Optional account filter.
 * @returns Task page.
 */
export function listMailSyncTasks(
  userId: string,
  options?: { accountId?: string | null; status?: string; limit?: number },
): MailSyncTaskPage {
  const owner = requireMailUserId(userId)
  const accounts = listMailAccounts(owner).map((account) => account.id)
  const accountId = options?.accountId
  const scoped = accountId && accounts.includes(accountId) ? [accountId] : accounts
  if (scoped.length === 0) {
    return { items: [], total: 0 }
  }
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200)
  const rows = getMailDatabase()
    .prepare(
      `SELECT * FROM sync_tasks WHERE account_id IN (${scoped.map(() => '?').join(',')})
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(...scoped, limit) as StoreRow[]
  const items: MailSyncTask[] = rows.map((row) => ({
    id: asString(row.id),
    mailAccountId: asString(row.account_id),
    kind: asString(row.kind),
    status: asString(row.status) as MailSyncTask['status'],
    attempts: asInteger(row.attempts),
    errorMessage: asString(row.error_message) || null,
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    messageCount: 0,
    label: null,
    sendJobId: null,
  }))
  return { items, total: items.length }
}

/**
 * Returns a running incremental job for an account, if any.
 * @param userId - Auth user id.
 * @param accountId - Account id.
 * @returns Job id, or null.
 */
export function findRunningSyncJob(userId: string, accountId: string): string | null {
  const row = getMailDatabase()
    .prepare(
      `SELECT id FROM sync_jobs
       WHERE user_id = ? AND account_id = ? AND status IN ('pending', 'running')
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(requireMailUserId(userId), accountId) as StoreRow | undefined
  return row ? asString(row.id) : null
}
