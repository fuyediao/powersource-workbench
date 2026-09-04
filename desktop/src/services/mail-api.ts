/**
 * Local mail IPC client (SQLite + IMAP/SMTP on this PC).
 */

import { supabase } from '@/lib/supabase'
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
  MailMessagePage,
  MailProvider,
  MailProviderPreset,
  MailSendRequest,
  MailSyncJobStatus,
  MailSyncTaskPage,
} from '@/types/mail'

const SYNC_JOB_POLL_MS = 2000
const SYNC_JOB_MAX_POLL_ERRORS = 10

/**
 * Returns whether the desktop mail store is available.
 * @returns True in the Electron shell.
 */
export function isMailApiConfigured(): boolean {
  return Boolean(window.workbench?.mail)
}

/**
 * Resolves the signed-in user id for mail IPC.
 * @returns Auth user id.
 */
async function requireSignedInUserId(): Promise<string> {
  if (!supabase) {
    throw new Error('Sign in required.')
  }
  const { data } = await supabase.auth.getSession()
  if (data.session?.user.id) {
    return data.session.user.id
  }
  const { data: refreshed } = await supabase.auth.refreshSession()
  const userId = refreshed.session?.user.id
  if (!userId) {
    throw new Error('Sign in required.')
  }
  return userId
}

/**
 * Returns the local mail IPC bridge.
 * @returns Mail API.
 */
function mailBridge(): NonNullable<Window['workbench']>['mail'] {
  const api = window.workbench?.mail
  if (!api) {
    throw new Error('Mail is only available in the desktop app.')
  }
  return api
}

/**
 * Turns an IPC binary payload into a Blob.
 * @param payload - Bytes from main.
 * @returns Browser blob.
 */
function binaryToBlob(payload: { bytes: ArrayBuffer; contentType: string }): Blob {
  return new Blob([payload.bytes], { type: payload.contentType })
}

/**
 * Lists Inbox or Sent messages related to a CRM customer.
 * Customer matching stays on this PC; there is no cloud mail index.
 * @param _customerId - CRM customer UUID (unused until local CRM join exists).
 * @param _box - Inbox or sent.
 * @param _limit - Max rows.
 * @returns Empty list (mail is not queried from Supabase).
 */
export async function listMailMessagesByCustomer(
  _customerId: string,
  _box: 'inbox' | 'sent',
  _limit = 50,
): Promise<MailMessage[]> {
  return []
}

/**
 * Adds an IMAP/SMTP mailbox (AliMail).
 * @param provider - Provider id (`alibaba`).
 * @param email - Address.
 * @param displayName - Optional label.
 * @param config - Server credentials.
 * @returns Created account ids.
 */
export async function addImapAccount(
  provider: MailProvider,
  email: string,
  displayName: string | null,
  config: MailImapSmtpConfig,
): Promise<{ id: string; email: string; provider: string }> {
  const userId = await requireSignedInUserId()
  return mailBridge().addImap(userId, provider, email, displayName, config)
}

/**
 * Sends a message from a connected mailbox.
 * @param req - Recipients and body.
 * @returns Job metadata.
 */
export async function sendMail(req: MailSendRequest): Promise<{ ok: boolean; jobId: string | null }> {
  const userId = await requireSignedInUserId()
  return mailBridge().send(userId, req)
}

/**
 * Loads IMAP/SMTP presets keyed by provider id.
 * @returns Preset map.
 */
export async function getProviderPresets(): Promise<Record<string, MailProviderPreset>> {
  const userId = await requireSignedInUserId()
  return mailBridge().presets(userId)
}

/**
 * Lists mailboxes the current user can access.
 * @returns Active accounts (disconnected rows omitted).
 */
export async function listMailAccounts(): Promise<MailAccount[]> {
  const userId = await requireSignedInUserId()
  return mailBridge().listAccounts(userId)
}

/**
 * Lists IMAP folders for an account.
 * @param accountId - Mailbox id.
 * @returns Folders.
 */
export async function listMailFolders(accountId: string): Promise<MailFolderInfo[]> {
  const userId = await requireSignedInUserId()
  return mailBridge().listFolders(userId, accountId)
}

/**
 * Lists user Gmail labels (empty for IMAP).
 * @param accountId - Mailbox id.
 * @returns Labels.
 */
export async function listMailLabels(accountId: string): Promise<MailLabel[]> {
  const userId = await requireSignedInUserId()
  return mailBridge().listLabels(userId, accountId)
}

/**
 * Sidebar unread counts for one mailbox.
 * @param accountId - Mailbox id.
 * @returns Count maps.
 */
