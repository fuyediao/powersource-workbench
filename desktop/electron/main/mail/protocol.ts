/**
 * IMAP sync and SMTP send for mailboxes stored on this PC.
 */

import { ImapFlow } from 'imapflow'
import { simpleParser, type ParsedMail } from 'mailparser'
import nodemailer from 'nodemailer'
import type { MailAddress, MailImapSmtpConfig, MailSendAttachment } from '../../shared/mail-types'
import {
  hasMessageBody,
  persistMessageBody,
  type PersistAttachmentInput,
  type StoredMailAccountConfig,
  type UpsertImapMessageInput,
  upsertImapMessage,
  getFolderHighestUid,
  refreshFolderCounts,
} from './store'
import { resolveMailboxRole, type MailFolderRole } from './query'

const SYNC_FETCH_LIMIT = 500
const BODY_PREFETCH_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000
const BODY_PREFETCH_LIMIT = 40
const IMAP_TIMEOUT_MS = 20_000

/** One listed IMAP mailbox with a sidebar role. */
interface ListedMailbox {
  name: string
  role: MailFolderRole
}

/**
 * Maps an envelope address list to MailAddress rows.
 * @param list - IMAP envelope addresses.
 * @returns Address list.
 */
function mapEnvelopeAddresses(
  list: Array<{ address?: string | null; name?: string | null }> | undefined,
): MailAddress[] {
  if (!list) {
    return []
  }
  return list.flatMap((entry) => {
    const email = typeof entry.address === 'string' ? entry.address.trim() : ''
    if (!email) {
      return []
    }
    const address: MailAddress = { email }
    if (typeof entry.name === 'string' && entry.name.trim()) {
      address.name = entry.name.trim()
    }
    return [address]
  })
}

/**
 * Turns an IMAP INTERNALDATE into an ISO-8601 string.
 * @param value - Date object or RFC 3501 date string.
 * @returns ISO timestamp, or null.
 */
function isoFromInternalDate(value: Date | string | undefined): string | null {
  if (!value) {
    return null
  }
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null
  }
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : value
}

/**
 * Opens an IMAP session for one config.
 * @param config - Host and credentials.
 * @returns Connected client.
 */
async function connectImap(config: MailImapSmtpConfig): Promise<ImapFlow> {
  const client = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: config.imapSsl,
    auth: { user: config.username, pass: config.password },
    logger: false,
    connectionTimeout: IMAP_TIMEOUT_MS,
    greetingTimeout: IMAP_TIMEOUT_MS,
    socketTimeout: IMAP_TIMEOUT_MS,
  })
  await client.connect()
  return client
}

/**
 * Tests IMAP login.
 * @param config - Host and credentials.
 * @returns Whether the greeting and LOGIN succeeded.
 */
export async function testImapConnection(
  config: MailImapSmtpConfig,
): Promise<{ ok: boolean; error?: string | null }> {
  try {
    const client = await connectImap(config)
    await client.logout()
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'IMAP connection failed',
    }
  }
}

/**
 * Lists role-mapped mailboxes (inbox, sent, drafts, trash, spam, archive).
 * @param client - Connected IMAP client.
 * @returns Mailboxes the sidebar can show.
 */
async function listRoleMailboxes(client: ImapFlow): Promise<ListedMailbox[]> {
  const listed = await client.list()
  const seen = new Set<MailFolderRole>()
  const out: ListedMailbox[] = []
  for (const mailbox of listed) {
    const attributes: string[] = []
    if (typeof mailbox.specialUse === 'string' && mailbox.specialUse) {
      attributes.push(mailbox.specialUse)
    }
    if (mailbox.flags) {
      attributes.push(...[...mailbox.flags].map(String))
    }
    const role = resolveMailboxRole(attributes, mailbox.path)
    if (!role || role === 'custom' || seen.has(role)) {
      continue
    }
    seen.add(role)
    out.push({ name: mailbox.path, role })
  }
  if (!seen.has('inbox')) {
    out.unshift({ name: 'INBOX', role: 'inbox' })
  }
  return out
}

/**
 * Downloads and parses one MIME body.
 * @param client - Connected IMAP client.
 * @param uid - Message UID.
 * @returns Parsed mail, or null.
 */
async function parseUidBody(client: ImapFlow, uid: number): Promise<ParsedMail | null> {
  const downloaded = await client.download(String(uid), undefined, { uid: true })
  if (!downloaded?.content) {
    return null
  }
  return simpleParser(downloaded.content)
}

/**
 * Turns parsed attachments into local file payloads.
 * @param parsed - mailparser result.
 * @returns Attachment bytes.
 */
