/**
 * Chooses the Harness workflow runtime for this window.
 *
 * The local `codex app-server` host is used whenever the desktop bridge
 * exposes it and a pinned binary is installed. Missing hosts return an
 * explicit unavailable runtime and never simulate task completion.
 */

import { createIpcHarnessRuntime, isHarnessHostAvailable } from '@/utils/harness/ipc-runtime'
import type { HarnessActiveExpertConfig, HarnessComputerTarget, HarnessRuntime } from '@/types/harness'
import type { HarnessApprovalMode } from '@/utils/settings/harness-prefs'

/** Inputs the live runtime needs from the signed-in session. */
export interface HarnessRuntimeOptions {
  /** Provider key from Settings → AI, when the renderer knows it. */
  apiKey: string | null
  /** Working directory for the workflow thread. */
  cwd: string | null
  /** Existing local thread to reopen for a history record. */
  resumeThreadId: string | null
  /** Cloud transcript context used if local resume is unavailable. */
  continuationInstructions: string | null
  /** False when no local workflow binary is installed. */
  hostAvailable: boolean
  /** Frozen VPS Hermes memory snapshot plus skill index for this turn. */
  developerInstructions: string | null
  /** Signed-in session JWT for first-party tools and memory review. */
  accessToken: string | null
  /** Public workbench-api origin. */
  apiBaseUrl: string | null
  /** Provider selected from the shared AI catalog. */
  provider: string
  /** Vendor model id selected for this thread. */
  modelId: string
  /** Approval profile selected for this thread. */
  approvalMode: HarnessApprovalMode
  /** Provider selected independently for visual desktop control. */
  computerUseProvider: string
  /** Vision-capable model selected for visual desktop control. */
  computerUseModel: string
  /** Whether Computer Use is enabled for the next thread. */
  computerUseEnabled: boolean
  /** Whether first-party web search is enabled for the next thread. */
  webSearchEnabled: boolean
  /** Display or native window selected for desktop control. */
  computerUseTarget: HarnessComputerTarget | null
  /** First-party tools granted by the active reusable tool. */
  allowedTools: string[] | null
  /** Unique executable contract for the active marketplace tool. */
  activeExpert: HarnessActiveExpertConfig | null
}

/**
 * Creates the best available workflow runtime.
 * @param options - Session inputs and host availability.
 * @returns Live Codex host when present, otherwise an unavailable runtime.
 */
export function createHarnessRuntime(options: HarnessRuntimeOptions): HarnessRuntime {
  if (options.hostAvailable && isHarnessHostAvailable()) {
    return createIpcHarnessRuntime(
      options.apiKey,
      options.cwd,
      options.resumeThreadId,
      options.continuationInstructions,
      options.developerInstructions,
      options.accessToken,
      options.apiBaseUrl,
      options.provider,
      options.modelId,
      options.approvalMode,
      options.computerUseProvider,
      options.computerUseModel,
      options.computerUseEnabled,
      options.webSearchEnabled,
      options.computerUseTarget,
      options.allowedTools,
      options.activeExpert,
    )
  }
  const listeners = new Set<Parameters<HarnessRuntime['subscribe']>[0]>()
  return {
    isLive: false,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async startTurn() {
      for (const listener of listeners) {
        listener({
          type: 'turnFailed',
          message: 'The local Harness workflow host is unavailable. Rebuild or reinstall Codex app-server, then retry the connection.',
        })
      }
    },
    async loginMcp() {
      throw new Error('The local Harness workflow host is unavailable.')
    },
    async listConnectors() {
      return []
    },
    async installConnector() {
      throw new Error('The local Harness workflow host is unavailable.')
    },
    async listComputerTargets() {
      return window.workbench?.harness?.listComputerTargets() ?? []
    },
    async interrupt() {},
    async respondToApproval() {},
    dispose() {
      listeners.clear()
    },
  }
}
