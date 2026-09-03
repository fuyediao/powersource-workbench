/** OnlyOffice feature tabs (Docs / Sheets / Slides). */
export const OFFICE_FEATURE_IDS = ['docs', 'sheets', 'slides'] as const

/** OnlyOffice feature tab id. */
export type OfficeFeatureId = (typeof OFFICE_FEATURE_IDS)[number]

/**
 * Returns whether a feature tab is an OnlyOffice-backed editor.
 * @param feature - Feature tab id.
 * @returns True for Docs / Sheets / Slides.
 */
export function isOfficeFeatureId(feature: string): feature is OfficeFeatureId {
  return (OFFICE_FEATURE_IDS as readonly string[]).includes(feature)
}