export async function fetchMailFolderCounts(accountId: string): Promise<MailFolderCountsResponse> {
  const userId = await requireSignedInUserId()
  return mailBridge().folderCounts(userId, accountId)
}

/**
 * Lists messages for the active folder / label.
 * @param accountId - Mailbox id.
 * @param options - Filters.
 * @returns Page of messages.
 */
export async function listMailMessages(
  accountId: string,
  options: {
    folderId?: string
    label?: string
    q?: string
    page?: number
    threadId?: string
    category?: string
  } = {},
): Promise<MailMessagePage> {
  const userId = await requireSignedInUserId()
  return mailBridge().listMessages(userId, accountId, options)
}

/**
 * Loads one message body.
 * @param messageId - Message id.
 * @returns Detail.
 */
export async function getMailMessageDetail(messageId: string): Promise<MailMessageDetail> {
  const userId = await requireSignedInUserId()
  return mailBridge().getDetail(userId, messageId)
}

/**
 * Marks a message read or unread.
 * @param messageId - Message id.
 * @param isRead - New read flag.
 */
export async function markMailMessageRead(messageId: string, isRead: boolean): Promise<void> {
  const userId = await requireSignedInUserId()
  await mailBridge().markRead(userId, messageId, isRead)
}

/**
 * Toggles the starred flag.
 * @param messageId - Message id.
 * @param starred - New star flag.
 */
export async function toggleMailMessageStar(messageId: string, starred: boolean): Promise<void> {
  const userId = await requireSignedInUserId()
  await mailBridge().toggleStar(userId, messageId, starred)
}

/**
 * Moves messages to trash.
 * @param messageIds - Message ids.
 */
export async function trashMailMessages(messageIds: string[]): Promise<void> {
  await bulkMailMessages(messageIds, 'trash')
}

/**
 * Starts an incremental sync job.
 * @param accountId - Mailbox id.
 * @returns Running job id.
 */
export async function syncMailAccount(accountId: string): Promise<{ jobId: string }> {
  const userId = await requireSignedInUserId()
  return mailBridge().sync(userId, accountId)
}

/**
 * Reads a sync job snapshot.
 * @param jobId - Job id.
 * @returns Status.
 */
export async function fetchMailSyncJob(jobId: string): Promise<MailSyncJobStatus> {
  const userId = await requireSignedInUserId()
  return mailBridge().fetchSyncJob(userId, jobId)
}

/**
 * Polls a sync job until it finishes or times out.
 * @param jobId - Job id.
 * @param maxWaitMs - Deadline.
 * @returns Final snapshot.
 */
export async function pollMailSyncJobUntilDone(
  jobId: string,
  maxWaitMs = 45 * 60 * 1000,
): Promise<MailSyncJobStatus> {
  const deadline = Date.now() + maxWaitMs
  let consecutiveErrors = 0
  for (;;) {
    try {
      const job = await fetchMailSyncJob(jobId)
      consecutiveErrors = 0
      if (job.status !== 'pending' && job.status !== 'running') {
        return job
      }
    } catch (error) {
      consecutiveErrors += 1
      if (consecutiveErrors > SYNC_JOB_MAX_POLL_ERRORS) {
        throw error instanceof Error ? error : new Error('Sync polling failed')
      }
    }
    if (Date.now() >= deadline) {
      throw new Error('Sync timed out while waiting for completion')
    }
    await new Promise((resolve) => setTimeout(resolve, SYNC_JOB_POLL_MS))
  }
}

/**
 * Runs a bulk mailbox action.
 * @param messageIds - Target ids.
 * @param action - Bulk action.
 * @param extra - Optional label or snooze wake time.
 */
export async function bulkMailMessages(
  messageIds: string[],
  action: MailBulkAction,
  extra: { label?: string; snoozeUntil?: string } = {},
): Promise<{ updated: number }> {
  const userId = await requireSignedInUserId()
  return mailBridge().bulk(userId, messageIds, action, extra)
}

/**
 * Saves a new local draft.
 * @param req - Draft fields.
 * @returns Created draft id.
 */
export async function saveMailDraft(req: MailDraftRequest): Promise<{ id: string }> {
  const userId = await requireSignedInUserId()
  return mailBridge().saveDraft(userId, req)
}

/**
 * Updates an existing draft.
 * @param draftId - Draft id.
 * @param req - Fields.
 */
export async function updateMailDraft(draftId: string, req: MailDraftRequest): Promise<void> {
  const userId = await requireSignedInUserId()
  await mailBridge().updateDraft(userId, draftId, req)
}

/**
 * Deletes a draft.
 * @param draftId - Draft id.
 */