function parsedAttachments(parsed: ParsedMail): PersistAttachmentInput[] {
  const out: PersistAttachmentInput[] = []
  for (const part of parsed.attachments ?? []) {
    if (!part.content || part.content.length === 0) {
      continue
    }
    out.push({
      filename: part.filename || 'attachment',
      contentType: part.contentType || null,
      bytes: Buffer.isBuffer(part.content) ? part.content : Buffer.from(part.content),
    })
  }
  return out
}

/**
 * Syncs headers (and recent bodies) for one IMAP mailbox into local SQLite.
 * @param account - Stored account including password.
 * @param kind - Incremental (new UIDs) or historical (full search).
 * @param onProgress - Optional progress callback.
 * @returns Messages upserted.
 */
export async function syncImapAccount(
  account: StoredMailAccountConfig,
  kind: 'incremental' | 'historical',
  onProgress?: (synced: number, total: number) => void,
): Promise<number> {
  const client = await connectImap(account)
  let synced = 0
  const prefetch: Array<{ messageId: string; mailbox: string; uid: number; receivedAt: string | null }> =
    []
  try {
    const boxes = await listRoleMailboxes(client)
    for (const box of boxes) {
      const lock = await client.getMailboxLock(box.name)
      try {
        const highest = kind === 'historical' ? 0 : getFolderHighestUid(account.accountId, box.name)
        const range = highest > 0 ? `${highest + 1}:*` : '1:*'
        const uids = await client.search({ uid: range }, { uid: true })
        const limited = (uids || []).slice(-SYNC_FETCH_LIMIT)
        if (limited.length === 0) {
          continue
        }
        for await (const msg of client.fetch(
          limited,
          { uid: true, envelope: true, flags: true, internalDate: true },
          { uid: true },
        )) {
          const envelope = msg.envelope
          const from = mapEnvelopeAddresses(envelope?.from)
          const input: UpsertImapMessageInput = {
            accountId: account.accountId,
            mailboxName: box.name,
            mailboxRole: box.role,
            uid: msg.uid,
            flags: [...(msg.flags ?? [])].map(String),
            subject: envelope?.subject ?? '',
            fromAddress: from[0]?.email ?? '',
            fromName: from[0]?.name ?? '',
            toAddresses: mapEnvelopeAddresses(envelope?.to),
            ccAddresses: mapEnvelopeAddresses(envelope?.cc),
            receivedAt: isoFromInternalDate(msg.internalDate),
            messageIdHeader: envelope?.messageId ?? '',
            inReplyTo: envelope?.inReplyTo ?? '',
          }
          const messageId = upsertImapMessage(input)
          synced += 1
          const receivedMs = input.receivedAt ? Date.parse(input.receivedAt) : 0
          const recent =
            Number.isFinite(receivedMs) && Date.now() - receivedMs <= BODY_PREFETCH_MAX_AGE_MS
          if (recent && prefetch.length < BODY_PREFETCH_LIMIT && !hasMessageBody(messageId)) {
            prefetch.push({
              messageId,
              mailbox: box.name,
              uid: msg.uid,
              receivedAt: input.receivedAt,
            })
          }
          if (onProgress && synced % 20 === 0) {
            onProgress(synced, limited.length)
          }
        }
      } finally {
        lock.release()
      }
    }
    for (const item of prefetch) {
      const lock = await client.getMailboxLock(item.mailbox)
      try {
        const parsed = await parseUidBody(client, item.uid)
        if (!parsed) {
          continue
        }
        persistMessageBody(
          account.userId,
          item.messageId,
          typeof parsed.html === 'string' ? parsed.html : null,
          typeof parsed.text === 'string' ? parsed.text : null,
          parsedAttachments(parsed),
        )
      } finally {
        lock.release()
      }
    }
    refreshFolderCounts(account.accountId)
    if (onProgress) {
      onProgress(synced, synced)
    }
    return synced
  } finally {
    try {
      await client.logout()
    } catch {
      client.close()
    }
  }
}

/**
 * Fetches a missing body for one stored IMAP message.
 * @param account - Stored account.
 * @param messageId - Local message id.
 * @param mailbox - IMAP mailbox name.
 * @param uid - Message UID.
 * @returns Nothing.
 */
export async function hydrateImapBody(
  account: StoredMailAccountConfig,
  messageId: string,
  mailbox: string,
  uid: number,
): Promise<void> {
  if (hasMessageBody(messageId)) {
    return
  }
  const client = await connectImap(account)
  try {
    const lock = await client.getMailboxLock(mailbox)
    try {
      const parsed = await parseUidBody(client, uid)
      if (!parsed) {
        return
      }
      persistMessageBody(
        account.userId,
        messageId,
        typeof parsed.html === 'string' ? parsed.html : null,
        typeof parsed.text === 'string' ? parsed.text : null,
        parsedAttachments(parsed),
      )
    } finally {
      lock.release()
    }
  } finally {
    try {
      await client.logout()
    } catch {
      client.close()
    }
  }
}

