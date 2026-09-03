/**
 * Harness IPC surface: one local Codex workflow host per renderer.
 */

import { ipcMain, type WebContents } from 'electron'
import { CodexHost } from './codex-host'
import { resolveCodexBinary } from './codex-binary'
import {
  hideHarnessCanvasPreview,
  showHarnessCanvasPreview,
  transferHarnessCanvasPreview,
} from './canvas-preview'
import {
  readHarnessDevicePreferences,
  writeHarnessDevicePreferences,
} from './device-preferences'
import {
  defaultHarnessWorkFolder,
  listHarnessWorkspace,
  parkHarnessCanvasFolder,
  pickHarnessAttachmentFolder,
  pickHarnessFiles,
  pickHarnessWorkFolder,
  readHarnessReview,
  readHarnessWorkspaceFile,
  restoreHarnessCanvasSession,
  snapshotHarnessCanvasSession,
  writeHarnessCanvasFile,
} from './work-folder'
import {
  disposeAllHarnessPtys,
  disposeHarnessPty,
  resizeHarnessPty,
  spawnHarnessPty,
  transferHarnessPtys,
  writeHarnessPty,
} from './pty'
import {
  HARNESS_EVENT,
  HARNESS_IPC_CHANNEL,
  isHarnessApprovalMode,
  isHarnessReasoningEffortId,
  sanitizeMcpServers,
  type HarnessApprovalDecisionWire,
  type HarnessHostStatus,
  type HarnessComputerTarget,
  type HarnessStartOptions,
  type HarnessStartTurnExtras,
} from '../../shared/harness'

/** Live hosts keyed by renderer `webContents.id`. */
const hosts = new Map<number, CodexHost>()

/**
 * Binds host cleanup to one renderer without killing a host that was transferred away.
 * @param sender - Current renderer owner.
 * @param host - Host associated with the renderer at registration time.
 * @returns Nothing.
 */
function watchHostOwner(sender: WebContents, host: CodexHost): void {
  sender.once('destroyed', () => {
    if (hosts.get(sender.id) !== host) return
    host.dispose()
    hosts.delete(sender.id)
  })
}

/**
 * Returns the host for one renderer, creating it on first use.
 * @param sender - Renderer web contents.
 * @returns Codex workflow host.
 */
function hostFor(sender: WebContents): CodexHost {
  const existing = hosts.get(sender.id)
  if (existing) {
    return existing
  }
  const host = new CodexHost((event) => {
    if (!sender.isDestroyed()) {
      sender.send(HARNESS_EVENT, event)
    }
  })
  hosts.set(sender.id, host)
  watchHostOwner(sender, host)
  return host
}

/**
 * Transfers a live Harness host and utility processes to another renderer.
 * @param source - Renderer currently owning the Harness tab.
 * @param target - Renderer receiving the Harness tab.
 * @returns False only when both renderers already have active turns.
 */
export function transferHarnessHost(source: WebContents, target: WebContents): boolean {
  const sourceHost = hosts.get(source.id)
  const targetHost = hosts.get(target.id)
  if (sourceHost && targetHost && targetHost !== sourceHost && targetHost.hasActiveTurn()) {
    return false
  }
  transferHarnessCanvasPreview(source.id, target)
  transferHarnessPtys(source.id, target)
  if (!sourceHost) return true
  if (targetHost && targetHost !== sourceHost) targetHost.dispose()
  hosts.delete(source.id)
  hosts.set(target.id, sourceHost)
  sourceHost.rebindEmit((event) => {
    if (!target.isDestroyed()) target.send(HARNESS_EVENT, event)
  })
  watchHostOwner(target, sourceHost)
  if (!target.isDestroyed()) {
    target.send(HARNESS_EVENT, { type: 'snapshotReset' })
    for (const event of sourceHost.snapshot()) target.send(HARNESS_EVENT, event)
  }
  return true
}

