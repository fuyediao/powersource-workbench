/** One message in an AI chat thread. */
export interface ChatMessage {
  id: string
  role: 'user' | 'model' | 'system'
  content: string
  timestamp: number
  thinkingTime?: number
  groundingMetadata?: {
    groundingChunks: unknown[]
    groundingSupports?: unknown[]
    webSearchQueries?: string[]
  }
  /** Data URL of a captured page screenshot (Ask AI sidebar only; not persisted). */
  screenshotDataUrl?: string
}

/** Stored chat surface. Legacy `'agent'` rows are coerced to Ask. */
export type ChatAssistantKind = 'ask' | 'agent'

/**
 * Coerces a stored assistant kind. Unknown values and legacy Agent rows map to Ask.
 * @param value - Raw value from storage or the database
 * @returns Always `ask`
 */
export function parseChatAssistantKind(_value: unknown): 'ask' {
  return 'ask'
}

/** Persisted chat history row (local SQLite). */
export interface HistoryRecord {
  id: string
  userId: string
  query: string
  messages: ChatMessage[]
  groupId?: string | null
  createdByUserId?: string | null
  assistantKind: ChatAssistantKind
  createdAt: string
  updatedAt: string
}

/** Payload when creating or updating a history record. */
export interface HistoryInput {
  query: string
  messages: ChatMessage[]
  assistantKind?: ChatAssistantKind
}
