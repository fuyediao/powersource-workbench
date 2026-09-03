/** localStorage key for Ask AI Quick / Think. */
export const ASK_AI_MODE_KEY = 'workbench.electron.askAiMode'

/** Ask composer modes persisted for the companion sidebar. */
export type AskAiMode = 'quick' | 'think'

/**
 * Returns whether a value is a persisted Ask AI mode.
 * @param value - Candidate.
 * @returns True for `quick` or `think`.
 */
export function isAskAiMode(value: unknown): value is AskAiMode {
  return value === 'quick' || value === 'think'
}

/**
 * Reads the last Ask AI Quick / Think choice.
 * @returns Stored mode, or Quick when missing.
 */
export function loadAskAiMode(): AskAiMode {
  try {
    const raw = localStorage.getItem(ASK_AI_MODE_KEY)
    return isAskAiMode(raw) ? raw : 'quick'
  } catch {
    return 'quick'
  }
}

/**
 * Persists Ask AI Quick / Think on this device.
 * @param mode - Mode to store.
 * @returns Nothing.
 */
export function saveAskAiMode(mode: AskAiMode): void {
  try {
    localStorage.setItem(ASK_AI_MODE_KEY, mode)
  } catch {
    // Ignore quota / private-mode failures.
  }
}