/**
 * Reads the start options sent by the renderer.
 * @param raw - Unvalidated payload.
 * @returns Normalized options.
 */
function readStartOptions(raw: unknown): HarnessStartOptions {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const mode = source.approvalMode
  const rawTarget = source.computerUseTarget
  const computerUseTarget = rawTarget && typeof rawTarget === 'object' && !Array.isArray(rawTarget)
    ? rawTarget as Record<string, unknown>
    : null
  const rawExpert = source.activeExpert
  const activeExpert = rawExpert && typeof rawExpert === 'object' && !Array.isArray(rawExpert)
    ? rawExpert as Record<string, unknown>
    : null
  return {
    cwd: typeof source.cwd === 'string' ? source.cwd : null,
    resumeThreadId: typeof source.resumeThreadId === 'string' ? source.resumeThreadId : null,
    continuationInstructions:
      typeof source.continuationInstructions === 'string'
        ? source.continuationInstructions
        : null,
    approvalMode: isHarnessApprovalMode(mode) ? mode : 'askIfUnsafe',
    apiKey: typeof source.apiKey === 'string' ? source.apiKey : null,
    model: typeof source.model === 'string' ? source.model : null,
    provider: typeof source.provider === 'string' ? source.provider : null,
    computerUseProvider:
      typeof source.computerUseProvider === 'string' ? source.computerUseProvider : null,
    computerUseModel: typeof source.computerUseModel === 'string' ? source.computerUseModel : null,
    computerUseEnabled: source.computerUseEnabled === true,
    webSearchEnabled: source.webSearchEnabled === true,
    computerUseTarget:
      computerUseTarget &&
      typeof computerUseTarget.id === 'string' &&
      typeof computerUseTarget.label === 'string' &&
      (computerUseTarget.kind === 'display' || computerUseTarget.kind === 'window')
        ? {
            id: computerUseTarget.id,
            kind: computerUseTarget.kind,
            label: computerUseTarget.label,
          } satisfies HarnessComputerTarget
        : null,
    allowedTools: Array.isArray(source.allowedTools)
      ? source.allowedTools.filter((value): value is string => typeof value === 'string')
      : null,
    activeExpert:
      activeExpert &&
      typeof activeExpert.id === 'string' &&
      typeof activeExpert.executorName === 'string' &&
      /^expert_[a-zA-Z0-9_-]{1,48}$/.test(activeExpert.executorName) &&
      typeof activeExpert.name === 'string' &&
      typeof activeExpert.instructions === 'string' &&
      (activeExpert.outputMode === 'narrative' || activeExpert.outputMode === 'table' ||
        activeExpert.outputMode === 'dashboard' || activeExpert.outputMode === 'document')
        ? {
            id: activeExpert.id,
            executorName: activeExpert.executorName,
            name: activeExpert.name,
            instructions: activeExpert.instructions,
            outputMode: activeExpert.outputMode,
            requiredConnectors: Array.isArray(activeExpert.requiredConnectors)
              ? activeExpert.requiredConnectors.filter((value): value is string => typeof value === 'string')
              : [],
          }
        : null,
    developerInstructions:
      typeof source.developerInstructions === 'string' ? source.developerInstructions : null,
    accessToken: typeof source.accessToken === 'string' ? source.accessToken : null,
    apiBaseUrl: typeof source.apiBaseUrl === 'string' ? source.apiBaseUrl : null,
    mcpServers: sanitizeMcpServers(source.mcpServers),
  }
}

/**
 * Reads optional startTurn extras from the renderer.
 * @param raw - Unvalidated payload.
 * @returns Normalized extras.
 */
