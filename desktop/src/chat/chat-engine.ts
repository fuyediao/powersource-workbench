/**
 * Shared chat engine: Ask-mode orchestration via workbench-api `/ai/aichat`.
 */

import { postAiChat } from '@/services/ai-api'
import type { ChatModelId, ChatApiKeys, SendMessageResult, ChatMessage } from './chat-types'
import type { ChatModeType } from '@/prompts/system-instruction'
import { getSystemInstructionForMode } from '@/prompts/system-instruction'

export { getSystemInstructionForMode }
export type { ChatModeType }

/**
 * Run a single Ask send via the AI gateway.
 *
 * @param params - Model, prompt, location, mode, api keys (compat), optional screenshot, optional web search, optional abort
 * @returns SendMessageResult or throws
 */
export async function runSendMessage(params: {
  model: ChatModelId
  modelId?: string
  prompt: string
  historyMessages?: ChatMessage[]
  location?: { latitude: number; longitude: number }
  mapSearch?: boolean
  webSearch?: boolean
  mode: ChatModeType
  apiKeys: ChatApiKeys
  image?: { mimeType: string; data: string }
  signal?: AbortSignal
}): Promise<SendMessageResult> {
  const {
    model,
    modelId,
    prompt,
    historyMessages,
    location,
    mapSearch,
    webSearch,
    mode,
    image,
    signal,
  } = params

  if (mode === 'customerInsight' || mode === 'kolInsight') {
    throw new Error('Customer and KOL insight modes are not supported in the Electron chat client.')
  }

  // Reference mode helper so tree-shaking retains parity with web exports.
  void getSystemInstructionForMode(mode)

  const askMode = mode === 'quick' ? 'quick' : 'think'
  const startTime = performance.now()
  const response = await postAiChat({
    model,
    modelId,
    mode: askMode,
    prompt,
    history: historyMessages,
    image,
    map: Boolean(mapSearch),
    webSearch: Boolean(webSearch),
    latitude: mapSearch ? location?.latitude : undefined,
    longitude: mapSearch ? location?.longitude : undefined,
    signal,
  })
  const thinkingTimeSeconds = (performance.now() - startTime) / 1000
  const locations = response.locations ?? []

  return {
    message: {
      id: crypto.randomUUID(),
      role: 'model',
      content: response.content,
      timestamp: Date.now(),
      thinkingTime: thinkingTimeSeconds,
      ...(locations.length > 0 ? { relatedShops: locations } : {}),
    },
    locations,
  }
}
