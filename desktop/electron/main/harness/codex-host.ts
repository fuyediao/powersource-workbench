/**
 * Local Codex `app-server` host for Harness.
 *
 * Spawns the pinned binary with `--stdio`, speaks newline-delimited JSON-RPC,
 * and projects `item/*` notifications onto the renderer's Harness event shape.
 * Approval requests are forwarded to the renderer and answered from there.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { app, shell } from 'electron'
import { resolveCodexBinary, workflowSpawnArgs } from './codex-binary'
import {
  COMPUTER_USE_TOOL_NAME,
  FIRST_PARTY_DYNAMIC_TOOLS,
  resolveFirstPartyDynamicTools,
  isFirstPartyToolName,
  parseToolArguments,
} from './first-party-tools'
import { runComputerUse } from './computer-use'
import { isLocalOfficeToolName, runLocalOfficeTool } from './office-tools'
import { listComputerTargets } from './computer-targets'
import {
  callHarnessTool,
  completeHarnessWakeItem,
} from './harness-api'
import { resolveHarnessWorkFolder, ensureHarnessCanvasFolder } from './work-folder'
import { expandMailAttachments, uploadHarnessLocalFile } from './local-tool-input'
import { searchHarnessSessions } from '../chat-history'
import { mergeWorkAgentInstructions } from '../../shared/harness-work-agent'

/** Appended to the user turn when the composer Canvas toggle is on. */
const CANVAS_MODE_TURN_INSTRUCTIONS = `Canvas mode is on for this turn. A Markdown reply in chat is not the Canvas document. Use a file write tool to save the primary HTML or Markdown deliverable under the workspace folder canvas/. Prefer canvas/index.html for a web page or canvas/document.md for Markdown. HTML must be a single self-contained file with inline CSS and inline JavaScript. After writing, reply with a short confirmation that names that path. Do not write those deliverables outside canvas/.`
import { reportClawdState, requestClawdPermission } from '../clawd-bridge'
import type {
  HarnessApprovalDecisionWire,
  HarnessActiveExpertConfig,
  HarnessApprovalMode,
  HarnessAppConnector,
  HarnessComputerTarget,
  HarnessStartOptions,
  HarnessStartTurnExtras,
} from '../../shared/harness'

/** JSON-RPC message read from the workflow process. */
interface RpcMessage {
  id?: number | string
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: { message?: string }
}

/** Sandbox and approval settings derived from the permission profile. */
interface PermissionProfile {
  approvalPolicy: string
  sandboxPolicy: Record<string, unknown>
}

/** Client identity reported to the workflow process. */
const CLIENT_INFO = {
  name: 'workbench_harness',
  title: 'PowerSource Workbench Harness',
  version: '1',
}

/**
 * Maps a Settings permission profile onto Codex approval and sandbox policy.
 * @param mode - Profile chosen in Settings → Harness.
 * @returns Approval policy and sandbox policy for `turn/start`.
 */
function permissionProfile(mode: HarnessApprovalMode): PermissionProfile {
  if (mode === 'fullAccess') {
    return {
      approvalPolicy: 'never',
      sandboxPolicy: { type: 'dangerFullAccess' },
    }
  }
  if (mode === 'askAlways') {
    return {
      approvalPolicy: 'untrusted',
      sandboxPolicy: { type: 'readOnly', networkAccess: false },
    }
  }
  return {
    approvalPolicy: 'on-request',
    sandboxPolicy: {
      type: 'workspaceWrite',
      writableRoots: [],
      networkAccess: false,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false,
    },
  }
}

/**
 * Reads a string field from an unknown record.
 * @param source - Params object.
 * @param key - Field name.
 * @returns Trimmed string, or empty.
 */
function readString(source: Record<string, unknown> | undefined, key: string): string {
  const value = source?.[key]
  return typeof value === 'string' ? value : ''
}

/**
 * Reads a number field from an unknown record.
 * @param source - Params object.
 * @param key - Field name.
 * @returns Number, or null.
 */
function readNumber(source: Record<string, unknown> | undefined, key: string): number | null {
  const value = source?.[key]
  return typeof value === 'number' ? value : null
}

/**
 * Formats an unknown protocol value for transcript display.
 * @param value - JSON-compatible protocol value.
 * @returns Readable text, or an empty string when absent.
 */
function formatProtocolValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/**
 * Reads the auth user id from a session JWT payload without verifying the signature.
 * The token was already accepted by workbench-api; this only scopes local SQLite.
 * @param token - Session JWT.
 * @returns User id, or empty.
 */
function userIdFromAccessToken(token: string): string {
  const parts = token.split('.')
  if (parts.length < 2) {
    return ''
  }
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8')
    const payload = JSON.parse(json) as { sub?: unknown }
    return typeof payload.sub === 'string' ? payload.sub.trim() : ''
  } catch {
    return ''
  }
}

/**
 * Extracts text and media references from dynamic-tool output items.
 * @param value - Raw `contentItems` value.
 * @returns Newline-separated output summary.
 */
function formatDynamicContent(value: unknown): string {
  if (!Array.isArray(value)) return ''
  return value
    .flatMap((entry): string[] => {
      if (!entry || typeof entry !== 'object') return []
      const record = entry as Record<string, unknown>
      const text = readString(record, 'text')
      if (text) return [text]
      const imageUrl = readString(record, 'imageUrl')
      if (imageUrl) return [`Image: ${imageUrl}`]
      const audioUrl = readString(record, 'audioUrl')
      return audioUrl ? [`Audio: ${audioUrl}`] : []
    })
    .join('\n')
}

/**
 * Builds a concise one-line subtitle from common tool arguments.
 * @param tool - Tool name.
 * @param value - Raw arguments value.
 * @returns Human-readable tool summary.
 */
function summarizeToolArguments(tool: string, value: unknown): string {
  const args = parseToolArguments(value)
  for (const key of ['task', 'entity', 'query', 'name']) {
    const candidate = args[key]
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }
  return tool
}

/**
 * Normalizes a Codex item status onto the renderer's status union.
 * @param raw - Status string from the workflow.
 * @returns Renderer status value.
 */
function normalizeStatus(raw: string): 'inProgress' | 'completed' | 'failed' | 'declined' {
  if (raw === 'completed' || raw === 'failed' || raw === 'declined') {
    return raw
  }
  return 'inProgress'
}

