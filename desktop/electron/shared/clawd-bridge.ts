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

/** Parsed Clawd `/permission` outcome. */
export type ClawdPermissionResult =
  | { kind: 'decision'; decision: 'allow' | 'deny' }
  | { kind: 'no-decision' }
  | { kind: 'cancelled' }

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

/**
 * Maps a Clawd permission HTTP result to allow, deny, or native fallback.
 * @param statusCode - HTTP status, or null when the request failed.
 * @param body - Response text.
 * @param aborted - True when the caller cancelled the request.
 * @returns Parsed outcome.
 */
export function parseClawdPermissionResult(
  statusCode: number | null,
  body: string,
  aborted = false,
): ClawdPermissionResult {
  if (aborted) {
    return { kind: 'cancelled' }
  }
  if (statusCode === 204 || statusCode === null) {
    return { kind: 'no-decision' }
  }
  if (statusCode !== 200 || !body) {
    return { kind: 'no-decision' }
  }
  try {
    const parsed: unknown = JSON.parse(body)
    if (
      parsed
      && typeof parsed === 'object'
      && !Array.isArray(parsed)
      && ((parsed as { decision?: unknown }).decision === 'allow'
        || (parsed as { decision?: unknown }).decision === 'deny')
    ) {
      return {
        kind: 'decision',
        decision: (parsed as { decision: 'allow' | 'deny' }).decision,
      }
    }
  } catch {
    return { kind: 'no-decision' }
  }
  return { kind: 'no-decision' }
}
