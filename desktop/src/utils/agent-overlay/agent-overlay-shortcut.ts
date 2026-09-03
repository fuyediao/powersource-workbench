/**
 * Returns whether a keydown matches the Agent overlay accelerator chord.
 * @param event - Keyboard event.
 * @param accelerator - Electron accelerator (`Control+G` or `Alt+G`).
 * @returns True when the chord matches.
 */
export function isAgentOverlayFallbackChord(
  event: KeyboardEvent,
  accelerator: string,
): boolean {
  if (event.repeat || event.code !== 'KeyG' || event.metaKey || event.shiftKey) {
    return false
  }
  if (accelerator === 'Control+G') {
    return event.ctrlKey && !event.altKey
  }
  return event.altKey && !event.ctrlKey
}
