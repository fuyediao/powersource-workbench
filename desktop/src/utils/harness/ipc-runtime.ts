/**
 * Harness runtime backed by the local `codex app-server` host in the Electron
 * main process. Events arrive over preload IPC and are validated here — the
 * renderer never trusts the wire shape blindly.
 */

import type {
  HarnessApprovalDecision,
  HarnessApprovalRequest,
  HarnessEvent,
  HarnessFileUpdateChange,
  HarnessItem,
  HarnessItemStatus,
  HarnessMcpServerStatus,
  HarnessRuntime,
  HarnessComputerTarget,
  HarnessActiveExpertConfig,
} from '@/types/harness'
import {
  loadHarnessMcpServers,
  type HarnessApprovalMode,
} from '@/utils/settings/harness-prefs'

/**
 * Narrows an unknown value to a plain record.
 * @param value - Candidate value.
 * @returns Record, or null.
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/**
 * Reads a string field.
 * @param source - Record to read.
 * @param key - Field name.
 * @returns String value, or empty.
 */
function str(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  return typeof value === 'string' ? value : ''
}

/**
 * Reads an item status field.
 * @param source - Record to read.
 * @returns Known status value.
 */
function status(source: Record<string, unknown>): HarnessItemStatus {
  const value = source.status
  return value === 'completed' || value === 'failed' || value === 'declined'
    ? value
    : 'inProgress'
}

/**
 * Validates one transcript item from the wire.
 * @param value - Unknown item payload.
 * @returns Item, or null when unsupported.
 */
function parseItem(value: unknown): HarnessItem | null {
  const raw = asRecord(value)
  if (!raw) {
    return null
  }
  const id = str(raw, 'id')
  const type = str(raw, 'type')
  if (!id) {
    return null
  }

  switch (type) {
    case 'userMessage':
    case 'agentMessage':
    case 'reasoning':
      return { id, type, text: str(raw, 'text') }
    case 'commandExecution':
      return {
        id,
        type,
        command: str(raw, 'command'),
        cwd: str(raw, 'cwd'),
        status: status(raw),
        aggregatedOutput: str(raw, 'aggregatedOutput'),
        exitCode: typeof raw.exitCode === 'number' ? raw.exitCode : null,
      }
    case 'fileChange': {
      const changes = Array.isArray(raw.changes) ? raw.changes : []
      return {
        id,
        type,
        changes: changes
          .map((entry) => asRecord(entry))
          .filter((entry): entry is Record<string, unknown> => Boolean(entry))
          .map((entry): HarnessFileUpdateChange => {
            const kind = str(entry, 'kind')
            return {
              path: str(entry, 'path'),
              kind: kind === 'add' || kind === 'delete' ? kind : 'update',
            }
          }),
        status: status(raw),
        diff: typeof raw.diff === 'string' ? raw.diff : null,
      }
    }
    case 'mcpToolCall':
      return {
        id,
        type,
        server: str(raw, 'server'),
        tool: str(raw, 'tool'),
        status: status(raw),
        arguments: str(raw, 'arguments'),
        result: str(raw, 'result'),
        error: str(raw, 'error'),
        durationMs: typeof raw.durationMs === 'number' ? raw.durationMs : null,
      }
    case 'crmToolCall':
      return {
        id,
        type,
        tool: str(raw, 'tool'),
        summary: str(raw, 'summary'),
        status: status(raw),
        arguments: str(raw, 'arguments'),
        result: str(raw, 'result'),
        durationMs: typeof raw.durationMs === 'number' ? raw.durationMs : null,
      }
    case 'computerUseStep':
      return {
        id,
        type,
        parentId: str(raw, 'parentId'),
        step: typeof raw.step === 'number' ? raw.step : 0,
        action: str(raw, 'action'),
        reason: str(raw, 'reason'),
        status: status(raw),
        screenshotDataUrl: str(raw, 'screenshotDataUrl'),
      }
    case 'error':
      return { id, type, message: str(raw, 'message') }
    default:
      return null
  }
}

/**
 * Validates one approval request from the wire.
 * @param value - Unknown request payload.
 * @returns Approval request, or null.
 */