function readStartTurnExtras(raw: unknown): HarnessStartTurnExtras {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const attachments = Array.isArray(source.attachments)
    ? source.attachments.flatMap((value) => {
        if (!value || typeof value !== 'object') return []
        const record = value as Record<string, unknown>
        const attachmentPath = typeof record.path === 'string' ? record.path.trim() : ''
        const kind = record.kind === 'folder' ? 'folder' : 'file'
        return attachmentPath ? [{ path: attachmentPath, kind } as const] : []
      })
    : []
  const mentions = Array.isArray(source.mentions)
    ? source.mentions.flatMap((value) => {
        if (!value || typeof value !== 'object') return []
        const record = value as Record<string, unknown>
        const name = typeof record.name === 'string' ? record.name.trim() : ''
        const mentionPath = typeof record.path === 'string' ? record.path.trim() : ''
        return name ? [{ name, path: mentionPath }] : []
      })
    : []
  return {
    wakeJobId: typeof source.wakeJobId === 'string' ? source.wakeJobId : null,
    attachments,
    mentions,
    goal: typeof source.goal === 'string' ? source.goal.trim() : null,
    planMode: source.planMode === true,
    canvasMode: source.canvasMode === true,
    effort:
      typeof source.effort === 'string' && isHarnessReasoningEffortId(source.effort.trim())
        ? source.effort.trim()
        : null,
  }
}

/**
 * Registers the Harness IPC handler. Safe to call once at startup.
 * @returns Nothing.
 */
