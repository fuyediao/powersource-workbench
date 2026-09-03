/** Section keys for the team retro board (i18n `admin.team.retro.section.*`). */
export type TeamRetroSectionId =
  | 'customer'
  | 'goals'
  | 'execution'
  | 'data'
  | 'tech'

/** One editable block per section. */
export interface TeamRetroSectionEntry {
  teamDesc: string
  improvement: string
}

/** Full board payload stored in `team_retro_boards.board_payload`. */
export type TeamRetroBoardPayload = Record<TeamRetroSectionId, TeamRetroSectionEntry>