function parseApproval(value: unknown): HarnessApprovalRequest | null {
  const raw = asRecord(value)
  if (!raw) {
    return null
  }
  const requestId = str(raw, 'requestId')
  const kind = str(raw, 'kind')
  if (
    !requestId
    || (kind !== 'commandExecution'
      && kind !== 'fileChange'
      && kind !== 'computerUse'
      && kind !== 'sendMail')
  ) {
    return null
  }
  const changes = Array.isArray(raw.changes) ? raw.changes : null
  return {
    requestId,
    kind,
    itemId: str(raw, 'itemId'),
    reason: typeof raw.reason === 'string' ? raw.reason : null,
    command: typeof raw.command === 'string' ? raw.command : null,
    cwd: typeof raw.cwd === 'string' ? raw.cwd : null,
    changes: changes
      ? changes
          .map((entry) => asRecord(entry))
          .filter((entry): entry is Record<string, unknown> => Boolean(entry))
          .map((entry): HarnessFileUpdateChange => {
            const changeKind = str(entry, 'kind')
            return {
              path: str(entry, 'path'),
              kind: changeKind === 'add' || changeKind === 'delete' ? changeKind : 'update',
            }
          })
      : null,
    computerAction: typeof raw.computerAction === 'string' ? raw.computerAction : null,
    screenshotDataUrl: typeof raw.screenshotDataUrl === 'string' ? raw.screenshotDataUrl : null,
    mail: (() => {
      const mail = asRecord(raw.mail)
      if (!mail) return null
      const strings = (value: unknown) =>
        Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
      return {
        to: strings(mail.to),
        cc: strings(mail.cc),
        subject: str(mail, 'subject'),
        snippet: str(mail, 'snippet'),
        attachments: strings(mail.attachments),
      }
    })(),
  }
}

/**
 * Validates one workflow event from the wire.
 * @param value - Unknown event payload.
 * @returns Event, or null when unrecognized.
 */
function parseEvent(value: unknown): HarnessEvent | null {
  const raw = asRecord(value)
  if (!raw) {
    return null
  }
  const type = str(raw, 'type')

  switch (type) {
    case 'snapshotReset':
      return { type }
    case 'threadStarted':
      return { type, threadId: str(raw, 'threadId') }
    case 'mcpStatus': {
      const servers = Array.isArray(raw.servers)
        ? raw.servers.flatMap((value): HarnessMcpServerStatus[] => {
            const server = asRecord(value)
            const name = server ? str(server, 'name') : ''
            if (!server || !name) return []
            return [{
              name,
              runtimeStatus:
                typeof server.runtimeStatus === 'string' ? server.runtimeStatus : null,
              authStatus: str(server, 'authStatus') || 'unknown',
            }]
          })
        : []
      return { type, servers }
    }
    case 'turnStarted':
      return { type, turnId: str(raw, 'turnId') }
    case 'itemStarted':
    case 'itemUpdated':
    case 'itemCompleted': {
      const item = parseItem(raw.item)
      return item ? { type, item } : null
    }
    case 'approvalRequested': {
      const request = parseApproval(raw.request)
      return request ? { type, request } : null
    }
    case 'approvalResolved':
      return { type, requestId: str(raw, 'requestId') }
    case 'turnCompleted':
    case 'turnInterrupted':
      return { type }
    case 'turnFailed':
      return { type, message: str(raw, 'message') }
    default:
      return null
  }
}

/**
 * Reports whether the desktop bridge exposes the workflow host.
 * @returns True when Harness IPC is available.
 */
export function isHarnessHostAvailable(): boolean {
  return Boolean(window.workbench?.harness)
}

/**
 * Creates the live workflow runtime over preload IPC.
 * @param apiKey - Provider key from Settings → AI, when known.
 * @param cwd - Working directory for the thread.
 * @param resumeThreadId - Existing local thread id, when continuing history.
 * @param continuationInstructions - Cloud context used when local resume fails.
 * @param developerInstructions - Frozen VPS Hermes memory snapshot plus skills.
 * @param accessToken - Session JWT for `/ai/harness/*`.
 * @param apiBaseUrl - Public workbench-api origin.
 * @param provider - Selected AI provider id.
 * @param modelId - Selected vendor model id.
 * @param approvalMode - Approval profile selected for this thread.
 * @param computerUseProvider - Provider selected for desktop control.
 * @param computerUseModel - Vision model selected for desktop control.
 * @param computerUseEnabled - Whether the local desktop tool is available.
 * @param webSearchEnabled - Whether the first-party web search tool is available.
 * @param computerUseTarget - Display or native window selected for desktop control.
 * @param allowedTools - First-party tools granted by the active reusable tool.
 * @param activeExpert - Unique executable contract for the selected marketplace tool.
 * @returns Runtime bound to the local Codex host.
 */
