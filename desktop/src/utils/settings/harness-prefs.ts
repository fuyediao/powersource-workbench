import {
  HARNESS_UTILITY_MAX_WIDTH,
  clampHarnessUtilityWidth,
} from '@/utils/harness/utility-layout'

/** Legacy localStorage key imported into SQLite once. */
export const HARNESS_APPROVAL_MODE_KEY = 'geocrm.electron.harness.approvalMode.v1'

/**
 * When Harness asks before file or network actions.
 * Aligns with Codex `:read-only` / `:workspace` / `:danger-no-sandbox`.
 */
export type HarnessApprovalMode = 'askAlways' | 'askIfUnsafe' | 'fullAccess'

export const HARNESS_APPROVAL_MODES: readonly HarnessApprovalMode[] = [
  'askAlways',
  'askIfUnsafe',
  'fullAccess',
]

/**
 * Returns whether a value is a persisted Harness approval mode.
 * @param value - Candidate string.
 * @returns Type predicate for {@link HarnessApprovalMode}.
 */
export function isHarnessApprovalMode(value: string): value is HarnessApprovalMode {
  return (HARNESS_APPROVAL_MODES as readonly string[]).includes(value)
}

/**
 * Reads the Harness approval mode for this device.
 * @returns Mode; defaults to workspace-style “ask if unsafe”.
 */
export function loadHarnessApprovalMode(): HarnessApprovalMode {
  return cachedPreferences.approvalMode
}

/**
 * Persists the Harness approval mode on this device.
 * @param mode - Target permission profile.
 * @returns Nothing.
 */
export function saveHarnessApprovalMode(mode: HarnessApprovalMode): void {
  persistPreferences({ ...cachedPreferences, approvalMode: mode })
}

/** Legacy localStorage key for third-party MCP servers imported into SQLite once. */
export const HARNESS_MCP_SERVERS_KEY = 'geocrm.electron.harness.mcpServers.v1'
export const HARNESS_COMPUTER_USE_ENABLED_KEY = 'geocrm.electron.harness.computerUseEnabled.v1'

/** Legacy localStorage key for the Computer Use target imported into SQLite once. */
export const HARNESS_COMPUTER_USE_TARGET_KEY = 'geocrm.electron.harness.computerUseTarget.v1'

/** Reads whether Computer Use is enabled for new Harness threads. */
export function loadHarnessComputerUseEnabled(): boolean {
  return cachedPreferences.computerUseEnabled
}

/** Persists whether Computer Use is enabled for new Harness threads. */
export function saveHarnessComputerUseEnabled(enabled: boolean): void {
  persistPreferences({ ...cachedPreferences, computerUseEnabled: enabled })
}

/** Reads whether first-party web search is enabled for new Harness threads. */
export function loadHarnessWebSearchEnabled(): boolean {
  return cachedPreferences.webSearchEnabled
}

/** Persists whether first-party web search is enabled for new Harness threads. */
export function saveHarnessWebSearchEnabled(enabled: boolean): void {
  persistPreferences({ ...cachedPreferences, webSearchEnabled: enabled })
}

/**
 * Reads whether the full Harness sidebar is visible.
 * @returns True when the sidebar should be rendered.
 */
export function loadHarnessSidebarVisible(): boolean {
  return cachedPreferences.sidebarVisible
}

/**
 * Persists whether the full Harness sidebar is visible.
 * @param visible - True to render the sidebar.
 * @returns Nothing.
 */
export function saveHarnessSidebarVisible(visible: boolean): void {
  persistPreferences({ ...cachedPreferences, sidebarVisible: visible })
}

/** Reads whether the Harness utility workspace is visible. */
export function loadHarnessUtilitySidebarVisible(): boolean {
  return cachedPreferences.utilitySidebarVisible
}

/** Persists whether the Harness utility workspace is visible. */
export function saveHarnessUtilitySidebarVisible(visible: boolean): void {
  persistPreferences({ ...cachedPreferences, utilitySidebarVisible: visible })
}