export async function deleteMailDraft(draftId: string): Promise<void> {
  const userId = await requireSignedInUserId()
  await mailBridge().deleteDraft(userId, draftId)
}

/**
 * Downloads an attachment as a blob.
 * @param messageId - Message id.
 * @param attachmentId - Attachment id.
 * @returns Blob.
 */
export async function downloadMailAttachment(
  messageId: string,
  attachmentId: string,
): Promise<Blob> {
  const userId = await requireSignedInUserId()
  const payload = await mailBridge().downloadAttachment(userId, messageId, attachmentId)
  return binaryToBlob(payload)
}

/**
 * Downloads a reconstructed .eml snapshot.
 * @param messageId - Message id.
 * @returns EML blob.
 */
export async function downloadMailEml(messageId: string): Promise<Blob> {
  const userId = await requireSignedInUserId()
  const payload = await mailBridge().downloadEml(userId, messageId)
  return binaryToBlob(payload)
}

/**
 * Disconnects a mailbox (keeps the row, clears secrets).
 * @param accountId - Account id.
 */
export async function disconnectMailAccount(accountId: string): Promise<void> {
  const userId = await requireSignedInUserId()
  await mailBridge().disconnect(userId, accountId)
}

/**
 * Permanently deletes a mailbox.
 * @param accountId - Account id.
 */
export async function deleteMailAccount(accountId: string): Promise<void> {
  const userId = await requireSignedInUserId()
  await mailBridge().deleteAccount(userId, accountId)
}

/**
 * Renames an IMAP mailbox display name.
 * @param accountId - Account id.
 * @param displayName - New name, or null to clear.
 */
export async function updateMailAccount(
  accountId: string,
  displayName: string | null,
): Promise<void> {
  const userId = await requireSignedInUserId()
  await mailBridge().updateAccount(userId, accountId, displayName)
}

/**
 * Tests IMAP credentials.
 * @param accountId - Account id.
 * @returns Test result.
 */
export async function testMailAccount(accountId: string): Promise<MailAccountTestResult> {
  const userId = await requireSignedInUserId()
  return mailBridge().test(userId, accountId)
}

/**
 * Starts a historical sync.
 * @param accountId - Mailbox id.
 * @param _since - Unused; local IMAP syncs the mailbox UID range.
 * @returns Job id.
 */
export async function startHistoricalMailSync(
  accountId: string,
  _since?: string,
): Promise<{ jobId: string }> {
  const userId = await requireSignedInUserId()
  return mailBridge().historicalSync(userId, accountId)
}

/**
 * Inbox unread count across accessible mailboxes.
 * @returns Total unread.
 */
export async function fetchMailUnreadSummary(): Promise<number> {
  if (!window.workbench?.mail) {
    return 0
  }
  const userId = await requireSignedInUserId()
  return mailBridge().unreadSummary(userId)
}

/**
 * Creates a Gmail user label (unsupported for IMAP).
 * @param _accountId - Mailbox id.
 * @param _name - Label name.
 * @returns Never.
 */
export async function createMailLabel(_accountId: string, _name: string): Promise<MailLabel> {
  throw new Error('IMAP mailboxes do not support Gmail labels.')
}

/**
 * Renames a Gmail user label (unsupported for IMAP).
 * @param _accountId - Mailbox id.
 * @param _labelId - Label id.
 * @param _name - New name.
 * @returns Never.
 */
export async function renameMailLabel(
  _accountId: string,
  _labelId: string,
  _name: string,
): Promise<MailLabel> {
  throw new Error('IMAP mailboxes do not support Gmail labels.')
}

/**
 * Deletes a Gmail user label (unsupported for IMAP).
 * @param _accountId - Mailbox id.
 * @param _labelId - Label id.
 */
export async function deleteMailLabel(_accountId: string, _labelId: string): Promise<void> {
  throw new Error('IMAP mailboxes do not support Gmail labels.')
}

/**
 * Permanently deletes every message in trash or spam.
 * @param accountId - Mailbox id.
 * @param role - Folder role.
 * @returns Deleted count.
 */
export async function emptyMailFolder(
  accountId: string,
  role: 'trash' | 'spam',
): Promise<{ updated: number }> {
  const userId = await requireSignedInUserId()
  return mailBridge().emptyFolder(userId, accountId, role)
}

/**
 * Lists pending / failed remote sync tasks (Outbox).
 * @param options - Optional account filter and status list.
 * @returns Task page.
 */
export async function listMailSyncTasks(options?: {
  accountId?: string | null
  status?: string
  limit?: number
}): Promise<MailSyncTaskPage> {
  const userId = await requireSignedInUserId()
  return mailBridge().listSyncTasks(userId, options)
}
