/**
 * Shared Harness column width rules for the right utility workspace.
 *
 * The transcript column targets {@link HARNESS_MIDDLE_CONTENT_WIDTH} (same as
 * the transcript `max-w-5xl`). Leftover horizontal space is offered to the
 * utility sidebar so a wide window does not leave a void between the centered
 * chat and the right edge.
 */

/** Left Harness navigation rail width when expanded. */
export const HARNESS_LEFT_SIDEBAR_WIDTH = 240

/** Ideal middle transcript/composer column width (`max-w-5xl`). */
export const HARNESS_MIDDLE_CONTENT_WIDTH = 1024

/** Floor for the middle column so chat stays usable while resizing. */
export const HARNESS_MIDDLE_MIN_WIDTH = 420

/** Smallest utility workspace width. */
export const HARNESS_UTILITY_MIN_WIDTH = 280

/** Hard ceiling for the utility workspace. */
export const HARNESS_UTILITY_MAX_WIDTH = 720

export interface HarnessUtilityWidthInput {
  /** Full Harness page width in CSS pixels. */
  containerWidth: number
  /** Whether the left navigation rail is visible. */
  leftSidebarVisible: boolean
  /** User-persisted preferred width. */
  preferredWidth: number
  /**
   * When true, keep the preferred width (clamped) instead of auto-filling
   * leftover space beside the middle content column.
   */
  preferManualWidth?: boolean
}

export interface HarnessUtilityWidthResult {
  /** Width to apply to the utility sidebar. */
  width: number
  /** Dynamic maximum for the resize handle (may be below the hard ceiling). */
  maxWidth: number
}

/**
 * Clamps a raw width into the supported utility range.
 * @param width - Candidate width.
 * @param maxWidth - Dynamic upper bound for this layout.
 * @returns Integer width within bounds.
 */
export function clampHarnessUtilityWidth(width: number, maxWidth = HARNESS_UTILITY_MAX_WIDTH): number {
  const ceiling = Math.max(HARNESS_UTILITY_MIN_WIDTH, Math.min(HARNESS_UTILITY_MAX_WIDTH, Math.round(maxWidth)))
  return Math.min(ceiling, Math.max(HARNESS_UTILITY_MIN_WIDTH, Math.round(width)))
}

/**
 * Resolves the live utility sidebar width from the page layout and preference.
 * Auto mode fills leftover space after reserving the middle content width;
 * manual mode keeps the user drag within a dynamic max that never crushes the
 * middle column below {@link HARNESS_MIDDLE_MIN_WIDTH}.
 * @param input - Container, left-rail, and preference inputs.
 * @returns Applied width and resize maximum.
 */
export function resolveHarnessUtilityWidth(input: HarnessUtilityWidthInput): HarnessUtilityWidthResult {
  const left = input.leftSidebarVisible ? HARNESS_LEFT_SIDEBAR_WIDTH : 0
  const room = Math.max(0, Math.round(input.containerWidth) - left)
  const maxWidth = clampHarnessUtilityWidth(
    room - HARNESS_MIDDLE_MIN_WIDTH,
    HARNESS_UTILITY_MAX_WIDTH,
  )
  const suggested = clampHarnessUtilityWidth(room - HARNESS_MIDDLE_CONTENT_WIDTH, maxWidth)
  if (input.preferManualWidth) {
    return {
      width: clampHarnessUtilityWidth(input.preferredWidth, maxWidth),
      maxWidth,
    }
  }
  return {
    width: clampHarnessUtilityWidth(Math.max(input.preferredWidth, suggested), maxWidth),
    maxWidth,
  }
}
