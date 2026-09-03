/**
 * Structured address helpers (favorites → customer company_* sync).
 */

/** Six-part structured postal address (all optional / nullable). */
export interface StructuredAddress {
  country?: string | null
  stateProvince?: string | null
  city?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  postalCode?: string | null
}

/**
 * True when any structured address field is a non-empty string.
 * @param fav - Address-shaped object.
 * @returns Whether structured fields are present.
 */
export function hasStructuredAddress(fav: {
  country?: string | null
  stateProvince?: string | null
  city?: string | null
  addressLine1?: string | null
  postalCode?: string | null
}): boolean {
  return [fav.country, fav.stateProvince, fav.city, fav.addressLine1, fav.postalCode].some(
    (v) => typeof v === 'string' && v.trim().length > 0,
  )
}

/**
 * Applies a favorite address onto customer company_* form fields (mutates form).
 * @param fav - Favorite or favorite-shaped address.
 * @param form - Form company address fields.
 * @returns Nothing.
 */
export function applyFavoriteToCustomerCompanyAddress(
  fav: {
    country?: string | null
    stateProvince?: string | null
    city?: string | null
    addressLine1?: string | null
    addressLine2?: string | null
    postalCode?: string | null
    address?: string
  },
  form: {
    companyCountry: string | null
    companyState: string | null
    companyCity: string | null
    companyPostalCode: string | null
    companyAddressLine1: string | null
    companyAddressLine2: string | null
  },
): void {
  if (hasStructuredAddress(fav)) {
    form.companyCountry = fav.country?.trim() || null
    form.companyState = fav.stateProvince?.trim() || null
    form.companyCity = fav.city?.trim() || null
    form.companyPostalCode = fav.postalCode?.trim() || null
    form.companyAddressLine1 = fav.addressLine1?.trim() || null
    form.companyAddressLine2 = fav.addressLine2?.trim() || null
  } else {
    form.companyCountry = null
    form.companyState = null
    form.companyCity = null
    form.companyPostalCode = null
    form.companyAddressLine1 = fav.address?.trim() || null
    form.companyAddressLine2 = null
  }
}
