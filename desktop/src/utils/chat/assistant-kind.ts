/**
 * Persist Ask vs Agent independently: open thread, history id, and the active surface.
 */

import type { ChatAssistantKind, ChatMessage } from '@/types/chat'
import { parseChatAssistantKind } from '@/types/chat'

const KIND_KEY = 'electron_chat_assistant_kind'
const LEGACY_MESSAGES_KEY = 'electron_chat_messages'
const LEGACY_HISTORY_ID_KEY = 'electron_chat_history_id'

export interface ChatKindSession {
  messages: ChatMessage[]
  historyId: string | null
  inputText: string
}

/**
 * SessionStorage key for the open thread of one assistant kind.
 * @param kind - Ask or Agent
 * @returns Key
 */
function messagesKey(kind: ChatAssistantKind): string {
  return `electron_chat_messages_${kind}`
}

/**
 * SessionStorage key for the history row id of one assistant kind.
 * @param kind - Ask or Agent
 * @returns Key
 */
function historyIdKey(kind: ChatAssistantKind): string {
  return `electron_chat_history_id_${kind}`
}

/**
 * Reads the last selected Ask / Agent surface.
 * @returns Stored kind, or Ask when unset
 */
export function loadChatAssistantKind(): ChatAssistantKind {
  try {
    return parseChatAssistantKind(localStorage.getItem(KIND_KEY))
  } catch {
    return 'ask'
  }
}

/**
 * Persists the Ask / Agent surface on this device.
 * @param kind - Selected surface
 * @returns Nothing
 */
export function saveChatAssistantKind(kind: ChatAssistantKind): void {
  try {
    localStorage.setItem(KIND_KEY, kind)
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Reads the in-progress conversation for one surface.
 * Legacy unscoped keys are treated as Ask.
 * @param kind - Ask or Agent
 * @returns Messages, history id, and composer draft
 */
export function loadChatKindSession(kind: ChatAssistantKind): ChatKindSession {
  try {
    const scopedMessages = sessionStorage.getItem(messagesKey(kind))
    const scopedHistoryId = sessionStorage.getItem(historyIdKey(kind))
    const rawMessages =
      scopedMessages ?? (kind === 'ask' ? sessionStorage.getItem(LEGACY_MESSAGES_KEY) : null)
    const rawHistoryId =
      scopedHistoryId ?? (kind === 'ask' ? sessionStorage.getItem(LEGACY_HISTORY_ID_KEY) : null)
    if (!rawMessages) {
      return { messages: [], historyId: rawHistoryId ?? null, inputText: '' }
    }
    const parsed = JSON.parse(rawMessages) as ChatMessage[] | { messages?: ChatMessage[]; inputText?: string }
    if (Array.isArray(parsed)) {
      return {
        messages: parsed,
        historyId: rawHistoryId ?? null,
        inputText: '',
      }
    }
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      historyId: rawHistoryId ?? null,
      inputText: typeof parsed.inputText === 'string' ? parsed.inputText : '',
    }
  } catch {
    return { messages: [], historyId: null, inputText: '' }
  }
}

/**
 * Writes the in-progress conversation for one surface.
 * @param kind - Ask or Agent
 * @param session - Messages, history id, and composer draft
 * @returns Nothing
 */
export function saveChatKindSession(kind: ChatAssistantKind, session: ChatKindSession): void {
  try {
    if (session.messages.length > 0 || session.inputText.trim()) {
      sessionStorage.setItem(
        messagesKey(kind),
        JSON.stringify({ messages: session.messages, inputText: session.inputText }),
      )
    } else {
      sessionStorage.removeItem(messagesKey(kind))
    }
    if (session.historyId) {
      sessionStorage.setItem(historyIdKey(kind), session.historyId)
    } else {
      sessionStorage.removeItem(historyIdKey(kind))
    }
    if (kind === 'ask') {
      sessionStorage.removeItem(LEGACY_MESSAGES_KEY)
      sessionStorage.removeItem(LEGACY_HISTORY_ID_KEY)
    }
  } catch {
    // ignore quota / private mode
  }
}