/**
 * Adds or removes IMAP flags for one UID.
 * @param account - Stored account.
 * @param mailbox - IMAP mailbox name.
 * @param uid - Message UID.
 * @param add - Flags to add.
 * @param remove - Flags to remove.
 * @returns Nothing.
 */
export async function storeImapFlags(
  account: StoredMailAccountConfig,
  mailbox: string,
  uid: number,
  add: string[],
  remove: string[],
): Promise<void> {
  const client = await connectImap(account)
  try {
    const lock = await client.getMailboxLock(mailbox)
    try {
      if (add.length > 0) {
        await client.messageFlagsAdd(String(uid), add, { uid: true })
      }
      if (remove.length > 0) {
        await client.messageFlagsRemove(String(uid), remove, { uid: true })
      }
    } finally {
      lock.release()
    }
  } finally {
    try {
      await client.logout()
    } catch {
      client.close()
    }
  }
}

/**
 * Moves one UID into another mailbox when the server supports it.
 * @param account - Stored account.
 * @param fromMailbox - Source mailbox.
 * @param uid - Message UID.
 * @param toMailbox - Destination mailbox.
 * @returns Nothing.
 */
export async function moveImapMessage(
  account: StoredMailAccountConfig,
  fromMailbox: string,
  uid: number,
  toMailbox: string,
): Promise<void> {
  const client = await connectImap(account)
  try {
    const lock = await client.getMailboxLock(fromMailbox)
    try {
      await client.messageMove(String(uid), toMailbox, { uid: true })
    } finally {
      lock.release()
    }
  } finally {
    try {
      await client.logout()
    } catch {
      client.close()
    }
  }
}

/**
 * Decodes base64 send attachments.
 * @param attachments - Composer attachments.
 * @returns Nodemailer attachment objects.
 */
function decodeSendAttachments(
  attachments: MailSendAttachment[] | undefined,
): PersistAttachmentInput[] {
  if (!attachments || attachments.length === 0) {
    return []
  }
  if (attachments.length > 10) {
    throw new Error('Too many attachments')
  }
  return attachments.map((part) => {
    const bytes = Buffer.from(part.dataBase64, 'base64')
    if (bytes.length > 25 * 1024 * 1024) {
      throw new Error('Attachment is too large')
    }
    return {
      filename: part.filename || 'attachment',
      contentType: part.contentType || 'application/octet-stream',
      bytes,
    }
  })
}

/**
 * Sends one message through SMTP.
 * @param account - Stored account.
 * @param options - Recipients and body.
 * @returns Decoded attachments (for the local sent copy).
 */
export async function sendSmtpMessage(
  account: StoredMailAccountConfig,
  options: {
    fromAddress: string
    replyTo?: string
    to: MailAddress[]
    cc?: MailAddress[]
    bcc?: MailAddress[]
    subject: string
    bodyHtml?: string
    bodyText?: string
    inReplyTo?: string
    attachments?: MailSendAttachment[]
  },
): Promise<PersistAttachmentInput[]> {
  const files = decodeSendAttachments(options.attachments)
  const transport = nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpSsl,
    auth: { user: account.username, pass: account.password },
  })
  const toList = options.to.map((address) => address.email).filter(Boolean)
  if (toList.length === 0) {
    throw new Error('Missing required send fields')
  }
  await transport.sendMail({
    from: options.fromAddress || account.email,
    to: toList.join(', '),
    cc: (options.cc ?? []).map((address) => address.email).filter(Boolean).join(', ') || undefined,
    bcc: (options.bcc ?? []).map((address) => address.email).filter(Boolean).join(', ') || undefined,
    replyTo: options.replyTo || undefined,
    subject: options.subject,
    text: options.bodyText || undefined,
    html: options.bodyHtml || undefined,
    inReplyTo: options.inReplyTo || undefined,
    attachments: files.map((file) => ({
      filename: file.filename,
      contentType: file.contentType || undefined,
      content: file.bytes,
    })),
  })
  return files
}

/**
 * AliMail IMAP/SMTP host preset.
 * @returns Preset map keyed by provider id.
 */
export function providerPresets(): Record<string, {
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
  smtpSsl: boolean
}> {
  return {
    alibaba: {
      imapHost: 'imap.qiye.aliyun.com',
      imapPort: 993,
      smtpHost: 'smtp.qiye.aliyun.com',
      smtpPort: 465,
      smtpSsl: true,
    },
  }
}
