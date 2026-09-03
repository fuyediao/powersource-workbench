const FALLBACK_COLORS = [
  'bg-sky-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-violet-500',
] as const

/**
 * Builds the icon URL for a website tile (remote favicon CDN only).
 * Function tiles must use {@link AppItem.icon} instead — never call this for them.
 * @param url - Site URL.
 * @returns Favicon CDN URL, or null when the site URL is invalid.
 */
export function getAppIconUrl(url: string): string | null {
  return getRemoteFaviconUrl(url)
}

/**
 * Builds a remote favicon URL for a site.
 * Uses DuckDuckGo's icon CDN (avoids Google `s2/favicons` SSL failures on restricted networks).
 * @param url - Site URL.
 * @returns Favicon CDN URL, or null when the site URL is invalid.
 */
export function getRemoteFaviconUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname
    if (!hostname) {
      return null
    }
    return `https://icons.duckduckgo.com/ip3/${hostname}.ico`
  } catch {
    return null
  }
}

/**
 * Detects Google's default globe placeholder.
 * Missing icons still return HTTP 200 with a tiny 16x16 image, so onError never runs.
 * @param image - Loaded favicon image element.
 * @returns Whether the image is the placeholder globe.
 */
export function isPlaceholderFavicon(image: HTMLImageElement): boolean {
  return image.naturalWidth <= 16 || image.naturalHeight <= 16
}

/**
 * Picks a stable letter-tile color class for an app name.
 * @param name - Display name.
 * @returns A Tailwind background color class.
 */
export function getLetterFallbackColor(name: string): string {
  const colorIndex = [...name].reduce((total, character) => total + character.charCodeAt(0), 0)
  return FALLBACK_COLORS[colorIndex % FALLBACK_COLORS.length]
}
