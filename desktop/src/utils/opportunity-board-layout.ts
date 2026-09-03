/**
 * Admin Opportunities Freeform board layout (SQLite via IPC, with a one-time
 * localStorage migration). One sales process is active at a time; stage-card
 * positions and camera are stored per process, scoped to the signed-in user.
 */

import {
  DEFAULT_SALES_PROCESS,
  isOpportunitySalesProcess,
  pipelineStagesForSalesProcess,
  type OpportunitySalesProcess,
} from '@/types/opportunity'

/** localStorage key prefix (appended with `:` + userId). */
export const OPPORTUNITY_BOARD_LAYOUT_KEY = 'geocrm-electron-opportunity-board-layout'

/** Stage card width on the canvas (px). */
export const OPPORTUNITY_BOARD_MODULE_WIDTH = 280

const LAYOUT_VERSION = 5
const PAD = 16
/** Diagonal cascade: each stage card steps down-right and overlaps the previous. */
const CASCADE_STEP_X = 72
const CASCADE_STEP_Y = 56

/** Minimum camera zoom. */
export const OPPORTUNITY_BOARD_MIN_SCALE = 0.25

/** Maximum camera zoom. */
export const OPPORTUNITY_BOARD_MAX_SCALE = 3

export interface OpportunityBoardPosition {
  x: number
  y: number
}

/** Camera + stage positions for one sales process. */
export interface OpportunityBoardProcessLayout {
  stages: Record<string, OpportunityBoardPosition>
  pan: OpportunityBoardPosition
  scale: number
}

/** Saved Freeform layout (selected process + per-process cameras). */
export interface OpportunityBoardLayout {
  selectedProcess: OpportunitySalesProcess
  processes: Partial<Record<OpportunitySalesProcess, OpportunityBoardProcessLayout>>
}

interface StoredBoardLayout {
  version: number
  selectedProcess?: string
  processes?: Partial<Record<string, OpportunityBoardProcessLayout>>
}

let writeQueue: Promise<void> = Promise.resolve()

/**
 * Returns the Opportunities board layout IPC bridge when preload is present.
 * @returns Bridge, or undefined outside Electron.
 */
function opportunityBoardLayoutBridge():
  | Window['geocrm']['opportunityBoardLayout']
  | undefined {
  return window.geocrm?.opportunityBoardLayout
}

/**
 * Builds the legacy localStorage key (used only to migrate into SQLite).
 * @param userId - Auth user id.
 * @returns localStorage key.
 */
export function opportunityBoardLayoutKey(userId: string): string {
  return `${OPPORTUNITY_BOARD_LAYOUT_KEY}:${userId}`
}

/**
 * Default cascade positions for a process's stage cards (diagonal stack).
 * @param process - Active sales process.
 * @param _canvasWidth - Unused; kept so callers can pass the viewport width.
 * @param extraStages - Stage slugs not in the catalog (appended).
 * @returns Positions keyed by stage slug.
 */
export function defaultOpportunityBoardStagePositions(
  process: OpportunitySalesProcess,
  _canvasWidth: number,
  extraStages: readonly string[] = [],
): Record<string, OpportunityBoardPosition> {
  const catalog = pipelineStagesForSalesProcess(process).map((row) => row.stage)
  const known = new Set(catalog)
  const slugs = [
    ...catalog,
    ...extraStages.filter(
      (stage, index, list) => !known.has(stage) && list.indexOf(stage) === index,
    ),
  ]
  const result: Record<string, OpportunityBoardPosition> = {}
  slugs.forEach((stage, index) => {
    result[stage] = {
      x: PAD + index * CASCADE_STEP_X,
      y: PAD + index * CASCADE_STEP_Y,
    }
  })
  return result
}

/**
 * Merges saved stage positions with wrap defaults.
 * @param process - Active sales process.
 * @param canvasWidth - Visible width.
 * @param saved - Stored map, or null.
 * @param extraStages - Extra stage slugs from live data.
 * @returns Complete position map.
 */
export function resolveOpportunityBoardStagePositions(
  process: OpportunitySalesProcess,
  canvasWidth: number,
  saved: Record<string, OpportunityBoardPosition> | null | undefined,
  extraStages: readonly string[] = [],
): Record<string, OpportunityBoardPosition> {
  const defaults = defaultOpportunityBoardStagePositions(
    process,
    canvasWidth,
    extraStages,
  )
  const next = { ...defaults }
  if (saved) {
    for (const stage of Object.keys(defaults)) {
      const raw = saved[stage]
      if (raw) {
        next[stage] = sanitizeOpportunityBoardPosition(raw)
      }
    }
  }
  return next
}

/**
 * Keeps only finite coordinates (no viewport clamp — the canvas is unbounded).
 * @param position - Raw x/y.
 * @returns Finite position, or origin when invalid.
 */
