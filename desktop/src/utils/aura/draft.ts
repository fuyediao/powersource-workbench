/** localStorage key for the in-app Aura draft. */
export const AURA_DRAFT_STORAGE_KEY = 'geocrm_aura_draft'

/**
 * Loads the persisted Aura draft, or an empty document.
 *
 * @returns Markdown source.
 */
export function loadAuraDraft(): string {
  try {
    const raw = localStorage.getItem(AURA_DRAFT_STORAGE_KEY)
    if (raw != null && raw.length > 0) {
      return raw
    }
  } catch {
    // ignore quota / private mode
  }
  return ''
}

/**
 * Persists the Aura draft to localStorage.
 *
 * @param markdown - Document text.
 * @returns Nothing.
 */
export function saveAuraDraft(markdown: string): void {
  try {
    localStorage.setItem(AURA_DRAFT_STORAGE_KEY, markdown)
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Clears the persisted Aura draft.
 *
 * @returns Nothing.
 */
export function clearAuraDraft(): void {
  try {
    localStorage.removeItem(AURA_DRAFT_STORAGE_KEY)
  } catch {
    // ignore
  }
}
