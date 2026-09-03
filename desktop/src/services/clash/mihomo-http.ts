import { clashInvoke, clashListen } from '@/services/clash/bridge'

export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'SILENT'

export type Message = { type: 'Text' | 'Binary'; data: string }

export type Traffic = {
  up: number
  down: number
  upTotal?: number
  downTotal?: number
}

export type ProxyDelay = { delay: number }

export type BaseConfig = Record<string, unknown> & {
  mode?: string
  'mixed-port'?: number
  'log-level'?: string
}

export type Rule = {
  type?: string
  payload?: string
  proxy?: string
}

export type RuleProvider = {
  name?: string
  type?: string
  vehicleType?: string
  behavior?: string
  ruleCount?: number
  updatedAt?: number
}

type MihomoHttpResult = {
  ok: boolean
  status: number
  data: unknown
}

const sockets = new Set<MihomoWebSocket>()

/**
 * Calls Mihomo through Electron IPC (unix socket / named pipe in main).
 * The renderer never opens 127.0.0.1:19091.
 * @param pathname - Path beginning with /.
 * @param init - Fetch-like init.
 * @returns Parsed JSON, empty object, or null.
 */
async function mihomoJson<T>(pathname: string, init?: RequestInit): Promise<T | null> {
  const result = await clashInvoke<MihomoHttpResult>('mihomo_http', {
    pathname,
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? init.body : undefined,
  })
  if (!result.ok) {
    throw new Error(`Mihomo ${pathname} failed (${result.status})`)
  }
  if (result.status === 204 || result.data == null) {
    return null
  }
  return result.data as T
}

/**
 * IPC websocket wrapper matching `tauri-plugin-mihomo-api` MihomoWebSocket.
 */
export class MihomoWebSocket {
  private unsub: (() => void) | null = null
  private listeners: Array<(message: Message) => void> = []

  private constructor(private readonly id: string) {
    sockets.add(this)
  }

  /**
   * Subscribes to host websocket frames for this session.
   * @returns Nothing.
   */
  private async attach(): Promise<void> {
    this.unsub = await clashListen<Message>(`mihomo-ws:${this.id}`, (event) => {
      for (const listener of this.listeners) {
        listener(event.payload)
      }
    })
  }

  /**
   * Registers a text-frame listener.
   * @param listener - Message callback.
   */
  addListener(listener: (message: Message) => void): void {
    this.listeners.push(listener)
  }

  /**
   * Closes the socket.
   */
  async close(): Promise<void> {
    sockets.delete(this)
    this.listeners = []
    this.unsub?.()
    this.unsub = null
    await clashInvoke('mihomo_ws_close', { id: this.id })
  }

  /**
   * Opens a Mihomo websocket path via the Electron host.
   * @param pathname - Path such as /traffic.
   * @returns Connected wrapper.
   */
  static async connectPath(pathname: string): Promise<MihomoWebSocket> {
    const id = crypto.randomUUID()
    const socket = new MihomoWebSocket(id)
    await socket.attach()
    await clashInvoke<string>('mihomo_ws_open', { pathname, id })
    return socket
  }

  static connect_traffic(): Promise<MihomoWebSocket> {
    return MihomoWebSocket.connectPath('/traffic')
  }

  static connect_memory(): Promise<MihomoWebSocket> {
    return MihomoWebSocket.connectPath('/memory')
  }

  static connect_logs(level: LogLevel): Promise<MihomoWebSocket> {
    const pathLevel = level.toLowerCase()
    return MihomoWebSocket.connectPath(`/logs?level=${encodeURIComponent(pathLevel)}`)
  }

  static connect_connections(): Promise<MihomoWebSocket> {
    return MihomoWebSocket.connectPath('/connections')
  }

  static async get_all_instances(): Promise<MihomoWebSocket[]> {
    return [...sockets]
  }

  static cleanupAll(): void {
    for (const item of [...sockets]) {
      void item.close()
    }
  }
}

