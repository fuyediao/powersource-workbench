/**
 * ERP order display helpers (web parity).
 */

/**
 * Read a trimmed ERP scalar field as a display string, or null when empty.
 * @param value - Raw ERP JSON value.
 * @returns Trimmed string or null.
 */
export function erpScalarString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const trimmed = String(value).trim()
  return trimmed || null
}

/**
 * Returns true when an ERP name field looks like a person, not a duplicate customer code.
 * @param name - Candidate person name from ERP.
 * @param customerCode - ERP customer code on the same order.
 * @returns Whether the name is usable as a person label.
 */
export function isErpPersonName(name: string | null, customerCode: string | null): boolean {
  if (!name) return false
  if (!customerCode) return true
  return name.toUpperCase() !== customerCode.toUpperCase()
}

/**
 * Formats ERP order contact info for display.
 * ERP `LinkMan` is often populated with the customer code; in that case only phone is shown.
 * @param saleOrder - Flattened ERP SaleOrder object.
 * @returns Contact name and/or phone, or em dash when neither is usable.
 */
export function formatErpContactInfo(saleOrder: Record<string, unknown>): string {
  const linkMan = erpScalarString(saleOrder.LinkMan)
  const customerCode = erpScalarString(saleOrder.CustomerCode)
  const tel = erpScalarString(saleOrder.Tel)
  const listRcvMan = erpScalarString(saleOrder.ListRcvMan)

  const name = isErpPersonName(linkMan, customerCode)
    ? linkMan
    : isErpPersonName(listRcvMan, customerCode)
      ? listRcvMan
      : null

  const parts: string[] = []
  if (name) parts.push(name)
  if (tel) parts.push(tel)
  return parts.length > 0 ? parts.join(' · ') : '—'
}
