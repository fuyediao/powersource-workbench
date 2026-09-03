import fs from 'node:fs'
import vm from 'node:vm'
import { dump as dumpYaml, load as loadYaml } from 'js-yaml'

import { CLASH_MIXED_PORT } from '../../shared/clash'
import {
  clashDataDir,
  controllerSocketPath,
  ensureClashDirs,
  loadProfilesIndex,
  loadVergeStore,
  profilePath,
  readClashSecret,
} from './store'
import type { ClashProfileItem, ClashValidationOutcome } from './types'

/** A single chain-item log line: `[level, message]`. */
type LogLine = [string, string]

/** Sequence override shape (`prepend` / `append` / `delete`), matching Clash Verge's `SeqMap`. */
type SeqMap = {
  prepend: unknown[]
  append: unknown[]
  delete: string[]
}

type Mapping = Record<string, unknown>

const SCRIPT_TIMEOUT_MS = 5000

/** App-owned top-level keys restored after manual merge/script overrides. */
const CONTROL_PLANE_KEYS = [
  'external-controller',
  'external-controller-unix',
  'external-controller-pipe',
  'external-controller-cors',
  'secret',
  'mixed-port',
  'socks-port',
  'port',
  'redir-port',
  'tproxy-port',
  'tun',
  'mode',
  'allow-lan',
  'log-level',
  'ipv6',
  'unified-delay',
]

/** Fields written first / in a stable order by `sortConfig`. */
const HANDLE_FIELDS = [
  'mode',
  'redir-port',
  'tproxy-port',
  'mixed-port',
  'socks-port',
  'port',
  'allow-lan',
  'log-level',
  'ipv6',
  'external-controller',
  'secret',
  'unified-delay',
]

/** Bulky list fields written last. */
const DEFAULT_FIELDS = ['proxies', 'proxy-providers', 'proxy-groups', 'rule-providers', 'rules']

let lastExistsKeys = new Set<string>()
let lastRuntimeLogs: Record<string, LogLine[]> = {}
let lastRuntimeConfig: Mapping | null = null

/** Last enhanced runtime config as a plain object (`get_runtime_config`). */
export function getRuntimeConfig(): Mapping | null {
  return lastRuntimeConfig
}

/** Keys that exist in the current profile / overrides, lowercased (`get_runtime_exists`). */
export function getRuntimeExistsKeys(): string[] {
  return Array.from(lastExistsKeys)
}

/** Per chain-item log lines from the last enhance pass (`get_runtime_logs`). */
export function getRuntimeLogs(): Record<string, LogLine[]> {
  return lastRuntimeLogs
}

/**
 * Parses YAML text into a plain mapping, tolerating empty / invalid input.
 * @param text - YAML source.
 * @returns Parsed mapping (empty on parse failure).
 */
function parseYamlMapping(text: string): Mapping {
  if (!text || !text.trim()) {
    return {}
  }
  try {
    const parsed = loadYaml(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Mapping) : {}
  } catch {
    return {}
  }
}

/**
 * Lowercases every top-level mapping key.
 * @param config - Source mapping.
 * @returns New mapping with lowercase keys.
 */
function lowercaseKeys(config: Mapping): Mapping {
  const out: Mapping = {}
  for (const [key, value] of Object.entries(config)) {
    out[key.toLowerCase()] = value
  }
  return out
}

/**
 * Deep-merges `patch` over `base` (objects merge key by key, everything else replaces).
 * @param base - Destination value.
 * @param patch - Source value to apply.
 * @returns Merged value.
 */
function deepMerge(base: unknown, patch: unknown): unknown {
  if (
    base &&
    patch &&
    typeof base === 'object' &&
    typeof patch === 'object' &&
    !Array.isArray(base) &&
    !Array.isArray(patch)
  ) {
    const result: Mapping = { ...(base as Mapping) }
    for (const [key, value] of Object.entries(patch as Mapping)) {
      result[key] = deepMerge(result[key], value)
    }
    return result
  }
  return patch
}

