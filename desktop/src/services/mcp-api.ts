/**
 * Settings → Model Context Protocol: multi-key lifecycle plus the master
 * on/off switch against geocrm-api `/mcp/settings/*`. A plaintext key is
 * returned by the server only once, right after it is minted; it is never
 * persisted client-side.
 */

import { resolveApiBaseUrl } from '@/config/deployment-urls'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

/** One MCP key row; never carries a secret. */
export interface McpKey {
  id: string
  /** Non-secret display prefix, e.g. `gcrm_mcp_ab12cd34`. */
  keyPrefix: string
  /** Optional user-chosen label, e.g. "Laptop", "Cursor". */
  label?: string
  enabled: boolean
  createdAt: string
  lastUsedAt?: string | null
}

/** Copyable fields for MCP clients that use OAuth instead of a Bearer key. */
export interface McpOAuthInfo {
  authorizeUrl: string
  tokenUrl: string
  clientId: string
  clientSecret: string
}

/** MCP status for the signed-in user. */
export interface McpSettings {
  /** Master switch: when off, every key and OAuth token is rejected. */
  enabled: boolean
  /** Streamable HTTP endpoint agents connect to. */
  endpoint: string
  keys: McpKey[]
  /** Maximum keys allowed per account (currently 5). */
  maxKeys: number
  /** Full plaintext key — present only right after it is created. */
  newKey?: string
  /** English one-shot setup instruction for Codex / Cursor. */
  setupPrompt?: string
  /** OAuth connector fields, present only when the server has a client configured. */
  oauth?: McpOAuthInfo
}

/** Error raised by MCP settings helpers. */
export class McpApiError extends Error {
  readonly status: number

  /**
   * @param message - Human-readable message.
   * @param status - HTTP status (0 = network or configuration failure).
   */
  constructor(message: string, status: number) {
    super(message)
    this.name = 'McpApiError'
    this.status = status
  }
}

/**
 * Reports whether the GeoCRM API origin is configured.
 * @returns True when MCP settings calls can run.
 */
export function isMcpApiConfigured(): boolean {
  return Boolean(resolveApiBaseUrl())
}

/**
 * Authenticated JSON request to geocrm-api `/mcp/settings/*`.
 * @param path - Path below `/mcp`.
 * @param method - HTTP method.
 * @param options - Optional JSON body and abort signal.
 * @returns Parsed JSON response.
 */
async function mcpRequest<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  options?: { body?: unknown; signal?: AbortSignal },
): Promise<T> {
  const base = resolveApiBaseUrl()
  if (!base) {
    throw new McpApiError('The PowerSource Workbench API is not configured.', 0)
  }
  if (!isSupabaseConfigured || !supabase) {
    throw new McpApiError('Supabase is not configured.', 0)
  }
  const { data, error } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token
  if (error || !accessToken) {
    throw new McpApiError('Sign in required.', 401)
  }

  const init: RequestInit = {
    method,
    mode: 'cors',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    signal: options?.signal,
  }
  if (options?.body !== undefined) {
    init.body = JSON.stringify(options.body)
  }

  let response: Response
  try {
    response = await fetch(`${base}/mcp${path}`, init)
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw err
    }
    throw new McpApiError('The PowerSource Workbench API could not be reached.', 0)
  }

  if (!response.ok) {
    let message = `MCP request failed (${response.status})`
    try {
      const payload = (await response.json()) as { error?: unknown }
      if (typeof payload.error === 'string' && payload.error) {
        message = payload.error
      }
    } catch {
      // Non-JSON error body; keep the status-based message.
    }
    throw new McpApiError(message, response.status)
  }
  return (await response.json()) as T
}

/**
 * Loads the caller's MCP status: master switch, keys, and OAuth fields.
 * @param signal - Optional abort signal.
 * @returns Current settings without any secret.
 */
export function fetchMcpSettings(signal?: AbortSignal): Promise<McpSettings> {
  return mcpRequest<McpSettings>('/settings', 'GET', { signal })
}

/**
 * Turns the master "Enable MCP Access" switch on. Existing keys are unaffected.
 * @returns Updated settings.
 */
export function enableMcpMaster(): Promise<McpSettings> {
  return mcpRequest<McpSettings>('/settings/enable', 'POST')
}

/**
 * Turns the master switch off, immediately blocking every key and OAuth token.
 * @returns Updated settings.
 */
export function disableMcpMaster(): Promise<McpSettings> {
  return mcpRequest<McpSettings>('/settings/disable', 'POST')
}

/**
 * Creates a new key (up to the account's `maxKeys` limit).
 * @param label - Optional display label, e.g. "Laptop".
 * @returns Settings including the new plaintext key, shown once.
 */
export function createMcpKey(label?: string): Promise<McpSettings> {
  return mcpRequest<McpSettings>('/settings/keys', 'POST', { body: { label: label ?? '' } })
}

/**
 * Enables or disables one key without deleting it.
 * @param keyId - Key id.
 * @param enabled - Requested state.
 * @returns Updated settings.
 */
export function setMcpKeyEnabled(keyId: string, enabled: boolean): Promise<McpSettings> {
  return mcpRequest<McpSettings>(`/settings/keys/${encodeURIComponent(keyId)}`, 'PATCH', {
    body: { enabled },
  })
}

/**
 * Permanently deletes one key.
 * @param keyId - Key id.
 * @returns Updated settings.
 */
export function deleteMcpKey(keyId: string): Promise<McpSettings> {
  return mcpRequest<McpSettings>(`/settings/keys/${encodeURIComponent(keyId)}`, 'DELETE')
}

/**
 * Loads the English setup prompt without revealing a key.
 * @param signal - Optional abort signal.
 * @returns Endpoint and prompt text.
 */
export function fetchMcpSetupPrompt(
  signal?: AbortSignal,
): Promise<{ endpoint: string; prompt: string }> {
  return mcpRequest<{ endpoint: string; prompt: string }>('/settings/setup-prompt', 'GET', {
    signal,
  })
}

/** Placeholder used when the plaintext MCP key is not on screen. */
export const MCP_KEY_PLACEHOLDER = '<YOUR_GEOCRM_MCP_KEY>'

/**
 * Builds a Streamable HTTP MCP client snippet with a Bearer header.
 * Matches the top-level `{ "geocrm": { url, headers } }` shape some clients
 * paste (no `mcpServers` wrapper).
 * @param endpoint - Public `/mcp` URL.
 * @param key - Plaintext key, or {@link MCP_KEY_PLACEHOLDER} when unknown.
 * @returns Pretty-printed JSON, including a trailing newline.
 */
export function buildMcpBearerJson(endpoint: string, key: string): string {
  return `${JSON.stringify(
    {
      geocrm: {
        url: endpoint,
        headers: {
          Authorization: `Bearer ${key}`,
        },
      },
    },
    null,
    2,
  )}\n`
}