export function sanitizeOpportunityBoardPosition(
  position: OpportunityBoardPosition,
): OpportunityBoardPosition {
  return {
    x: Number.isFinite(position.x) ? position.x : PAD,
    y: Number.isFinite(position.y) ? position.y : PAD,
  }
}

/**
 * Clamps camera zoom to the supported range.
 * @param scale - Raw scale.
 * @returns Scale between min and max, or 1 when invalid.
 */
export function clampOpportunityBoardScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) {
    return 1
  }
  return Math.min(
    OPPORTUNITY_BOARD_MAX_SCALE,
    Math.max(OPPORTUNITY_BOARD_MIN_SCALE, scale),
  )
}

/**
 * Parses a stored layout payload.
 * @param raw - JSON text.
 * @returns Layout, or null when invalid.
 */
function parseStoredBoardLayout(raw: string): OpportunityBoardLayout | null {
  try {
    const parsed = JSON.parse(raw) as StoredBoardLayout
    if (parsed.version !== LAYOUT_VERSION) {
      return null
    }
    const selectedProcess = isOpportunitySalesProcess(parsed.selectedProcess)
      ? parsed.selectedProcess
      : DEFAULT_SALES_PROCESS
    const processes: OpportunityBoardLayout['processes'] = {}
    if (parsed.processes && typeof parsed.processes === 'object') {
      for (const [key, slice] of Object.entries(parsed.processes)) {
        if (!isOpportunitySalesProcess(key) || !slice || typeof slice !== 'object') {
          continue
        }
        processes[key] = {
          stages:
            slice.stages && typeof slice.stages === 'object' ? slice.stages : {},
          pan: slice.pan
            ? sanitizeOpportunityBoardPosition(slice.pan)
            : { x: 0, y: 0 },
          scale: clampOpportunityBoardScale(slice.scale ?? 1),
        }
      }
    }
    return { selectedProcess, processes }
  } catch {
    return null
  }
}

/**
 * Reads a leftover localStorage layout for migration.
 * @param userId - Auth user id.
 * @returns Layout, or null.
 */
function readLegacyLocalStorageLayout(userId: string): OpportunityBoardLayout | null {
  try {
    const raw = window.localStorage.getItem(opportunityBoardLayoutKey(userId))
    if (!raw) {
      return null
    }
    return parseStoredBoardLayout(raw)
  } catch {
    return null
  }
}

/**
 * Reads saved layout from SQLite (migrating localStorage once when needed).
 * @param userId - Auth user id.
 * @returns Saved layout, or null.
 */
export async function readOpportunityBoardLayout(
  userId: string,
): Promise<OpportunityBoardLayout | null> {
  const bridge = opportunityBoardLayoutBridge()
  try {
    const raw = bridge ? ((await bridge.get(userId)) ?? null) : null
    const fromSqlite = raw ? parseStoredBoardLayout(raw) : null
    if (fromSqlite) {
      return fromSqlite
    }
    const fromLegacy = readLegacyLocalStorageLayout(userId)
    if (fromLegacy) {
      await writeOpportunityBoardLayout(userId, fromLegacy)
      window.localStorage.removeItem(opportunityBoardLayoutKey(userId))
      return fromLegacy
    }
    return null
  } catch {
    return readLegacyLocalStorageLayout(userId)
  }
}

/**
 * Writes the Freeform layout for this user to SQLite.
 * @param userId - Auth user id.
 * @param layout - Selected process and per-process cameras.
 * @returns Nothing.
 */
export async function writeOpportunityBoardLayout(
  userId: string,
  layout: OpportunityBoardLayout,
): Promise<void> {
  const payload: StoredBoardLayout = {
    version: LAYOUT_VERSION,
    selectedProcess: layout.selectedProcess,
    processes: layout.processes,
  }
  const json = JSON.stringify(payload)
  /**
   * Writes one serialized payload after earlier layout writes finish.
   * @returns Nothing.
   */
  const run = async (): Promise<void> => {
    const bridge = opportunityBoardLayoutBridge()
    try {
      if (!bridge) {
        throw new Error('Opportunity board layout IPC is unavailable.')
      }
      await bridge.set(userId, json)
      window.localStorage.removeItem(opportunityBoardLayoutKey(userId))
    } catch {
      try {
        window.localStorage.setItem(opportunityBoardLayoutKey(userId), json)
      } catch {
        // Ignore quota / private-mode failures.
      }
    }
  }
  writeQueue = writeQueue.then(run, run)
  await writeQueue
}

/**
 * Clears the saved layout so the next render uses cascade defaults.
 * @param userId - Auth user id.
 * @returns Nothing.
 */
export async function clearOpportunityBoardLayout(userId: string): Promise<void> {
  try {
    const bridge = opportunityBoardLayoutBridge()
    if (bridge) {
      await bridge.clear(userId)
    }
  } catch {
    // Fall through to localStorage cleanup.
  }
  try {
    window.localStorage.removeItem(opportunityBoardLayoutKey(userId))
  } catch {
    // Ignore storage failures.
  }
}