/** Reads the persisted Harness utility workspace width. */
export function loadHarnessUtilitySidebarWidth(): number {
  return cachedPreferences.utilitySidebarWidth
}

/** Persists a clamped Harness utility workspace width. */
export function saveHarnessUtilitySidebarWidth(width: number): void {
  const utilitySidebarWidth = clampHarnessUtilityWidth(width, HARNESS_UTILITY_MAX_WIDTH)
  persistPreferences({ ...cachedPreferences, utilitySidebarWidth })
}

/** Desktop target persisted independently from the visual model. */
export interface HarnessComputerUseTargetPreference {
  id: string
  kind: 'display' | 'window'
  label: string
}

/**
 * Reads the preferred Computer Use target.
 * @returns Saved target, or null when unset or invalid.
 */
export function loadHarnessComputerUseTarget(): HarnessComputerUseTargetPreference | null {
  return cachedPreferences.computerUseTarget
}

/**
 * Persists the preferred Computer Use target.
 * @param target - Display or window selection, or null for automatic targeting.
 * @returns Nothing.
 */
export function saveHarnessComputerUseTarget(
  target: HarnessComputerUseTargetPreference | null,
): void {
  persistPreferences({ ...cachedPreferences, computerUseTarget: target })
}

/**
 * One MCP server Harness may connect to.
 * These are always third-party services; GeoCRM data uses the signed-in
 * session instead, so `geocrm` is rejected as a server name.
 */
export interface HarnessMcpServer {
  /** Config key, e.g. `github`. */
  name: string
  /** User-facing label shown in the MCP library. */
  displayName?: string
  /** Optional explanation of the server's purpose. */
  description?: string
  /** Optional small PNG icon stored only on this device. */
  iconDataUrl?: string
  /** Standard local process or remote Streamable HTTP transport. */
  transport: 'stdio' | 'streamableHttp'
  /** Remote authentication strategy. */
  auth?: 'oauth' | 'bearer' | 'none'
  command?: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  envVars?: string[]
  url?: string
  bearerTokenEnvVar?: string
  httpHeaders?: Record<string, string>
  envHttpHeaders?: Record<string, string>
  enabled?: boolean
  required?: boolean
  enabledTools?: string[]
  disabledTools?: string[]
  approvalMode?: 'auto' | 'prompt' | 'writes' | 'approve'
  toolApprovalModes?: Record<string, 'auto' | 'prompt' | 'writes' | 'approve'>
  startupTimeoutSec?: number
  toolTimeoutSec?: number
  oauthCallbackUrl?: string
  oauthCallbackPort?: number
  riskAcknowledged?: boolean
}

/** JSON shape accepted by the advanced MCP configuration editor. */
export interface HarnessMcpJsonDocument {
  mcpServers: Record<string, Omit<HarnessMcpServer, 'name'>>
}

/**
 * Splits a command line while preserving quoted arguments and escaped quotes.
 * @param input - User-entered executable and arguments.
 * @returns Tokenized command line.
 */
export function parseHarnessCommandLine(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  const source = input.trim()
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? ''
    const next = source[index + 1] ?? ''
    if (character === '\\' && quote !== "'" && (next === '"' || next === '\\')) {
      current += next
      index += 1
      continue
    }
    if (character === '"' || character === "'") {
      if (quote === character) quote = null
      else if (!quote) quote = character
      else current += character
      continue
    }
    if (/\s/.test(character) && !quote) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += character
  }
  if (current) tokens.push(current)
  return tokens
}

/** Reserved name: GeoCRM is never reached over MCP from Harness. */
const RESERVED_SERVER_NAME = 'geocrm'

/**
 * Returns whether a server name may be configured.
 * @param name - Candidate config key.
 * @returns True for a usable third-party server name.
 */
export function isAllowedMcpServerName(name: string): boolean {
  const trimmed = name.trim().toLowerCase()
  return /^[a-z0-9_-]{1,32}$/.test(trimmed) && trimmed !== RESERVED_SERVER_NAME
}

