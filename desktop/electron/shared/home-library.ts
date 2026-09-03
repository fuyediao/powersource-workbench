/**
 * Home website library DTOs and URL normalization (renderer + main).
 * Company Function tiles stay in code; user websites live in local SQLite.
 */

/** One Home rail category stored in SQLite. */
export interface HomeLibraryCategoryDto {
  id: string
  position: number
}

/** One website tile in a user's category list. */
export interface HomeLibraryAppDto {
  id: string
  categoryId: string
  position: number
  url: string
  name: string
}

/** Shared-catalog search hit (not yet linked into the user's category). */
export interface HomeLibrarySiteHitDto {
  id: string
  url: string
  name: string
}