/**
 * Projects one Codex `ThreadItem` onto the renderer's Harness item shape.
 * Item kinds the transcript does not render return null.
 * @param raw - Item payload from a notification.
 * @returns Renderer item, or null when unsupported.
 */
function projectItem(raw: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!raw) {
    return null
  }
  const type = readString(raw, 'type')
  const id = readString(raw, 'id')
  if (!id) {
    return null
  }

  if (type === 'userMessage') {
    const content = Array.isArray(raw.content) ? raw.content : []
    const text = content
      .map((entry) =>
        entry && typeof entry === 'object' ? readString(entry as Record<string, unknown>, 'text') : '',
      )
      .filter(Boolean)
      .join('\n')
    return { id, type: 'userMessage', text }
  }

  if (type === 'agentMessage') {
    return { id, type: 'agentMessage', text: readString(raw, 'text') }
  }

  if (type === 'reasoning') {
    const summary = Array.isArray(raw.summary) ? raw.summary : []
    const text = summary.filter((entry): entry is string => typeof entry === 'string').join('\n')
    return text ? { id, type: 'reasoning', text } : null
  }

  if (type === 'commandExecution') {
    return {
      id,
      type: 'commandExecution',
      command: readString(raw, 'command'),
      cwd: readString(raw, 'cwd'),
      status: normalizeStatus(readString(raw, 'status')),
      aggregatedOutput: readString(raw, 'aggregatedOutput'),
      exitCode: readNumber(raw, 'exitCode'),
    }
  }

  if (type === 'fileChange') {
    const rawChanges = Array.isArray(raw.changes) ? raw.changes : []
    const changes = rawChanges
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
      .map((entry) => ({
        path: readString(entry, 'path'),
        kind: readString(entry, 'kind') || 'update',
      }))
    const diff = rawChanges
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
      .map((entry) => readString(entry, 'diff'))
      .filter(Boolean)
      .join('\n')
    return {
      id,
      type: 'fileChange',
      changes,
      status: normalizeStatus(readString(raw, 'status')),
      diff: diff || null,
    }
  }

  if (type === 'mcpToolCall') {
    const errorValue = raw.error
    const error =
      errorValue && typeof errorValue === 'object'
        ? readString(errorValue as Record<string, unknown>, 'message') || formatProtocolValue(errorValue)
        : formatProtocolValue(errorValue)
    return {
      id,
      type: 'mcpToolCall',
      server: readString(raw, 'server'),
      tool: readString(raw, 'tool'),
      status: normalizeStatus(readString(raw, 'status')),
      arguments: formatProtocolValue(raw.arguments),
      result: formatProtocolValue(raw.result),
      error,
      durationMs: readNumber(raw, 'durationMs'),
    }
  }

  if (type === 'dynamicToolCall') {
    const tool = readString(raw, 'tool')
    return {
      id,
      type: 'crmToolCall',
      tool,
      summary: summarizeToolArguments(tool, raw.arguments),
      status: normalizeStatus(readString(raw, 'status')),
      arguments: formatProtocolValue(raw.arguments),
      result: formatDynamicContent(raw.contentItems),
      durationMs: readNumber(raw, 'durationMs'),
    }
  }

  return null
}

/**
 * Projects persisted items returned by `thread/resume`.
 * @param value - Thread response payload.
 * @returns Renderer items in turn order.
 */
function projectThreadHistory(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== 'object') return []
  const thread = (value as { thread?: unknown }).thread
  if (!thread || typeof thread !== 'object') return []
  const turns = Array.isArray((thread as { turns?: unknown }).turns)
    ? ((thread as { turns: unknown[] }).turns)
    : []
  const items: Record<string, unknown>[] = []
  for (const turn of turns) {
    if (!turn || typeof turn !== 'object') continue
    const rawItems = Array.isArray((turn as { items?: unknown }).items)
      ? ((turn as { items: unknown[] }).items)
      : []
    for (const raw of rawItems) {
      if (!raw || typeof raw !== 'object') continue
      const projected = projectItem(raw as Record<string, unknown>)
      if (projected) items.push(projected)
    }
  }
  return items
}

/**
 * One local workflow process plus its thread.
 * A host is created per renderer session and torn down with the window.
 */