export function createIpcHarnessRuntime(
  apiKey: string | null,
  cwd: string | null,
  resumeThreadId: string | null,
  continuationInstructions: string | null,
  developerInstructions: string | null,
  accessToken: string | null = null,
  apiBaseUrl: string | null = null,
  provider = 'gemini',
  modelId = 'gemini-3.7-flash',
  approvalMode: HarnessApprovalMode = 'askIfUnsafe',
  computerUseProvider = 'gemini',
  computerUseModel = 'gemini-3.7-flash',
  computerUseEnabled = false,
  webSearchEnabled = false,
  computerUseTarget: HarnessComputerTarget | null = null,
  allowedTools: string[] | null = null,
  activeExpert: HarnessActiveExpertConfig | null = null,
): HarnessRuntime {
  const bridge = window.workbench.harness
  const listeners = new Set<(event: HarnessEvent) => void>()
  let started: Promise<void> | null = null
  let disposed = false
  let hydrated = false
  const queuedEvents: HarnessEvent[] = []

  /** Delivers one parsed event to current runtime subscribers. */
  function deliver(event: HarnessEvent): void {
    for (const listener of listeners) listener(event)
  }

  const unsubscribeBridge = bridge.onEvent((payload: unknown) => {
    const event = parseEvent(payload)
    if (!event) {
      return
    }
    if (!hydrated) queuedEvents.push(event)
    else deliver(event)
  })
  const hydration = bridge.snapshot()
    .then((events) => {
      for (const payload of events) {
        const event = parseEvent(payload)
        if (event) deliver(event)
      }
      hydrated = true
      for (const event of queuedEvents.splice(0)) deliver(event)
    })
    .catch(() => {
      hydrated = true
      for (const event of queuedEvents.splice(0)) deliver(event)
    })

  /**
   * Emits a synthetic failure so the UI leaves the running state.
   * @param error - Failure to report.
   * @returns Nothing.
   */
  function emitFailure(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    for (const listener of listeners) {
      listener({ type: 'turnFailed', message })
    }
  }

  /**
   * Starts the workflow process once per runtime.
   * @returns Promise resolved when the thread is open.
   */
  function ensureStarted(): Promise<void> {
    started ??= bridge.start({
      cwd,
      resumeThreadId,
      continuationInstructions,
      approvalMode,
      apiKey,
      developerInstructions,
      accessToken,
      apiBaseUrl,
      provider,
      model: modelId,
      computerUseProvider,
      computerUseModel,
      computerUseEnabled,
      webSearchEnabled,
      computerUseTarget,
      allowedTools,
      activeExpert,
      mcpServers: loadHarnessMcpServers(),
    })
    return started
  }

  return {
    isLive: true,
    subscribe(listener) {
      listeners.add(listener)
      void hydration
      return () => {
        listeners.delete(listener)
      }
    },
    async startTurn(text, extras) {
      try {
        await ensureStarted()
        if (disposed) {
          return
        }
        await bridge.startTurn(text, extras)
      } catch (error) {
        started = null
        emitFailure(error)
      }
    },
    async loginMcp(name) {
      await ensureStarted()
      if (!disposed) await bridge.mcpLogin(name)
    },
    async listConnectors(forceRefetch = false) {
      await ensureStarted()
      return disposed ? [] : bridge.listConnectors(forceRefetch)
    },
    async installConnector(connectorId, installUrl) {
      await ensureStarted()
      if (!disposed) await bridge.installConnector(connectorId, installUrl)
    },
    async listComputerTargets() {
      return bridge.listComputerTargets()
    },
    async interrupt() {
      try {
        await bridge.interrupt()
      } catch (error) {
        emitFailure(error)
      }
    },
    async respondToApproval(requestId, decision: HarnessApprovalDecision) {
      try {
        await bridge.respondToApproval(requestId, decision)
      } catch (error) {
        emitFailure(error)
      }
    },
    dispose() {
      disposed = true
      unsubscribeBridge()
      listeners.clear()
      void bridge.dispose().catch(() => undefined)
    },
  }
}
