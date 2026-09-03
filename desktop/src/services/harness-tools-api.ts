/**
 * First-party GeoCRM tools for Harness, via geocrm-api
 * `/ai/harness/tools/{tool}`.
 *
 * These reuse the same CRM implementation and desktop ACL as the public MCP
 * transport: group-scoped reads plus `group_desktop_writes_*` for mutations.
 * Harness never mints a `gcrm_mcp_` key and never speaks MCP to reach GeoCRM;
 * mail and calendar come from the same signed-in session as those Home tiles.
 */

import { resolveApiBaseUrl } from '@/config/deployment-urls'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

/** Outcome of one first-party tool call. */
export interface HarnessToolResult {
  tool: string
  /** JSON payload, exactly as MCP clients receive it. */
  result: string
  /** True for tool-level failures such as forbidden or not found. */
  isError: boolean
}

/**
 * Reports whether the GeoCRM API origin is configured.
 * @returns True when tool calls can run.
 */
export function isHarnessToolsApiConfigured(): boolean {
  return Boolean(resolveApiBaseUrl())
}

/**
 * Runs one GeoCRM tool as the signed-in user.
 * @param tool - Tool name, e.g. `search_records`.
 * @param args - Tool arguments.
 * @returns Tool payload and error flag.
 */
export async function callHarnessTool(
  tool: string,
  args: Record<string, unknown>,
): Promise<HarnessToolResult> {
  const base = resolveApiBaseUrl()
  if (!base || !isSupabaseConfigured || !supabase) {
    throw new Error('The GeoCRM API is not configured.')
  }
  const { data, error } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token
  if (error || !accessToken) {
    throw new Error('Sign in required.')
  }

  const response = await fetch(`${base}/ai/harness/tools/${encodeURIComponent(tool)}`, {
    method: 'POST',
    mode: 'cors',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ arguments: args }),
  })
  if (!response.ok) {
    throw new Error(`GeoCRM tool call failed (${response.status})`)
  }
  return (await response.json()) as HarnessToolResult
}