/**
 * Overlays a lowercased merge mapping onto a profile config.
 * @param merge - Merge-chain mapping.
 * @param config - Profile config.
 * @returns Merged config.
 */
function useMerge(merge: Mapping, config: Mapping): Mapping {
  return deepMerge(config, lowercaseKeys(merge)) as Mapping
}

/**
 * Collects `name` strings out of a rules/proxies/groups sequence item.
 * @param seq - Sequence entries (strings, or mappings with a `name`).
 * @returns Names found.
 */
function collectNames(seq: unknown[]): string[] {
  const names: string[] = []
  for (const item of seq) {
    if (typeof item === 'string') {
      names.push(item)
    } else if (item && typeof item === 'object' && typeof (item as Mapping).name === 'string') {
      names.push((item as Mapping).name as string)
    }
  }
  return names
}

/**
 * Applies a prepend/append/delete sequence override to one list field
 * (`rules`, `proxies`, or `proxy-groups`), matching Clash Verge's `use_seq`.
 * @param seq - Prepend/append/delete lists.
 * @param config - Profile config.
 * @param field - Target field name.
 * @returns Updated config.
 */
function useSeq(seq: SeqMap, config: Mapping, field: string): Mapping {
  const { prepend, append, delete: deleted } = seq
  const isProxyField = field === 'proxies'
  const addedProxyNames = isProxyField
    ? Array.from(new Set(collectNames([...prepend, ...append])))
    : []

  const existing = Array.isArray(config[field]) ? (config[field] as unknown[]) : []
  const kept = existing.filter((item) => {
    const name =
      typeof item === 'string' ? item : item && typeof item === 'object' ? (item as Mapping).name : undefined
    return typeof name !== 'string' || !deleted.includes(name)
  })
  const next = { ...config, [field]: [...prepend, ...kept, ...append] }

  if (!isProxyField) {
    return next
  }

  const groups = next['proxy-groups']
  if (!Array.isArray(groups)) {
    return next
  }

  let appendedToSelector = false
  const updatedGroups = groups.map((group) => {
    if (!group || typeof group !== 'object') {
      return group
    }
    const groupMap = group as Mapping
    const groupType = typeof groupMap.type === 'string' ? groupMap.type.toLowerCase() : ''
    const isSelector = groupType === 'select' || groupType === 'selector'
    let proxies = Array.isArray(groupMap.proxies) ? (groupMap.proxies as unknown[]) : undefined
    if (proxies) {
      proxies = proxies.filter((proxy) => typeof proxy !== 'string' || !deleted.includes(proxy))
    }

    if (!appendedToSelector && addedProxyNames.length > 0 && isSelector) {
      const seen = new Set<string>()
      const merged: unknown[] = []
      for (const name of addedProxyNames) {
        if (!seen.has(name)) {
          seen.add(name)
          merged.push(name)
        }
      }
      for (const value of proxies ?? []) {
        if (typeof value === 'string' && seen.has(value)) {
          continue
        }
        if (typeof value === 'string') {
          seen.add(value)
        }
        merged.push(value)
      }
      proxies = merged
      appendedToSelector = true
    }

    return proxies ? { ...groupMap, proxies } : groupMap
  })

  return { ...next, 'proxy-groups': updatedGroups }
}

/**
 * Runs a Clash Verge–style profile script (`function main(config, name) { ... return config }`)
 * inside a timeout-bounded `vm` context. Mirrors the Boa-engine contract: the script is
 * responsible for returning a plain object, and `console.*` calls are captured as log lines
 * instead of writing to stdout.
 * @param script - Script source.
 * @param config - Config to pass into `main`.
 * @param name - Profile name (second arg to `main`).
 * @returns Resulting config plus captured log lines.
 */
