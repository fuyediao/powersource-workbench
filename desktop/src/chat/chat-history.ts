/**
 * Shared chat history helpers: build HistoryInput from UI state.
 */

import type {
  HistoryInput,
  ChatMessage,
  ChatAssistantKind,
} from '@/types/chat'
import { parseChatAssistantKind } from '@/types/chat'

/**
 * Build HistoryInput from current messages.
 *
 * @param messages - Current conversation messages
 * @param query - Display query (typically the last user message content)
 * @param assistantKind - Stored surface; always persisted as Ask
 * @returns History payload for local insert/update
 */
export function buildHistoryInput(
  messages: ChatMessage[],
  query: string,
  assistantKind: ChatAssistantKind = 'ask',
): HistoryInput {
  return {
    query,
    messages,
    assistantKind: parseChatAssistantKind(assistantKind),
  }
}
