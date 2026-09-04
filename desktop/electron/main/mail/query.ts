/**
 * IMAP mailbox roles and virtual sidebar labels for the local mail store.
 */

/** Folder role used by IMAP / sidebar grouping. */
export type MailFolderRole = 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive' | 'custom'

/** Virtual mailbox tokens used by the mail sidebar. */
export const VIRTUAL_LABELS = new Set([
  'INBOX',
  'UNREAD',
  'IMPORTANT',
  'ALI_IMPORTANT',
  'ALI_FOLLOWUP',
  'ALI_COMPLETED',
  'DRAFT',
  'SENT',
  'TRASH',
  'SPAM',
  'ARCHIVE',
  'STARRED',
  'ALL',
  'SNOOZED',
])

const SPECIAL_USE_ROLE: Record<string, MailFolderRole> = {
  '\\sent': 'sent',
  '\\drafts': 'drafts',
  '\\draft': 'drafts',
  '\\trash': 'trash',
  '\\junk': 'spam',
  '\\spam': 'spam',
  '\\inbox': 'inbox',
  '\\archive': 'archive',
}

const MAILBOX_NAME_ROLE: Record<string, MailFolderRole> = {
  inbox: 'inbox',
  sent: 'sent',
  'sent messages': 'sent',
  'sent items': 'sent',
  draft: 'drafts',
  drafts: 'drafts',
  trash: 'trash',
  deleted: 'trash',
  'deleted items': 'trash',
  junk: 'spam',
  spam: 'spam',
  'junk e-mail': 'spam',
  archive: 'archive',
  archives: 'archive',
  'all mail': 'archive',
}

/** Flags and labels used when matching a stored message. */
export interface MailLabelMatchInput {
  labels: string[]
  isRead: boolean
  isStarred: boolean
  isDraft: boolean
  isSent: boolean
}

/**
 * Maps RFC 6154 special-use attributes or a mailbox name to a sidebar role.
 * @param attributes - IMAP LIST attribute tokens.
 * @param name - Mailbox name.
 * @returns Role, or empty when the mailbox is a custom folder the UI skips.
 */
export function resolveMailboxRole(attributes: readonly string[], name: string): MailFolderRole | '' {
  for (const attr of attributes) {
    const role = SPECIAL_USE_ROLE[attr.toLowerCase()]
    if (role) {
      return role
    }
  }
  return MAILBOX_NAME_ROLE[name.toLowerCase()] ?? ''
}

/**
 * Builds the virtual labels stored on a synced IMAP message.
 * @param role - Mailbox role.
 * @param flags - IMAP flags.
 * @returns Label tokens.
 */
export function labelsForImapMessage(role: MailFolderRole | '', flags: readonly string[]): string[] {
  const labels = new Set<string>()
  const lower = new Set(flags.map((flag) => flag.toLowerCase()))
  if (role === 'inbox') {
    labels.add('INBOX')
  }
  if (role === 'sent') {
    labels.add('SENT')
  }
  if (role === 'drafts' || lower.has('\\draft')) {
    labels.add('DRAFT')
  }
  if (role === 'trash' || lower.has('\\deleted')) {
    labels.add('TRASH')
  }
  if (role === 'spam') {
    labels.add('SPAM')
  }
  if (role === 'archive') {
    labels.add('ARCHIVE')
  }
  if (lower.has('\\flagged')) {
    labels.add('STARRED')
  }
  return [...labels]
}

/**
 * Returns whether a stored message belongs in a virtual sidebar folder.
 * @param input - Stored flags and labels.
 * @param label - Uppercase virtual label, ALL, or ALL_MAIL.
 * @returns True when the message should appear in that folder.
 */
export function messageMatchesVirtualLabel(input: MailLabelMatchInput, label: string): boolean {
  const labels = new Set(input.labels)
  const has = (token: string): boolean => labels.has(token)
  switch (label) {
    case 'INBOX':
      return has('INBOX') && !has('TRASH') && !has('SPAM')
    case 'UNREAD':
      return has('INBOX') && !input.isRead && !input.isDraft
    case 'IMPORTANT':
      return has('IMPORTANT')
    case 'ALI_IMPORTANT':
      return has('INBOX') && input.isStarred
    case 'ALI_FOLLOWUP':
      return has('INBOX') && input.isStarred && !input.isRead
    case 'ALI_COMPLETED':
      return has('INBOX') && input.isStarred && input.isRead
    case 'DRAFT':
      return input.isDraft || has('DRAFT')
    case 'SENT':
      return input.isSent || has('SENT')
    case 'TRASH':
      return has('TRASH') || has('\\Deleted')
    case 'SPAM':
      return has('SPAM') && !has('TRASH') && !has('\\Deleted')
    case 'ARCHIVE':
      return has('ARCHIVE')
    case 'STARRED':
      return has('STARRED') || input.isStarred
    case 'ALL':
    case 'ALL_MAIL':
      return !has('TRASH') && !has('SPAM') && !input.isDraft
    case 'SNOOZED':
      return has('SNOOZED')
    default:
      return has(label)
  }
}

/**
 * Maps an `in:` search token to a virtual label.
 * @param token - Raw in: value.
 * @returns Uppercase label, or empty.
 */
export function inTokenToLabel(token: string): string {
  const trimmed = token.trim().toLowerCase()
  if (trimmed === 'inbox') {
    return 'INBOX'
  }
  if (trimmed === 'sent') {
    return 'SENT'
  }
  if (trimmed === 'drafts' || trimmed === 'draft') {
    return 'DRAFT'
  }
  if (trimmed === 'trash') {
    return 'TRASH'
  }
  if (trimmed === 'spam' || trimmed === 'junk') {
    return 'SPAM'
  }
  if (trimmed === 'starred') {
    return 'STARRED'
  }
  if (trimmed === 'unread') {
    return 'UNREAD'
  }
  if (trimmed === 'archive') {
    return 'ARCHIVE'
  }
  return trimmed.toUpperCase()
}

/**
 * Applies archive / trash / spam label mutations used by bulk actions.
 * @param labels - Current labels.
 * @param add - Labels to add.
 * @param remove - Labels to remove.
 * @returns Next unique labels.
 */
export function toggleLabels(labels: string[], add: string[], remove: string[]): string[] {
  const next = new Set(labels)
  for (const token of remove) {
    next.delete(token)
  }
  for (const token of add) {
    next.add(token)
  }
  return [...next]
}
