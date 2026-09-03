import type { AiConnectivityModelResult, AiEgressInfo } from '@/services/ai-api'
import type { AiProviderDto } from '@/services/ai-api'
import { testAiProviderBrowser } from '@/services/ai-keys-api'
import { isLocalAiProviderId } from '@/constants/local-ai-providers'
import {
  localAiModelsUrl,
  type LocalAiBaseUrlState,
} from '@/utils/settings/local-ai-prefs'

/** One hop of a dual-path connection test. */
export interface HopResult {
  ok: boolean
  message: string
  skipped?: boolean
}

export type ConnectivityCellStatus = 'ok' | 'fail' | 'skip' | 'na'

export interface ConnectivityTableCell {
  status: ConnectivityCellStatus
  message: string
}

export interface ConnectivityTableRow {
  model: string
  label: string
  browser: ConnectivityTableCell
  server: ConnectivityTableCell
}

export interface DualPathIpCheckResult {
  browserIp: string
  serverIp: string
  rows: ConnectivityTableRow[]
}

type Translate = (key: string, options?: Record<string, unknown>) => string

/**
 * Absolute models-list URL for a catalog row (honours local base URL overrides).
 * @param provider - Catalog DTO.
 * @param localBaseUrls - Optional local base URL overrides.
 * @returns Absolute URL or empty when unsupported / missing base.
 */
export function providerModelsUrl(
  provider: AiProviderDto,
  localBaseUrls?: LocalAiBaseUrlState,
): string {
  if (provider.isLocal || isLocalAiProviderId(provider.id)) {
    return localAiModelsUrl(provider.id, provider.modelsPath, localBaseUrls)
  }
  const base = provider.baseUrl?.replace(/\/$/, '') ?? ''
  const path = provider.modelsPath?.startsWith('/')
    ? provider.modelsPath
    : provider.modelsPath
      ? `/${provider.modelsPath}`
      : ''
  if (!base || !path) {
    return ''
  }
  return `${base}${path}`
}

/**
 * Formats an egress IP for display (ip + optional country/city).
 * @param egress - Server or browser IP info.
 * @param options - `maskIp` redacts the last two IPv4 octets.
 * @returns Human-readable label.
 */
export function formatEgressLabel(
  egress: Pick<AiEgressInfo, 'ip' | 'country' | 'city' | 'error'>,
  options?: { maskIp?: boolean },
): string {
  if (egress.error && (!egress.ip || egress.ip === 'Error')) {
    return egress.error
  }
  let ip = egress.ip || '—'
  if (options?.maskIp && ip !== 'Error' && ip !== '—') {
    ip = maskIpAddress(ip)
  }
  let label = ip
  if (egress.country) {
    label += ` (${egress.country}${egress.city ? `, ${egress.city}` : ''})`
  }
  return label
}

/**
 * Redacts an IP for display.
 * @param ip - Raw IP string.
 * @returns Masked IP.
 */
export function maskIpAddress(ip: string): string {
  const trimmed = ip.trim()
  if (!trimmed || trimmed === 'Error' || trimmed === '—') {
    return trimmed
  }
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(trimmed)
  if (v4) {
    return `${v4[1]}.${v4[2]}.XXX.XXX`
  }
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').filter((part) => part.length > 0)
    if (parts.length >= 2) {
      return `${parts[0]}:${parts[1]}:XXXX:XXXX:XXXX:XXXX`
    }
  }
  return 'XXX'
}

/**
 * Resolves public browser egress via public IP APIs.
 * @returns Egress info.
 */
