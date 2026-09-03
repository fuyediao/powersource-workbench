/**
 * Competitor shop / line types aligned with workbench-web Admin competitor models.
 */

/** Map marker importance stored in `competitor_shops.importance_level`. */
export type CompetitorImportanceLevel = 'low' | 'medium' | 'high'

/** Threat rating stored in `competitor_lines.threat_level`. */
export type CompetitorThreatLevel =
  | 'very_low'
  | 'low'
  | 'medium'
  | 'high'
  | 'critical'

/** Competitor store / site observation. */
export interface CompetitorShop {
  id: string
  groupId: string
  storeName: string
  country: string | null
  stateProvince: string | null
  city: string | null
  addressLine1: string | null
  addressLine2: string | null
  postalCode: string | null
  latitude: number | null
  longitude: number | null
  reporterUserId: string | null
  /** Resolved from `profiles` on list fetch. */
  reporterDisplayName: string | null
  importanceLevel: CompetitorImportanceLevel | null
  customerId: string | null
  /** Company name from the embedded `customers` join (list select). */
  linkedCustomerName: string | null
  siteNotes: string | null
  sitePhotoUrls: string[]
  createdAt: string
  updatedAt: string
}

/** Editable competitor shop fields. */
export interface CompetitorShopInput {
  storeName: string
  country: string | null
  stateProvince: string | null
  city: string | null
  addressLine1: string | null
  addressLine2: string | null
  postalCode: string | null
  latitude: number | null
  longitude: number | null
  reporterUserId: string | null
  importanceLevel: CompetitorImportanceLevel | null
  customerId: string | null
  siteNotes: string | null
  sitePhotoUrls: string[]
}

/** Competitor product line attached to a shop. */
export interface CompetitorLine {
  id: string
  shopId: string
  groupId: string
  competitorCompanyName: string | null
  competitorProductName: string | null
  price: number | null
  salesQuantity: number | null
  threatLevel: CompetitorThreatLevel | null
  remarks: string | null
  productPhotoUrls: string[]
  createdAt: string
  updatedAt: string
}

/** Editable competitor line fields. */
export interface CompetitorLineInput {
  competitorCompanyName: string | null
  competitorProductName: string | null
  price: number | null
  salesQuantity: number | null
  threatLevel: CompetitorThreatLevel | null
  remarks: string | null
  productPhotoUrls: string[]
}

/** Importance filter for the shop list (`all` applies no filter). */
export type CompetitorImportanceFilter =
  | 'all'
  | 'unset'
  | CompetitorImportanceLevel

/** Paginated shop list result. */
export interface CompetitorShopListResult {
  rows: CompetitorShop[]
  totalCount: number
}
