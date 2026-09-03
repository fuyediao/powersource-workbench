import http from 'node:http'
import https from 'node:https'
import type { IncomingMessage } from 'node:http'

import { CLASH_MIXED_PORT } from '../../shared/clash'
import { isSidecarRunning } from './sidecar'

/** Media-unlock probe result row (`UnlockItem` in the Rust `clash_verge_media_unlock` crate). */
export type UnlockItem = {
  name: string
  status: string
  region?: string | null
  check_time?: string | null
}

type ProbeResult = { status: string; region?: string | null }

type ProxiedResponse = {
  status: number
  finalUrl: string
  location: string | null
  body: string
}

const REQUEST_TIMEOUT_MS = 12_000
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'

/**
 * Converts an ISO 3166-1 alpha-2 code to a flag emoji.
 * @param code - Two-letter country code.
 * @returns Flag emoji, or an empty string when the code is not two letters.
 */
function countryCodeToEmoji(code: string): string {
  const upper = code.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(upper)) {
    return ''
  }
  const base = 0x1f1e6
  return String.fromCodePoint(
    base + (upper.charCodeAt(0) - 65),
    base + (upper.charCodeAt(1) - 65),
  )
}

/**
 * Formats a region chip as `🇺🇸US`.
 * @param code - Country code, possibly with extra path segments.
 * @returns Display string, or null when empty.
 */
function formatRegion(code: string | null | undefined): string | null {
  if (!code) {
    return null
  }
  const upper = code.trim().split('-')[0]?.toUpperCase() ?? ''
  if (!upper) {
    return null
  }
  const emoji = countryCodeToEmoji(upper)
  return emoji ? `${emoji}${upper}` : upper
}

/**
 * GETs a URL through the running Mihomo mixed-port proxy so results reflect the active
 * outbound route, not the host machine's direct network path.
 * @param url - Absolute URL.
 * @param options - Extra headers / whether to follow redirects.
 * @returns Status code, final URL, redirect Location, and body text.
 */
function proxiedGet(
  url: string,
  options?: { headers?: Record<string, string>; followRedirects?: boolean },
): Promise<ProxiedResponse> {
  const target = new URL(url)
  if (target.protocol !== 'https:') {
    return Promise.reject(
      new Error(`Unsupported unlock probe protocol: ${target.protocol}`),
    )
  }
  const follow = options?.followRedirects ?? true
  const port = target.port ? Number(target.port) : 443
  const headers: Record<string, string> = {
    'User-Agent': BROWSER_UA,
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity',
    Host: target.host,
    ...options?.headers,
  }
  return new Promise((resolve, reject) => {
    const connectReq = http.request({
      host: '127.0.0.1',
      port: CLASH_MIXED_PORT,
      method: 'CONNECT',
      path: `${target.hostname}:${port}`,
      timeout: REQUEST_TIMEOUT_MS,
    })
    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy()
        reject(new Error(`proxy CONNECT ${res.statusCode ?? 0}`))
        return
      }
      const req = https.request(
        {
          host: target.hostname,
          port,
          path: `${target.pathname}${target.search}`,
          method: 'GET',
          headers,
          timeout: REQUEST_TIMEOUT_MS,
          servername: target.hostname,
          agent: false,
          createConnection: () => socket,
        },
        (httpsRes: IncomingMessage) => {
          const locationHeader = httpsRes.headers.location
          const location = locationHeader
            ? new URL(locationHeader, url).toString()
            : null
          if (
            follow &&
            location &&
            httpsRes.statusCode &&
            httpsRes.statusCode >= 300 &&
            httpsRes.statusCode < 400
          ) {
            httpsRes.resume()
            proxiedGet(location, options).then(resolve, reject)
            return
          }
          const chunks: Buffer[] = []
          httpsRes.on('data', (chunk: Buffer) => chunks.push(chunk))
          httpsRes.on('end', () => {
            resolve({
              status: httpsRes.statusCode ?? 0,
              finalUrl: url,
              location,
              body: Buffer.concat(chunks).toString('utf8'),
            })
          })
        },
      )
      req.on('timeout', () => req.destroy(new Error('timeout')))
      req.on('error', reject)
      req.end()
    })
    connectReq.on('timeout', () => connectReq.destroy(new Error('timeout')))
    connectReq.on('error', reject)
    connectReq.end()
  })
}

/**
 * Runs one probe with a hard timeout, mapping any failure to `Failed (Network Connection)`.
 * @param probe - Probe function.
 * @returns Probe result.
 */
