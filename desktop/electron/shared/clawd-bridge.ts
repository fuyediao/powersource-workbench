/** IPC channel for Ask / Ask AI Clawd state reports. */
export const CLAWD_BRIDGE_IPC_CHANNEL = 'workbench:clawd-bridge'

/** First-party Clawd agent id. Must match clawd-on-desk `agents/workbench.js`. */
export const CLAWD_WORKBENCH_AGENT_ID = 'workbench'

/** Marker written by Clawd Install into Workbench userData. */
export const CLAWD_WORKBENCH_BRIDGE_MARKER = 'workbench-clawd-bridge.v1'

/** Managed bridge filename inside Electron userData. */
export const CLAWD_WORKBENCH_BRIDGE_FILE = 'clawd-bridge.json'

/** One Ask or Ask AI activity snapshot for Clawd `/state`. */
export type ClawdBridgeActivity = {
  sessionId: string
  event: string
  state: string
  cwd?: string
  toolName?: string
}

/**
 * Returns whether a parsed JSON document is the Clawd-managed Workbench bridge.
 * @param value - File contents.
 * @returns True when Clawd owns the file.
 */
export function isManagedClawdBridge(value: unknown): boolean {
  return Boolean(
    value
      && typeof value === 'object'
      && !Array.isArray(value)
      && (value as { app?: unknown }).app === 'clawd-on-desk'
      && (value as { integration?: unknown }).integration === 'workbench'
      && (value as { marker?: unknown }).marker === CLAWD_WORKBENCH_BRIDGE_MARKER
      && (value as { managed?: unknown }).managed === true,
  )
}
