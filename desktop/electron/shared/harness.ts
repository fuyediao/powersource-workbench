/**
 * Harness desktop bridge contract.
 *
 * The renderer drives one local `codex app-server` process through these
 * channels. Harness never uses the npm `@openai/codex` CLI, and it never
 * reaches GeoCRM over MCP.
 */

/** IPC channel for Harness workflow commands (start / turn / approval). */
export const HARNESS_IPC_CHANNEL = 'geocrm:harness'

/** Event pushed from main to the renderer for one workflow event. */
export const HARNESS_EVENT = 'geocrm:harness-event'

/** Streaming PTY output for one Harness terminal tab. */
export const HARNESS_PTY_DATA_EVENT = 'geocrm:harness-pty-data'

/** Exit notification for one Harness terminal tab. */
export const HARNESS_PTY_EXIT_EVENT = 'geocrm:harness-pty-exit'

/** Console output emitted by the isolated native Canvas preview. */
export const HARNESS_CANVAS_CONSOLE_EVENT = 'geocrm:harness-canvas-console'

/** Permission profile chosen in Settings → Harness. */
export type HarnessApprovalMode = 'askAlways' | 'askIfUnsafe' | 'fullAccess'

/** Whether a local workflow binary was found. */
export interface HarnessHostStatus {
  /** True when a `codex-app-server` (or `codex`) binary is resolvable. */
  available: boolean
  /** Resolved binary path, or empty when unavailable. */
  binaryPath: string
}

/** Harness preferences that belong to one physical Electron installation. */
export interface HarnessDevicePreferences {
  approvalMode: HarnessApprovalMode
  computerUseEnabled: boolean
  webSearchEnabled: boolean
  computerUseTarget: HarnessComputerTarget | null
  sidebarVisible: boolean
  utilitySidebarVisible: boolean
  utilitySidebarWidth: number
  workFolder: string
  mcpServers: HarnessMcpServerConfig[]
}

/** One direct child in the Harness workspace file browser. */
export interface HarnessWorkspaceEntry {
  name: string
  relativePath: string
  kind: 'directory' | 'file'
  size: number
}

/** Text preview returned for a workspace file. */
export interface HarnessWorkspaceFile {
  relativePath: string
  content: string
  binary: boolean
  truncated: boolean
}

/** Git working-tree snapshot rendered in the Review utility page. */
export interface HarnessReviewSnapshot {
  repository: boolean
  status: string
  summary: string
  diff: string
}

/** One local path selected from the Harness composer. */
export interface HarnessComposerAttachment {
  path: string
  kind: 'file' | 'folder'
}

/** One `@` plugin mention sent with a turn. */
export interface HarnessComposerMention {
  name: string
  /** Codex path such as `app://gmail`, or empty for text-only mentions. */
  path: string
}

/** Extra fields for one `startTurn` IPC call. */
export interface HarnessStartTurnExtras {
  /** Scheduled job that must be marked complete after this local turn. */
  wakeJobId?: string | null
  /** Local files and folders selected from the composer. */
  attachments?: HarnessComposerAttachment[] | null
  /** Plugins and connectors mentioned with `@`. */
  mentions?: HarnessComposerMention[] | null
  /** Optional durable objective for the current thread. */
  goal?: string | null
  /** Starts this turn in Codex plan collaboration mode. */
  planMode?: boolean
  /** Writes HTML and Markdown deliverables into the workspace canvas folder. */
  canvasMode?: boolean
  /** Catalog-clamped reasoning effort for this turn (`turn/start.effort`). */
  effort?: string | null
}

/** Codex `turn/start.effort` values GeoCRM will forward. */
export const HARNESS_REASONING_EFFORTS = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultra',
] as const

/** One catalog-backed reasoning depth. */
export type HarnessReasoningEffortId = (typeof HARNESS_REASONING_EFFORTS)[number]

/**
 * Returns whether a string is a Codex reasoning effort GeoCRM forwards.
 * @param value - Candidate
 * @returns True when the value is allowed on `turn/start`
 */
export function isHarnessReasoningEffortId(value: string): value is HarnessReasoningEffortId {
  return (HARNESS_REASONING_EFFORTS as readonly string[]).includes(value)
}

