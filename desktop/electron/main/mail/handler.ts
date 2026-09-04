/**
 * Local mail IPC: SQLite + IMAP/SMTP on this PC.
 */

import type { SQLOutputValue } from 'node:sqlite'
import type {
  MailAccountTestResult,
  MailAddress,
  MailBinaryDto,
  MailBulkAction,
  MailDraftRequest,
  MailImapSmtpConfig,
  MailProvider,
  MailSendAttachment,
  MailSendRequest,
} from '../../shared/mail-types'
import {
  createSyncJob,
  deleteDraft,
  deleteMailAccount,
  deleteMessageAndFiles,
  disconnectMailAccount,
  emptyMailFolder,
  fetchMailFolderCounts,
  fetchMailSyncJob,
  fetchMailUnreadSummary,
  findFolderIdByRole,
  findRunningSyncJob,
  getMailMessageDetail,
  getMailMessageRow,
  getOwnedAccountRow,
  imapRefFromRow,
  insertDraft,
  insertImapAccount,
  insertSentCopy,
  listMailAccounts,
  listMailFolders,
  listMailMessages,
  listMailSyncTasks,
  listOwnedMessageRows,
  loadAccountConfig,
  markAccountSync,
  patchMessageFlags,
  readMailAttachment,
  buildStoredEml,
  refreshFolderCounts,
  updateDraft,
  updateMailAccount,
  updateSyncJob,
  bulkPatchForAction,
} from './store'
import {
  hydrateImapBody,
  moveImapMessage,
  providerPresets,
  sendSmtpMessage,
  storeImapFlags,
  syncImapAccount,
  testImapConnection,
} from './protocol'

const runningAccountSync = new Set<string>()

/**
 * Reads a JSON object received over IPC.
 * @param value - Candidate object.
 * @param label - Field label.
 * @returns Record.
 */
