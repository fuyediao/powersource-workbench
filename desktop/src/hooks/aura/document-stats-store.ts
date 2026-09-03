import {
  computeDocumentStats,
  type DocumentStats,
} from '@/utils/aura/document-stats'

type Listener = () => void

const EMPTY_STATS = computeDocumentStats('')
let stats: DocumentStats = EMPTY_STATS
const listeners = new Set<Listener>()

/** Notify document-stats subscribers. */
function emit(): void {
  listeners.forEach((listener) => listener())
}

/**
 * Latest Aura document metrics (word count menu / status).
 *
 * @returns Current character, word, line, and reading-time stats.
 */
export function getDocumentStats(): DocumentStats {
  return stats
}

/**
 * Replace document metrics and notify subscribers when values change.
 *
 * @param next - Latest metrics.
 * @returns Nothing.
 */
export function setDocumentStats(next: DocumentStats): void {
  if (
    stats.characters === next.characters &&
    stats.words === next.words &&
    stats.lines === next.lines &&
    stats.readingMinutes === next.readingMinutes
  ) {
    return
  }
  stats = next
  emit()
}

/**
 * Subscribe to document metric changes.
 *
 * @param listener - Callback invoked on change.
 * @returns Unsubscribe function.
 */
export function subscribeDocumentStats(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
