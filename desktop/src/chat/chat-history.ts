/**
 * Shared chat history helpers: build HistoryInput from UI state.
 */

import type {
  HistoryInput,
  ChatMessage,
  ShopLocation,
  Coordinates,
  ChatAssistantKind,
} from '@/types/chat'
import { parseChatAssistantKind } from '@/types/chat'

/**
 * Build HistoryInput from current messages and optional locations/search location.
 *
 * @param messages - Current conversation messages
 * @param query - Display query (typically the last user message content)
 * @param locations - All locations from the conversation
 * @param searchLocation - Optional coordinates used for the search
 * @param assistantKind - Ask vs Agent surface for this thread
 * @returns History payload for Supabase insert/update
 */
export function buildHistoryInput(
  messages: ChatMessage[],
  query: string,
  locations: ShopLocation[],
  searchLocation?: Coordinates | null,
  assistantKind: ChatAssistantKind = 'ask',
): HistoryInput {
  return {
    query,
    messages,
    locations,
    searchLocation: searchLocation ?? undefined,
    assistantKind: parseChatAssistantKind(assistantKind),
  }
}
