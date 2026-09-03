/**
 * Harness memory against geocrm-api `/ai/harness/memory`.
 *
 * The authoritative `MEMORY.md` / `USER.md` live on the user's VPS profile
 * (one directory per `user_id`). The desktop client reads a snapshot before a
 * turn, runs the review model with the user's Settings API key, and posts
 * proposed files afterwards. It never writes those files itself.
 */

import { resolveApiBaseUrl } from '@/config/deployment-urls'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { HarnessItem } from '@/types/harness'
import { requestJson, requestText } from '@/utils/api'

/** Frozen memory prefix for one turn. */
export interface HarnessMemorySnapshot {
  memory: string
  user: string
}

/**
 * Reports whether the GeoCRM API origin is configured.
 * @returns True when memory calls can run.
 */
export function isHarnessMemoryApiConfigured(): boolean {
  return Boolean(resolveApiBaseUrl())
}

/**
 * Authenticated JSON request to `/ai/harness/memory*`.
 * @param path - Path below `/ai/harness/memory`.
 * @param method - HTTP method.
 * @param body - Optional JSON body.
 * @returns Parsed JSON response.
 */
async function memoryRequest<T>(
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
): Promise<T> {
  const base = resolveApiBaseUrl()
  if (!base || !isSupabaseConfigured || !supabase) {
    throw new Error('The PowerSource Workbench API is not configured.')
  }
  const { data, error } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token
  if (error || !accessToken) {
    throw new Error('Sign in required.')
  }

  return requestJson<T>(`${base}/ai/harness/memory${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body,
  })
}

/**
 * Extracts assistant text from the Harness Responses SSE wire format.
 * @param payload - Complete event-stream response body.
 * @returns Concatenated assistant output text.
 */
export function parseHarnessResponseText(payload: string): string {
  const output: string[] = []
  for (const line of payload.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue
    const data = line.slice(5).trim()
    if (!data || data === '[DONE]') continue
    const event = JSON.parse(data) as {
      type?: unknown
      item?: { type?: unknown; content?: Array<{ type?: unknown; text?: unknown }> }
    }
    if (event.type !== 'response.output_item.done' || event.item?.type !== 'message') continue
    for (const part of event.item.content ?? []) {
      if (part.type === 'output_text' && typeof part.text === 'string') {
        output.push(part.text)
      }
    }
  }
  return output.join('')
}

/**
 * Runs a model-only memory review through the authenticated Harness API.
 * @param provider - Selected provider identifier.
 * @param modelId - Selected provider model identifier.
 * @param systemPrompt - Review system instructions.
 * @param userPrompt - Review input text.
 * @returns Assistant review output.
 */
export async function completeHarnessMemoryReview(
  provider: string,
  modelId: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const base = resolveApiBaseUrl()
  if (!base || !isSupabaseConfigured || !supabase) {
    throw new Error('The PowerSource Workbench API is not configured.')
  }
  const { data, error } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token
  if (error || !accessToken) {
    throw new Error('Sign in required.')
  }
  const payload = await requestText(`${base}/ai/harness/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'x-geocrm-provider': provider,
    },
    body: {
      model: modelId,
      instructions: systemPrompt,
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: userPrompt }],
        },
      ],
      tools: [],
      prompt_cache_key: `memory-review-${crypto.randomUUID()}`,
    },
  })
  return parseHarnessResponseText(payload)
}

/**
 * Reads the caller's memory snapshot from the VPS profile.
 * @returns Snapshot text for both files.
 */
export function fetchHarnessMemory(): Promise<HarnessMemorySnapshot> {
  return memoryRequest<HarnessMemorySnapshot>('', 'GET')
}

/**
 * Applies a desktop-proposed MEMORY.md / USER.md. geocrm-api clamps and writes.
 * @param snapshot - Proposed file bodies.
 * @returns Nothing.
 */
export async function postHarnessMemoryReview(snapshot: HarnessMemorySnapshot): Promise<void> {
  await memoryRequest<unknown>('/review', 'POST', {
    memory: snapshot.memory,
    user: snapshot.user,
  })
}

/**
 * Renders a memory snapshot as developer instructions for one turn.
 * @param snapshot - Memory files from the VPS profile.
 * @returns Instruction text, or empty when there is nothing to inject.
 */
export function formatMemoryInstructions(snapshot: HarnessMemorySnapshot): string {
  const sections: string[] = []
  if (snapshot.user.trim()) {
    sections.push(`# User profile\n\n${snapshot.user.trim()}`)
  }
  if (snapshot.memory.trim()) {
    sections.push(`# Remembered facts\n\n${snapshot.memory.trim()}`)
  }
  return sections.join('\n\n')
}

/**
 * Flattens transcript items into the plain text the review model reads.
 * @param items - Transcript rows from the finished turn.
 * @returns Review text.
 */
export function formatTranscriptForReview(items: HarnessItem[]): string {
  const lines: string[] = []
  for (const item of items) {
    switch (item.type) {
      case 'userMessage':
        lines.push(`User: ${item.text}`)
        break
      case 'agentMessage':
        lines.push(`Assistant: ${item.text}`)
        break
      case 'commandExecution':
        lines.push(`Command (${item.status}): ${item.command}`)
        break
      case 'fileChange':
        lines.push(
          `File change (${item.status}): ${item.changes.map((change) => change.path).join(', ')}`,
        )
        break
      case 'mcpToolCall':
        lines.push(`Tool (${item.status}): ${item.server}/${item.tool}`)
        break
      case 'crmToolCall':
        lines.push(`PowerSource Workbench (${item.status}): ${item.tool}`)
        break
      default:
        break
    }
  }
  return lines.join('\n')
}