export class CodexHost {
  private child: ChildProcessWithoutNullStreams | null = null
  private buffer = ''
  private nextRequestId = 1
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void }
  >()

  /** Server-initiated approval requests awaiting a renderer decision. */
  private readonly approvals = new Map<string, number | string>()
  private readonly computerApprovals = new Map<
    string,
    (decision: HarnessApprovalDecisionWire) => void
  >()
  private threadId = ''
  private turnId = ''
  private disposed = false
  private approvalMode: HarnessApprovalMode = 'askIfUnsafe'
  private accessToken = ''
  private apiBaseUrl = ''
  private model = ''
  private computerUseProvider = ''
  private computerUseModel = ''
  private computerUseTarget: HarnessComputerTarget | null = null
  private allowedTools = new Set<string>()
  private activeExpert: HarnessActiveExpertConfig | null = null
  private pendingWakeJobId: string | null = null
  private workFolder = ''
  private readonly clawdPermissionAborts = new Set<AbortController>()
  private eventTarget: (event: Record<string, unknown>) => void
  private readonly eventLog: Record<string, unknown>[] = []
  private readonly emit: (event: Record<string, unknown>) => void

  /**
   * @param emit - Sends one projected event to the renderer.
   */
  constructor(emit: (event: Record<string, unknown>) => void) {
    this.eventTarget = emit
    this.emit = (event) => {
      this.eventLog.push(event)
      if (this.eventLog.length > 500) this.eventLog.shift()
      this.eventTarget(event)
    }
  }

  /**
   * Reports whether a turn is currently active.
   * @returns True while a turn can still emit work or approvals.
   */
  hasActiveTurn(): boolean {
    return Boolean(this.turnId)
  }

  /**
   * Moves renderer event delivery without restarting the workflow process.
   * @param emit - Destination renderer sender.
   * @returns Nothing.
   */
  rebindEmit(emit: (event: Record<string, unknown>) => void): void {
    this.eventTarget = emit
  }

  /**
   * Returns the bounded event projection needed to hydrate a transferred renderer.
   * @returns Previously emitted workflow events in order.
   */
  snapshot(): Record<string, unknown>[] {
    return this.eventLog.map((event) => ({ ...event }))
  }

  /**
   * Whether a workflow process is running.
   * @returns True while the child process is alive.
   */
  get isRunning(): boolean {
    return this.child !== null
  }

  /**
   * Returns the Clawd session id for this workflow thread.
   * @returns Thread id, or `harness` before a thread exists.
   */
  private clawdSessionId(): string {
    return this.threadId.trim() || 'harness'
  }

  /**
   * Posts one Harness lifecycle event to Clawd when the bridge is installed.
   * @param event - Clawd event name.
   * @param state - Clawd visual state.
   * @param toolName - Optional tool label.
   * @returns Nothing.
   */
  private reportClawd(event: string, state: string, toolName?: string): void {
    reportClawdState({
      sessionId: this.clawdSessionId(),
      event,
      state,
      cwd: this.workFolder || undefined,
      toolName,
    })
  }

  /**
   * Asks Clawd for Allow/Deny. Null means Workbench should show its native card.
   * @param input - Tool identity and bounded arguments.
   * @returns `accept`, `decline`, or null.
   */
  private async tryClawdApproval(input: {
    toolName: string
    toolUseId?: string
    reason?: string | null
    toolInput?: Record<string, unknown>
  }): Promise<'accept' | 'decline' | null> {
    const controller = new AbortController()
    this.clawdPermissionAborts.add(controller)
    try {
      const result = await requestClawdPermission({
        sessionId: this.clawdSessionId(),
        toolName: input.toolName,
        toolUseId: input.toolUseId,
        reason: input.reason,
        toolInput: input.toolInput,
        cwd: this.workFolder,
        signal: controller.signal,
      })
      if (this.disposed || result.kind === 'cancelled') {
        return null
      }
      if (result.kind === 'decision' && result.decision === 'allow') {
        return 'accept'
      }
      if (result.kind === 'decision' && result.decision === 'deny') {
        return 'decline'
      }
      return null
    } finally {
      this.clawdPermissionAborts.delete(controller)
    }
  }

  /**
   * Cancels in-flight Clawd permission POSTs.
   * @returns Nothing.
   */
  private abortClawdPermissions(): void {
    for (const controller of this.clawdPermissionAborts) {
      controller.abort()
    }
    this.clawdPermissionAborts.clear()
  }

  /**
   * Reports a projected item as Clawd tool work when the type is a tool card.
   * @param item - Projected Harness item.
   * @param started - True for item/started.
   * @returns Nothing.
   */
  private reportClawdItem(item: Record<string, unknown>, started: boolean): void {
    const type = typeof item.type === 'string' ? item.type : ''
    if (
      type !== 'commandExecution'
      && type !== 'fileChange'
      && type !== 'mcpToolCall'
      && type !== 'crmToolCall'
      && type !== 'computerUseStep'
    ) {
      return
    }
    const toolName =
      type === 'commandExecution'
        ? 'commandExecution'
        : type === 'fileChange'
          ? 'fileChange'
          : type === 'mcpToolCall'
            ? (typeof item.server === 'string' && typeof item.tool === 'string'
              ? `${item.server}/${item.tool}`
              : 'mcpToolCall')
            : type === 'crmToolCall'
              ? (typeof item.tool === 'string' ? item.tool : 'crmToolCall')
              : 'computerUse'
    this.reportClawd(started ? 'PreToolUse' : 'PostToolUse', 'working', toolName)
  }

  /**
   * Starts the workflow process and opens a thread.
   * @param options - Working directory, permission profile, and provider key.
   * @returns Nothing.
   */
  async start(options: HarnessStartOptions): Promise<void> {
    if (this.child) {
      return
    }
    const binary = resolveCodexBinary()
    if (!binary) {
      throw new Error('No local Codex workflow binary was found.')
    }
    this.approvalMode = options.approvalMode
    this.accessToken = options.accessToken?.trim() || ''
    this.apiBaseUrl = options.apiBaseUrl?.trim() || ''
    this.model = options.model?.trim() || ''
    this.computerUseProvider = options.computerUseProvider?.trim() || ''
    this.computerUseModel = options.computerUseModel?.trim() || ''
    this.computerUseTarget = options.computerUseTarget ?? null
    this.activeExpert = options.activeExpert ?? null
    this.allowedTools = new Set(
      resolveFirstPartyDynamicTools(options.allowedTools, options.webSearchEnabled === true)
        .map((tool) => tool.name),
    )
    const cwd = resolveHarnessWorkFolder(options.cwd)
    this.workFolder = cwd

    // Per-OS-user Codex home; never shared with the VPS Hermes profile.
    const codexHome = path.join(app.getPath('userData'), 'codex-home')
    mkdirSync(codexHome, { recursive: true })
    const env: NodeJS.ProcessEnv = { ...process.env, CODEX_HOME: codexHome }
    if (options.apiKey) {
      env.OPENAI_API_KEY = options.apiKey
    }
    if (options.accessToken) {
      env.WORKBENCH_HARNESS_TOKEN = options.accessToken
    }

    const child = spawn(binary, workflowSpawnArgs(binary), {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.child = child

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => this.consume(chunk))
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      console.warn('[harness] codex app-server:', chunk.trimEnd())
    })
    child.on('exit', (code) => {
      this.child = null
      this.rejectAllPending(new Error(`Codex app-server exited (${code ?? 'unknown'}).`))
      if (!this.disposed) {
        this.emit({ type: 'turnFailed', message: `Workflow stopped (exit ${code ?? 'unknown'}).` })
      }
    })
    child.on('error', (error: Error) => {
      this.child = null
      this.rejectAllPending(error)
      if (!this.disposed) {
        this.emit({ type: 'turnFailed', message: error.message })
      }
    })

    await this.request('initialize', {
      clientInfo: CLIENT_INFO,
      capabilities: { experimentalApi: true },
    })
    this.notify('initialized', {})

    // Long-term memory belongs to the VPS Hermes profile, not Codex, and MCP
    // is only ever used for third-party services (`workbench` is filtered out).
    const config: Record<string, unknown> = {
      'features.memories': false,
      'features.apps': true,
    }
    const provider = options.provider?.trim().toLowerCase() || ''
    if (provider && options.apiBaseUrl && options.accessToken) {
      config.model_provider = 'workbench-harness'
      config['model_providers.workbench-harness'] = {
        name: 'PowerSource Workbench Harness',
        base_url: `${options.apiBaseUrl.replace(/\/$/, '')}/ai/harness`,
        env_key: 'WORKBENCH_HARNESS_TOKEN',
        wire_api: 'responses',
        http_headers: { 'x-workbench-provider': provider },
      }
    }
    for (const server of options.mcpServers ?? []) {
      if (server.transport === 'streamableHttp' && server.url) {
        config[`mcp_servers.${server.name}.url`] = server.url
        if (server.auth === 'oauth') {
          config[`mcp_servers.${server.name}.auth`] = 'oauth'
        }
        if (server.bearerTokenEnvVar) {
          config[`mcp_servers.${server.name}.bearer_token_env_var`] = server.bearerTokenEnvVar
        }
        if (server.httpHeaders) {
          config[`mcp_servers.${server.name}.http_headers`] = server.httpHeaders
        }
        if (server.envHttpHeaders) {
          config[`mcp_servers.${server.name}.env_http_headers`] = server.envHttpHeaders
        }
      } else if (server.command) {
        config[`mcp_servers.${server.name}.command`] = server.command
        config[`mcp_servers.${server.name}.args`] = server.args ?? []
        if (server.cwd) {
          config[`mcp_servers.${server.name}.cwd`] = server.cwd
        }
        if (server.env) {
          config[`mcp_servers.${server.name}.env`] = server.env
        }
        if (server.envVars) {
          config[`mcp_servers.${server.name}.env_vars`] = server.envVars
        }
      }
      config[`mcp_servers.${server.name}.enabled`] = server.enabled !== false
      config[`mcp_servers.${server.name}.required`] = server.required === true
      config[`mcp_servers.${server.name}.default_tools_approval_mode`] =
        server.approvalMode ?? 'prompt'
      if (server.enabledTools) {
        config[`mcp_servers.${server.name}.enabled_tools`] = server.enabledTools
      }
      if (server.disabledTools) {
        config[`mcp_servers.${server.name}.disabled_tools`] = server.disabledTools
      }
      if (server.startupTimeoutSec) {
        config[`mcp_servers.${server.name}.startup_timeout_sec`] = server.startupTimeoutSec
      }
      if (server.toolTimeoutSec) {
        config[`mcp_servers.${server.name}.tool_timeout_sec`] = server.toolTimeoutSec
      }
      for (const [tool, mode] of Object.entries(server.toolApprovalModes ?? {})) {
        config[`mcp_servers.${server.name}.tools.${tool}.approval_mode`] = mode
      }
    }
    const oauthProfile = (options.mcpServers ?? []).find(
      (server) => server.oauthCallbackUrl || server.oauthCallbackPort,
    )
    if (oauthProfile?.oauthCallbackUrl) {
      config.mcp_oauth_callback_url = oauthProfile.oauthCallbackUrl
    }
    if (oauthProfile?.oauthCallbackPort) {
      config.mcp_oauth_callback_port = oauthProfile.oauthCallbackPort
    }

    const threadOptions = {
      cwd,
      ...(options.model ? { model: options.model } : {}),
      developerInstructions: mergeWorkAgentInstructions(options.developerInstructions),
      dynamicTools: [
        ...FIRST_PARTY_DYNAMIC_TOOLS.filter(
          (tool) =>
            this.allowedTools.has(tool.name) &&
            (options.computerUseEnabled || tool.name !== COMPUTER_USE_TOOL_NAME),
        ),
        ...(this.activeExpert ? [{
          type: 'function' as const,
          name: this.activeExpert.executorName,
          description: `Initialize the independent ${this.activeExpert.name} execution contract. Call this once before performing the requested specialist workflow.`,
          inputSchema: {
            type: 'object' as const,
            properties: {
              request: { type: 'string', description: 'The concrete specialist outcome requested by the user.' },
              context: { type: 'string', description: 'Known facts, constraints, and source context.' },
            },
            required: ['request'],
            additionalProperties: false,
          },
        }] : []),
      ],
      config,
    }
    let thread: { thread?: { id?: string; turns?: unknown[] } } | undefined
    const resumeThreadId = options.resumeThreadId?.trim() || ''
    if (resumeThreadId) {
      try {
        thread = (await this.request('thread/resume', {
          threadId: resumeThreadId,
          ...threadOptions,
        })) as { thread?: { id?: string; turns?: unknown[] } } | undefined
      } catch (error) {
        console.warn('[harness] local thread resume failed; starting from cloud history:', error)
        const developerInstructions = mergeWorkAgentInstructions(
          [options.developerInstructions?.trim(), options.continuationInstructions?.trim()]
            .filter((value): value is string => Boolean(value))
            .join('\n\n'),
        )
        thread = (await this.request('thread/start', {
          ...threadOptions,
          developerInstructions,
          sessionStartSource: 'clear',
        })) as { thread?: { id?: string; turns?: unknown[] } } | undefined
      }
    } else {
      thread = (await this.request('thread/start', threadOptions)) as
        | { thread?: { id?: string; turns?: unknown[] } }
        | undefined
    }

    this.threadId = thread?.thread?.id ?? ''
    if (!this.threadId) {
      throw new Error('Codex app-server did not return a thread id.')
    }
    this.emit({ type: 'threadStarted', threadId: this.threadId })
    this.reportClawd('SessionStart', 'idle')
    for (const item of projectThreadHistory(thread)) {
      this.emit({ type: 'itemCompleted', item })
    }
    await this.refreshMcpStatus()
  }

  /**
   * Opens the app-server OAuth flow for one configured MCP server.
   * @param name - MCP config name.
   * @returns Nothing.
   */
  async loginMcp(name: string): Promise<void> {
    if (!this.child || !this.threadId) {
      throw new Error('The Harness workflow is not running.')
    }
    const result = (await this.request('mcpServer/oauth/login', {
      name: name.trim(),
      threadId: this.threadId,
    })) as { authorizationUrl?: string } | undefined
    const authorizationUrl = result?.authorizationUrl?.trim() || ''
    if (!/^https?:\/\//i.test(authorizationUrl)) {
      throw new Error('The MCP server did not return an authorization URL.')
    }
    await shell.openExternal(authorizationUrl)
  }

  /**
   * Lists hosted connectors and merges directory metadata with runtime state.
   * @param forceRefetch - Whether Codex should bypass its connector cache.
   * @returns Connector directory rows.
   */
  async listConnectors(forceRefetch = false): Promise<HarnessAppConnector[]> {
    if (!this.child || !this.threadId) throw new Error('The Harness workflow is not running.')
    const listed = (await this.request('app/list', {
      limit: 100,
      threadId: this.threadId,
      forceRefetch,
    })) as { data?: unknown[] } | undefined
    const baseRows = (listed?.data ?? []).flatMap((value) => {
      if (!value || typeof value !== 'object') return []
      const row = value as Record<string, unknown>
      const id = readString(row, 'id')
      const name = readString(row, 'name')
      if (!id || !name) return []
      return [{
        id,
        name,
        description: readString(row, 'description'),
        iconUrl: readString(row, 'logoUrl'),
        installUrl: readString(row, 'installUrl'),
        accessible: row.isAccessible === true,
        enabled: row.isEnabled !== false,
      }]
    })
    if (baseRows.length === 0) return []
    const [details, installed] = await Promise.all([
      this.request('app/read', {
        appIds: baseRows.map((row) => row.id),
        threadId: this.threadId,
        includeTools: true,
      }),
      this.request('app/installed', { threadId: this.threadId, forceRefresh: forceRefetch }),
    ])
    const detailRows = ((details as { apps?: unknown[] } | undefined)?.apps ?? [])
    const installedRows = ((installed as { apps?: unknown[] } | undefined)?.apps ?? [])
    const detailsById = new Map(detailRows.flatMap((value): Array<[string, Record<string, unknown>]> => {
      if (!value || typeof value !== 'object') return []
      const row = value as Record<string, unknown>
      const id = readString(row, 'id')
      return id ? [[id, row]] : []
    }))
    const installedById = new Map(installedRows.flatMap((value): Array<[string, Record<string, unknown>]> => {
      if (!value || typeof value !== 'object') return []
      const row = value as Record<string, unknown>
      const id = readString(row, 'id')
      return id ? [[id, row]] : []
    }))
    return baseRows.map((row): HarnessAppConnector => {
      const detail = detailsById.get(row.id)
      const runtime = installedById.get(row.id)
      const tools = Array.isArray(detail?.toolSummaries) ? detail.toolSummaries : []
      return {
        ...row,
        description: readString(detail, 'description') || row.description,
        iconUrl: readString(detail, 'iconUrl') || row.iconUrl,
        installUrl: readString(detail, 'installUrl') || row.installUrl,
        installed: Boolean(runtime),
        callable: runtime?.callable === true,
        enabled: runtime ? runtime.enabled === true : row.enabled,
        toolNames: tools.flatMap((value) => {
          if (!value || typeof value !== 'object') return []
          const name = readString(value as Record<string, unknown>, 'name')
          return name ? [name] : []
        }),
      }
    })
  }

  /**
   * Opens a connector installation URL owned by its provider.
   * @param connectorId - Connector identifier used for audit context.
   * @param installUrl - Provider-owned HTTPS installation URL.
   * @returns Nothing.
   */
  async installConnector(connectorId: string, installUrl: string): Promise<void> {
    if (!connectorId.trim() || !/^https:\/\//i.test(installUrl)) {
      throw new Error('The connector installation URL is invalid.')
    }
    await shell.openExternal(installUrl)
  }

  /**
   * Lists displays and native windows available for visual control.
   * @returns Computer Use targets.
   */
  async listComputerTargets(): Promise<HarnessComputerTarget[]> {
    return listComputerTargets()
  }

  /**
   * Publishes the current Codex MCP inventory to the renderer.
   * @returns Nothing.
   */
  private async refreshMcpStatus(): Promise<void> {
    if (!this.child || !this.threadId) return
    try {
      const result = (await this.request('mcpServerStatus/list', {
        detail: 'toolsAndAuthOnly',
        threadId: this.threadId,
      })) as { data?: unknown[] } | undefined
      const servers = (result?.data ?? []).flatMap((value) => {
        if (!value || typeof value !== 'object') return []
        const record = value as Record<string, unknown>
        const name = readString(record, 'name')
        if (!name) return []
        return [{
          name,
          runtimeStatus: typeof record.runtimeStatus === 'string' ? record.runtimeStatus : null,
          authStatus: readString(record, 'authStatus') || 'unknown',
        }]
      })
      this.emit({ type: 'mcpStatus', servers })
    } catch (error) {
      console.warn('[harness] MCP status is unavailable:', error)
    }
  }

  /**
   * Sends one task and starts a turn.
   * @param text - Task text from the composer.
   * @param extras - Optional wake-job id to complete after the turn.
   * @returns Nothing.
   */
  async startTurn(text: string, extras?: HarnessStartTurnExtras | null): Promise<void> {
    if (!this.child || !this.threadId) {
      throw new Error('The Harness workflow is not running.')
    }
    this.pendingWakeJobId = extras?.wakeJobId?.trim() || null
    const profile = permissionProfile(this.approvalMode)
    const goal = extras?.goal?.trim() || ''
    if (goal) {
      await this.request('thread/goal/set', {
        threadId: this.threadId,
        objective: goal,
      })
    }
    const attachments = extras?.attachments ?? []
    const imageExtensions = new Set(['.gif', '.jpeg', '.jpg', '.png', '.webp'])
    const audioExtensions = new Set(['.m4a', '.mp3', '.ogg', '.wav', '.webm'])
    const officeExtensions = new Set(['.docx', '.xlsx', '.pptx'])
    const pathInputs: Array<Record<string, unknown>> = []
    const referencedPaths: string[] = []
    const officePaths: string[] = []
    for (const attachment of attachments) {
      const attachmentPath = attachment.path.trim()
      if (!attachmentPath) continue
      const extension = path.extname(attachmentPath).toLowerCase()
      if (attachment.kind === 'file' && imageExtensions.has(extension)) {
        pathInputs.push({ type: 'localImage', path: attachmentPath })
      } else if (attachment.kind === 'file' && audioExtensions.has(extension)) {
        pathInputs.push({ type: 'localAudio', path: attachmentPath })
      } else {
        referencedPaths.push(attachmentPath)
        if (attachment.kind === 'file' && officeExtensions.has(extension)) {
          officePaths.push(attachmentPath)
        }
      }
    }
    const attachmentPrompt = referencedPaths.length
      ? `Attached local paths:\n${referencedPaths.map((value) => `- ${value}`).join('\n')}\n\nUser request:\n${text}`
      : text
    const prompt = officePaths.length
      ? `Use inspect_local_office_file for attached OOXML Office files before drawing conclusions from their contents. Use edit_local_office_file or create_local_office_file for Office output instead of manually unpacking ZIP parts.\n\n${attachmentPrompt}`
      : attachmentPrompt
    const turnText = extras?.canvasMode
      ? `${CANVAS_MODE_TURN_INSTRUCTIONS}\n\n${prompt}`
      : prompt
    if (extras?.canvasMode) {
      ensureHarnessCanvasFolder(this.workFolder)
    }
    const effort = extras?.effort?.trim() || null
    const collaborationMode = extras?.planMode
      ? {
          mode: 'plan',
          settings: {
            model: this.model,
            reasoning_effort: effort,
            developer_instructions: null,
          },
        }
      : undefined
    const mentionInputs = (extras?.mentions ?? []).flatMap((mention) => {
      const name = mention.name.trim()
      const mentionPath = mention.path.trim()
      if (!name) return []
      if (!mentionPath.startsWith('app://') && !mentionPath.startsWith('plugin://')) return []
      return [{ type: 'mention', name, path: mentionPath }]
    })
    const turn = (await this.request('turn/start', {
      threadId: this.threadId,
      input: [{ type: 'text', text: turnText, text_elements: [] }, ...mentionInputs, ...pathInputs],
      approvalPolicy: profile.approvalPolicy,
      sandboxPolicy: profile.sandboxPolicy,
      ...(effort ? { effort } : {}),
      ...(collaborationMode ? { collaborationMode } : {}),
    })) as { turn?: { id?: string } } | undefined
    this.turnId = turn?.turn?.id ?? ''
    this.emit({ type: 'turnStarted', turnId: this.turnId })
  }

  /**
   * Requests cancellation of the in-flight turn.
   * @returns Nothing.
   */
  async interrupt(): Promise<void> {
    if (!this.child || !this.threadId || !this.turnId) {
      return
    }
    await this.request('turn/interrupt', { threadId: this.threadId, turnId: this.turnId })
    this.emit({ type: 'turnInterrupted' })
    this.reportClawd('Stop', 'attention')
  }

  /**
   * Answers a pending approval request.
   * @param requestId - Approval id previously sent to the renderer.
   * @param decision - User's choice.
   * @returns Nothing.
   */
  respondToApproval(requestId: string, decision: HarnessApprovalDecisionWire): void {
    const resolveComputerApproval = this.computerApprovals.get(requestId)
    if (resolveComputerApproval) {
      this.computerApprovals.delete(requestId)
      resolveComputerApproval(decision)
      this.emit({ type: 'approvalResolved', requestId })
      return
    }
    const rpcId = this.approvals.get(requestId)
    if (rpcId === undefined) {
      return
    }
    this.approvals.delete(requestId)
    this.write({ id: rpcId, result: { decision } })
    this.emit({ type: 'approvalResolved', requestId })
  }

  /**
   * Terminates the workflow process and clears state.
   * @returns Nothing.
   */
  dispose(): void {
    this.disposed = true
    this.abortClawdPermissions()
    this.reportClawd('SessionEnd', 'sleeping')
    this.approvals.clear()
    for (const resolveApproval of this.computerApprovals.values()) resolveApproval('decline')
    this.computerApprovals.clear()
    this.rejectAllPending(new Error('The Harness workflow was closed.'))
    this.child?.kill()
    this.child = null
    this.threadId = ''
    this.turnId = ''
    this.pendingWakeJobId = null
  }

  /**
   * Completes a wake job after a local turn ends.
   * @param failed - True when the turn failed or was interrupted.
   * @returns Nothing.
   */
  private finishTurn(failed: boolean): void {
    const wakeJobId = this.pendingWakeJobId
    this.pendingWakeJobId = null
    const token = this.accessToken
    const base = this.apiBaseUrl
    if (token && base && wakeJobId) {
      void completeHarnessWakeItem(base, token, wakeJobId, failed).catch(() => undefined)
    }
    this.turnId = ''
  }

  /**
   * Dispatches one first-party dynamic tool call through workbench-api.
   * @param rpcId - JSON-RPC id to answer.
   * @param params - Codex `item/tool/call` parameters.
   * @returns Nothing.
   */
  private async handleDynamicToolCall(
    rpcId: number | string,
    params: Record<string, unknown> | undefined,
  ): Promise<void> {
    const tool = readString(params, 'tool')
    const args = parseToolArguments(params?.arguments)
    this.reportClawd('PreToolUse', 'working', tool || 'tool')
    if (this.activeExpert && tool === this.activeExpert.executorName) {
      this.write({
        id: rpcId,
        result: {
          contentItems: [{
            type: 'inputText',
            text: JSON.stringify({
              executorId: this.activeExpert.id,
              executorName: this.activeExpert.executorName,
              instructions: this.activeExpert.instructions,
              outputMode: this.activeExpert.outputMode,
              requiredConnectors: this.activeExpert.requiredConnectors,
              grantedCapabilities: [...this.allowedTools],
              request: args.request ?? '',
              context: args.context ?? '',
            }),
          }],
          success: true,
        },
      })
      return
    }
    if (tool === COMPUTER_USE_TOOL_NAME) {
      const parentId = readString(params, 'callId') || `computer-use-${String(rpcId)}`
      const task = typeof args.task === 'string' ? args.task.trim() : ''
      if (!task || !this.accessToken || !this.apiBaseUrl || !this.computerUseProvider || !this.computerUseModel) {
        this.write({
          id: rpcId,
          result: {
            contentItems: [{ type: 'inputText', text: JSON.stringify({ error: 'Computer Use is not configured.' }) }],
            success: false,
          },
        })
        return
      }
      try {
        let sensitiveActionsApproved = this.approvalMode === 'fullAccess'
        const text = await runComputerUse({
          apiBaseUrl: this.apiBaseUrl,
          accessToken: this.accessToken,
          provider: this.computerUseProvider,
          model: this.computerUseModel,
          task,
          target: this.computerUseTarget,
          onSensitiveAction: async (action, screenshotDataUrl) => {
            if (sensitiveActionsApproved) return 'acceptForSession'
            const requestId = `computer-use:${parentId}:${randomUUID()}`
            const clawdDecision = await this.tryClawdApproval({
              toolName: 'computerUse',
              toolUseId: requestId,
              reason: action.reason?.trim() || null,
              toolInput: { action: action.action },
            })
            if (clawdDecision === 'accept') return 'accept'
            if (clawdDecision === 'decline') return 'decline'
            const decision = await new Promise<HarnessApprovalDecisionWire>((resolve) => {
              this.computerApprovals.set(requestId, resolve)
              this.emit({
                type: 'approvalRequested',
                request: {
                  requestId,
                  kind: 'computerUse',
                  itemId: parentId,
                  reason: action.reason?.trim() || null,
                  command: null,
                  cwd: null,
                  changes: null,
                  computerAction: action.action,
                  screenshotDataUrl,
                },
              })
            })
            if (decision === 'acceptForSession') sensitiveActionsApproved = true
            return decision
          },
          onProgress: (progress) => {
            const item = {
              id: `${parentId}:step:${progress.step}`,
              type: 'computerUseStep',
              parentId,
              step: progress.step,
              action: progress.action,
              reason: progress.reason,
              status: progress.status,
              screenshotDataUrl: progress.screenshotDataUrl,
            }
            this.emit({
              type: progress.status === 'inProgress' ? 'itemStarted' : 'itemCompleted',
              item,
            })
          },
        })
        const terminalResult = [
          'Computer Use finished with a terminal result:',
          text,
          'Treat this visual result as authoritative. Do not call Computer Use again or run commands merely to verify it. Continue with the final answer now.',
        ].join('\n\n')
        this.write({
          id: rpcId,
          result: { contentItems: [{ type: 'inputText', text: terminalResult }], success: true },
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.write({
          id: rpcId,
          result: { contentItems: [{ type: 'inputText', text: JSON.stringify({ error: message }) }], success: false },
        })
      }
      return
    }
    if (isLocalOfficeToolName(tool)) {
      const result = await runLocalOfficeTool(tool, args, this.workFolder)
      this.write({
        id: rpcId,
        result: {
          contentItems: [{ type: 'inputText', text: result.text }],
          success: !result.isError,
        },
      })
      return
    }
    if (!isFirstPartyToolName(tool)) {
      this.write({
        id: rpcId,
        result: {
          contentItems: [{ type: 'inputText', text: JSON.stringify({ error: 'Unknown tool.' }) }],
          success: false,
        },
      })
      return
    }
    if (!this.allowedTools.has(tool)) {
      this.write({
        id: rpcId,
        result: {
          contentItems: [{ type: 'inputText', text: JSON.stringify({ error: 'This tool is not granted to the active profile.' }) }],
          success: false,
        },
      })
      return
    }
    if (tool === 'search_harness_sessions') {
      const userId = userIdFromAccessToken(this.accessToken)
      if (!userId) {
        this.write({
          id: rpcId,
          result: {
            contentItems: [{ type: 'inputText', text: JSON.stringify({ error: 'Sign in required.' }) }],
            success: false,
          },
        })
        return
      }
      const query = typeof args.query === 'string' ? args.query : ''
      const limit = typeof args.limit === 'number' ? args.limit : 10
      const sessions = searchHarnessSessions(userId, query, limit)
      this.write({
        id: rpcId,
        result: {
          contentItems: [{ type: 'inputText', text: JSON.stringify({ sessions }) }],
          success: true,
        },
      })
      return
    }
    if (!this.accessToken || !this.apiBaseUrl) {
      this.write({
        id: rpcId,
        result: {
          contentItems: [{ type: 'inputText', text: JSON.stringify({ error: 'Sign in required.' }) }],
          success: false,
        },
      })
      return
    }
    const callTool = (name: string, input: Record<string, unknown>) =>
      callHarnessTool(this.apiBaseUrl, this.accessToken, name, input)
    if (tool === 'upload_file') {
      const result = await uploadHarnessLocalFile(this.workFolder, args, callTool)
      this.write({
        id: rpcId,
        result: {
          contentItems: [{ type: 'inputText', text: result.text }],
          success: !result.isError,
        },
      })
      return
    }
    let resolvedArgs = args
    if (tool === 'send_mail' || tool === 'save_mail_draft') {
      resolvedArgs = await expandMailAttachments(this.workFolder, args)
    }
    if (tool === 'send_mail') {
      const requestId = `send-mail:${String(rpcId)}:${randomUUID()}`
      const recipients = Array.isArray(resolvedArgs.to)
        ? resolvedArgs.to.flatMap((entry) => {
            if (!entry || typeof entry !== 'object') return []
            const email = (entry as Record<string, unknown>).email
            return typeof email === 'string' ? [email] : []
          })
        : []
      const attachments = Array.isArray(args.attachments)
        ? args.attachments.flatMap((entry) => {
            if (!entry || typeof entry !== 'object') return []
            const record = entry as Record<string, unknown>
            const value = typeof record.filename === 'string' ? record.filename : record.path
            return typeof value === 'string' ? [path.basename(value)] : []
        })
        : []
      const ccRecipients = Array.isArray(resolvedArgs.cc)
        ? resolvedArgs.cc.flatMap((entry) => {
            if (!entry || typeof entry !== 'object') return []
            const email = (entry as Record<string, unknown>).email
            return typeof email === 'string' ? [email] : []
          })
        : []
      const decision = await new Promise<HarnessApprovalDecisionWire>((resolve) => {
        this.computerApprovals.set(requestId, resolve)
        this.emit({
          type: 'approvalRequested',
          request: {
            requestId,
            kind: 'sendMail',
            itemId: String(rpcId),
            reason: 'Sending mail always requires confirmation.',
            command: null,
            cwd: null,
            changes: null,
            computerAction: null,
            screenshotDataUrl: null,
            mail: {
              to: recipients,
              cc: ccRecipients,
              subject: typeof resolvedArgs.subject === 'string' ? resolvedArgs.subject : '',
              snippet:
                typeof resolvedArgs.bodyText === 'string'
                  ? resolvedArgs.bodyText.slice(0, 240)
                  : '',
              attachments,
            },
          },
        })
      })
      if (decision === 'decline') {
        this.write({
          id: rpcId,
          result: {
            contentItems: [{ type: 'inputText', text: JSON.stringify({ error: 'Mail send declined.' }) }],
            success: false,
          },
        })
        return
      }
    }
    const result = await callTool(tool, resolvedArgs)
    this.write({
      id: rpcId,
      result: {
        contentItems: [{ type: 'inputText', text: result.text }],
        success: !result.isError,
      },
    })
  }

  /**
   * Fails every in-flight request with the same error.
   * @param error - Failure to report.
   * @returns Nothing.
   */
  private rejectAllPending(error: Error): void {
    for (const entry of this.pending.values()) {
      entry.reject(error)
    }
    this.pending.clear()
  }

  /**
   * Writes one JSON-RPC message as a single line.
   * @param message - Request, response, or notification body.
   * @returns Nothing.
   */
  private write(message: Record<string, unknown>): void {
    this.child?.stdin.write(`${JSON.stringify(message)}\n`)
  }

  /**
   * Sends a request and resolves with its result.
   * @param method - JSON-RPC method name.
   * @param params - Method parameters.
   * @returns Result payload.
   */
  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextRequestId
    this.nextRequestId += 1
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.write({ id, method, params })
    })
  }

  /**
   * Sends a notification (no response expected).
   * @param method - JSON-RPC method name.
   * @param params - Method parameters.
   * @returns Nothing.
   */
  private notify(method: string, params: Record<string, unknown>): void {
    this.write({ method, params })
  }

  /**
   * Splits stdout into newline-delimited JSON messages.
   * @param chunk - Raw stdout text.
   * @returns Nothing.
   */
  private consume(chunk: string): void {
    this.buffer += chunk
    let newlineIndex = this.buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).trim()
      this.buffer = this.buffer.slice(newlineIndex + 1)
      if (line) {
        try {
          this.handleMessage(JSON.parse(line) as RpcMessage)
        } catch {
          console.warn('[harness] dropped malformed app-server line')
        }
      }
      newlineIndex = this.buffer.indexOf('\n')
    }
  }

  /**
   * Routes one decoded message to a pending request, notification, or approval.
   * @param message - Decoded JSON-RPC message.
   * @returns Nothing.
   */
  private handleMessage(message: RpcMessage): void {
    if (message.id !== undefined && message.method === undefined) {
      const entry = typeof message.id === 'number' ? this.pending.get(message.id) : undefined
      if (!entry) {
        return
      }
      this.pending.delete(message.id as number)
      if (message.error) {
        entry.reject(new Error(message.error.message ?? 'Codex app-server request failed.'))
        return
      }
      entry.resolve(message.result)
      return
    }

    if (message.method === undefined) {
      return
    }

    if (message.id !== undefined) {
      this.handleServerRequest(message.method, message.id, message.params)
      return
    }

    this.handleNotification(message.method, message.params)
  }

  /**
   * Converts an approval request into a renderer event.
   * @param method - Server request method.
   * @param rpcId - JSON-RPC id to answer.
   * @param params - Request parameters.
   * @returns Nothing.
   */
  private handleServerRequest(
    method: string,
    rpcId: number | string,
    params: Record<string, unknown> | undefined,
  ): void {
    if (method === 'item/commandExecution/requestApproval') {
      const requestId = `${String(rpcId)}`
      this.approvals.set(requestId, rpcId)
      const request = {
        requestId,
        kind: 'commandExecution' as const,
        itemId: readString(params, 'itemId'),
        reason: readString(params, 'reason') || null,
        command: readString(params, 'command') || null,
        cwd: readString(params, 'cwd') || null,
        changes: null,
      }
      void this.tryClawdApproval({
        toolName: 'commandExecution',
        toolUseId: requestId,
        reason: request.reason,
        toolInput: {
          ...(request.command ? { command: request.command } : {}),
          ...(request.cwd ? { cwd: request.cwd } : {}),
        },
      }).then((decision) => {
        if (decision === 'accept' || decision === 'decline') {
          this.respondToApproval(requestId, decision)
          return
        }
        if (this.disposed || !this.approvals.has(requestId)) {
          return
        }
        this.emit({ type: 'approvalRequested', request })
      })
      return
    }

    if (method === 'item/fileChange/requestApproval') {
      const requestId = `${String(rpcId)}`
      this.approvals.set(requestId, rpcId)
      const request = {
        requestId,
        kind: 'fileChange' as const,
        itemId: readString(params, 'itemId'),
        reason: readString(params, 'reason') || null,
        command: null,
        cwd: null,
        changes: [],
      }
      void this.tryClawdApproval({
        toolName: 'fileChange',
        toolUseId: requestId,
        reason: request.reason,
        toolInput: {},
      }).then((decision) => {
        if (decision === 'accept' || decision === 'decline') {
          this.respondToApproval(requestId, decision)
          return
        }
        if (this.disposed || !this.approvals.has(requestId)) {
          return
        }
        this.emit({ type: 'approvalRequested', request })
      })
      return
    }

    if (method === 'item/tool/call') {
      void this.handleDynamicToolCall(rpcId, params).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        this.write({
          id: rpcId,
          result: {
            contentItems: [{ type: 'inputText', text: JSON.stringify({ error: message }) }],
            success: false,
          },
        })
      })
      return
    }

    // Unhandled server requests must still be answered so the turn can finish.
    this.write({ id: rpcId, error: { code: -32601, message: `Unsupported method: ${method}` } })
  }

  /**
   * Projects turn and item notifications onto renderer events.
   * @param method - Notification method.
   * @param params - Notification parameters.
   * @returns Nothing.
   */
  private handleNotification(method: string, params: Record<string, unknown> | undefined): void {
    if (method === 'mcpServer/oauthLogin/completed') {
      void this.refreshMcpStatus()
      return
    }
    if (method === 'turn/started') {
      const turn = params?.turn as Record<string, unknown> | undefined
      this.turnId = readString(turn, 'id') || this.turnId
      this.emit({ type: 'turnStarted', turnId: this.turnId })
      this.reportClawd('UserPromptSubmit', 'thinking')
      return
    }
    if (method === 'turn/completed') {
      // One notification carries the terminal status; `failed` includes an error.
      const turn = params?.turn as Record<string, unknown> | undefined
      const status = readString(turn, 'status')
      if (status === 'interrupted') {
        this.finishTurn(true)
        this.emit({ type: 'turnInterrupted' })
        this.reportClawd('Stop', 'attention')
        return
      }
      if (status === 'failed') {
        const error = turn?.error as Record<string, unknown> | undefined
        this.finishTurn(true)
        this.emit({ type: 'turnFailed', message: readString(error, 'message') || 'The turn failed.' })
        this.reportClawd('StopFailure', 'error')
        return
      }
      this.finishTurn(false)
      this.emit({ type: 'turnCompleted' })
      this.reportClawd('Stop', 'attention')
      return
    }
    if (method === 'item/started' || method === 'item/updated' || method === 'item/completed') {
      const item = projectItem(params?.item as Record<string, unknown> | undefined)
      if (!item) {
        return
      }
      const eventType =
        method === 'item/started'
          ? 'itemStarted'
          : method === 'item/updated'
            ? 'itemUpdated'
            : 'itemCompleted'
      this.emit({ type: eventType, item })
      if (method === 'item/started' || method === 'item/completed') {
        this.reportClawdItem(item, method === 'item/started')
      }
    }
  }
}
