import { resolveApiBaseUrl } from '@/config/deployment-urls'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { ChatMessage } from '@/chat/chat-types'
import type { ShopLocation } from '@/types/chat'

/** Gateway model slugs used by geocrm-api `/ai/*`. */
export type AiGatewayModel = string

/** Server egress IP returned by POST /ai/settings/connectivity. */
export interface AiEgressInfo {
  ip: string
  country?: string
  region?: string
  city?: string
  isp?: string
  error?: string
}

/** One model row from POST /ai/settings/connectivity. */
export interface AiConnectivityModelResult {
  model: string
  ok: boolean
  message: string
  skipped: boolean
}

/** Full dual-path connectivity payload from the server hop. */
export interface AiConnectivityResponse {
  egress: AiEgressInfo
  models: AiConnectivityModelResult[]
}

/** Response shape from /ai/mapchat. */
export interface AiLocationsResponse {
  content: string
  locations: ShopLocation[]
  locationSetId: string | null
}

/** Error from AI gateway helpers. */
export class AiApiError extends Error {
  readonly code: string
  readonly status: number

  /**
   * @param code - Machine-readable error code.
   * @param message - Human-readable message.
   * @param status - HTTP status (0 = network).
   */
  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'AiApiError'
    this.code = code
    this.status = status
  }
}

/**
 * Returns true when the GeoCRM API origin is configured.
 * @returns Whether AI settings API calls can run.
 */
export function isAiApiConfigured(): boolean {
  return Boolean(resolveApiBaseUrl())
}

/**
 * Authenticated JSON request to geocrm-api `/ai/*`.
 *
 * @param path - Absolute API path (e.g. `/ai/aichat`).
 * @param body - JSON body; omit for GET.
 * @param signal - Optional abort signal.
 * @param method - HTTP method (defaults to POST when body is set, GET otherwise).
 * @returns Parsed JSON response.
 */
async function aiRequest<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
  method?: 'GET' | 'POST',
): Promise<T> {
  const base = resolveApiBaseUrl()
  if (!base) {
    throw new AiApiError('not_configured', 'API is not configured', 0)
  }
  if (!isSupabaseConfigured || !supabase) {
    throw new AiApiError('not_configured', 'Supabase is not configured', 0)
  }
  const { data, error } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token
  if (error || !accessToken) {
    throw new AiApiError('authentication_required', 'Sign in required', 401)
  }

  const httpMethod = method ?? (body === undefined ? 'GET' : 'POST')
  let response: Response
  try {
    response = await fetch(`${base}${path}`, {
      method: httpMethod,
      mode: 'cors',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw err
    }
    const detail =
      err instanceof Error && err.message.trim() ? ` (${err.message.trim()})` : ''
    throw new AiApiError(
      'network_error',
      `The PowerSource Workbench API could not be reached.${detail}`,
      0,
    )
  }

  if (!response.ok) {
    let code = 'request_failed'
    let message = `AI request failed (${response.status})`
    try {
      const payload = (await response.json()) as {
        error?: unknown
        code?: unknown
        message?: unknown
      }
      if (typeof payload.code === 'string' && payload.code) {
        code = payload.code
      }
      if (typeof payload.error === 'string' && payload.error) {
        message = payload.error
      } else if (typeof payload.message === 'string' && payload.message) {
        message = payload.message
      }
    } catch {
      // keep defaults
    }
    throw new AiApiError(code, message, response.status)
  }

  return (await response.json()) as T
}

/**
 * Ask-mode chat via POST /ai/aichat.
 *
 * @param params - Model, mode, prompt, optional history, vendor modelId, screenshot, Map search, and web search
 * @returns Assistant text plus any server-parsed map pins
 */
export async function postAiChat(params: {
  model: AiGatewayModel
  modelId?: string
  mode: 'think' | 'quick'
  prompt: string
  history?: ChatMessage[]
  image?: { mimeType: string; data: string }
  map?: boolean
  webSearch?: boolean
  reasoningEffort?: string
  latitude?: number
  longitude?: number
  signal?: AbortSignal
}): Promise<AiLocationsResponse> {
  const history = (params.history ?? [])
    .filter((m) => (m.role === 'user' || m.role === 'model') && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }))
  const res = await aiRequest<{
    content: string
    locations?: ShopLocation[]
    locationSetId?: string | null
  }>(
    '/ai/aichat',
    {
      model: params.model,
      ...(params.modelId ? { modelId: params.modelId } : {}),
      mode: params.mode,
      prompt: params.prompt,
      history,
      ...(params.image ? { image: params.image } : {}),
      ...(params.map ? { map: true } : {}),
      ...(params.webSearch ? { webSearch: true } : {}),
      ...(params.reasoningEffort ? { reasoningEffort: params.reasoningEffort } : {}),
      ...(params.latitude != null ? { latitude: params.latitude } : {}),
      ...(params.longitude != null ? { longitude: params.longitude } : {}),
    },
    params.signal,
  )
  return {
    content: res.content,
    locations: res.locations ?? [],
    locationSetId: res.locationSetId ?? null,
  }
}