function runScript(script: string, config: Mapping, name: string): { config: Mapping; logs: LogLine[] } {
  const logs: LogLine[] = []
  const record = (level: string, data: unknown): void => {
    if (logs.length >= 1000) {
      return
    }
    let text: string
    try {
      text = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
    } catch {
      text = String(data)
    }
    logs.push([level, text])
  }

  const sandbox: Record<string, unknown> = {
    console: {
      log: (data: unknown) => record('log', data),
      info: (data: unknown) => record('info', data),
      error: (data: unknown) => record('error', data),
      debug: (data: unknown) => record('debug', data),
      warn: (data: unknown) => record('warn', data),
      table: (data: unknown) => record('table', data),
    },
  }
  const context = vm.createContext(sandbox)

  try {
    const configJson = JSON.stringify(lowercaseKeys(config))
    const wrapped = `
      (function () {
        ${script}
        const __input__ = ${configJson};
        const __result__ = main(__input__, ${JSON.stringify(name)});
        return JSON.stringify(__result__ === undefined ? '' : __result__);
      })()
    `
    const compiled = new vm.Script(wrapped)
    const raw = compiled.runInContext(context, { timeout: SCRIPT_TIMEOUT_MS })
    if (typeof raw !== 'string' || raw.length === 0 || raw === '""') {
      throw new Error('main function should return an object')
    }
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('main function should return an object')
    }
    return { config: lowercaseKeys(parsed as Mapping), logs }
  } catch (err) {
    logs.push(['exception', err instanceof Error ? err.message : String(err)])
    return { config, logs }
  }
}

/**
 * Injects/updates TUN + fake-ip DNS, matching Clash Verge's `use_tun`.
 * @param config - Profile config.
 * @param enable - Whether TUN mode is on.
 * @returns Updated config.
 */
function useTun(config: Mapping, enable: boolean): Mapping {
  const tun = { ...(typeof config.tun === 'object' && config.tun ? (config.tun as Mapping) : {}) }
  let next = { ...config }

  if (enable) {
    const dns = { ...(typeof config.dns === 'object' && config.dns ? (config.dns as Mapping) : {}) }
    const ipv6 = Boolean(config.ipv6)
    const currentMode = typeof dns['enhanced-mode'] === 'string' ? (dns['enhanced-mode'] as string) : 'fake-ip'

    if (currentMode === 'fake-ip' || !('enhanced-mode' in dns)) {
      dns.enable = true
      dns.ipv6 = ipv6
      if (!('enhanced-mode' in dns)) {
        dns['enhanced-mode'] = 'fake-ip'
      }
      if (!('fake-ip-range' in dns)) {
        dns['fake-ip-range'] = '198.18.0.1/16'
      }
      if (ipv6 && !('fake-ip-range6' in dns)) {
        dns['fake-ip-range6'] = 'fdfe:dcba:9876::1/64'
      }
    }
    next = { ...next, dns }
  }

  tun.enable = enable
  next = { ...next, tun }
  return next
}

/**
 * Reads and merges Workbench's persisted DNS config (`dns_config.yaml`) into the profile config,
 * matching Clash Verge's `apply_dns_settings`.
 * @param config - Profile config.
 * @param enabled - `enable_dns_settings` from the Verge store.
 * @returns Updated config.
 */
function applyDnsSettings(config: Mapping, enabled: boolean): Mapping {
  if (!enabled) {
    return config
  }
  const dnsPath = dnsConfigPath()
  if (!fs.existsSync(dnsPath)) {
    return config
  }
  const parsed = parseYamlMapping(fs.readFileSync(dnsPath, 'utf8'))
  let next = { ...config }
  if (parsed.hosts && typeof parsed.hosts === 'object') {
    next = { ...next, hosts: parsed.hosts }
  }
  const dnsSection = parsed.dns && typeof parsed.dns === 'object' ? (parsed.dns as Mapping) : parsed
  if (dnsSection && Object.keys(dnsSection).length > 0) {
    const dns = { ...dnsSection }
    ensureFakeIpRange6(dns)
    next = { ...next, dns }
  }
  return next
}