/** Options for starting a workflow thread. */
export interface HarnessStartOptions {
  /**
   * Working directory for the thread. Defaults to Documents/Harness.
   * Never the CRM git tree unless the user picks it.
   */
  cwd?: string | null
  /** Existing local Codex thread to resume when available. */
  resumeThreadId?: string | null
  /** Context used only when a stored local thread cannot be resumed. */
  continuationInstructions?: string | null
  /** Permission profile for this thread. */
  approvalMode: HarnessApprovalMode
  /** Provider API key from Settings → AI, passed to the child process only. */
  apiKey?: string | null
  /** Model id override. */
  model?: string | null
  /** Provider id selected from the GeoCRM model catalog. */
  provider?: string | null
  /** Provider selected independently for visual desktop control. */
  computerUseProvider?: string | null
  /** Vision-capable model selected for visual desktop control. */
  computerUseModel?: string | null
  /** Whether the local Computer Use dynamic tool is available in this thread. */
  computerUseEnabled?: boolean
  /** Whether the first-party web search tool is available in this thread. */
  webSearchEnabled?: boolean
  /** Desktop display or window selected for visual control. */
  computerUseTarget?: HarnessComputerTarget | null
  /** First-party dynamic tools exposed to the selected tool profile. */
  allowedTools?: string[] | null
  /** Unique executable contract for the selected marketplace tool. */
  activeExpert?: HarnessActiveExpertConfig | null
  /**
   * Frozen VPS Hermes memory snapshot plus skill index, injected as
   * developer instructions. The workflow's own memory feature stays off.
   */
  developerInstructions?: string | null
  /** Signed-in session JWT for `/ai/harness/*` from the main process. */
  accessToken?: string | null
  /** Public geocrm-api origin, e.g. `https://api.example.com`. */
  apiBaseUrl?: string | null
  /**
   * Third-party MCP servers the workflow may connect to. GeoCRM is never in
   * this list: CRM, mail, and calendar use the signed-in session instead.
   */
  mcpServers?: HarnessMcpServerConfig[] | null
}

/** Runtime contract for one selected built-in or cloud-synchronized expert tool. */
export interface HarnessActiveExpertConfig {
  id: string
  executorName: string
  name: string
  instructions: string
  outputMode: 'narrative' | 'table' | 'dashboard' | 'document'
  requiredConnectors: string[]
}

/** One desktop surface that Computer Use can observe and control. */
export interface HarnessComputerTarget {
  id: string
  kind: 'display' | 'window'
  label: string
}

/** Connector metadata returned by the Codex app directory. */
export interface HarnessAppConnector {
  id: string
  name: string
  description: string
  iconUrl: string
  installUrl: string
  accessible: boolean
  enabled: boolean
  installed: boolean
  callable: boolean
  toolNames: string[]
}

/** One third-party MCP server passed to the workflow process. */
export interface HarnessMcpServerConfig {
  name: string
  displayName?: string
  description?: string
  iconDataUrl?: string
  transport: 'stdio' | 'streamableHttp'
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

/** Reserved server name that must never be configured for Harness. */
export const HARNESS_RESERVED_MCP_SERVER = 'geocrm'

/**
 * Reads a string-only record from an untrusted payload.
 * @param value - Candidate record.
 * @returns Trimmed-key string record, or undefined when empty or invalid.
 */
function readMcpStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => Boolean(entry[0].trim()) && typeof entry[1] === 'string',
  )
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

/**
 * Reads a string list from an untrusted payload.
 * @param value - Candidate list.
 * @returns Trimmed non-empty strings, or undefined when none are valid.
 */
function readMcpStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const values = value.filter(
    (item): item is string => typeof item === 'string' && Boolean(item.trim()),
  )
  return values.length > 0 ? values.map((item) => item.trim()) : undefined
}

/**
 * Reads a positive finite number from an untrusted payload.
 * @param value - Candidate numeric value.
 * @returns Positive number, or undefined when invalid.
 */
function readMcpPositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

/**
 * Reads a supported MCP tool approval mode.
 * @param value - Candidate approval mode.
 * @returns Supported approval mode with a prompt-safe default.
 */
function readMcpApprovalMode(
  value: unknown,
): NonNullable<HarnessMcpServerConfig['approvalMode']> {
  return value === 'auto' || value === 'approve' || value === 'writes' ? value : 'prompt'
}

/**
 * Filters an MCP server list down to usable third-party entries.
 * @param raw - Unvalidated list from the renderer.
 * @returns Servers safe to hand to the workflow process.
 */
