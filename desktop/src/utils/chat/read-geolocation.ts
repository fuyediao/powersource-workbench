/**
 * Reads the browser geolocation once. Failures return undefined so Map search
 * can still run from the query text.
 *
 * @returns Coordinates when permission and GPS succeed.
 */
export async function readBrowserGeolocation(): Promise<
  { latitude: number; longitude: number } | undefined
> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return undefined
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
      },
      () => {
        resolve(undefined)
      },
      { timeout: 8000, maximumAge: 60_000, enableHighAccuracy: false },
    )
  })
}