/**
 * Fills a missing `fake-ip-range6` when IPv6 fake-ip DNS is in effect (issue #7373 upstream).
 * @param dns - DNS mapping (mutated in place).
 */
function ensureFakeIpRange6(dns: Mapping): void {
  const ipv6Enabled = Boolean(dns.ipv6)
  const isFakeIp = typeof dns['enhanced-mode'] !== 'string' || dns['enhanced-mode'] === 'fake-ip'
  const range6 = dns['fake-ip-range6']
  const missing = typeof range6 !== 'string' || range6.trim().length === 0
  if (ipv6Enabled && isFakeIp && missing) {
    dns['fake-ip-range6'] = 'fdfe:dcba:9876::1/64'
  }
}

/**
 * Snapshots the app-owned control-plane fields (and `dns.ipv6` when the DNS page owns it)
 * before manual merge/script overrides run.
 */
function captureAuthoritative(config: Mapping, dnsOwned: boolean): { plane: Mapping; dnsIpv6?: unknown } {
  const plane: Mapping = {}
  for (const key of CONTROL_PLANE_KEYS) {
    if (key in config) {
      plane[key] = config[key]
    }
  }
  const dns = config.dns
  const dnsIpv6 =
    dnsOwned && dns && typeof dns === 'object' && 'ipv6' in (dns as Mapping)
      ? (dns as Mapping).ipv6
      : undefined
  return { plane, dnsIpv6 }
}

/**
 * Restores the fields captured by {@link captureAuthoritative} after manual overrides.
 */
function enforceAuthoritative(config: Mapping, snapshot: { plane: Mapping; dnsIpv6?: unknown }): Mapping {
  const next: Mapping = { ...config }
  for (const key of CONTROL_PLANE_KEYS) {
    if (key in snapshot.plane) {
      next[key] = snapshot.plane[key]
    } else {
      delete next[key]
    }
  }
  if (snapshot.dnsIpv6 !== undefined && next.dns && typeof next.dns === 'object') {
    next.dns = { ...(next.dns as Mapping), ipv6: snapshot.dnsIpv6 }
  }
  return next
}

/**
 * Widens a loopback `bind-address` to `*` when LAN access is on (otherwise LAN clients
 * cannot reach a listener bound to `127.0.0.1`).
 */
function ensureLanBindAddress(config: Mapping): Mapping {
  const allowLan = Boolean(config['allow-lan'])
  const bindAddress = config['bind-address']
  if (!allowLan || typeof bindAddress !== 'string') {
    return config
  }
  const trimmed = bindAddress.replace(/^\[/, '').replace(/\]$/, '')
  const isLoopback =
    trimmed.toLowerCase() === 'localhost' || trimmed === '::1' || /^127(\.\d{1,3}){1,3}$/.test(trimmed)
  return isLoopback ? { ...config, 'bind-address': '*' } : config
}

/**
 * Drops proxy-group references to proxies/providers that no longer exist, matching
 * Clash Verge's `cleanup_proxy_groups`.
 */