export async function checkBrowserEgress(): Promise<AiEgressInfo> {
  const services = [
    'https://ipapi.co/json/',
    'https://api.ipify.org?format=json',
    'https://ip-api.com/json/',
  ]
  for (const service of services) {
    try {
      const response = await fetch(service, { method: 'GET', mode: 'cors' })
      if (!response.ok) {
        continue
      }
      const data = (await response.json()) as Record<string, string>
      if (service.includes('ipify')) {
        return { ip: data.ip }
      }
      if (service.includes('ipapi.co')) {
        return {
          ip: data.ip,
          country: data.country_name,
          region: data.region,
          city: data.city,
          isp: data.org,
        }
      }
      if (service.includes('ip-api.com')) {
        return {
          ip: data.query || data.ip,
          country: data.country,
          region: data.regionName,
          city: data.city,
          isp: data.isp,
        }
      }
    } catch {
      // try next
    }
  }
  return { ip: 'Error', error: 'Failed to check IP' }
}

/**
 * Localises a hop message for the connectivity table.
 * @param hop - Hop outcome.
 * @param t - Translator.
 * @returns Display message.
 */
function localiseHopMessage(hop: HopResult, t: Translate): string {
  if (hop.skipped || hop.message === 'missing_key') {
    return t('settings.ai.ipCheck.missingKey')
  }
  if (hop.message === 'unsupported') {
    return t('settings.ai.ipCheck.unsupportedProvider')
  }
  if (hop.ok || hop.message === 'ok') {
    return t('settings.ai.ipCheck.apiSuccess')
  }
  if (hop.message.includes('Network') || hop.message === 'network_error') {
    return t('settings.ai.ipCheck.networkError')
  }
  return hop.message
}

/**
 * Builds a table cell from a browser hop.
 * @param hop - Hop outcome.
 * @param t - Translator.
 * @returns Display cell.
 */
function cellFromHop(hop: HopResult, t: Translate): ConnectivityTableCell {
  if (hop.skipped) {
    return { status: 'skip', message: localiseHopMessage(hop, t) }
  }
  return {
    status: hop.ok ? 'ok' : 'fail',
    message: localiseHopMessage(hop, t),
  }
}

/**
 * Builds a table cell from a server connectivity model row.
 * @param row - Server model result.
 * @param t - Translator.
 * @returns Display cell.
 */
function cellFromServerRow(row: AiConnectivityModelResult, t: Translate): ConnectivityTableCell {
  if (row.skipped) {
    return {
      status: 'skip',
      message: row.message?.trim() ? row.message : t('settings.ai.ipCheck.skippedNoKey'),
    }
  }
  return {
    status: row.ok ? 'ok' : 'fail',
    message: row.ok ? t('settings.ai.ipCheck.apiSuccess') : row.message,
  }
}

/**
 * Merges browser hop results and server connectivity rows into table rows.
 * @param order - Provider ids in display order.
 * @param labelByModel - Localised vendor names.
 * @param browserByModel - Browser hop per provider id.
 * @param serverModels - Rows from POST /ai/settings/connectivity.
 * @param t - Translator.
 * @returns Ordered table rows.
 */
export function buildConnectivityTableRows(
  order: string[],
  labelByModel: Record<string, string>,
  browserByModel: Partial<Record<string, HopResult>>,
  serverModels: AiConnectivityModelResult[],
  t: Translate,
): ConnectivityTableRow[] {
  const serverByModel = new Map(serverModels.map((row) => [row.model, row]))
  const ids = new Set<string>([...order, ...serverByModel.keys(), ...Object.keys(browserByModel)])
  const rows: ConnectivityTableRow[] = []
  for (const model of order.length > 0 ? order : [...ids]) {
    const browserHop = browserByModel[model]
    const serverRow = serverByModel.get(model)
    if (!browserHop && !serverRow) {
      continue
    }
    rows.push({
      model,
      label: labelByModel[model] ?? model,
      browser: browserHop
        ? cellFromHop(browserHop, t)
        : { status: 'na', message: t('settings.ai.ipCheck.notTested') },
      server: serverRow
        ? cellFromServerRow(serverRow, t)
        : { status: 'na', message: t('settings.ai.ipCheck.notTested') },
    })
  }
  // Append any server-only ids not in order.
  for (const row of serverModels) {
    if (order.includes(row.model)) {
      continue
    }
    if (rows.some((r) => r.model === row.model)) {
      continue
    }
    rows.push({
      model: row.model,
      label: labelByModel[row.model] ?? row.model,
      browser: { status: 'na', message: t('settings.ai.ipCheck.notTested') },
      server: cellFromServerRow(row, t),
    })
  }
  return rows
}

