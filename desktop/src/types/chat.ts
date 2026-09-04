import type { HarnessItem } from '@/types/harness'

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

/** Chat surface: Ask (Q&A) or Agent (tool-using). Histories are not shared. */
export type ChatAssistantKind = 'ask' | 'agent'

/**
 * Coerces a stored assistant kind. Unknown values map to Ask.
 * @param value - Raw value from storage or the database
 * @returns `ask` or `agent`
 */
export function parseChatAssistantKind(value: unknown): ChatAssistantKind {
  return value === 'agent' ? 'agent' : 'ask'
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
  /** Local Codex thread id for same-device Harness resume. */
  harnessThreadId?: string | null
  /** Full projected workflow transcript for Harness restore. */
  harnessItems?: HarnessItem[]
  createdAt: string
  updatedAt: string
}

/** Payload when creating or updating a history record. */
export interface HistoryInput {
  query: string
  messages: ChatMessage[]
  assistantKind?: ChatAssistantKind
  harnessThreadId?: string | null
  harnessItems?: HarnessItem[]
}
