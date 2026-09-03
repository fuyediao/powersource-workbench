/** POWERSOURCE OA / ERP region pickers (Functions tiles). */

/** Which POWERSOURCE product the user opened. */
export type PowersourceSystem = 'oa' | 'erp'

/** Region host used to reach OA (:86) or ERP (:8068). */
export type PowersourceRegionId = 'intranet' | 'china' | 'other'

/** OA listens on this port. */
export const POWERSOURCE_OA_PORT = 86

/** ERP listens on this port. */
export const POWERSOURCE_ERP_PORT = 8068

interface PowersourceRegion {
  id: PowersourceRegionId
  host: string
  /** i18n key under `functions.endpointPicker.regions.*`. */
  labelKey: string
}

/** Region hosts shown in the OA / ERP picker dialog. */
export const POWERSOURCE_REGIONS: readonly PowersourceRegion[] = [
  {
    id: 'intranet',
    host: '192.168.0.5',
    labelKey: 'functions.endpointPicker.regions.intranet',
  },
  {
    id: 'china',
    host: '219.129.189.58',
    labelKey: 'functions.endpointPicker.regions.china',
  },
  {
    id: 'other',
    host: '61.29.250.144',
    labelKey: 'functions.endpointPicker.regions.other',
  },
] as const

/**
 * Returns the HTTP port for a POWERSOURCE product.
 * @param system - OA or ERP.
 * @returns Port number.
 */
export function powersourcePort(system: PowersourceSystem): number {
  return system === 'oa' ? POWERSOURCE_OA_PORT : POWERSOURCE_ERP_PORT
}

/**
 * Builds the absolute OA / ERP URL for a region.
 * @param system - OA (:86) or ERP (:8068).
 * @param regionId - Intranet / China / other host.
 * @returns `http://host:port` or empty when the region is unknown.
 */
export function buildPowersourceUrl(
  system: PowersourceSystem,
  regionId: PowersourceRegionId,
): string {
  const region = POWERSOURCE_REGIONS.find((entry) => entry.id === regionId)
  if (!region) {
    return ''
  }
  return `http://${region.host}:${powersourcePort(system)}`
}

/**
 * Resolves whether a browser URL is a POWERSOURCE OA or ERP login host
 * (one of the three region IPs on port 86 or 8068).
 *
 * @param url - Absolute page URL from the in-app browser
 * @returns `'oa'` | `'erp'`, or null when not a known login endpoint
 */
export function matchPowersourceLoginSystem(url: string): PowersourceSystem | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null
  }
  const host = parsed.hostname
  const port = parsed.port
    ? Number(parsed.port)
    : parsed.protocol === 'https:'
      ? 443
      : 80
  const knownHost = POWERSOURCE_REGIONS.some((region) => region.host === host)
  if (!knownHost) {
    return null
  }
  if (port === POWERSOURCE_OA_PORT) {
    return 'oa'
  }
  if (port === POWERSOURCE_ERP_PORT) {
    return 'erp'
  }
  return null
}
