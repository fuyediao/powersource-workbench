/**
 * Shared chat types for the Electron chat UI and engines.
 */

import type { ChatMessage, HistoryInput, ShopLocation, Coordinates } from '@/types/chat'
import type { ChatModeType } from '@/prompts/system-instruction'

export type { ChatMessage, HistoryInput, ShopLocation, Coordinates }
export type { ChatModeType }

/** AI model identifier for the chat engine (catalog provider slug). */
export type ChatModelId = string

/** Payload for sending a new message (engine input). */
export interface SendMessageParams {
  model: ChatModelId
  prompt: string
  historyMessages?: ChatMessage[]
  location?: Coordinates
  mode: ChatModeType
  signal?: AbortSignal
}

/** API keys keyed by model (caller provides; server loads BYOK from profiles). */
export interface ChatApiKeys {
  gemini: string
  openai: string
  anthropic: string
  grok: string
}

/** Result from the chat engine after a successful send. */
export interface SendMessageResult {
  message: ChatMessage
  locations: ShopLocation[]
}
