/**
 * Ask and Harness conversation rows stored in machine SQLite.
 * Not company Supabase. One database per Electron userData directory.
 */

/** Ask vs Harness transcript kind. */
export type ChatHistoryKind = 'ask' | 'agent'

/**
 * One persisted conversation. Messages and Harness items are JSON-safe arrays.
 */
export interface ChatHistoryRowDto {
  id: string
  userId: string
  query: string
  messages: unknown[]
  assistantKind: ChatHistoryKind
  harnessThreadId: string | null
  harnessItems: unknown[] | null
  createdAt: string
  updatedAt: string
}

/** Fields accepted when creating a local history row. */
export interface ChatHistoryCreateInput {
  id?: string
  query: string
  messages: unknown[]
  assistantKind: ChatHistoryKind
  harnessThreadId?: string | null
  harnessItems?: unknown[] | null
  createdAt?: string
  updatedAt?: string
}

/** Fields accepted when updating a local history row. */
export interface ChatHistoryUpdateInput {
  query?: string
  messages?: unknown[]
  harnessThreadId?: string | null
  harnessItems?: unknown[] | null
}

/**
 * Coerces a stored assistant kind.
 * @param value - Raw value.
 * @returns `ask` or `agent`.
 */
export function parseChatHistoryKind(value: unknown): ChatHistoryKind {
  return value === 'agent' ? 'agent' : 'ask'
}
