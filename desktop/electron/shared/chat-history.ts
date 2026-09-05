/**
 * Ask conversation rows stored in machine SQLite.
 * Not company Supabase. One database per Electron userData directory.
 */

/** Ask transcript kind. Legacy Harness rows stored as `agent` are read as Ask. */
export type ChatHistoryKind = 'ask'

/**
 * One persisted conversation. Messages are JSON-safe arrays.
 */
export interface ChatHistoryRowDto {
  id: string
  userId: string
  query: string
  messages: unknown[]
  assistantKind: ChatHistoryKind
  createdAt: string
  updatedAt: string
}

/** Fields accepted when creating a local history row. */
export interface ChatHistoryCreateInput {
  id?: string
  query: string
  messages: unknown[]
  assistantKind: ChatHistoryKind
  createdAt?: string
  updatedAt?: string
}

/** Fields accepted when updating a local history row. */
export interface ChatHistoryUpdateInput {
  query?: string
  messages?: unknown[]
}

/**
 * Coerces a stored assistant kind to Ask.
 * Legacy Harness rows used `agent` and are treated as Ask.
 * @param _value - Raw stored or IPC value.
 * @returns `ask`.
 */
export function parseChatHistoryKind(_value: unknown): ChatHistoryKind {
  return 'ask'
}