export function registerHarnessIpc(): void {
  ipcMain.handle(
    HARNESS_IPC_CHANNEL,
    async (event, method: string, ...args: unknown[]): Promise<unknown> => {
      if (method === 'status') {
        const binaryPath = resolveCodexBinary()
        return { available: Boolean(binaryPath), binaryPath } satisfies HarnessHostStatus
      }
      if (method === 'getDevicePreferences') {
        return readHarnessDevicePreferences(args[0])
      }
      if (method === 'setDevicePreferences') {
        return writeHarnessDevicePreferences(args[0])
      }
      if (method === 'defaultWorkFolder') {
        return defaultHarnessWorkFolder()
      }
      if (method === 'pickWorkFolder') {
        return pickHarnessWorkFolder(event.sender)
      }
      if (method === 'pickFiles') {
        return pickHarnessFiles(event.sender)
      }
      if (method === 'pickAttachmentFolder') {
        return pickHarnessAttachmentFolder(event.sender)
      }
      if (method === 'listWorkspace') {
        const cwd = typeof args[0] === 'string' ? args[0] : null
        const relativePath = typeof args[1] === 'string' ? args[1] : ''
        return listHarnessWorkspace(cwd, relativePath)
      }
      if (method === 'readWorkspaceFile') {
        const cwd = typeof args[0] === 'string' ? args[0] : null
        const relativePath = typeof args[1] === 'string' ? args[1].trim() : ''
        if (!relativePath) throw new Error('A workspace file path is required.')
        return readHarnessWorkspaceFile(cwd, relativePath)
      }
      if (method === 'writeCanvasFile') {
        const cwd = typeof args[0] === 'string' ? args[0] : null
        const relativePath = typeof args[1] === 'string' ? args[1].trim() : ''
        const content = typeof args[2] === 'string' ? args[2] : ''
        if (!relativePath) throw new Error('A Canvas file path is required.')
        return writeHarnessCanvasFile(cwd, relativePath, content)
      }
      if (method === 'snapshotCanvas') {
        const cwd = typeof args[0] === 'string' ? args[0] : null
        const historyId = typeof args[1] === 'string' ? args[1] : ''
        if (!historyId.trim()) throw new Error('A Canvas session id is required.')
        snapshotHarnessCanvasSession(cwd, historyId)
        return null
      }
      if (method === 'parkCanvas') {
        const cwd = typeof args[0] === 'string' ? args[0] : null
        const historyId = typeof args[1] === 'string' ? args[1] : null
        parkHarnessCanvasFolder(cwd, historyId)
        hideHarnessCanvasPreview(event.sender.id)
        return null
      }
      if (method === 'restoreCanvas') {
        const cwd = typeof args[0] === 'string' ? args[0] : null
        const historyId = typeof args[1] === 'string' ? args[1] : ''
        if (!historyId.trim()) throw new Error('A Canvas session id is required.')
        hideHarnessCanvasPreview(event.sender.id)
        return restoreHarnessCanvasSession(cwd, historyId)
      }
      if (method === 'showCanvasPreview') {
        const document = typeof args[1] === 'string' ? args[1] : ''
        await showHarnessCanvasPreview(event.sender, args[0], document)
        return null
      }
      if (method === 'hideCanvasPreview') {
        hideHarnessCanvasPreview(event.sender.id)
        return null
      }
      if (method === 'ptySpawn') {
        const sessionId = typeof args[0] === 'string' ? args[0] : ''
        const cwd = typeof args[1] === 'string' ? args[1] : null
        spawnHarnessPty(event.sender, sessionId, cwd, args[2], args[3])
        return null
      }
      if (method === 'ptyWrite') {
        const sessionId = typeof args[0] === 'string' ? args[0] : ''
        const data = typeof args[1] === 'string' ? args[1] : ''
        writeHarnessPty(event.sender.id, sessionId, data)
        return null
      }
      if (method === 'ptyResize') {
        const sessionId = typeof args[0] === 'string' ? args[0] : ''
        resizeHarnessPty(event.sender.id, sessionId, args[1], args[2])
        return null
      }
      if (method === 'ptyDispose') {
        const sessionId = typeof args[0] === 'string' ? args[0] : ''
        disposeHarnessPty(event.sender.id, sessionId)
        return null
      }
      if (method === 'readReview') {
        return readHarnessReview(typeof args[0] === 'string' ? args[0] : null)
      }

      if (method === 'dispose') {
        const existing = hosts.get(event.sender.id)
        if (existing) {
          existing.dispose()
          hosts.delete(event.sender.id)
        }
        return null
      }

      const host = hostFor(event.sender)

      if (method === 'snapshot') {
        return host.snapshot()
      }

      if (method === 'start') {
        await host.start(readStartOptions(args[0]))
        return null
      }
      if (method === 'startTurn') {
        const text = typeof args[0] === 'string' ? args[0] : ''
        if (!text.trim()) {
          throw new Error('The Harness task text is empty.')
        }
        await host.startTurn(text, readStartTurnExtras(args[1]))
        return null
      }
      if (method === 'mcpLogin') {
        const name = typeof args[0] === 'string' ? args[0].trim() : ''
        if (!name) throw new Error('An MCP server name is required.')
        await host.loginMcp(name)
        return null
      }
      if (method === 'listConnectors') {
        return host.listConnectors(args[0] === true)
      }
      if (method === 'installConnector') {
        const connectorId = typeof args[0] === 'string' ? args[0].trim() : ''
        const installUrl = typeof args[1] === 'string' ? args[1].trim() : ''
        if (!connectorId || !installUrl) throw new Error('A connector and install URL are required.')
        await host.installConnector(connectorId, installUrl)
        return null
      }
      if (method === 'listComputerTargets') {
        return host.listComputerTargets()
      }
      if (method === 'interrupt') {
        await host.interrupt()
        return null
      }
      if (method === 'respondToApproval') {
        const requestId = typeof args[0] === 'string' ? args[0] : ''
        const decision = args[1]
        if (
          !requestId ||
          (decision !== 'accept' && decision !== 'acceptForSession' && decision !== 'decline')
        ) {
          throw new Error('The Harness approval decision is invalid.')
        }
        host.respondToApproval(requestId, decision as HarnessApprovalDecisionWire)
        return null
      }
      throw new Error(`Unknown Harness method: ${method}`)
    },
  )
}

/**
 * Stops every workflow host (app shutdown).
 * @returns Nothing.
 */
export function disposeHarnessHosts(): void {
  for (const host of hosts.values()) {
    host.dispose()
  }
  hosts.clear()
  disposeAllHarnessPtys()
}
