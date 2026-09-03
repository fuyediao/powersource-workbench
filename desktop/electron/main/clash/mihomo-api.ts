import http from 'node:http'

import { CLASH_MIXED_PORT } from '../../shared/clash'
import { controllerSocketPath, readClashSecret } from './store'

type MihomoProxy = {
  name?: string
  type?: string
  now?: string
  all?: string[]
  udp?: boolean
  xudp?: boolean
  tfo?: boolean
  history?: Array<{ time?: string; delay?: number }>
  hidden?: boolean
  icon?: string
  alive?: boolean
}

type MihomoProxies = {
  proxies?: Record<string, MihomoProxy>
}

const GROUP_TYPES = new Set([
  'Selector',
  'URLTest',
  'Fallback',
  'LoadBalance',
  'Relay',
])

export type MihomoHttpResult = {
  ok: boolean
  status: number
  data: unknown
}

/**
 * Calls the Mihomo REST API over the controller unix socket / named pipe.
 * @param pathname - Path beginning with /.
 * @param init - Method and JSON body.
 * @returns Parsed JSON, or null on failure.
 */
export async function mihomoFetch<T>(
  pathname: string,
  init?: { method?: string; body?: string },
): Promise<T | null> {
  const result = await mihomoRequest(pathname, init)
  if (!result.ok) {
    return null
  }
  return result.data as T
}

/**
 * Calls the Mihomo REST API and returns status for the renderer IPC bridge.
 * @param pathname - Path beginning with /.
 * @param init - Method and JSON body.
 * @returns Status plus parsed JSON.
 */
export function mihomoRequest(
  pathname: string,
  init?: { method?: string; body?: string },
): Promise<MihomoHttpResult> {
  const secret = readClashSecret()
  const url = new URL(pathname, 'http://mihomo.local')
  const method = init?.method ?? 'GET'
  const body = init?.body

  return new Promise((resolve) => {
    const req = http.request(
      {
        socketPath: controllerSocketPath(),
        path: `${url.pathname}${url.search}`,
        method,
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
          Host: 'localhost',
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk)
        })
        res.on('end', () => {
          const status = res.statusCode ?? 0
          const text = Buffer.concat(chunks).toString('utf8')
          if (status === 204 || text.length === 0) {
            resolve({ ok: status >= 200 && status < 300, status, data: null })
            return
          }
          let data: unknown = null
          try {
            data = JSON.parse(text) as unknown
          } catch {
            data = text
          }
          resolve({
            ok: status >= 200 && status < 300,
            status,
            data,
          })
        })
      },
    )
    req.on('error', () => {
      resolve({ ok: false, status: 0, data: null })
    })
    if (body) {
      req.write(body)
    }
    req.end()
  })
}

/**
 * Waits until the controller socket answers GET /version.
 * @param timeoutMs - Give-up time.
 * @returns True when ready.
 */
export async function waitForMihomo(timeoutMs = 8000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const version = await mihomoFetch<{ version?: string }>('/version')
    if (version?.version) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 120))
  }
  return false
}

/**
 * Builds a Clash Verge ProxyViewV1 from GET /proxies.
 * @returns Proxy view payload.
 */
export async function buildProxyView(): Promise<Record<string, unknown>> {
  const payload = await mihomoFetch<MihomoProxies>('/proxies')
  const proxies = payload?.proxies ?? {}
  const records: Record<string, unknown> = {}
  const groups: unknown[] = []
  const standalone: string[] = []
  const caps = { udp: false, xudp: false, tfo: false, mptcp: false, smux: false }

  for (const [name, proxy] of Object.entries(proxies)) {
    const type = proxy.type ?? 'Unknown'
    const history = (proxy.history ?? []).map((row) => ({
      time: row.time ?? '',
      delay: row.delay ?? 0,
    }))
    if (GROUP_TYPES.has(type) || name === 'GLOBAL') {
      const members = (proxy.all ?? []).map((memberName) => {
        const member = proxies[memberName]
        if (member && (GROUP_TYPES.has(member.type ?? '') || memberName === 'GLOBAL')) {
          return { kind: 'group', name: memberName }
        }
        const recordId = `core:${memberName}`
        return { kind: 'node', name: memberName, recordId }
      })
      groups.push({
        ...caps,
        udp: Boolean(proxy.udp),
        name,
        type,
        alive: proxy.alive !== false,
        now: proxy.now,
        hidden: proxy.hidden,
        icon: proxy.icon,
        history,
        members,
      })
      continue
    }
    const recordId = `core:${name}`
    records[recordId] = {
      ...caps,
      udp: Boolean(proxy.udp),
      xudp: Boolean(proxy.xudp),
      tfo: Boolean(proxy.tfo),
      recordId,
      name,
      type,
      alive: proxy.alive !== false,
      history,
      hidden: proxy.hidden,
      icon: proxy.icon,
      source: { kind: 'core', proxyName: name },
    }
    if (name !== 'DIRECT' && name !== 'REJECT' && name !== 'PASS') {
      standalone.push(recordId)
    }
  }

  const globalGroup = groups.find((row) => (row as { name?: string }).name === 'GLOBAL') ?? null
  return {
    schemaVersion: 1,
    orderSource: payload ? 'runtime' : 'fallback',
    providerState: payload ? 'ready' : 'unavailable',
    global: globalGroup,
    direct: 'DIRECT',
    groups,
    records,
    standalone,
    providers: [],
  }
}

/**
 * Reads mixed-port / secret for get_clash_info.
 * `server` is empty: the renderer talks to Mihomo through Electron IPC, not TCP.
 * @returns Clash info payload.
 */
export function clashInfoPayload(): {
  mixed_port: number
  socks_port: number
  server: string
  secret: string
} {
  return {
    mixed_port: CLASH_MIXED_PORT,
    socks_port: CLASH_MIXED_PORT,
    server: '',
    secret: readClashSecret(),
  }
}

/**
 * PATCHes Mihomo configs.
 * @param body - Partial config.
 */
export async function patchMihomoConfig(body: Record<string, unknown>): Promise<void> {
  await mihomoFetch('/configs', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}
