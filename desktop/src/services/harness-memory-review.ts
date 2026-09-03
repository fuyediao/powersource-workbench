/**
 * Desktop Harness memory review: run the user's Settings API key locally,
 * then POST proposed MEMORY.md / USER.md. geocrm-api only clamps and writes.
 */

import { fetchAiKeys, readAiKeysFromLocalStorage, type AiKeysState } from '@/services/ai-keys-api'
import {
  completeHarnessMemoryReview,
  fetchHarnessMemory,
  postHarnessMemoryReview,
  type HarnessMemorySnapshot,
} from '@/services/harness-memory-api'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { ApiRequestError, postJson } from '@/utils/api'

const MEMORY_CHAR_CAP = 2200
const USER_CHAR_CAP = 1375

/** English instruction for the bounded memory rewrite. */
export const HARNESS_REVIEW_SYSTEM_PROMPT = `You maintain two long-term memory files for a desktop CRM assistant.

MEMORY.md (at most 2200 characters): durable environment facts, project context, and standing office notes. Prefer stable facts over chatter. Drop stale or contradicted items.

USER.md (at most 1375 characters): who the user is, how they prefer to work, names they care about, and communication style. Do not invent identity.

Rules:
- Respond in English.
- Return a JSON object with exactly two string keys: "memory" and "user".
- Each value is the full replacement for that file, not a diff.
- Honor the character caps. Omit trivia rather than overflowing.
- If the transcript adds nothing durable, keep the existing files with only light cleanup.
- Do not wrap the JSON in markdown fences.
- Never include secrets, API keys, or raw credentials.`

type ReviewProvider = 'openai' | 'gemini' | 'grok' | 'anthropic'

interface ReviewProviderChoice {
  provider: ReviewProvider
  key: string
  modelId: string
}

/** Model selection used by the completed Harness turn. */
export interface HarnessMemoryReviewSelection {
  provider: string
  modelId: string
}

/**
 * Shortens s to at most max Unicode code points.
 * @param s - Source text.
 * @param max - Maximum rune count.
 * @returns Clamped text.
 */
function clampRunes(s: string, max: number): string {
  const runes = Array.from(s)
  if (max <= 0 || runes.length <= max) {
    return s
  }
  return runes.slice(0, max).join('')
}

/**
 * Parses the review model's JSON object (optionally fenced) and clamps caps.
 * @param raw - Model text.
 * @returns Proposed files.
 */
export function parseHarnessReviewOutput(raw: string): HarnessMemorySnapshot {
  let trimmed = raw.trim()
  trimmed = trimmed.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim()
  const parsed = JSON.parse(trimmed) as { memory?: unknown; user?: unknown }
  const memory = typeof parsed.memory === 'string' ? parsed.memory : ''
  const user = typeof parsed.user === 'string' ? parsed.user : ''
  return {
    memory: clampRunes(memory, MEMORY_CHAR_CAP),
    user: clampRunes(user, USER_CHAR_CAP),
  }
}

/**
 * Builds the user prompt for one review pass.
 * @param snapshot - Current VPS files.
 * @param transcript - Finished turn text.
 * @returns Prompt body.
 */
function buildReviewUserPrompt(snapshot: HarnessMemorySnapshot, transcript: string): string {
  return (
    'Current MEMORY.md:\n' +
    snapshot.memory +
    '\n\nCurrent USER.md:\n' +
    snapshot.user +
    '\n\nTranscript:\n' +
    transcript
  )
}

/**
 * Merges localStorage keys with the signed-in profile bag.
 * @returns Combined key bag.
 */
async function loadReviewKeys(): Promise<AiKeysState> {
  const bag: AiKeysState = { ...readAiKeysFromLocalStorage() }
  if (!isSupabaseConfigured || !supabase) {
    return bag
  }
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) {
    return bag
  }
  try {
    const remote = await fetchAiKeys(userId)
    if (!remote) {
      return bag
    }
    return { ...remote, ...bag }
  } catch {
    return bag
  }
}

/**
 * Resolves the completed turn's provider and key without cross-provider fallback.
 * @param keys - Key bag.
 * @param selection - Provider and model used by Harness.
 * @returns Provider, key, and selected model, or null when unsupported or unconfigured.
 */
function resolveReviewProvider(
  keys: AiKeysState,
  selection: HarnessMemoryReviewSelection,
): ReviewProviderChoice | null {
  const provider = selection.provider.trim().toLowerCase()
  const modelId = selection.modelId.trim()
  if (!modelId) return null
  if (provider === 'chatgpt' || provider === 'openai') {
    const key = (keys.openai ?? keys.chatgpt ?? '').trim()
    return key ? { provider: 'openai', key, modelId } : null
  }
  if (provider === 'claude' || provider === 'anthropic') {
    const key = (keys.anthropic ?? keys.claude ?? '').trim()
    return key ? { provider: 'anthropic', key, modelId } : null
  }
  if (provider === 'gemini' || provider === 'grok') {
    const key = (keys[provider] ?? '').trim()
    return key ? { provider, key, modelId } : null
  }
  return null
}