/**
 * GET /configs.
 * @returns Base config.
 */
export async function getBaseConfig(): Promise<BaseConfig> {
  return (await mihomoJson<BaseConfig>('/configs')) ?? {}
}

/**
 * GET /rules.
 * @returns Rules list.
 */
export async function getRules(): Promise<{ rules: Rule[] }> {
  return (await mihomoJson<{ rules: Rule[] }>('/rules')) ?? { rules: [] }
}

/**
 * GET /providers/rules.
 * @returns Rule providers map.
 */
export async function getRuleProviders(): Promise<{
  providers: Record<string, RuleProvider>
}> {
  return (
    (await mihomoJson<{ providers: Record<string, RuleProvider> }>('/providers/rules')) ?? {
      providers: {},
    }
  )
}

/**
 * GET /connections.
 * @returns Connection snapshot.
 */
export async function getConnections(): Promise<{
  connections?: Array<{ id: string; chains: string[] }>
}> {
  return (await mihomoJson('/connections')) ?? {}
}

/**
 * DELETE /connections.
 */
export async function closeAllConnections(): Promise<void> {
  await mihomoJson('/connections', { method: 'DELETE' })
}

/**
 * DELETE /connections/:id.
 * @param id - Connection id.
 */
export async function closeConnection(id: string): Promise<void> {
  await mihomoJson(`/connections/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/**
 * PUT /proxies/:group.
 * @param groupName - Selector group.
 * @param proxyName - Selected node.
 */
export async function selectNodeForGroup(groupName: string, proxyName: string): Promise<void> {
  await mihomoJson(`/proxies/${encodeURIComponent(groupName)}`, {
    method: 'PUT',
    body: JSON.stringify({ name: proxyName }),
  })
}

/**
 * GET /proxies/:name/delay.
 * @param name - Proxy name.
 * @param url - Test URL.
 * @param timeout - Timeout ms.
 * @returns Delay payload.
 */
export async function delayProxyByName(
  name: string,
  url: string,
  timeout: number,
): Promise<ProxyDelay> {
  const query = new URLSearchParams({ url, timeout: String(timeout) })
  return (
    (await mihomoJson<ProxyDelay>(
      `/proxies/${encodeURIComponent(name)}/delay?${query.toString()}`,
    )) ?? { delay: 0 }
  )
}

/**
 * Health-check a provider node (falls back to delay).
 * @param _providerName - Provider name (unused for HTTP delay).
 * @param name - Node name.
 * @param url - Test URL.
 * @param timeout - Timeout ms.
 * @returns Delay payload.
 */
export async function healthcheckNodeInProvider(
  _providerName: string,
  name: string,
  url: string,
  timeout: number,
): Promise<ProxyDelay> {
  return delayProxyByName(name, url, timeout)
}

/**
 * PUT /providers/proxies/:name.
 * @param name - Provider name.
 */
export async function updateProxyProvider(name: string): Promise<void> {
  await mihomoJson(`/providers/proxies/${encodeURIComponent(name)}`, { method: 'PUT' })
}

/**
 * PUT /providers/rules/:name.
 * @param name - Provider name.
 */
export async function updateRuleProvider(name: string): Promise<void> {
  await mihomoJson(`/providers/rules/${encodeURIComponent(name)}`, { method: 'PUT' })
}

/**
 * POST /configs/geo.
 */
export async function updateGeo(): Promise<void> {
  await mihomoJson('/configs/geo', { method: 'POST' })
}

/**
 * POST /upgrade.
 */
export async function upgradeCore(): Promise<void> {
  await mihomoJson('/upgrade', { method: 'POST' })
}

/**
 * GET /version.
 * @returns Version payload.
 */
export async function getVersion(): Promise<{ version?: string; meta?: boolean }> {
  return (await mihomoJson('/version')) ?? { version: 'unknown' }
}
