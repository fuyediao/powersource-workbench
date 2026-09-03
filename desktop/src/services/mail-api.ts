/**
 * workbench-api `/mail/*` client for the Electron mail workspace.
 */

import { resolveApiBaseUrl } from '@/config/deployment-urls'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type {
  MailAccount,
  MailAccountTestResult,
  MailBulkAction,
  MailDraftRequest,
  MailFolderCounts,
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

const GATEWAY_STATUSES = new Set([502, 503, 504])
const SYNC_JOB_POLL_MS = 2000
const SYNC_JOB_MAX_POLL_ERRORS = 10

/**
 * Returns whether the mail API origin is configured.
 * @returns True when `VITE_DEPLOYMENT_DOMAIN` is set.
 */
export function isMailApiConfigured(): boolean {
  return Boolean(resolveApiBaseUrl())
}

/**
 * Supabase access token for `/mail/*`.
 * @returns Bearer token, or null when unsigned.
 */
async function getToken(): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null
  }
  const { data } = await supabase.auth.getSession()
  if (data.session?.access_token) {
    return data.session.access_token
  }
  const { data: refreshed } = await supabase.auth.refreshSession()
  return refreshed.session?.access_token ?? null
}

/**
 * Authenticated JSON request to workbench-api `/mail/*`.
 * @param path - Absolute path starting with `/mail`.
 * @param init - Fetch init.
 * @returns Parsed JSON.
 */