/**
 * Reads the configured third-party MCP servers for this device.
 * @returns Server list; empty when unset or unreadable.
 */
export function loadHarnessMcpServers(): HarnessMcpServer[] {
  return cachedPreferences.mcpServers
}

/**
 * Persists the third-party MCP server list on this device.
 * @param servers - Servers to store; `geocrm` is dropped.
 * @returns Nothing.
 */
export function saveHarnessMcpServers(servers: HarnessMcpServer[]): void {
  const allowed = normalizeHarnessMcpServers(servers)
  persistPreferences({ ...cachedPreferences, mcpServers: allowed })
}

/**
 * Parses a guided-editor or WorkBuddy-style MCP JSON document.
 * @param source - Raw JSON text from the advanced editor.
 * @returns Validated Harness MCP profiles.
 */
export function parseHarnessMcpJson(source: string): HarnessMcpServer[] {
  const parsed = JSON.parse(source) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('MCP configuration must be a JSON object.')
  }
  const root = parsed as Record<string, unknown>
  const rawServers = root.mcpServers
  if (!rawServers || typeof rawServers !== 'object' || Array.isArray(rawServers)) {
    throw new Error('MCP configuration must contain an mcpServers object.')
  }
  const entries = Object.entries(rawServers).map(([name, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { name }
    }
    const record = value as Record<string, unknown>
    const legacyHeaders = readStringRecord(record.headers)
    if (
      legacyHeaders &&
      Object.entries(legacyHeaders).some(
        ([key, value]) => key.toLowerCase() === 'authorization' && /^bearer\s+\S+/i.test(value),
      )
    ) {
      throw new Error('Plaintext bearer tokens are not accepted. Use bearerTokenEnvVar or envHttpHeaders.')
    }
    const commandLine = typeof record.command === 'string' ? parseHarnessCommandLine(record.command) : []
    const url = typeof record.url === 'string' ? record.url : ''
    return {
      ...record,
      name,
      transport:
        record.transport === 'stdio' || (!url && commandLine.length > 0)
          ? ('stdio' as const)
          : ('streamableHttp' as const),
      command: commandLine[0] ?? '',
      args: Array.isArray(record.args) ? record.args : commandLine.slice(1),
      httpHeaders: readStringRecord(record.httpHeaders) ?? legacyHeaders,
      enabled: record.disabled === true ? false : record.enabled,
    }
  })
  const servers = normalizeHarnessMcpServers(entries)
  if (servers.length !== entries.length) {
    throw new Error('One or more MCP server entries are invalid.')
  }
  return servers
}

/**
 * Serializes MCP profiles for the advanced editor without inventing secrets.
 * @param servers - Validated MCP profiles.
 * @returns Readable JSON configuration text.
 */
export function serializeHarnessMcpJson(servers: HarnessMcpServer[]): string {
  const mcpServers = Object.fromEntries(
    normalizeHarnessMcpServers(servers).map(({ name, ...server }) => [name, server]),
  )
  return JSON.stringify({ mcpServers } satisfies HarnessMcpJsonDocument, null, 2)
}

/**
 * Normalizes renderer and persisted MCP profiles.
 * @param raw - Candidate server array.
 * @returns Valid server profiles with safe scalar values.
 */