/**
 * Tailwind text color for a connectivity cell.
 * @param status - Cell status.
 * @returns Class string.
 */
export function connectivityCellClass(status: ConnectivityCellStatus): string {
  switch (status) {
    case 'ok':
      return 'text-emerald-500'
    case 'fail':
      return 'text-red-500'
    default:
      return 'text-muted'
  }
}

/**
 * Prefix mark for a connectivity cell.
 * @param status - Cell status.
 * @returns Check / cross / dash.
 */
export function connectivityCellMark(status: ConnectivityCellStatus): string {
  switch (status) {
    case 'ok':
      return '✓'
    case 'fail':
      return '✗'
    default:
      return '–'
  }
}

/**
 * Runs browser egress + vendor probes + server connectivity.
 * Local providers are probed on the browser hop only (Server = local-only).
 * @param keys - Current AI key bag.
 * @param catalog - Merged cloud + local provider catalog.
 * @param postConnectivity - Server hop fetcher.
 * @param t - Translator.
 * @param resolveLabel - Maps provider id to display label.
 * @param localBaseUrls - Device-local base URL overrides.
 * @returns Dual-path table payload.
 */
export async function runDualPathIpCheck(
  keys: Record<string, string>,
  catalog: AiProviderDto[],
  postConnectivity: () => Promise<{ egress: AiEgressInfo; models: AiConnectivityModelResult[] }>,
  t: Translate,
  resolveLabel: (provider: AiProviderDto) => string,
  localBaseUrls?: LocalAiBaseUrlState,
): Promise<DualPathIpCheckResult> {
  const browserByModel: Partial<Record<string, HopResult>> = {}
  const localProviders = catalog.filter((p) => p.isLocal || isLocalAiProviderId(p.id))
  const cloudConfigured = catalog.filter(
    (p) => !(p.isLocal || isLocalAiProviderId(p.id)) && (keys[p.id] ?? '').trim(),
  )
  const toProbe = [...localProviders, ...cloudConfigured]

  const browserTests = toProbe.map(async (provider) => {
    const isLocal = Boolean(provider.isLocal || isLocalAiProviderId(provider.id))
    const result = await testAiProviderBrowser(
      provider.apiStyle,
      providerModelsUrl(provider, localBaseUrls),
      keys[provider.id] ?? '',
    )
    browserByModel[provider.id] = {
      ok: result.ok,
      message: result.message,
      skipped:
        !isLocal &&
        (result.message === 'missing_key' || result.message === 'unsupported'),
    }
  })

  const [browserEgress, serverConn] = await Promise.all([
    checkBrowserEgress(),
    postConnectivity(),
    ...browserTests,
  ])

  const labelByModel: Record<string, string> = {}
  for (const provider of catalog) {
    labelByModel[provider.id] = resolveLabel(provider)
  }

  const serverModels: AiConnectivityModelResult[] = [
    ...localProviders.map((p) => ({
      model: p.id,
      ok: false,
      message: t('settings.ai.ipCheck.localOnly'),
      skipped: true,
    })),
    ...serverConn.models.filter((row) => !isLocalAiProviderId(row.model)),
  ]

  return {
    browserIp: formatEgressLabel(browserEgress),
    serverIp: formatEgressLabel(serverConn.egress, { maskIp: true }),
    rows: buildConnectivityTableRows(
      toProbe.map((p) => p.id),
      labelByModel,
      browserByModel,
      serverModels,
      t,
    ),
  }
}