async function mailFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = resolveApiBaseUrl()
  if (!base) {
    throw new Error('VITE_DEPLOYMENT_DOMAIN is not configured')
  }
  const token = await getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  const method = (init.method ?? 'GET').toUpperCase()
  const canReplay = method === 'GET' || method === 'HEAD'
  let res: Response
  try {
    res = await fetch(`${base}${path}`, { ...init, headers, mode: 'cors' })
    if (GATEWAY_STATUSES.has(res.status) && canReplay) {
      await new Promise((resolve) => setTimeout(resolve, 600))
      res = await fetch(`${base}${path}`, { ...init, headers, mode: 'cors', cache: 'no-store' })
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Network error'
    throw new Error(`${reason}. Cannot reach workbench-api (${base}).`)
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: '' }))) as {
      error?: string
      detail?: string
      jobId?: string
    }
    const parts = [body.error, body.detail].filter(
      (part): part is string => typeof part === 'string' && part.trim().length > 0,
    )
    throw new Error(parts.length > 0 ? parts.join(' — ') : `Request failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

/**
 * Coerces a JSON list payload to object rows. A Go nil slice encodes as `null`.
 * @param raw - Parsed JSON.
 * @returns Object rows, or an empty array.
 */
function asObjectRows(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw.filter(
    (row): row is Record<string, unknown> =>
      row !== null && typeof row === 'object' && !Array.isArray(row),
  )
}

/**
 * Maps a `/mail/accounts` row to {@link MailAccount}.
 * @param raw - API row.
 * @returns Account.
 */
function mapAccount(raw: Record<string, unknown>): MailAccount {
  return {
    id: String(raw.id),
    provider:
      raw.provider === 'alibaba' ? 'alibaba' : raw.provider === 'imap' ? 'imap' : 'gmail',
    email: String(raw.email),
    displayName: typeof raw.display_name === 'string' ? raw.display_name : null,
    avatarUrl: typeof raw.avatar_url === 'string' ? raw.avatar_url : null,
    status: (raw.status as MailAccount['status']) ?? 'active',
    errorMessage: typeof raw.error_message === 'string' ? raw.error_message : null,
    lastSyncAt: typeof raw.last_sync_at === 'string' ? raw.last_sync_at : null,
  }
}

/**
 * Maps a message list/detail row.
 * @param raw - API row.
 * @returns Message.
 */
function mapMessage(raw: Record<string, unknown>): MailMessage {
  return {
    id: String(raw.id),
    mailAccountId: typeof raw.mail_account_id === 'string' ? raw.mail_account_id : null,
    threadId: typeof raw.thread_id === 'string' ? raw.thread_id : null,
    folderId: typeof raw.folder_id === 'string' ? raw.folder_id : null,
    subject: typeof raw.subject === 'string' ? raw.subject : null,
    fromAddress: String(raw.from_address ?? ''),
    fromName: typeof raw.from_name === 'string' ? raw.from_name : null,
    toAddresses: Array.isArray(raw.to_addresses) ? (raw.to_addresses as MailMessage['toAddresses']) : [],
    snippet: typeof raw.snippet === 'string' ? raw.snippet : null,
    receivedAt: typeof raw.received_at === 'string' ? raw.received_at : null,
    isRead: Boolean(raw.is_read),
    isStarred: Boolean(raw.is_starred),
    isSent: Boolean(raw.is_sent),
    isDraft: Boolean(raw.is_draft),
    hasAttachments: Boolean(raw.has_attachments),
    labels: Array.isArray(raw.labels) ? raw.labels.map(String) : [],
  }
}

/**
 * Lists Inbox or Sent messages related to a CRM customer.
 * @param customerId - CRM customer UUID.
 * @param box - 'inbox' for mail from the customer's addresses, 'sent' for mail
 * addressed (To/Cc) to the customer's addresses.
 * @param limit - Max rows.
 * @returns Messages for that customer.
 */
export async function listMailMessagesByCustomer(
  customerId: string,
  box: 'inbox' | 'sent',
  limit = 50,
): Promise<MailMessage[]> {
  const params = new URLSearchParams({ customerId, box })
  if (limit !== undefined) {
    params.set('limit', String(limit))
  }
  const raw = await mailFetch<unknown>(`/mail/messages/by-customer?${params}`)
  return asObjectRows(raw).map(mapMessage)
}

/**
 * Maps message detail including body and attachments.
 * @param raw - API row.
 * @returns Detail.
 */
function mapMessageDetail(raw: Record<string, unknown>): MailMessageDetail {
  const attachmentsRaw = Array.isArray(raw.attachments) ? raw.attachments : []
  return {
    ...mapMessage(raw),
    ccAddresses: Array.isArray(raw.cc_addresses) ? (raw.cc_addresses as MailMessageDetail['ccAddresses']) : [],
    bccAddresses: Array.isArray(raw.bcc_addresses) ? (raw.bcc_addresses as MailMessageDetail['bccAddresses']) : [],
    bodyHtml: typeof raw.body_html === 'string' ? raw.body_html : null,
    bodyText: typeof raw.body_text === 'string' ? raw.body_text : null,
    attachments: attachmentsRaw
      .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
      .map((row) => ({
        id: String(row.id),
        filename: String(row.filename ?? 'attachment'),
        contentType: typeof row.content_type === 'string' ? row.content_type : null,
        sizeBytes: typeof row.size_bytes === 'number' ? row.size_bytes : null,
      })),
  }
}

/**
 * Starts Gmail OAuth; open the returned URL in the system browser.
 * @param loginHint - Optional Google account hint.
 * @param returnOrigin - Allowed public web origin for the callback redirect.
 * @returns Google authorization URL.
 */
export async function startGmailOAuth(loginHint?: string, returnOrigin?: string): Promise<string> {
  const payload: { loginHint?: string; returnOrigin?: string } = {}
  if (loginHint) {
    payload.loginHint = loginHint
  }
  if (returnOrigin) {
    payload.returnOrigin = returnOrigin
  }
  const data = await mailFetch<{ url?: string }>('/mail/accounts/google/link', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (typeof data.url !== 'string' || data.url.length === 0) {
    throw new Error('Failed to start Gmail OAuth')
  }
  return data.url
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
  return mailFetch('/mail/accounts/imap', {
    method: 'POST',
    body: JSON.stringify({ provider, email, displayName, config }),
  })
}

/**
 * Sends a message from a connected mailbox.
 * @param req - Recipients and body.
 * @returns Job metadata.
 */
export async function sendMail(req: MailSendRequest): Promise<{ ok: boolean; jobId: string | null }> {
  return mailFetch('/mail/send', { method: 'POST', body: JSON.stringify(req) })
}

/**
 * Loads IMAP/SMTP presets keyed by provider id.
 * @returns Preset map.
 */
export async function getProviderPresets(): Promise<Record<string, MailProviderPreset>> {
  return mailFetch('/mail/provider-presets')
}

/**
 * Lists mailboxes the current user can access.
 * @returns Active accounts (disconnected rows omitted).
 */
export async function listMailAccounts(): Promise<MailAccount[]> {
  const raw = await mailFetch<unknown>('/mail/accounts')
  return asObjectRows(raw)
    .map(mapAccount)
    .filter((account) => account.status !== 'disconnected')
}

/**
 * Lists IMAP/Gmail folders for an account.
 * @param accountId - Mailbox id.
 * @returns Folders.
 */
export async function listMailFolders(accountId: string): Promise<MailFolderInfo[]> {
  const raw = await mailFetch<Array<Record<string, unknown>>>(
    `/mail/folders?accountId=${encodeURIComponent(accountId)}`,
  )
  return raw.map((row) => ({
    id: String(row.id),
    providerId: String(row.provider_id ?? ''),
    name: String(row.name ?? ''),
    role: (row.role as MailFolderInfo['role']) ?? null,
    unreadCount: Number(row.unread_count ?? 0),
    totalCount: Number(row.total_count ?? 0),
  }))
}

/**
 * Lists user Gmail labels (empty for AliMail).
 * @param accountId - Mailbox id.
 * @returns Labels.
 */
export async function listMailLabels(accountId: string): Promise<MailLabel[]> {
  const raw = await mailFetch<Array<{ id?: unknown; name?: unknown }>>(
    `/mail/labels?accountId=${encodeURIComponent(accountId)}`,
  )
  return raw
    .filter((row) => typeof row.id === 'string' && typeof row.name === 'string')
    .map((row) => ({ id: String(row.id), name: String(row.name) }))
}

/**
 * Sidebar unread counts for one mailbox.
 * @param accountId - Mailbox id.
 * @returns Count maps.
 */
export async function fetchMailFolderCounts(accountId: string): Promise<MailFolderCountsResponse> {
  const data = await mailFetch<{
    counts?: Record<string, unknown>
    labelCounts?: Record<string, unknown>
    folderIdCounts?: Record<string, unknown>
  }>(`/mail/folder-counts?accountId=${encodeURIComponent(accountId)}`)

  const toCounts = (raw: Record<string, unknown> | undefined): MailFolderCounts => {
    const out: MailFolderCounts = {}
    if (!raw) {
      return out
    }
    for (const [key, value] of Object.entries(raw)) {
      const n = Number(value)
      if (Number.isFinite(n) && n > 0) {
        out[key] = n
      }
    }
    return out
  }

  return {
    counts: toCounts(data.counts),
    labelCounts: toCounts(data.labelCounts),
    folderIdCounts: toCounts(data.folderIdCounts),
  }
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
  const params = new URLSearchParams({ accountId })
  if (options.folderId) {
    params.set('folderId', options.folderId)
  }
  if (options.label) {
    params.set('label', options.label)
  }
  if (options.q) {
    params.set('q', options.q)
  }
  if (options.page !== undefined) {
    params.set('page', String(options.page))
  }
  if (options.threadId) {
    params.set('threadId', options.threadId)
  }
  if (options.category) {
    params.set('category', options.category)
  }
  const raw = await mailFetch<{
    items?: Array<Record<string, unknown>>
    page?: number
    pageSize?: number
    total?: number
    hasMore?: boolean
    unreadInboxCount?: number
  }>(`/mail/messages?${params}`)
  return {
    items: (raw.items ?? []).map(mapMessage),
    page: raw.page ?? 0,
    pageSize: raw.pageSize ?? 50,
    total: raw.total ?? 0,
    hasMore: Boolean(raw.hasMore),
    unreadInboxCount: raw.unreadInboxCount ?? 0,
  }
}

/**
 * Loads one message body.
 * @param messageId - Message id.
 * @returns Detail.
 */
export async function getMailMessageDetail(messageId: string): Promise<MailMessageDetail> {
  const raw = await mailFetch<Record<string, unknown>>(`/mail/messages/${encodeURIComponent(messageId)}`)
  return mapMessageDetail(raw)
}

/**
 * Marks a message read or unread.
 * @param messageId - Message id.
 * @param isRead - New read flag.
 */
export async function markMailMessageRead(messageId: string, isRead: boolean): Promise<void> {
  await mailFetch(`/mail/messages/${encodeURIComponent(messageId)}/read`, {
    method: 'PATCH',
    body: JSON.stringify({ isRead }),
  })
}

/**
 * Toggles the starred flag.
 * @param messageId - Message id.
 * @param starred - New star flag.
 */
export async function toggleMailMessageStar(messageId: string, starred: boolean): Promise<void> {
  await mailFetch(`/mail/messages/${encodeURIComponent(messageId)}/star`, {
    method: 'PATCH',
    body: JSON.stringify({ starred }),
  })
}

/**
 * Moves messages to trash.
 * @param messageIds - Message ids.
 */
export async function trashMailMessages(messageIds: string[]): Promise<void> {
  await mailFetch('/mail/messages/bulk', {
    method: 'PATCH',
    body: JSON.stringify({ messageIds, action: 'trash' }),
  })
}

/**
 * Starts an incremental sync job.
 * @param accountId - Mailbox id.
 * @returns Running job id.
 */
export async function syncMailAccount(accountId: string): Promise<{ jobId: string }> {
  const base = resolveApiBaseUrl()
  if (!base) {
    throw new Error('VITE_DEPLOYMENT_DOMAIN is not configured')
  }
  const token = await getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  const res = await fetch(`${base}/mail/accounts/${encodeURIComponent(accountId)}/sync`, {
    method: 'POST',
    headers,
    mode: 'cors',
  })
  const body = (await res.json().catch(() => ({}))) as { jobId?: string; error?: string }
  if (res.status === 409 && typeof body.jobId === 'string') {
    return { jobId: body.jobId }
  }
  if (!res.ok || typeof body.jobId !== 'string' || body.jobId.length === 0) {
    throw new Error(body.error || `Sync failed: ${res.status}`)
  }
  return { jobId: body.jobId }
}

/**
 * Reads a sync job snapshot.
 * @param jobId - Job id.
 * @returns Status.
 */
export async function fetchMailSyncJob(jobId: string): Promise<MailSyncJobStatus> {
  const raw = await mailFetch<Record<string, unknown>>(`/mail/sync-jobs/${encodeURIComponent(jobId)}`)
  return {
    jobId: String(raw.jobId ?? raw.id ?? jobId),
    accountId: String(raw.accountId ?? raw.mail_account_id ?? ''),
    kind: raw.kind === 'historical' ? 'historical' : 'incremental',
    status: (raw.status as MailSyncJobStatus['status']) ?? 'running',
    progress: Number(raw.progress ?? 0),
    totalEstimated: typeof raw.totalEstimated === 'number' ? raw.totalEstimated : null,
    messagesSynced: Number(raw.messagesSynced ?? raw.messages_synced ?? 0),
    errorMessage: typeof raw.errorMessage === 'string' ? raw.errorMessage : null,
  }
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
  const data = await mailFetch<{ updated?: number }>('/mail/messages/bulk', {
    method: 'PATCH',
    body: JSON.stringify({
      messageIds,
      action,
      label: extra.label,
      snoozeUntil: extra.snoozeUntil,
    }),
  })
  return { updated: data.updated ?? 0 }
}

/**
 * Saves a new local draft.
 * @param req - Draft fields.
 * @returns Created draft id.
 */
export async function saveMailDraft(req: MailDraftRequest): Promise<{ id: string }> {
  return mailFetch('/mail/drafts', { method: 'POST', body: JSON.stringify(req) })
}

/**
 * Updates an existing draft.
 * @param draftId - Draft id.
 * @param req - Fields.
 */
export async function updateMailDraft(draftId: string, req: MailDraftRequest): Promise<void> {
  await mailFetch(`/mail/drafts/${encodeURIComponent(draftId)}`, {
    method: 'PATCH',
    body: JSON.stringify(req),
  })
}

/**
 * Deletes a draft.
 * @param draftId - Draft id.
 */
export async function deleteMailDraft(draftId: string): Promise<void> {
  await mailFetch(`/mail/drafts/${encodeURIComponent(draftId)}`, { method: 'DELETE' })
}

/**
 * Downloads an attachment as a blob.
 * @param messageId - Message id.
 * @param attachmentId - Attachment id.
 * @returns Blob and suggested filename.
 */
export async function downloadMailAttachment(
  messageId: string,
  attachmentId: string,
): Promise<Blob> {
  return mailFetchBlob(
    `/mail/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
  )
}