function normalizeHarnessMcpServers(raw: unknown): HarnessMcpServer[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    const entry = value as Record<string, unknown>
    const name = typeof entry.name === 'string' ? entry.name.trim().toLowerCase() : ''
    const transport = entry.transport === 'streamableHttp' ? 'streamableHttp' : 'stdio'
    const command = typeof entry.command === 'string' ? entry.command.trim() : ''
    const url = typeof entry.url === 'string' ? entry.url.trim() : ''
    if (
      !isAllowedMcpServerName(name) ||
      (transport === 'stdio' ? !command : !/^https:\/\//i.test(url))
    ) {
      return []
    }
    const auth = entry.auth === 'bearer' || entry.auth === 'none' ? entry.auth : 'oauth'
    const approvalMode = readApprovalMode(entry.approvalMode)
    return [{
      name,
      displayName: readOptionalString(entry.displayName),
      description: readOptionalString(entry.description),
      iconDataUrl: readPngDataUrl(entry.iconDataUrl),
      transport,
      auth,
      command,
      args: readStringArray(entry.args),
      cwd: readOptionalString(entry.cwd),
      env: readStringRecord(entry.env),
      envVars: readStringArray(entry.envVars),
      url,
      bearerTokenEnvVar: readOptionalString(entry.bearerTokenEnvVar),
      httpHeaders: readStringRecord(entry.httpHeaders),
      envHttpHeaders: readStringRecord(entry.envHttpHeaders),
      enabled: entry.enabled !== false,
      required: entry.required === true,
      enabledTools: readStringArray(entry.enabledTools),
      disabledTools: readStringArray(entry.disabledTools),
      approvalMode,
      toolApprovalModes: readApprovalRecord(entry.toolApprovalModes),
      startupTimeoutSec: readPositiveNumber(entry.startupTimeoutSec),
      toolTimeoutSec: readPositiveNumber(entry.toolTimeoutSec),
      oauthCallbackUrl:
        typeof entry.oauthCallbackUrl === 'string' && /^https?:\/\//i.test(entry.oauthCallbackUrl)
          ? entry.oauthCallbackUrl.trim()
          : undefined,
      oauthCallbackPort: readPort(entry.oauthCallbackPort),
      riskAcknowledged: entry.riskAcknowledged === true,
    }]
  })
}

/**
 * Reads a trimmed optional string.
 * @param value - Candidate persisted value.
 * @returns Trimmed text, or undefined when empty or invalid.
 */
function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/**
 * Reads a string-only array.
 * @param value - Candidate persisted list.
 * @returns Trimmed non-empty strings, or undefined when none are valid.
 */
function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value
    .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    .map((item) => item.trim())
  return items.length > 0 ? items : undefined
}

/**
 * Reads one supported MCP approval mode.
 * @param value - Candidate persisted approval mode.
 * @returns A supported approval mode with a prompt-safe default.
 */
function readApprovalMode(value: unknown): NonNullable<HarnessMcpServer['approvalMode']> {
  return value === 'auto' || value === 'approve' || value === 'writes' ? value : 'prompt'
}

/**
 * Reads per-tool approval modes.
 * @param value - Candidate tool-to-mode record.
 * @returns Validated tool approval policies, or undefined when empty.
 */
function readApprovalRecord(value: unknown): HarnessMcpServer['toolApprovalModes'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entries = Object.entries(value).flatMap(([name, mode]) => {
    const parsed = readApprovalMode(mode)
    return name.trim() ? [[name.trim(), parsed] as const] : []
  })
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

/**
 * Reads a positive finite number.
 * @param value - Candidate numeric value.
 * @returns Positive number, or undefined when invalid.
 */
function readPositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

/**
 * Reads a valid TCP port.
 * @param value - Candidate port value.
 * @returns Valid TCP port, or undefined when invalid.
 */
function readPort(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 65535
    ? value
    : undefined
}

/**
 * Reads a small PNG data URL.
 * @param value - Candidate persisted data URL.
 * @returns Safe PNG data URL, or undefined when invalid or oversized.
 */
function readPngDataUrl(value: unknown): string | undefined {
  return typeof value === 'string' && /^data:image\/png;base64,/i.test(value) && value.length <= 16_000
    ? value
    : undefined
}

/**
 * Reads a string-only header record from persisted JSON.
 * @param value - Candidate persisted record.
 * @returns String record, or undefined when empty or invalid.
 */
function readStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string' && Boolean(entry[0].trim()),
  )
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

/** Legacy localStorage key for the Harness work folder on this device. */
export const HARNESS_WORK_FOLDER_KEY = 'geocrm.electron.harness.workFolder.v1'

/**
 * Reads the user-chosen Harness work folder.
 * @returns Absolute path, or empty to use Documents/Harness.
 */
export function loadHarnessWorkFolder(): string {
  return cachedPreferences.workFolder
}