function cleanupProxyGroups(config: Mapping): Mapping {
  const BUILTIN = new Set(['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS'])
  const proxyNames = new Set<string>(
    Array.isArray(config.proxies) ? collectNames(config.proxies as unknown[]) : [],
  )
  const groupNames = new Set<string>(
    Array.isArray(config['proxy-groups'])
      ? (config['proxy-groups'] as unknown[])
          .map((g) => (g && typeof g === 'object' ? (g as Mapping).name : undefined))
          .filter((n): n is string => typeof n === 'string')
      : [],
  )
  const providerNames = new Set<string>(
    config['proxy-providers'] && typeof config['proxy-providers'] === 'object'
      ? Object.keys(config['proxy-providers'] as Mapping)
      : [],
  )
  const allowed = new Set<string>([...proxyNames, ...groupNames, ...providerNames, ...BUILTIN])

  if (!Array.isArray(config['proxy-groups'])) {
    return config
  }
  const groups = (config['proxy-groups'] as unknown[]).map((group) => {
    if (!group || typeof group !== 'object') {
      return group
    }
    const groupMap = { ...(group as Mapping) }
    let hasValidProvider = false
    if (Array.isArray(groupMap.use)) {
      groupMap.use = (groupMap.use as unknown[]).filter((name) => {
        const exists = typeof name === 'string' && providerNames.has(name)
        hasValidProvider = hasValidProvider || exists
        return exists
      })
    }
    if (Array.isArray(groupMap.proxies)) {
      groupMap.proxies = (groupMap.proxies as unknown[]).filter(
        (name) => typeof name !== 'string' || allowed.has(name) || hasValidProvider,
      )
    }
    return groupMap
  })
  return { ...config, 'proxy-groups': groups }
}

/**
 * Orders top-level keys the way Clash Verge does (small scalar settings first, bulky
 * list fields last), purely cosmetic for the persisted runtime.yaml.
 */
function sortConfig(config: Mapping): Mapping {
  const sorted: Mapping = {}
  for (const key of HANDLE_FIELDS) {
    if (key in config) {
      sorted[key] = config[key]
    }
  }
  const deferred: Mapping = {}
  for (const [key, value] of Object.entries(config)) {
    if (DEFAULT_FIELDS.includes(key)) {
      deferred[key] = value
    } else if (!HANDLE_FIELDS.includes(key)) {
      sorted[key] = value
    }
  }
  for (const key of DEFAULT_FIELDS) {
    if (key in deferred) {
      sorted[key] = deferred[key]
    }
  }
  return sorted
}

/** Absolute path of the persisted DNS overlay file. */
export function dnsConfigPath(): string {
  return `${clashDataDir()}/dns_config.yaml`
}

/**
 * Finds a profile item by uid (also resolves the well-known global `Merge` / `Script` uids).
 */
function findItem(uid: string): ClashProfileItem | undefined {
  return loadProfilesIndex().items.find((item) => item.uid === uid)
}

/**
 * Reads a profile item's file as text, or an empty string when missing.
 */
function readItemFile(item: ClashProfileItem | undefined): string {
  if (!item) {
    return ''
  }
  const abs = profilePath(item.file)
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : ''
}

/**
 * Reads a chain uid as a `SeqMap` (rules/proxies/groups override file), tolerating a
 * missing item or invalid YAML.
 */
function readSeqItem(uid: string | undefined, fallbackUid: string): SeqMap {
  const item = findItem(uid ?? fallbackUid)
  const parsed = parseYamlMapping(readItemFile(item))
  return {
    prepend: Array.isArray(parsed.prepend) ? (parsed.prepend as unknown[]) : [],
    append: Array.isArray(parsed.append) ? (parsed.append as unknown[]) : [],
    delete: Array.isArray(parsed.delete) ? (parsed.delete as string[]) : [],
  }
}

/**
 * Reads a chain uid as a merge mapping, tolerating a missing item.
 */
function readMergeItem(uid: string | undefined, fallbackUid: string): Mapping {
  const item = findItem(uid ?? fallbackUid)
  return parseYamlMapping(readItemFile(item))
}

/**
 * Reads a chain uid as script source, tolerating a missing item.
 */
function readScriptItem(uid: string | undefined, fallbackUid: string): string {
  const item = findItem(uid ?? fallbackUid)
  return readItemFile(item)
}

/**
 * Builds the Workbench-owned control-plane mapping (mixed-port, controller, secret, listeners),
 * analogous to Clash Verge's separate `Config::clash()` settings layer.
 */