async function runProbe(probe: () => Promise<ProbeResult>): Promise<ProbeResult> {
  try {
    return await probe()
  } catch {
    return { status: 'Failed (Network Connection)' }
  }
}

/**
 * True when an HTTP status means the title page is reachable (including login redirects).
 * @param status - HTTP status.
 * @returns Whether Netflix treated the title as available.
 */
function isNetflixTitleOk(status: number): boolean {
  return status === 200 || status === 301 || status === 302
}

/**
 * Netflix: Fast.com CDN short-circuit, then Originals vs catalog title IDs
 * (Clash Verge `media_unlock_checker/netflix.rs`).
 * @returns Probe result.
 */
async function checkNetflix(): Promise<ProbeResult> {
  try {
    const cdn = await proxiedGet(
      'https://api.fast.com/netflix/speedtest/v2?https=true&token=YXNkZmFzZGxmbnNkYWZoYXNkZmhrYWxm&urlCount=5',
    )
    if (cdn.status === 403) {
      return { status: 'No' }
    }
    if (cdn.status === 200) {
      const parsed = JSON.parse(cdn.body) as {
        targets?: Array<{ location?: { country?: string } }>
      }
      const country = parsed.targets?.[0]?.location?.country
      if (country) {
        return { status: 'Yes', region: formatRegion(country) }
      }
    }
  } catch {
    // Fall through to title probes when the CDN API is unavailable.
  }

  const [titleA, titleB] = await Promise.all([
    proxiedGet('https://www.netflix.com/title/81280792', { followRedirects: false }),
    proxiedGet('https://www.netflix.com/title/70143836', { followRedirects: false }),
  ])
  if (titleA.status === 404 && titleB.status === 404) {
    return { status: 'Originals Only' }
  }
  if (titleA.status === 403 || titleB.status === 403) {
    return { status: 'No' }
  }
  if (!isNetflixTitleOk(titleA.status) && !isNetflixTitleOk(titleB.status)) {
    return { status: 'Failed' }
  }

  const regionProbe = await proxiedGet('https://www.netflix.com/title/80018499', {
    followRedirects: false,
  })
  const loc = regionProbe.location ?? regionProbe.finalUrl
  const segment = new URL(loc).pathname.split('/').filter(Boolean)[0]
  if (segment && /^[a-z]{2}(-[a-z]{2})?$/i.test(segment) && segment.toLowerCase() !== 'title') {
    return { status: 'Yes', region: formatRegion(segment) }
  }
  return { status: 'Yes', region: formatRegion('US') }
}

/** YouTube Premium availability page. */
async function checkYoutubePremium(): Promise<ProbeResult> {
  const { status, body } = await proxiedGet('https://www.youtube.com/premium')
  if (status !== 200) {
    return { status: 'Failed' }
  }
  const unavailable = /premium is not available in your country/i.test(body)
  return { status: unavailable ? 'No' : 'Yes' }
}

/** Disney+ landing page redirects to `/unavailable` in unsupported regions. */
async function checkDisneyPlus(): Promise<ProbeResult> {
  const { finalUrl, body } = await proxiedGet('https://www.disneyplus.com/', {
    followRedirects: true,
  })
  if (/unavailable|preview/i.test(finalUrl) || /unavailable/i.test(body.slice(0, 4000))) {
    return { status: 'No' }
  }
  return { status: 'Yes' }
}

/**
 * ChatGPT Web compliance cookie endpoint (Clash Verge `chatgpt.rs`), with the iOS
 * landing page as a fallback when the API is unreachable.
 * @returns Probe result.
 */
async function checkChatGpt(): Promise<ProbeResult> {
  const web = await proxiedGet('https://api.openai.com/compliance/cookie_requirements')
  const webBody = web.body.toLowerCase()
  if (/unsupported_country/.test(webBody)) {
    return { status: 'No' }
  }
  if (web.status >= 200 && web.status < 400) {
    return { status: 'Yes' }
  }

  const ios = await proxiedGet('https://ios.chat.openai.com/')
  const iosBody = ios.body.toLowerCase()
  if (iosBody.includes('you may be connected to a disallowed isp')) {
    return { status: 'Disallowed ISP' }
  }
  if (iosBody.includes('request is not allowed. please try again later.')) {
    return { status: 'Yes' }
  }
  if (iosBody.includes('sorry, you have been blocked')) {
    return { status: 'No' }
  }
  return { status: 'Failed' }
}

/**
 * Spotify country-selector API (Clash Verge `spotify.rs`).
 * @returns Probe result.
 */
