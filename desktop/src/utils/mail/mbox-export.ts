import type { MailMessage, MailMessageDetail } from '@/types/mail'

/**
 * Builds a simple mbox snapshot from message details.
 * @param messages - Full messages (body preferred).
 * @returns mbox text.
 */
export function buildMbox(messages: Array<MailMessage | MailMessageDetail>): string {
  return messages
    .map((message) => {
      const date = message.receivedAt ? new Date(message.receivedAt).toUTCString() : new Date().toUTCString()
      const from = message.fromAddress || 'unknown@local'
      const subject = message.subject || ''
      const body =
        'bodyText' in message && message.bodyText
          ? message.bodyText
          : 'bodyHtml' in message && message.bodyHtml
            ? stripTags(message.bodyHtml)
            : message.snippet || ''
      return `From ${from} ${date}\nFrom: ${from}\nDate: ${date}\nSubject: ${subject}\n\n${body}\n`
    })
    .join('\n')
}

/**
 * Strips tags for a plain mbox body.
 * @param html - HTML fragment.
 * @returns Text.
 */
function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}