function buildControlConfig(): Mapping {
  const verge = loadVergeStore()
  const socket = controllerSocketPath()
  const controllerKey = process.platform === 'win32' ? 'external-controller-pipe' : 'external-controller-unix'
  const enableExternalController = verge.enable_external_controller ?? false

  const config: Mapping = {
    'mixed-port': CLASH_MIXED_PORT,
    'allow-lan': verge.clash_allow_lan ?? false,
    mode: verge.clash_mode ?? 'rule',
    'log-level': verge.clash_log_level ?? 'info',
    'external-controller': enableExternalController ? '127.0.0.1:9090' : '',
    [controllerKey]: socket,
    secret: readClashSecret(),
    'unified-delay': verge.clash_unified_delay ?? true,
    ipv6: verge.clash_ipv6 ?? true,
  }
  if (verge.verge_socks_enabled) {
    config['socks-port'] = verge.verge_socks_port ?? 17891
  }
  if (verge.verge_http_enabled) {
    config.port = verge.verge_port ?? 17892
  }
  if (process.platform !== 'win32' && verge.verge_redir_enabled) {
    config['redir-port'] = verge.verge_redir_port ?? 17893
  }
  if (process.platform === 'linux' && verge.verge_tproxy_enabled) {
    config['tproxy-port'] = verge.verge_tproxy_port ?? 17894
  }
  return config
}

/**
 * Overlays the Workbench control-plane mapping onto a profile config, matching Clash Verge's
 * `merge_default_config` (listener toggles remove rather than merge a disabled port).
 */
function mergeControlConfig(config: Mapping, control: Mapping): Mapping {
  const next = { ...config }
  for (const [key, value] of Object.entries(control)) {
    if (key === 'tun') {
      next.tun = deepMerge(next.tun ?? {}, value)
      continue
    }
    next[key] = value
  }
  for (const key of ['socks-port', 'port', 'redir-port', 'tproxy-port']) {
    if (!(key in control)) {
      delete next[key]
    }
  }
  return next
}

/** Chain-item result-log accumulator keyed by uid. */
type ResultMap = Record<string, LogLine[]>

/**
 * Applies a merge + script chain item, extending `existsKeys` and `results`.
 */
async function applyChainItem(
  config: Mapping,
  existsKeys: Set<string>,
  results: ResultMap,
  mergeMapping: Mapping,
  scriptSource: string,
  scriptUid: string,
  profileName: string,
): Promise<Mapping> {
  let next = config
  if (Object.keys(mergeMapping).length > 0) {
    for (const key of Object.keys(lowercaseKeys(mergeMapping))) {
      existsKeys.add(key)
    }
    next = useMerge(mergeMapping, next)
  }
  if (scriptSource.trim().length > 0) {
    const before = next
    const { config: after, logs } = runScript(scriptSource, next, profileName)
    for (const key of Object.keys(after)) {
      if (before[key] !== after[key]) {
        existsKeys.add(key.toLowerCase())
      }
    }
    next = after
    results[scriptUid] = logs
  }
  return next
}

/**
 * Runs the full profile enhance pipeline (seq overrides, control-plane overlay, TUN/DNS,
 * global + profile merge/script chains, cleanup) and writes `runtime.yaml`.
 * @returns Validation outcome for the Clash UI.
 */
