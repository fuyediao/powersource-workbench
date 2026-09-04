import { describe, expect, it } from 'vitest'
import {
  inTokenToLabel,
  labelsForImapMessage,
  messageMatchesVirtualLabel,
  resolveMailboxRole,
  toggleLabels,
} from './query'

describe('mail query helpers', () => {
  it('maps special-use attributes before the mailbox name', () => {
    expect(resolveMailboxRole(['\\Sent'], 'whatever')).toBe('sent')
    expect(resolveMailboxRole([], 'INBOX')).toBe('inbox')
    expect(resolveMailboxRole([], 'Projects')).toBe('')
  })

  it('builds virtual labels from folder role and IMAP flags', () => {
    expect(labelsForImapMessage('inbox', ['\\Flagged'])).toEqual(['INBOX', 'STARRED'])
    expect(labelsForImapMessage('trash', ['\\Deleted'])).toEqual(['TRASH'])
  })

  it('matches sidebar virtual folders', () => {
    const inboxUnread = {
      labels: ['INBOX'],
      isRead: false,
      isStarred: false,
      isDraft: false,
      isSent: false,
    }
    expect(messageMatchesVirtualLabel(inboxUnread, 'INBOX')).toBe(true)
    expect(messageMatchesVirtualLabel(inboxUnread, 'UNREAD')).toBe(true)
    expect(messageMatchesVirtualLabel({ ...inboxUnread, labels: ['INBOX', 'TRASH'] }, 'INBOX')).toBe(
      false,
    )
    expect(
      messageMatchesVirtualLabel(
        { labels: ['DRAFT'], isRead: true, isStarred: false, isDraft: true, isSent: false },
        'ALL',
      ),
    ).toBe(false)
  })

  it('maps in: search tokens and toggles labels', () => {
    expect(inTokenToLabel('inbox')).toBe('INBOX')
    expect(inTokenToLabel('junk')).toBe('SPAM')
    expect(toggleLabels(['INBOX'], ['ARCHIVE'], ['INBOX', 'TRASH'])).toEqual(['ARCHIVE'])
  })
})