/**
 * Reads assistant text from an OpenAI-style chat completion body.
 * @param payload - Parsed JSON.
 * @returns Content string.
 */
function readChatCompletionText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return ''
  }
  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) {
    return ''
  }
  const first = choices[0]
  if (!first || typeof first !== 'object') {
    return ''
  }
  const message = (first as { message?: { content?: unknown } }).message
  return typeof message?.content === 'string' ? message.content : ''
}

/**
 * Calls an OpenAI-compatible chat completions endpoint.
 * @param url - Full URL.
 * @param apiKey - Bearer token.
 * @param model - Vendor model id.
 * @param systemPrompt - System text.
 * @param userPrompt - User text.
 * @returns Assistant text.
 */
async function completeChatCompletions(
  url: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const payload = await postJson<unknown>(
    url,
    {
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    },
  )
  return readChatCompletionText(payload)
}

/**
 * Reads assistant text from an OpenAI Responses body.
 * @param payload - Parsed Responses API body.
 * @returns Concatenated output text.
 */
function readOpenAiResponseText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const record = payload as Record<string, unknown>
  if (typeof record.output_text === 'string') return record.output_text
  if (!Array.isArray(record.output)) return ''
  const text: string[] = []
  for (const item of record.output) {
    if (!item || typeof item !== 'object') continue
    const content = (item as Record<string, unknown>).content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (!part || typeof part !== 'object') continue
      const value = (part as Record<string, unknown>).text
      if (typeof value === 'string') text.push(value)
    }
  }
  return text.join('')
}

/**
 * Calls the OpenAI Responses API used by current GPT models.
 * @param apiKey - Bearer token.
 * @param model - Selected OpenAI model id.
 * @param systemPrompt - System text.
 * @param userPrompt - User text.
 * @returns Assistant text.
 */
async function completeOpenAi(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const payload = await postJson<unknown>(
    'https://api.openai.com/v1/responses',
    {
      model,
      instructions: systemPrompt,
      input: userPrompt,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    },
  )
  return readOpenAiResponseText(payload)
}

/**
 * Calls Gemini generateContent.
 * @param apiKey - Gemini API key sent as `x-goog-api-key`.
 * @param model - Selected Gemini model id.
 * @param systemPrompt - System text.
 * @param userPrompt - User text.
 * @returns Assistant text.
 */
async function completeGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  try {
    const payload = await postJson<{
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }>(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
      },
    )
    const parts = payload.candidates?.[0]?.content?.parts ?? []
    return parts.map((part) => part.text ?? '').join('')
  } catch (error) {
    if (!(error instanceof ApiRequestError) || !/user location is not supported/i.test(error.message)) {
      throw error
    }
    return completeHarnessMemoryReview('gemini', model, systemPrompt, userPrompt)
  }
}

/**
 * Calls Anthropic Messages.
 * @param apiKey - x-api-key.
 * @param model - Selected Anthropic model id.
 * @param systemPrompt - System text.
 * @param userPrompt - User text.
 * @returns Assistant text.
 */
async function completeAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const payload = await postJson<{ content?: Array<{ type?: string; text?: string }> }>(
    'https://api.anthropic.com/v1/messages',
    {
      model,
      max_tokens: 2048,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    },
    {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
    },
  )
  const blocks = payload.content ?? []
  return blocks
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text ?? '')
    .join('')
}

/**
 * Runs one provider complete for the review pass.
 * @param choice - Provider and key.
 * @param systemPrompt - System text.
 * @param userPrompt - User text.
 * @returns Assistant text.
 */
async function completeReview(
  choice: ReviewProviderChoice,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  switch (choice.provider) {
    case 'openai':
      return completeOpenAi(choice.key, choice.modelId, systemPrompt, userPrompt)
    case 'grok':
      return completeChatCompletions(
        'https://api.x.ai/v1/chat/completions',
        choice.key,
        choice.modelId,
        systemPrompt,
        userPrompt,
      )
    case 'gemini':
      return completeGemini(choice.key, choice.modelId, systemPrompt, userPrompt)
    case 'anthropic':
      return completeAnthropic(choice.key, choice.modelId, systemPrompt, userPrompt)
  }
}

/**
 * Reviews a finished transcript with the user's Settings key and writes the
 * proposed files through geocrm-api.
 * @param transcript - Plain-text turn.
 * @param selection - Provider and model used by the completed Harness turn.
 * @returns Nothing.
 */
export async function runHarnessMemoryReview(
  transcript: string,
  selection: HarnessMemoryReviewSelection,
): Promise<void> {
  const trimmed = transcript.trim()
  if (!trimmed) {
    return
  }
  const keys = await loadReviewKeys()
  const choice = resolveReviewProvider(keys, selection)
  if (!choice) {
    return
  }
  const snapshot = await fetchHarnessMemory()
  const raw = await completeReview(
    choice,
    HARNESS_REVIEW_SYSTEM_PROMPT,
    buildReviewUserPrompt(snapshot, trimmed),
  )
  const proposed = parseHarnessReviewOutput(raw)
  if (!proposed.memory.trim() && !proposed.user.trim()) {
    return
  }
  await postHarnessMemoryReview(proposed)
}