export async function runEnhance(): Promise<ClashValidationOutcome> {
  try {
    const index = loadProfilesIndex()
    const current = index.items.find((item) => item.uid === index.current)
    const verge = loadVergeStore()

    let config: Mapping = current ? parseYamlMapping(readItemFile(current)) : {}
    const profileName = current?.name ?? ''
    const option = current?.option

    const rulesSeq = readSeqItem(option?.rules, 'Rules')
    const proxiesSeq = readSeqItem(option?.proxies, 'Proxies')
    const groupsSeq = readSeqItem(option?.groups, 'Groups')
    config = useSeq(rulesSeq, config, 'rules')
    config = useSeq(proxiesSeq, config, 'proxies')
    config = useSeq(groupsSeq, config, 'proxy-groups')

    const existsKeys = new Set<string>(Object.keys(lowercaseKeys(config)))

    config = mergeControlConfig(config, buildControlConfig())
    config = useTun(config, verge.enable_tun_mode ?? false)
    config = applyDnsSettings(config, verge.enable_dns_settings ?? false)

    const enableDnsSettings = verge.enable_dns_settings ?? false
    const authoritative = captureAuthoritative(config, enableDnsSettings)

    const results: ResultMap = {}
    config = await applyChainItem(
      config,
      existsKeys,
      results,
      readMergeItem(undefined, 'Merge'),
      readScriptItem(undefined, 'Script'),
      'Script',
      profileName,
    )
    if (current) {
      config = await applyChainItem(
        config,
        existsKeys,
        results,
        readMergeItem(option?.merge, ''),
        readScriptItem(option?.script, ''),
        option?.script ?? 'profile-script',
        profileName,
      )
    }

    config = enforceAuthoritative(config, authoritative)
    config = ensureLanBindAddress(config)
    config = cleanupProxyGroups(config)
    config = sortConfig(config)

    lastExistsKeys = existsKeys
    lastRuntimeLogs = results
    lastRuntimeConfig = config

    const { runtimeFile } = ensureClashDirs()
    fs.writeFileSync(runtimeFile, dumpYaml(config, { forceQuotes: false, lineWidth: -1 }), 'utf8')

    return { status: 'valid' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { status: 'invalid', kind: 'enhance', message }
  }
}

/**
 * Extracts the `dialer-proxy` chain leading to `exitNode` as a standalone YAML `proxies` list
 * (used by the proxy-chain editor), matching Clash Verge's `get_runtime_proxy_chain_config`.
 */
export function getRuntimeProxyChainConfig(exitNode: string): string {
  const proxies = Array.isArray(lastRuntimeConfig?.proxies) ? (lastRuntimeConfig.proxies as Mapping[]) : []
  const chain: Mapping[] = []
  let currentName: string | undefined = exitNode
  for (;;) {
    const proxy = proxies.find(
      (candidate) => candidate.name === currentName && 'dialer-proxy' in candidate,
    )
    if (!proxy) {
      break
    }
    chain.push(proxy)
    currentName = typeof proxy['dialer-proxy'] === 'string' ? (proxy['dialer-proxy'] as string) : undefined
  }
  if (chain.length > 0 && currentName) {
    const entry = proxies.find((candidate) => candidate.name === currentName)
    if (entry) {
      chain.push(entry)
    }
  }
  chain.reverse()
  return dumpYaml({ proxies: chain })
}

/**
 * Patches (or clears) a `proxies` list in the live runtime config for the proxy-chain editor.
 * Persists to `runtime.yaml` so the next Mihomo restart keeps the chain.
 */
export function updateProxyChainConfigInRuntime(proxyChainConfig: unknown): void {
  if (!lastRuntimeConfig) {
    return
  }
  const parsed =
    typeof proxyChainConfig === 'string' ? parseYamlMapping(proxyChainConfig) : (proxyChainConfig as Mapping | null)
  const chainProxies = parsed && Array.isArray(parsed.proxies) ? (parsed.proxies as unknown[]) : []
  const existing = Array.isArray(lastRuntimeConfig.proxies) ? (lastRuntimeConfig.proxies as unknown[]) : []
  const chainNames = new Set(collectNames(chainProxies))
  const merged = [...chainProxies, ...existing.filter((p) => {
    const name = p && typeof p === 'object' ? (p as Mapping).name : undefined
    return typeof name !== 'string' || !chainNames.has(name)
  })]
  lastRuntimeConfig = { ...lastRuntimeConfig, proxies: merged }
  const { runtimeFile } = ensureClashDirs()
  fs.writeFileSync(runtimeFile, dumpYaml(lastRuntimeConfig, { forceQuotes: false, lineWidth: -1 }), 'utf8')
}
