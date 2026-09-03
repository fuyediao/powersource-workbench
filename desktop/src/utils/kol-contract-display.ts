import {
  KOL_CONTRACT_FILES_BUCKET,
  KOL_CONTRACT_IMAGES_BUCKET,
} from '@/services/kol-contract-storage'

/**
 * Return true if `url` points to an object in the `kol-contract-images` bucket.
 * @param url - URL to test.
 * @returns Whether the URL is a contract image Storage object.
 */
export function isKolContractImageUrl(url: string): boolean {
  return url.includes(`/${KOL_CONTRACT_IMAGES_BUCKET}/`)
}

/**
 * Return true if `url` points to an object in the `kol-contract-files` bucket.
 * @param url - URL to test.
 * @returns Whether the URL is a contract file Storage object.
 */
export function isKolContractFileUrl(url: string): boolean {
  return url.includes(`/${KOL_CONTRACT_FILES_BUCKET}/`)
}

/**
 * Return true if `url` is hosted in either KOL contract Storage bucket
 * (i.e. is an uploaded file, not an external link).
 * @param url - URL to test.
 * @returns Whether the URL is a Storage object.
 */
export function isKolContractStorageUrl(url: string): boolean {
  return isKolContractImageUrl(url) || isKolContractFileUrl(url)
}

/**
 * Extract a human-readable display name from a KOL contract URL.
 * For Storage URLs: basename, URL-decoded, with the leading `{timestamp}-` prefix stripped.
 * For external URLs: the raw URL is returned unchanged.
 * @param url - Full URL string.
 * @returns Display name string.
 */
export function extractKolContractDisplayName(url: string): string {
  if (!isKolContractStorageUrl(url)) {
    return url
  }
  try {
    const pathname = new URL(url).pathname
    const segments = pathname.split('/')
    const basename = segments[segments.length - 1] ?? url
    const decoded = decodeURIComponent(basename)
    return decoded.replace(/^\d+-/, '')
  } catch {
    return url
  }
}