/**
 * Map chat via POST /ai/mapchat (places near optional coordinates).
 *
 * @param params - Prompt, optional model, modelId, and lat/lng
 * @returns Assistant text plus shop locations to plot
 */
export async function postMapChat(params: {
  model?: AiGatewayModel
  modelId?: string
  prompt: string
  latitude?: number
  longitude?: number
  signal?: AbortSignal
}): Promise<AiLocationsResponse> {
  return aiRequest<AiLocationsResponse>(
    '/ai/mapchat',
    {
      model: params.model ?? 'gemini',
      ...(params.modelId ? { modelId: params.modelId } : {}),
      prompt: params.prompt,
      ...(params.latitude != null ? { latitude: params.latitude } : {}),
      ...(params.longitude != null ? { longitude: params.longitude } : {}),
    },
    params.signal,
  )
}

/** One row from GET /ai/models. */
export interface AiCatalogModelDto {
  id: string
  provider: string
  labelEn: string
  default?: boolean
  vision?: boolean
  computerUse?: boolean
  reasoningEfforts?: string[]
  defaultReasoningEffort?: string
}

/**
 * Lists allowlisted AI models via GET /ai/models?client=.
 *
 * @param client - web (flagships) or electron (full list)
 * @param signal - Optional abort signal
 * @returns Catalog rows
 */
export async function listAiModels(
  client: 'web' | 'electron' = 'electron',
  signal?: AbortSignal,
): Promise<AiCatalogModelDto[]> {
  const res = await aiRequest<{ models: AiCatalogModelDto[] }>(
    `/ai/models?client=${encodeURIComponent(client)}`,
    undefined,
    signal,
    'GET',
  )
  return res.models ?? []
}

/** One row from GET /ai/providers (cloud) or Electron local catalog. */
export interface AiProviderDto {
  id: string
  nameEn: string
  apiStyle: 'openai' | 'anthropic' | 'gemini' | 'unsupported' | 'ollama' | string
  baseUrl: string
  modelsPath: string
  pingModelId: string
  /** Electron-only local runtime (Ollama / LM Studio / llama.cpp). */
  isLocal?: boolean
  /** Local runtimes usually need no API key. */
  authOptional?: boolean
}

/**
 * Lists cloud AI vendors via GET /ai/providers.
 * @param signal - Optional abort signal.
 * @returns Provider catalog rows.
 */
export async function listAiProviders(signal?: AbortSignal): Promise<AiProviderDto[]> {
  const res = await aiRequest<{ providers: AiProviderDto[] }>(
    '/ai/providers',
    undefined,
    signal,
    'GET',
  )
  return res.providers ?? []
}

/**
 * AI Settings connectivity ping via POST /ai/settings/ping.
 *
 * @param model - Provider slug to test
 * @returns Success flag
 */
export async function postAiSettingsPing(
  model: AiGatewayModel | string,
): Promise<{ ok: boolean; model?: string; provider?: string }> {
  return aiRequest<{ ok: boolean; model?: string; provider?: string }>('/ai/settings/ping', {
    provider: model,
    model,
  })
}

/**
 * Server egress IP + per-provider GET /models probes via POST /ai/settings/connectivity.
 * @returns Egress info and per-provider probe rows (no Completer chat).
 */
export async function postAiSettingsConnectivity(): Promise<AiConnectivityResponse> {
  return aiRequest<AiConnectivityResponse>('/ai/settings/connectivity', {})
}

/** Trilingual customer / KOL insight payload from geocrm-api. */
export interface CustomerInsightTrilingual {
  enUs: string
  zhCn: string
  zhTw: string
}

/**
 * Customer AI summary via POST /ai/customer/summary (BYOK; does not persist).
 * @param model - Gateway model slug.
 * @param context - Client-built CRM context string.
 * @param signal - Optional abort.
 * @param modelId - Specific catalog model within the vendor; the backend's per-vendor default when omitted.
 * @returns Trilingual summary.
 */
export async function postCustomerSummary(
  model: AiGatewayModel,
  context: string,
  signal?: AbortSignal,
  modelId?: string,
): Promise<CustomerInsightTrilingual> {
  const res = await aiRequest<{ enUs: string; zhCn: string; zhTw: string }>(
    '/ai/customer/summary',
    { model, context, ...(modelId ? { modelId } : {}) },
    signal,
  )
  return { enUs: res.enUs, zhCn: res.zhCn, zhTw: res.zhTw }
}

/**
 * KOL AI summary via POST /ai/kol/summary (BYOK; does not persist).
 * @param model - Gateway model slug.
 * @param context - Client-built KOL context string.
 * @param signal - Optional abort.
 * @param modelId - Specific catalog model within the vendor; the backend's per-vendor default when omitted.
 * @returns Trilingual summary.
 */
export async function postKolSummary(
  model: AiGatewayModel,
  context: string,
  signal?: AbortSignal,
  modelId?: string,
): Promise<CustomerInsightTrilingual> {
  const res = await aiRequest<{ enUs: string; zhCn: string; zhTw: string }>(
    '/ai/kol/summary',
    { model, context, ...(modelId ? { modelId } : {}) },
    signal,
  )
  return { enUs: res.enUs, zhCn: res.zhCn, zhTw: res.zhTw }
}
