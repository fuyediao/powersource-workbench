/**
 * Thin Clawd on Desk reporter for Workbench Ask.
 *
 * Reads `~/.clawd/runtime.json` for the live port. Posts only when Clawd has
 * written a managed `clawd-bridge.json` into this app's userData.
 */

import { app } from 'electron'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import {
  CLAWD_WORKBENCH_AGENT_ID,
  CLAWD_WORKBENCH_BRIDGE_FILE,
  isManagedClawdBridge,
  type ClawdBridgeActivity,
} from '../shared/clawd-bridge'

const SERVER_ID = 'clawd-on-desk'
const SERVER_HEADER = 'x-clawd-server'
const PORTS = Object.freeze([23333, 23334, 23335, 23336, 23337])
const PROBE_TIMEOUT_MS = 500
const STATE_TIMEOUT_MS = 1000
const DISCOVERY_COOLDOWN_MS = 1000
const BRIDGE_CACHE_MS = 2000
const MAX_RESPONSE_BYTES = 64 * 1024

type HttpResult = {
  ok: boolean
  statusCode?: number
  body?: string
  aborted?: boolean
  reason?: string
}

let cachedPort: number | null = null
let discoveryPromise: Promise<number | null> | null = null
let retryAfter = 0
let bridgeCache: { at: number; enabled: boolean } | null = null

/**
 * Returns whether `value` is a Clawd HTTP port in the reserved range.
 * @param value - Candidate port.
 * @returns True when the port is in 23333-23337.
 */
function validPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && PORTS.includes(value)
}

/**
 * Returns the path Clawd writes while its HTTP server is up.
 * @returns Absolute runtime.json path.
 */
function runtimePath(): string {
  return path.join(os.homedir(), '.clawd', 'runtime.json')
}

/**
 * Returns whether Clawd Install has placed a managed bridge in userData.
 * @returns True when Workbench should post to Clawd.
 */
export function isClawdBridgeEnabled(): boolean {
  const now = Date.now()
  if (bridgeCache && now - bridgeCache.at < BRIDGE_CACHE_MS) {
    return bridgeCache.enabled
  }
  let enabled = false
  try {
    const filePath = path.join(app.getPath('userData'), CLAWD_WORKBENCH_BRIDGE_FILE)
    const raw = fs.readFileSync(filePath, 'utf8')
    const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
    enabled = isManagedClawdBridge(JSON.parse(text))
  } catch {
    enabled = false
  }
  bridgeCache = { at: now, enabled }
  return enabled
}

/**
 * Performs one HTTP request against a Clawd loopback port.
 * @param port - Discovered Clawd port.
 * @param method - HTTP method.
 * @param pathname - Path beginning with `/`.
 * @param body - JSON body, or undefined.
 * @param options - Timeout and abort.
 * @returns Status, body, or a failure reason.
 */
function request(
  port: number,
  method: string,
  pathname: string,
  body: unknown,
  options: { timeoutMs: number; signal?: AbortSignal; maxResponseBytes?: number } = {
    timeoutMs: STATE_TIMEOUT_MS,
  },
): Promise<HttpResult> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: HttpResult): void => {
      if (settled) return
      settled = true
      if (options.signal && abortHandler) {
        options.signal.removeEventListener('abort', abortHandler)
      }
      resolve(value)
    }
    const payload = body === undefined ? null : JSON.stringify(body)
    const maxResponseBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES
    const chunks: Buffer[] = []
    let responseBytes = 0
    let abortHandler: (() => void) | null = null

    let req: http.ClientRequest
    try {
      req = http.request(
        {
          host: '127.0.0.1',
          port,
          method,
          path: pathname,
          headers:
            payload === null
              ? {}
              : {
                  'Content-Type': 'application/json',
                  'Content-Length': Buffer.byteLength(payload),
                },
        },
        (res) => {
          res.on('data', (chunk: Buffer) => {
            responseBytes += chunk.length
            if (responseBytes > maxResponseBytes) {
              req.destroy()
              finish({ ok: false, reason: 'response-too-large' })
              return
            }
            chunks.push(chunk)
          })
          res.on('end', () => {
            const server = String(res.headers[SERVER_HEADER] || '')
            if (server !== SERVER_ID) {
              finish({ ok: false, reason: 'wrong-server' })
              return
            }
            const statusCode = res.statusCode ?? 0
            finish({
              ok: statusCode >= 200 && statusCode < 300,
              statusCode,
              body: Buffer.concat(chunks).toString('utf8'),
            })
          })
          res.on('error', () => finish({ ok: false, reason: 'response-error' }))
        },
      )
    } catch {
      finish({ ok: false, reason: 'request-create-failed' })
      return
    }

    req.on('error', () => finish({ ok: false, reason: 'request-error' }))
    req.setTimeout(options.timeoutMs, () => {
      req.destroy()
      finish({ ok: false, reason: 'timeout' })
    })
    abortHandler = () => {
      req.destroy()
      finish({ ok: false, reason: 'aborted', aborted: true })
    }
    if (options.signal) {
      if (options.signal.aborted) {
        abortHandler()
        return
      }
      options.signal.addEventListener('abort', abortHandler, { once: true })
    }
    if (payload !== null) req.write(payload)
    req.end()
  })
}

