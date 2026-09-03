export type MailSearchSuggestion = {
  token: string | null
  term: string
  description: string
}

const EMPTY_SUGGESTIONS: MailSearchSuggestion[] = [
  { token: 'from', term: '', description: 'an email address' },
  { token: 'to', term: '', description: 'an email address' },
  { token: 'subject', term: '', description: 'a word or phrase' },
  { token: 'in', term: 'inbox', description: 'inbox, sent, trash, spam, drafts, starred, archive, snoozed, all' },
  { token: 'is', term: 'unread', description: 'unread, read, starred' },
  { token: 'has', term: 'attachment', description: 'attachment' },
  { token: 'after', term: '', description: 'YYYY-MM-DD' },
  { token: 'before', term: '', description: 'YYYY-MM-DD' },
]

/**
 * Token suggestions for an empty or in-progress Gmail-style search.
 * @param query - Current search field.
 * @returns Suggestions to show under the search bar.
 */
export function mailSearchSuggestions(query: string): MailSearchSuggestion[] {
  const trimmed = query.trim()
  if (!trimmed) {
    return EMPTY_SUGGESTIONS
  }
  const last = trimmed.split(/\s+/).pop() ?? ''
  if (!last.includes(':')) {
    return EMPTY_SUGGESTIONS.filter((row) => row.token?.startsWith(last.toLowerCase()) || last.length < 2)
  }
  const [token, term = ''] = last.split(':')
  const key = token.toLowerCase()
  const matches = EMPTY_SUGGESTIONS.filter((row) => row.token === key)
  if (matches.length === 0) {
    return []
  }
  return matches.map((row) => ({ ...row, term: term || row.term }))
}

/**
 * Applies a suggestion onto the current query.
 * @param query - Current query.
 * @param suggestion - Chosen suggestion.
 * @returns Updated query string.
 */
export function applyMailSearchSuggestion(query: string, suggestion: MailSearchSuggestion): string {
  const parts = query.trimEnd().split(/\s+/)
  const prefix = parts.slice(0, -1).join(' ')
  const token = suggestion.token ? `${suggestion.token}:${suggestion.term} ` : suggestion.term
  return `${prefix ? `${prefix} ` : ''}${token}`
}
