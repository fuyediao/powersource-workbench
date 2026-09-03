/**
 * Repository for team-level retrospective boards (`team_retro_boards`).
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { Json } from '@/types/database'
import type {
  TeamRetroBoardPayload,
  TeamRetroSectionId,
  TeamRetroSectionEntry,
} from '@/types/team-retro'

const SECTION_IDS: TeamRetroSectionId[] = [
  'customer',
  'goals',
  'execution',
  'data',
  'tech',
]

/**
 * Builds an empty payload with all section keys present.
 * @returns Default board structure.
 */
export function emptyTeamRetroPayload(): TeamRetroBoardPayload {
  const base: Record<string, TeamRetroSectionEntry> = {}
  for (const id of SECTION_IDS) {
    base[id] = { teamDesc: '', improvement: '' }
  }
  return base as TeamRetroBoardPayload
}

/**
 * Coerces unknown JSON from DB into a valid TeamRetroBoardPayload.
 * @param raw - Parsed JSON or null.
 * @returns Normalized payload.
 */
export function normalizeTeamRetroPayload(raw: unknown): TeamRetroBoardPayload {
  const out = emptyTeamRetroPayload()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const o = raw as Record<string, unknown>
  for (const id of SECTION_IDS) {
    const block = o[id]
    if (!block || typeof block !== 'object' || Array.isArray(block)) continue
    const b = block as Record<string, unknown>
    const td = typeof b.teamDesc === 'string' ? b.teamDesc : ''
    const im = typeof b.improvement === 'string' ? b.improvement : ''
    out[id] = { teamDesc: td, improvement: im }
  }
  return out
}

/**
 * Fetches the retro board payload for a group and calendar month.
 * @param groupId - Workspace group UUID.
 * @param fiscalYear - Calendar year.
 * @param periodMonth - Month 1–12.
 * @returns Payload, or null when Supabase is not configured.
 */
export async function fetchTeamRetroBoardPayload(
  groupId: string,
  fiscalYear: number,
  periodMonth: number,
): Promise<TeamRetroBoardPayload | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase
    .from('team_retro_boards')
    .select('board_payload')
    .eq('group_id', groupId)
    .eq('fiscal_year', fiscalYear)
    .eq('period_month', periodMonth)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return emptyTeamRetroPayload()
  return normalizeTeamRetroPayload(data.board_payload)
}

/**
 * Inserts or updates the retro board row for the group and month.
 * @param groupId - Workspace group UUID.
 * @param fiscalYear - Calendar year.
 * @param periodMonth - Month 1–12.
 * @param payload - Board JSON to persist.
 */
export async function upsertTeamRetroBoardPayload(
  groupId: string,
  fiscalYear: number,
  periodMonth: number,
  payload: TeamRetroBoardPayload,
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { data: existing, error: selErr } = await supabase
    .from('team_retro_boards')
    .select('id')
    .eq('group_id', groupId)
    .eq('fiscal_year', fiscalYear)
    .eq('period_month', periodMonth)
    .maybeSingle()

  if (selErr) throw new Error(selErr.message)

  if (existing?.id) {
    const { error } = await supabase
      .from('team_retro_boards')
      .update({ board_payload: payload as unknown as Json })
      .eq('id', existing.id)
    if (error) throw new Error(error.message)
    return
  }

  const { error } = await supabase.from('team_retro_boards').insert({
    group_id: groupId,
    fiscal_year: fiscalYear,
    period_month: periodMonth,
    board_payload: payload as unknown as Json,
  })
  if (error) throw new Error(error.message)
}
