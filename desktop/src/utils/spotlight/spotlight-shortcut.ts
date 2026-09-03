/**
 * Returns whether a keydown matches the Spotlight accelerator chord.
 * @param event - Keyboard event.
 * @param accelerator - Electron accelerator (`Control+Shift+Space` or `Alt+Space`).
 * @returns True when the chord matches.
 */
export function isSpotlightFallbackChord(
  event: KeyboardEvent,
  accelerator: string,
): boolean {
  if (event.code !== 'Space' || event.repeat) {
    return false
  }
  if (accelerator === 'Control+Shift+Space') {
    return event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey
  }
  return event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
}
