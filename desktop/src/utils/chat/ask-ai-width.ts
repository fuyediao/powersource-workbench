/** localStorage key for Ask AI dock width in pixels. */
export const ASK_AI_WIDTH_KEY = 'workbench.electron.askAiWidthPx'

/** Default Ask AI sidebar width (22rem at 16px root). */
export const DEFAULT_ASK_AI_WIDTH_PX = 352

/** Minimum Ask AI sidebar width. */
export const MIN_ASK_AI_WIDTH_PX = 280

/** Maximum Ask AI sidebar width. */
export const MAX_ASK_AI_WIDTH_PX = 560

/**
 * Clamps a sidebar width into the supported pixel range.
 * @param widthPx - Candidate width.
 * @returns Clamped width.
 */
export function clampAskAiWidthPx(widthPx: number): number {
  if (!Number.isFinite(widthPx)) {
    return DEFAULT_ASK_AI_WIDTH_PX
  }
  return Math.min(MAX_ASK_AI_WIDTH_PX, Math.max(MIN_ASK_AI_WIDTH_PX, Math.round(widthPx)))
}

/**
 * Reads the persisted Ask AI sidebar width.
 * @returns Width in CSS pixels.
 */
export function loadAskAiWidthPx(): number {
  try {
    const raw = localStorage.getItem(ASK_AI_WIDTH_KEY)
    if (raw === null) {
      return DEFAULT_ASK_AI_WIDTH_PX
    }
    return clampAskAiWidthPx(Number(raw))
  } catch {
    return DEFAULT_ASK_AI_WIDTH_PX
  }
}

/**
 * Persists the Ask AI sidebar width on this device.
 * @param widthPx - Width in CSS pixels.
 * @returns Clamped width that was stored.
 */
export function saveAskAiWidthPx(widthPx: number): number {
  const next = clampAskAiWidthPx(widthPx)
  try {
    localStorage.setItem(ASK_AI_WIDTH_KEY, String(next))
  } catch {
    // Ignore quota / private-mode failures.
  }
  return next
}