function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is required.`)
  }
  return value as Record<string, unknown>
}

/**
 * Reads a string field from an IPC object.
 * @param record - Object.
 * @param key - Field name.
 * @param fallback - Default.
 * @returns String.
 */
function stringField(record: Record<string, unknown>, key: string, fallback = ''): string {
  const value = record[key]
  return typeof value === 'string' ? value : fallback
}

/**
 * Parses address objects from a Harness tool argument.
 * @param value - Raw `to` / `cc` / `bcc` value.
 * @returns Address list.
 */
function parseHarnessAddresses(value: unknown): MailAddress[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return []
    }
    const record = entry as Record<string, unknown>
    const email = typeof record.email === 'string' ? record.email.trim() : ''
    if (!email) {
      return []
    }
    const address: MailAddress = { email }
    if (typeof record.name === 'string' && record.name.trim()) {
      address.name = record.name.trim()
    }
    return [address]
  })
}

/**
 * Parses expanded Harness attachments (base64 payloads).
 * @param value - Raw attachments array.
 * @returns Attachment list, or undefined when empty.
 */
function parseHarnessAttachments(value: unknown): MailSendAttachment[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const out: MailSendAttachment[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue
    }
    const record = entry as Record<string, unknown>
    if (typeof record.dataBase64 !== 'string' || !record.dataBase64) {
      continue
    }
    out.push({
      filename: typeof record.filename === 'string' && record.filename.trim() ? record.filename : 'attachment',
      contentType:
        typeof record.contentType === 'string' && record.contentType.trim()
          ? record.contentType
          : 'application/octet-stream',
      dataBase64: record.dataBase64,
    })
  }
  return out.length > 0 ? out : undefined
}

/**
 * Maps a Harness `send_mail` argument object onto the local send payload.
 * @param args - Dynamic-tool arguments after attachment expansion.
 * @returns Send request.
 */
export function mailSendRequestFromHarnessArgs(args: Record<string, unknown>): MailSendRequest {
  return {
    mailAccountId: stringField(args, 'mailAccountId'),
    fromAddress: stringField(args, 'fromAddress'),
    replyTo: stringField(args, 'replyTo') || undefined,
    to: parseHarnessAddresses(args.to),
    cc: parseHarnessAddresses(args.cc),
    bcc: parseHarnessAddresses(args.bcc),
    subject: stringField(args, 'subject'),
    bodyHtml: stringField(args, 'bodyHtml') || undefined,
    bodyText: stringField(args, 'bodyText') || undefined,
    inReplyToMessageId: stringField(args, 'inReplyToMessageId') || undefined,
    draftId: stringField(args, 'draftId') || undefined,
    attachments: parseHarnessAttachments(args.attachments),
  }
}

/**
 * Maps a Harness `save_mail_draft` argument object onto the local draft payload.
 * @param args - Dynamic-tool arguments after attachment expansion.
 * @returns Draft request.
 */
export function mailDraftRequestFromHarnessArgs(args: Record<string, unknown>): MailDraftRequest {
  return {
    mailAccountId: stringField(args, 'mailAccountId'),
    fromAddress: stringField(args, 'fromAddress') || undefined,
    to: parseHarnessAddresses(args.to),
    cc: parseHarnessAddresses(args.cc),
    bcc: parseHarnessAddresses(args.bcc),
    subject: stringField(args, 'subject') || undefined,
    bodyHtml: stringField(args, 'bodyHtml') || undefined,
    bodyText: stringField(args, 'bodyText') || undefined,
  }
}

/**
 * Runs IMAP sync in the background and updates the job row.
 * @param userId - Auth user id.
 * @param accountId - Account id.
 * @param jobId - Job id.
 * @param kind - Incremental or historical.
 * @returns Nothing.
 */
async function runSyncJob(
  userId: string,
  accountId: string,
  jobId: string,
  kind: 'incremental' | 'historical',
): Promise<void> {
  if (runningAccountSync.has(accountId)) {
    return
  }
  runningAccountSync.add(accountId)
  try {
    const account = loadAccountConfig(userId, accountId)
    const synced = await syncImapAccount(account, kind, (done, total) => {
      const progress = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
      updateSyncJob(jobId, { progress, messagesSynced: done, totalEstimated: total })
    })
    markAccountSync(accountId, 'active', null)
    updateSyncJob(jobId, { status: 'done', progress: 100, messagesSynced: synced })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed'
    markAccountSync(accountId, 'error', message)
    updateSyncJob(jobId, { status: 'failed', errorMessage: message })
  } finally {
    runningAccountSync.delete(accountId)
  }
}

/**
 * Starts incremental sync, or returns the already-running job.
 * @param userId - Auth user id.
 * @param accountId - Account id.
 * @param kind - Incremental or historical.
 * @returns Job id.
 */
function startSync(
  userId: string,
  accountId: string,
  kind: 'incremental' | 'historical',
): { jobId: string } {
  if (!getOwnedAccountRow(userId, accountId)) {
    throw new Error('Account not found or access denied')
  }
  const existing = findRunningSyncJob(userId, accountId)
  if (existing) {
    return { jobId: existing }
  }
  const jobId = createSyncJob(userId, accountId, kind)
  void runSyncJob(userId, accountId, jobId, kind)
  return { jobId }
}

/**
 * Hydrates a message body from IMAP when the local cache is empty.
 * @param userId - Auth user id.
 * @param messageId - Message id.
 * @returns Detail.
 */
async function detailWithHydrate(userId: string, messageId: string): Promise<unknown> {
  let detail = getMailMessageDetail(userId, messageId)
  if (!detail.bodyHtml && !detail.bodyText) {
    const loaded = getMailMessageRow(userId, messageId)
    const ref = loaded ? imapRefFromRow(loaded.row) : null
    if (ref && loaded?.message.mailAccountId) {
      const account = loadAccountConfig(userId, loaded.message.mailAccountId)
      await hydrateImapBody(account, messageId, ref.mailbox, ref.uid)
      detail = getMailMessageDetail(userId, messageId)
    }
  }
  return detail
}

/**
 * Mirrors a local flag change to IMAP when the message still has a UID.
 * @param userId - Auth user id.
 * @param row - Message row.
 * @param add - Flags to add.
 * @param remove - Flags to remove.
 * @returns Nothing.
 */
async function mirrorFlags(
  userId: string,
  row: Record<string, SQLOutputValue>,
  add: string[],
  remove: string[],
): Promise<void> {
  const ref = imapRefFromRow(row)
  const accountId = typeof row.account_id === 'string' ? row.account_id : ''
  if (!ref || !accountId) {
    return
  }
  try {
    const account = loadAccountConfig(userId, accountId)
    await storeImapFlags(account, ref.mailbox, ref.uid, add, remove)
  } catch {
    // Local flags already changed; IMAP can catch up on the next sync.
  }
}

/**
 * Mirrors trash/spam/archive by moving the IMAP message when possible.
 * @param userId - Auth user id.
 * @param row - Message row.
 * @param role - Destination folder role.
 * @returns Nothing.
 */
async function mirrorMove(
  userId: string,
  row: Record<string, SQLOutputValue>,
  role: 'trash' | 'spam' | 'archive' | 'inbox',
): Promise<void> {
  const ref = imapRefFromRow(row)
  const accountId = typeof row.account_id === 'string' ? row.account_id : ''
  if (!ref || !accountId) {
    return
  }
  const destId = findFolderIdByRole(accountId, role === 'inbox' ? 'inbox' : role)
  if (!destId) {
    return
  }
  try {
    const account = loadAccountConfig(userId, accountId)
    const dest = listMailFolders(userId, accountId).find((folder) => folder.id === destId)
    if (!dest) {
      return
    }
    await moveImapMessage(account, ref.mailbox, ref.uid, dest.providerId)
  } catch {
    // Local labels already changed.
  }
}

/**
 * Applies a bulk mailbox action locally and best-effort on IMAP.
 * @param userId - Auth user id.
 * @param messageIds - Target ids.
 * @param action - Bulk action.
 * @param extra - Optional label or snooze wake time.
 * @returns Updated count.
 */
async function bulkMailMessages(
  userId: string,
  messageIds: string[],
  action: MailBulkAction,
  extra: { label?: string; snoozeUntil?: string },
): Promise<{ updated: number }> {
  const rows = listOwnedMessageRows(userId, messageIds)
  let updated = 0
  for (const row of rows) {
    const id = typeof row.id === 'string' ? row.id : ''
    if (!id) {
      continue
    }
    const patch = bulkPatchForAction(row, action, extra)
    if (patch.deleteRow) {
      await mirrorFlags(userId, row, ['\\Deleted'], [])
      deleteMessageAndFiles(userId, id)
      updated += 1
      continue
    }
    patchMessageFlags(id, {
      isRead: patch.isRead,
      isStarred: patch.isStarred,
      labels: patch.labels,
    })
    if (action === 'read') {
      await mirrorFlags(userId, row, ['\\Seen'], [])
    }
    if (action === 'unread') {
      await mirrorFlags(userId, row, [], ['\\Seen'])
    }
    if (action === 'star') {
      await mirrorFlags(userId, row, ['\\Flagged'], [])
    }
    if (action === 'unstar') {
      await mirrorFlags(userId, row, [], ['\\Flagged'])
    }
    if (action === 'trash') {
      await mirrorMove(userId, row, 'trash')
    }
    if (action === 'spam') {
      await mirrorMove(userId, row, 'spam')
    }
    if (action === 'archive') {
      await mirrorMove(userId, row, 'archive')
    }
    if (action === 'untrash' || action === 'unspam' || action === 'unarchive' || action === 'unsnooze') {
      await mirrorMove(userId, row, 'inbox')
    }
    updated += 1
  }
  const accountIds = new Set(
    rows.map((row) => (typeof row.account_id === 'string' ? row.account_id : '')).filter(Boolean),
  )
  for (const accountId of accountIds) {
    refreshFolderCounts(accountId)
  }
  return { updated }
}

/**
 * Sends mail through SMTP and stores a local sent copy.
 * @param userId - Auth user id.
 * @param req - Send payload.
 * @returns Result.
 */
export async function sendMailForUser(
  userId: string,
  req: MailSendRequest,
): Promise<{ ok: boolean; jobId: string | null }> {
  if (!req.mailAccountId || req.to.length === 0 || !req.subject) {
    throw new Error('Missing required send fields')
  }
  const account = loadAccountConfig(userId, req.mailAccountId)
  const files = await sendSmtpMessage(account, {
    fromAddress: req.fromAddress || account.email,
    replyTo: req.replyTo,
    to: req.to,
    cc: req.cc,
    bcc: req.bcc,
    subject: req.subject,
    bodyHtml: req.bodyHtml,
    bodyText: req.bodyText,
    inReplyTo: req.inReplyToMessageId,
    attachments: req.attachments,
  })
  insertSentCopy(userId, req.mailAccountId, {
    fromAddress: req.fromAddress || account.email,
    to: req.to,
    cc: req.cc ?? [],
    bcc: req.bcc ?? [],
    subject: req.subject,
    bodyHtml: req.bodyHtml ?? '',
    bodyText: req.bodyText ?? '',
    attachments: files,
  })
  if (req.draftId) {
    try {
      deleteDraft(userId, req.draftId)
    } catch {
      // Draft may already be gone.
    }
  }
  return { ok: true, jobId: null }
}

/**
 * Saves a local draft for Harness or the Mail composer.
 * @param userId - Auth user id.
 * @param req - Draft payload.
 * @returns Draft id.
 */
export function saveMailDraftForUser(
  userId: string,
  req: MailDraftRequest,
): { id: string } {
  if (!req.mailAccountId) {
    throw new Error('mailAccountId required')
  }
  const account = loadAccountConfig(userId, req.mailAccountId)
  const id = insertDraft(userId, req.mailAccountId, {
    fromAddress: req.fromAddress || account.email,
    to: req.to ?? [],
    cc: req.cc ?? [],
    bcc: req.bcc ?? [],
    subject: req.subject ?? '',
    bodyHtml: req.bodyHtml ?? '',
    bodyText: req.bodyText ?? '',
  })
  return { id }
}

/**
 * Dispatches one mail IPC method.
 * @param method - Method name.
 * @param userId - Signed-in user id.
 * @param args - Remaining IPC arguments.
 * @returns Method result.
 */
export async function handleMailIpc(
  method: string,
  userId: string,
  args: unknown[],
): Promise<unknown> {
  switch (method) {
    case 'presets':
      return providerPresets()
    case 'addImap': {
      const provider = args[0] === 'alibaba' || args[0] === 'imap' ? (args[0] as MailProvider) : null
      const email = typeof args[1] === 'string' ? args[1] : ''
      const displayName = typeof args[2] === 'string' ? args[2] : null
      const config = asRecord(args[3], 'IMAP config') as unknown as MailImapSmtpConfig
      if (!provider) {
        throw new Error('Only AliMail and generic IMAP accounts can be added.')
      }
      const tested = await testImapConnection(config)
      if (!tested.ok) {
        throw new Error(tested.error || 'IMAP connection failed')
      }
      return insertImapAccount(userId, provider, email, displayName, config)
    }
    case 'listAccounts':
      return listMailAccounts(userId)
    case 'listFolders':
      return listMailFolders(userId, String(args[0] ?? ''))
    case 'listLabels':
      return []
    case 'folderCounts':
      return fetchMailFolderCounts(userId, String(args[0] ?? ''))
    case 'listMessages':
      return listMailMessages(userId, String(args[0] ?? ''), asRecord(args[1] ?? {}, 'Message list options'))
    case 'getDetail':
      return detailWithHydrate(userId, String(args[0] ?? ''))
    case 'markRead':
      await bulkMailMessages(userId, [String(args[0] ?? '')], args[1] ? 'read' : 'unread', {})
      return null
    case 'toggleStar':
      await bulkMailMessages(userId, [String(args[0] ?? '')], args[1] ? 'star' : 'unstar', {})
      return null
    case 'bulk': {
      const extra = asRecord(args[2] ?? {}, 'Bulk extra')
      return bulkMailMessages(
        userId,
        Array.isArray(args[0]) ? args[0].map(String) : [],
        String(args[1] ?? '') as MailBulkAction,
        {
          label: stringField(extra, 'label') || undefined,
          snoozeUntil: stringField(extra, 'snoozeUntil') || undefined,
        },
      )
    }
    case 'sync':
      return startSync(userId, String(args[0] ?? ''), 'incremental')
    case 'historicalSync':
      return startSync(userId, String(args[0] ?? ''), 'historical')
    case 'fetchSyncJob':
      return fetchMailSyncJob(userId, String(args[0] ?? ''))
    case 'saveDraft':
      return saveMailDraftForUser(userId, asRecord(args[0], 'Draft') as unknown as MailDraftRequest)
    case 'updateDraft':
      updateDraft(userId, String(args[0] ?? ''), asRecord(args[1], 'Draft') as unknown as MailDraftRequest)
      return null
    case 'deleteDraft':
      deleteDraft(userId, String(args[0] ?? ''))
      return null
    case 'send':
      return sendMailForUser(userId, asRecord(args[0], 'Send') as unknown as MailSendRequest)
    case 'downloadAttachment': {
      const file = readMailAttachment(userId, String(args[0] ?? ''), String(args[1] ?? ''))
      const dto: MailBinaryDto = {
        bytes: file.bytes.buffer.slice(
          file.bytes.byteOffset,
          file.bytes.byteOffset + file.bytes.byteLength,
        ) as ArrayBuffer,
        filename: file.filename,
        contentType: file.contentType,
      }
      return dto
    }
    case 'downloadEml': {
      const detail = getMailMessageDetail(userId, String(args[0] ?? ''))
      const text = buildStoredEml(detail)
      const bytes = Buffer.from(text, 'utf8')
      const dto: MailBinaryDto = {
        bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
        filename: `${(detail.subject || 'message').slice(0, 40)}.eml`,
        contentType: 'message/rfc822',
      }
      return dto
    }
    case 'disconnect':
      disconnectMailAccount(userId, String(args[0] ?? ''))
      return null
    case 'deleteAccount':
      deleteMailAccount(userId, String(args[0] ?? ''))
      return null
    case 'updateAccount':
      updateMailAccount(
        userId,
        String(args[0] ?? ''),
        typeof args[1] === 'string' || args[1] === null ? args[1] : null,
      )
      return null
    case 'test': {
      const account = loadAccountConfig(userId, String(args[0] ?? ''))
      const result: MailAccountTestResult = await testImapConnection(account)
      return result
    }
    case 'unreadSummary':
      return fetchMailUnreadSummary(userId)
    case 'emptyFolder': {
      const role = args[1] === 'spam' ? 'spam' : 'trash'
      return emptyMailFolder(userId, String(args[0] ?? ''), role)
    }
    case 'listSyncTasks':
      return listMailSyncTasks(userId, asRecord(args[0] ?? {}, 'Sync task options'))
    case 'createLabel':
    case 'renameLabel':
    case 'deleteLabel':
      throw new Error('IMAP mailboxes do not support Gmail labels.')
    default:
      throw new Error(`Unknown mail method: ${method}`)
  }
}
