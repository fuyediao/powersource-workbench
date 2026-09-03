/**
 * Main-process HTTP helpers for GeoCRM Harness (`/ai/harness/*`).
 *
 * The renderer supplies the session JWT and API origin; Vite env is not
 * available here. Calls use `fetch` with a Bearer token, matching the
 * renderer services.
 */

import { isFirstPartyToolName } from './first-party-tools'

/** Outcome of one first-party tool call. */
export interface HarnessToolCallResult {
  /** Tool payload text, JSON-encoded as MCP clients see it. */
  text: string
  /** True for tool-level failures such as forbidden or not found. */
  isError: boolean
}

/** One normalized desktop action proposed by the selected visual model. */
export interface ComputerUseAction {
  action: 'click' | 'double_click' | 'right_click' | 'type' | 'press_key' | 'scroll' | 'drag' | 'wait' | 'done'
  x?: number
  y?: number
  endX?: number
  endY?: number
  text?: string
  key?: string
  direction?: 'up' | 'down' | 'left' | 'right'
  amount?: number
  result?: string
  reason?: string
  sensitive?: boolean
}

/**
 * Strips a trailing slash from an origin.
 * @param url - API origin.
 * @returns Origin without a trailing slash.
 */
function trimOrigin(url: string): string {
  return url.replace(/\/+$/, '')
}

/**
 * Authenticated JSON request from the Electron main process.
 * @param apiBaseUrl - Public geocrm-api origin.
 * @param accessToken - Signed-in session JWT.
 * @param path - Path beginning with `/ai/harness`.
 * @param method - HTTP method.
 * @param body - Optional JSON body.
 * @returns Parsed JSON, or null for an empty response.
 */
async function harnessRequest(
  apiBaseUrl: string,
  accessToken: string,
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
): Promise<unknown> {
  const origin = trimOrigin(apiBaseUrl)
  if (!origin || !accessToken) {
    throw new Error('Harness API origin or session token is missing.')
  }
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) {
    const errorText = (await response.text()).trim()
    let errorMessage = errorText
    if (errorText) {
      try {
        const payload = JSON.parse(errorText) as { error?: unknown }
        errorMessage = typeof payload.error === 'string' ? payload.error.trim() : errorText
      } catch {
        errorMessage = errorText
      }
    }
    throw new Error(
      errorMessage
        ? `Harness request failed (${response.status}): ${errorMessage}`
        : `Harness request failed (${response.status})`,
    )
  }
  const text = await response.text()
  if (!text.trim()) {
    return null
  }
  return JSON.parse(text) as unknown
}

/**
 * Requests one visual desktop action from the selected Computer Use model.
 * @param apiBaseUrl - Public geocrm-api origin.
 * @param accessToken - Session JWT.
 * @param provider - Selected provider id.
 * @param model - Selected vision model id.
 * @param task - Desktop task goal.
 * @param screenshot - Current PNG screenshot without a data URL prefix.
 * @param history - Previously executed action summaries.
 * @returns One normalized action.
 */
export async function planComputerUseAction(
  apiBaseUrl: string,
  accessToken: string,
  provider: string,
  model: string,
  task: string,
  screenshot: string,
  history: string[],
): Promise<ComputerUseAction> {
  return (await harnessRequest(apiBaseUrl, accessToken, '/ai/harness/computer-use/step', 'POST', {
    provider,
    model,
    task,
    screenshot,
    history,
  })) as ComputerUseAction
}

/**
 * Runs one first-party GeoCRM tool as the signed-in user.
 * @param apiBaseUrl - Public geocrm-api origin.
 * @param accessToken - Session JWT.
 * @param tool - First-party tool name.
 * @param args - Tool arguments.
 * @returns Tool text and error flag.
 */
export async function callHarnessTool(
  apiBaseUrl: string,
  accessToken: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<HarnessToolCallResult> {
  if (!isFirstPartyToolName(tool)) {
    return { text: JSON.stringify({ error: 'Unknown tool.' }), isError: true }
  }
  try {
    const payload = (await harnessRequest(
      apiBaseUrl,
      accessToken,
      `/ai/harness/tools/${encodeURIComponent(tool)}`,
      'POST',
      { arguments: args },
    )) as { result?: unknown; isError?: unknown } | null
    const text =
      typeof payload?.result === 'string' ? payload.result : JSON.stringify(payload?.result ?? payload)
    return { text, isError: payload?.isError === true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { text: JSON.stringify({ error: message }), isError: true }
  }
}

/**
 * Marks a this-PC wake item finished after the local Codex turn ends.
 * @param apiBaseUrl - Public geocrm-api origin.
 * @param accessToken - Session JWT.
 * @param jobId - Scheduled job id.
 * @param failed - True when the local turn failed or was interrupted.
 * @returns Nothing.
 */
export async function completeHarnessWakeItem(
  apiBaseUrl: string,
  accessToken: string,
  jobId: string,
  failed: boolean,
): Promise<void> {
  if (!jobId.trim() || !apiBaseUrl.trim() || !accessToken.trim()) {
    return
  }
  await harnessRequest(
    apiBaseUrl,
    accessToken,
    `/ai/harness/cron/wake/${encodeURIComponent(jobId)}/complete`,
    'POST',
    { failed },
  )
}