/**
 * Downloads a reconstructed .eml snapshot.
 * @param messageId - Message id.
 * @returns EML blob.
 */
export async function downloadMailEml(messageId: string): Promise<Blob> {
  return mailFetchBlob(`/mail/messages/${encodeURIComponent(messageId)}/eml`)
}

/**
 * Disconnects a mailbox (keeps the row, clears secrets).
 * @param accountId - Account id.
 */
export async function disconnectMailAccount(accountId: string): Promise<void> {
  await mailFetch(`/mail/accounts/${encodeURIComponent(accountId)}/disconnect`, { method: 'POST' })
}

/**
 * Permanently deletes a mailbox.
 * @param accountId - Account id.
 */
export async function deleteMailAccount(accountId: string): Promise<void> {
  await mailFetch(`/mail/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' })
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
  await mailFetch(`/mail/accounts/${encodeURIComponent(accountId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ displayName }),
  })
}

/**
 * Tests IMAP or Gmail credentials.
 * @param accountId - Account id.
 * @returns Test result.
 */
export async function testMailAccount(accountId: string): Promise<MailAccountTestResult> {
  return mailFetch(`/mail/accounts/${encodeURIComponent(accountId)}/test`, { method: 'POST' })
}

/**
 * Starts a historical sync.
 * @param accountId - Account id.
 * @param since - Optional ISO lower bound.
 * @returns Job id.
 */