export function sanitizeMcpServers(raw: unknown): HarnessMcpServerConfig[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const out: HarnessMcpServerConfig[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const record = entry as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name.trim().toLowerCase() : ''
    const transport = record.transport === 'streamableHttp' ? 'streamableHttp' : 'stdio'
    const command = typeof record.command === 'string' ? record.command.trim() : ''
    const url = typeof record.url === 'string' ? record.url.trim() : ''
    if (
      !/^[a-z0-9_-]{1,32}$/.test(name) ||
      name === HARNESS_RESERVED_MCP_SERVER ||
      (transport === 'stdio' ? !command : !/^https:\/\//i.test(url))
    ) {
      continue
    }
    const args = Array.isArray(record.args)
      ? record.args.filter((arg): arg is string => typeof arg === 'string')
      : []
    const environment = readMcpStringRecord(record.env)
    const environmentVariables = readMcpStringList(record.envVars)
    const httpHeaders = readMcpStringRecord(record.httpHeaders)
    const environmentHttpHeaders = readMcpStringRecord(record.envHttpHeaders)
    const enabledTools = readMcpStringList(record.enabledTools)
    const disabledTools = readMcpStringList(record.disabledTools)
    const startupTimeoutSec = readMcpPositiveNumber(record.startupTimeoutSec)
    const toolTimeoutSec = readMcpPositiveNumber(record.toolTimeoutSec)
    const toolApprovalModes = readMcpStringRecord(record.toolApprovalModes)
    const normalizedToolApprovalModes = toolApprovalModes
      ? Object.fromEntries(
          Object.entries(toolApprovalModes).map(([tool, mode]) => [
            tool,
            readMcpApprovalMode(mode),
          ]),
        )
      : undefined
    out.push({
      name,
      ...(typeof record.displayName === 'string' && record.displayName.trim()
        ? { displayName: record.displayName.trim() }
        : {}),
      ...(typeof record.description === 'string' && record.description.trim()
        ? { description: record.description.trim() }
        : {}),
      ...(typeof record.iconDataUrl === 'string' && /^data:image\/png;base64,/i.test(record.iconDataUrl)
        ? { iconDataUrl: record.iconDataUrl }
        : {}),
      transport,
      auth: record.auth === 'bearer' || record.auth === 'none' ? record.auth : 'oauth',
      ...(transport === 'stdio'
        ? {
            command,
            args,
            ...(typeof record.cwd === 'string' && record.cwd.trim()
              ? { cwd: record.cwd.trim() }
              : {}),
            ...(environment ? { env: environment } : {}),
            ...(environmentVariables ? { envVars: environmentVariables } : {}),
          }
        : { url }),
      ...(typeof record.bearerTokenEnvVar === 'string' && record.bearerTokenEnvVar.trim()
        ? { bearerTokenEnvVar: record.bearerTokenEnvVar.trim() }
        : {}),
      ...(httpHeaders ? { httpHeaders } : {}),
      ...(environmentHttpHeaders ? { envHttpHeaders: environmentHttpHeaders } : {}),
      enabled: record.enabled !== false,
      required: record.required === true,
      ...(enabledTools ? { enabledTools } : {}),
      ...(disabledTools ? { disabledTools } : {}),
      approvalMode: readMcpApprovalMode(record.approvalMode),
      ...(normalizedToolApprovalModes ? { toolApprovalModes: normalizedToolApprovalModes } : {}),
      ...(startupTimeoutSec ? { startupTimeoutSec } : {}),
      ...(toolTimeoutSec ? { toolTimeoutSec } : {}),
      ...(typeof record.oauthCallbackUrl === 'string' && /^https?:\/\//i.test(record.oauthCallbackUrl)
        ? { oauthCallbackUrl: record.oauthCallbackUrl.trim() }
        : {}),
      ...(typeof record.oauthCallbackPort === 'number' &&
      Number.isInteger(record.oauthCallbackPort) &&
      record.oauthCallbackPort > 0 &&
      record.oauthCallbackPort <= 65535
        ? { oauthCallbackPort: record.oauthCallbackPort }
        : {}),
      riskAcknowledged: record.riskAcknowledged === true,
    })
  }
  return out
}

/** Answer to one pending approval request. */
export type HarnessApprovalDecisionWire = 'accept' | 'acceptForSession' | 'decline'

/**
 * Returns whether a value is a known approval mode.
 * @param value - Candidate string.
 * @returns True for a supported permission profile.
 */
export function isHarnessApprovalMode(value: unknown): value is HarnessApprovalMode {
  return value === 'askAlways' || value === 'askIfUnsafe' || value === 'fullAccess'
}