/**
 * Persists the Harness work folder. Empty restores the Documents/Harness default.
 * @param folder - Absolute path, or empty.
 * @returns Nothing.
 */
export function saveHarnessWorkFolder(folder: string): void {
  persistPreferences({ ...cachedPreferences, workFolder: folder.trim() })
}

interface CachedHarnessDevicePreferences {
  approvalMode: HarnessApprovalMode
  computerUseEnabled: boolean
  webSearchEnabled: boolean
  computerUseTarget: HarnessComputerUseTargetPreference | null
  sidebarVisible: boolean
  utilitySidebarVisible: boolean
  utilitySidebarWidth: number
  workFolder: string
  mcpServers: HarnessMcpServer[]
}

let cachedPreferences: CachedHarnessDevicePreferences = {
  approvalMode: 'askIfUnsafe',
  computerUseEnabled: false,
  webSearchEnabled: false,
  computerUseTarget: null,
  sidebarVisible: true,
  utilitySidebarVisible: false,
  utilitySidebarWidth: 360,
  workFolder: '',
  mcpServers: [],
}

let hydration: Promise<CachedHarnessDevicePreferences> | null = null

/** Reads the legacy renderer settings before importing them into SQLite. */
function readLegacyPreferences(): CachedHarnessDevicePreferences {
  try {
    const approval = localStorage.getItem(HARNESS_APPROVAL_MODE_KEY)
    const rawTarget = localStorage.getItem(HARNESS_COMPUTER_USE_TARGET_KEY)
    const rawServers = localStorage.getItem(HARNESS_MCP_SERVERS_KEY)
    const target = rawTarget ? JSON.parse(rawTarget) as unknown : null
    return {
      approvalMode: typeof approval === 'string' && isHarnessApprovalMode(approval)
        ? approval
        : 'askIfUnsafe',
      computerUseEnabled: localStorage.getItem(HARNESS_COMPUTER_USE_ENABLED_KEY) === 'true',
      webSearchEnabled: false,
      computerUseTarget:
        target && typeof target === 'object' && !Array.isArray(target)
          ? target as HarnessComputerUseTargetPreference
          : null,
      sidebarVisible: true,
      utilitySidebarVisible: false,
      utilitySidebarWidth: 360,
      workFolder: localStorage.getItem(HARNESS_WORK_FOLDER_KEY)?.trim() ?? '',
      mcpServers: normalizeHarnessMcpServers(rawServers ? JSON.parse(rawServers) as unknown : []),
    }
  } catch {
    return cachedPreferences
  }
}

/** Removes legacy localStorage values after SQLite confirms the import. */
function clearLegacyPreferences(): void {
  try {
    for (const key of [
      HARNESS_APPROVAL_MODE_KEY,
      HARNESS_COMPUTER_USE_ENABLED_KEY,
      HARNESS_COMPUTER_USE_TARGET_KEY,
      HARNESS_MCP_SERVERS_KEY,
      HARNESS_WORK_FOLDER_KEY,
    ]) localStorage.removeItem(key)
  } catch {
    // SQLite remains authoritative when renderer storage is unavailable.
  }
}

/** Loads device-local Harness preferences from the Electron SQLite bridge. */
export function hydrateHarnessDevicePreferences(): Promise<CachedHarnessDevicePreferences> {
  if (hydration) return hydration
  hydration = (async () => {
    const bridge = window.geocrm?.harness
    if (!bridge?.getDevicePreferences) return cachedPreferences
    const stored = await bridge.getDevicePreferences(readLegacyPreferences())
    cachedPreferences = {
      ...stored,
      mcpServers: normalizeHarnessMcpServers(stored.mcpServers),
    }
    clearLegacyPreferences()
    return cachedPreferences
  })()
  return hydration
}

/** Writes the full cached preference document to SQLite. */
function persistPreferences(preferences: CachedHarnessDevicePreferences): void {
  cachedPreferences = preferences
  void window.geocrm?.harness?.setDevicePreferences(preferences).catch(() => undefined)
}