/**
 * Reads the port Clawd last wrote, if the file is a Clawd runtime document.
 * @returns Port, or null.
 */
function runtimePort(): number | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(runtimePath(), 'utf8'))
    if (
      parsed
      && typeof parsed === 'object'
      && !Array.isArray(parsed)
      && (parsed as { app?: unknown }).app === SERVER_ID
      && validPort((parsed as { port?: unknown }).port)
    ) {
      return (parsed as { port: number }).port
    }
  } catch {
    return null
  }
  return null
}

/**
 * Probes one port for Clawd's GET /state identity.
 * @param port - Candidate port.
 * @returns True when the server is Clawd.
 */
async function probe(port: number): Promise<boolean> {
  const result = await request(port, 'GET', '/state', undefined, {
    timeoutMs: PROBE_TIMEOUT_MS,
    maxResponseBytes: 4096,
  })
  if (!result.ok || result.statusCode !== 200 || !result.body) return false
  try {
    const parsed: unknown = JSON.parse(result.body)
    return Boolean(
      parsed
        && typeof parsed === 'object'
        && (parsed as { app?: unknown }).app === SERVER_ID
        && (parsed as { ok?: unknown }).ok === true,
    )
  } catch {
    return false
  }
}

/**
 * Walks runtime.json then the reserved port range until Clawd answers.
 * @returns Live port, or null.
 */
async function discoverUncached(): Promise<number | null> {
  const preferred = runtimePort()
  const candidates =
    preferred === null ? [...PORTS] : [preferred, ...PORTS.filter((port) => port !== preferred)]
  for (const port of candidates) {
    if (await probe(port)) {
      cachedPort = port
      retryAfter = 0
      return port
    }
  }
  cachedPort = null
  retryAfter = Date.now() + DISCOVERY_COOLDOWN_MS
  return null
}

/**
 * Returns a cached Clawd port, discovering one when needed.
 * @param signal - Optional abort for the caller.
 * @returns Port, or null when Clawd is offline.
 */
async function discover(signal?: AbortSignal): Promise<number | null> {
  if (validPort(cachedPort)) return cachedPort
  if (Date.now() < retryAfter) return null
  if (!discoveryPromise) {
    discoveryPromise = discoverUncached().finally(() => {
      discoveryPromise = null
    })
  }
  if (!signal) return discoveryPromise
  if (signal.aborted) return null
  return new Promise((resolve) => {
    const onAbort = (): void => {
      signal.removeEventListener('abort', onAbort)
      resolve(null)
    }
    signal.addEventListener('abort', onAbort, { once: true })
    void discoveryPromise!.then((port) => {
      signal.removeEventListener('abort', onAbort)
      resolve(port)
    })
  })
}

/**
 * POSTs JSON to a Clawd path, rediscovering the port once on failure.
 * @param pathname - `/state`.
 * @param body - JSON payload.
 * @param options - Timeout, abort, retry.
 * @returns HTTP result.
 */
async function post(
  pathname: string,
  body: unknown,
  options: {
    timeoutMs: number
    signal?: AbortSignal
    retry?: boolean
    maxResponseBytes?: number
  },
): Promise<HttpResult> {
  const port = await discover(options.signal)
  if (port === null) return { ok: false, reason: 'clawd-unavailable' }
  const first = await request(port, 'POST', pathname, body, options)
  if (first.ok || first.aborted || options.retry === false) return first
  cachedPort = null
  const retryPort = await discover(options.signal)
  if (retryPort === null) return first
  return request(retryPort, 'POST', pathname, body, {
    timeoutMs: options.timeoutMs,
    signal: options.signal,
    maxResponseBytes: options.maxResponseBytes,
  })
}

/**
 * Posts one lifecycle event to Clawd `/state` when the bridge is installed.
 * @param activity - Session event.
 * @returns Nothing.
 */
export function reportClawdState(activity: ClawdBridgeActivity): void {
  if (!isClawdBridgeEnabled()) return
  const sessionId = activity.sessionId.trim()
  const event = activity.event.trim()
  const state = activity.state.trim()
  if (!sessionId || !event || !state) return
  const body: Record<string, unknown> = {
    agent_id: CLAWD_WORKBENCH_AGENT_ID,
    hook_source: 'workbench-bridge',
    session_id: sessionId,
    event,
    state,
  }
  if (activity.cwd?.trim()) body.cwd = activity.cwd.trim()
  if (activity.toolName?.trim()) body.tool_name = activity.toolName.trim()
  void post('/state', body, {
    timeoutMs: STATE_TIMEOUT_MS,
    maxResponseBytes: 4096,
  }).catch(() => undefined)
}