async function checkSpotify(): Promise<ProbeResult> {
  const { status, body, finalUrl } = await proxiedGet(
    'https://www.spotify.com/api/content/v1/country-selector?platform=web&format=json',
  )
  if (status === 403 || status === 451) {
    return { status: 'No' }
  }
  if (status < 200 || status >= 300) {
    return { status: 'Failed' }
  }
  if (/not available in your country/i.test(body)) {
    return { status: 'No' }
  }
  const marker = '"countryCode":"'
  const idx = body.indexOf(marker)
  let region: string | null = null
  if (idx >= 0) {
    const rest = body.slice(idx + marker.length)
    const end = rest.indexOf('"')
    if (end > 0) {
      region = formatRegion(rest.slice(0, end))
    }
  }
  if (!region) {
    try {
      const path = new URL(finalUrl).pathname.split('/').filter(Boolean)[0]
      if (path && path !== 'api') {
        region = formatRegion(path)
      }
    } catch {
      region = null
    }
  }
  return { status: 'Yes', region }
}

/**
 * Prime Video homepage HTML (`isServiceRestricted` / `currentTerritory`, Clash Verge
 * `prime_video.rs`). The old `/region/eu/av/router` URL returns HTML, not JSON.
 * @returns Probe result.
 */
async function checkPrimeVideo(): Promise<ProbeResult> {
  const { status, body } = await proxiedGet('https://www.primevideo.com')
  if (status < 200 || status >= 400) {
    return { status: 'Failed' }
  }
  if (body.includes('isServiceRestricted')) {
    return { status: 'No' }
  }
  const match = body.match(/"currentTerritory"\s*:\s*"([^"]+)"/)
  if (match?.[1]) {
    return { status: 'Yes', region: formatRegion(match[1]) }
  }
  return { status: 'Failed' }
}

/** TikTok's main site redirects unsupported regions to a notice page. */
async function checkTikTok(): Promise<ProbeResult> {
  const { finalUrl, status } = await proxiedGet('https://www.tiktok.com/')
  if (status !== 200) {
    return { status: 'Failed' }
  }
  return { status: /tiktok\.com\/(illegal-crawl|unavailable)/i.test(finalUrl) ? 'No' : 'Yes' }
}

/** Bing search with a locale hint; a redirect to `cn.bing.com` marks a mainland-China exit. */
async function checkBing(): Promise<ProbeResult> {
  const { finalUrl, status } = await proxiedGet('https://www.bing.com/search?q=1&ensearch=1')
  if (status !== 200) {
    return { status: 'Failed' }
  }
  return { status: /cn\.bing\.com/i.test(finalUrl) ? 'No' : 'Yes' }
}

/** Probe table: display name -> checker. Order matches the Unlock page's default sort. */
const PROBES: Array<{ name: string; check: () => Promise<ProbeResult> }> = [
  { name: 'Netflix', check: checkNetflix },
  { name: 'YouTube Premium', check: checkYoutubePremium },
  { name: 'Disney+', check: checkDisneyPlus },
  { name: 'ChatGPT', check: checkChatGpt },
  { name: 'Spotify', check: checkSpotify },
  { name: 'Prime Video', check: checkPrimeVideo },
  { name: 'TikTok', check: checkTikTok },
  { name: 'Bing', check: checkBing },
]

/**
 * Default (unrun) unlock item list (`get_unlock_items`).
 * @returns Items with `status: 'Pending'`.
 */
export function defaultUnlockItems(): UnlockItem[] {
  return PROBES.map(({ name }) => ({ name, status: 'Pending', region: null, check_time: null }))
}

/**
 * Runs media-unlock probes through the Mihomo mixed port (`check_media_unlock`).
 * @param onlyName - When set, run that one service instead of the full table.
 * @returns Result rows with a real status and check time.
 */
export async function checkMediaUnlock(onlyName?: string): Promise<UnlockItem[]> {
  if (!isSidecarRunning()) {
    return PROBES.map(({ name }) => ({
      name,
      status: 'Failed (Network Connection)',
      region: null,
      check_time: null,
    }))
  }
  const now = new Date().toLocaleString()
  const selected = onlyName
    ? PROBES.filter((probe) => probe.name.toLowerCase() === onlyName.trim().toLowerCase())
    : PROBES
  const targets = selected.length > 0 ? selected : PROBES
  const results = await Promise.all(
    targets.map(async ({ name, check }) => {
      const result = await runProbe(check)
      return { name, status: result.status, region: result.region ?? null, check_time: now }
    }),
  )
  return results
}