export async function startHistoricalMailSync(
  accountId: string,
  since?: string,
): Promise<{ jobId: string }> {
  const data = await mailFetch<{ jobId?: string; error?: string }>(
    `/mail/accounts/${encodeURIComponent(accountId)}/sync/historical`,
    {
      method: 'POST',
      body: JSON.stringify(since ? { since } : {}),
    },
  )
  if (typeof data.jobId !== 'string' || data.jobId.length === 0) {
    throw new Error(data.error || 'Failed to start historical sync')
  }
  return { jobId: data.jobId }
}

/**
 * Inbox unread count across accessible mailboxes.
 * @returns Total unread.
 */
export async function fetchMailUnreadSummary(): Promise<number> {
  const data = await mailFetch<{ totalUnread?: number }>('/mail/unread-summary')
  const total = Number(data.totalUnread ?? 0)
  return Number.isFinite(total) && total > 0 ? Math.floor(total) : 0
}

/**
 * Creates a Gmail user label.
 * @param accountId - Mailbox id.
 * @param name - Label name.
 * @returns Created label.
 */
export async function createMailLabel(accountId: string, name: string): Promise<MailLabel> {
  const data = await mailFetch<{ id?: string; name?: string }>('/mail/labels', {
    method: 'POST',
    body: JSON.stringify({ accountId, name }),
  })
  if (typeof data.id !== 'string' || typeof data.name !== 'string') {
    throw new Error('Failed to create label')
  }
  return { id: data.id, name: data.name }
}

