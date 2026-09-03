/** Ask / Ask AI snapshot used to derive a Clawd `/state` event. */
export type ClawdAskActivityInput = {
  loading: boolean
  thinkMode: boolean
  error: boolean
}

/** Lifecycle pair posted to Clawd. */
export type ClawdAskActivity = {
  event: string
  state: string
}

/**
 * Maps Ask loading/error into a Clawd event. Returns null when idle after the
 * opening SessionStart (no extra POST).
 * @param input - Current Ask UI flags.
 * @param previousLoading - Loading flag from the previous render.
 * @returns Event/state pair, or null.
 */
export function mapAskClawdActivity(
  input: ClawdAskActivityInput,
  previousLoading: boolean,
): ClawdAskActivity | null {
  if (input.error) {
    return { event: 'StopFailure', state: 'error' }
  }
  if (input.loading) {
    return input.thinkMode
      ? { event: 'UserPromptSubmit', state: 'thinking' }
      : { event: 'PreToolUse', state: 'working' }
  }
  if (previousLoading) {
    return { event: 'Stop', state: 'attention' }
  }
  return null
}

/**
 * Reports one Ask activity through the desktop bridge when present.
 * @param sessionId - Stable Ask session id (`ask` or `ask-ai`).
 * @param activity - Event/state pair.
 * @returns Nothing.
 */
export function reportAskClawdActivity(sessionId: string, activity: ClawdAskActivity): void {
  void window.workbench?.clawd?.reportActivity({
    sessionId,
    event: activity.event,
    state: activity.state,
  })
}