/**
 * Renames a Gmail user label.
 * @param accountId - Mailbox id.
 * @param labelId - Label id.
 * @param name - New name.
 * @returns Updated label.
 */
export async function renameMailLabel(
  accountId: string,
  labelId: string,
  name: string,
): Promise<MailLabel> {
  const data = await mailFetch<{ id?: string; name?: string }>(
    `/mail/labels/${encodeURIComponent(labelId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ accountId, name }),
    },
  )
  if (typeof data.id !== 'string' || typeof data.name !== 'string') {
    throw new Error('Failed to rename label')
  }
  return { id: data.id, name: data.name }
}

/**
 * Deletes a Gmail user label.
 * @param accountId - Mailbox id.
 * @param labelId - Label id.
 */
export async function deleteMailLabel(accountId: string, labelId: string): Promise<void> {
  await mailFetch(
    `/mail/labels/${encodeURIComponent(labelId)}?accountId=${encodeURIComponent(accountId)}`,
    { method: 'DELETE' },
  )
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
  const data = await mailFetch<{ updated?: number }>('/mail/folders/empty', {
    method: 'POST',
    body: JSON.stringify({ accountId, role }),
  })
  return { updated: data.updated ?? 0 }
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
  const params = new URLSearchParams()
  if (options?.accountId) {
    params.set('accountId', options.accountId)
  }
  if (options?.status) {
    params.set('status', options.status)
  }
  if (options?.limit) {
    params.set('limit', String(options.limit))
  }
  const query = params.toString()
  const data = await mailFetch<{ items?: MailSyncTaskPage['items']; total?: number }>(
    `/mail/sync-tasks${query ? `?${query}` : ''}`,
  )
  return { items: data.items ?? [], total: data.total ?? data.items?.length ?? 0 }
}

/**
 * Authenticated binary GET for attachments / EML.
 * @param path - `/mail/...` path.
 * @returns Response blob.
 */
async function mailFetchBlob(path: string): Promise<Blob> {
  const base = resolveApiBaseUrl()
  if (!base) {
    throw new Error('VITE_DEPLOYMENT_DOMAIN is not configured')
  }
  const token = await getToken()
  const headers: Record<string, string> = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  const res = await fetch(`${base}${path}`, { headers, mode: 'cors' })
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status}`)
  }
  return res.blob()
}
