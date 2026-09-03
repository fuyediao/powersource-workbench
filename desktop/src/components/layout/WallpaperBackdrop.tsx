import { useEffect, useRef, useState } from 'react'
import { WALLPAPER_MANUAL_CROSSFADE_MS } from '@/utils/home/library-api'

interface WallpaperBackdropProps {
  /** Signed wallpaper URL, or null when cleared. */
  backgroundUrl?: string | null
  /** Crossfade duration in ms (manual fast vs rotate slow). */
  backgroundCrossfadeMs?: number
  /** Wallpaper visibility from 0 (hidden) to 1 (fully visible). */
  backgroundOpacity?: number
  /** When false, keep the last frame but hide the layer (e.g. in-app browser tab). */
  visible?: boolean
}

/**
 * Fixed full-window wallpaper with crossfade; lives above the signed-in shell so
 * Home and Settings share the same backdrop (Home may stay mounted but `hidden`).
 * @param props - Active URL, fade timing, opacity, and tab visibility.
 * @returns Wallpaper layer, or null when idle with no image.
 */
export function WallpaperBackdrop({
  backgroundUrl,
  backgroundCrossfadeMs = WALLPAPER_MANUAL_CROSSFADE_MS,
  backgroundOpacity = 1,
  visible = true,
}: WallpaperBackdropProps) {
  const [baseUrl, setBaseUrl] = useState<string | null>(null)
  const [baseOpaque, setBaseOpaque] = useState(false)
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null)
  const [overlayOpaque, setOverlayOpaque] = useState(false)
  const [fadeMs, setFadeMs] = useState(backgroundCrossfadeMs)
  const baseUrlRef = useRef<string | null>(null)
  const overlayUrlRef = useRef<string | null>(null)
  const fadeGenerationRef = useRef(0)

  useEffect(() => {
    const showing =
      visible && Boolean((baseUrl && baseOpaque) || (overlayUrl && overlayOpaque))
    document.documentElement.classList.toggle('has-wallpaper', showing)
    return () => {
      document.documentElement.classList.remove('has-wallpaper')
    }
  }, [baseUrl, baseOpaque, overlayUrl, overlayOpaque, visible])

  useEffect(() => {
    const generation = ++fadeGenerationRef.current
    const nextUrl = backgroundUrl ?? null
    const nextFadeMs = backgroundCrossfadeMs
    setFadeMs(nextFadeMs)

    /**
     * Commits any in-flight overlay onto the base layer so a new fade can start cleanly.
     * @returns Nothing.
     */
    function commitOverlayToBase(): void {
      const overlay = overlayUrlRef.current
      if (!overlay) {
        return
      }
      baseUrlRef.current = overlay
      overlayUrlRef.current = null
      setBaseUrl(overlay)
      setBaseOpaque(true)
      setOverlayUrl(null)
      setOverlayOpaque(false)
    }

    if (!nextUrl) {
      commitOverlayToBase()
      setBaseOpaque(false)
      const clearTimer = window.setTimeout(() => {
        if (fadeGenerationRef.current !== generation) {
          return
        }
        baseUrlRef.current = null
        setBaseUrl(null)
      }, nextFadeMs)
      return () => window.clearTimeout(clearTimer)
    }

    commitOverlayToBase()

    if (nextUrl === baseUrlRef.current) {
      setBaseOpaque(true)
      return
    }

    if (!baseUrlRef.current) {
      baseUrlRef.current = nextUrl
      setBaseUrl(nextUrl)
      setBaseOpaque(false)
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (fadeGenerationRef.current !== generation) {
            return
          }
          setBaseOpaque(true)
        })
      })
      return () => cancelAnimationFrame(frame)
    }

    overlayUrlRef.current = nextUrl
    setOverlayUrl(nextUrl)
    setOverlayOpaque(false)
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (fadeGenerationRef.current !== generation) {
          return
        }
        setOverlayOpaque(true)
      })
    })
    const settleTimer = window.setTimeout(() => {
      if (fadeGenerationRef.current !== generation) {
        return
      }
      baseUrlRef.current = nextUrl
      overlayUrlRef.current = null
      setBaseUrl(nextUrl)
      setBaseOpaque(true)
      setOverlayUrl(null)
      setOverlayOpaque(false)
    }, nextFadeMs)

    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(settleTimer)
    }
  }, [backgroundUrl, backgroundCrossfadeMs])

  if (!baseUrl && !overlayUrl) {
    return null
  }

  const fadeStyle = {
    transitionDuration: `${fadeMs}ms`,
    transitionTimingFunction: fadeMs >= 1000 ? 'ease-in-out' : 'ease',
  }

  return (
    <div
      className={`pointer-events-none fixed inset-0 -z-10 transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      aria-hidden={!visible}
    >
      <div className="absolute inset-0 bg-(--canvas)" />
      <div
        className="absolute inset-0 transition-opacity duration-300 ease-out"
        style={{ opacity: backgroundOpacity }}
      >
        {baseUrl ? (
          <div
            className={`absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity ${
              baseOpaque || overlayUrl ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ ...fadeStyle, backgroundImage: `url(${baseUrl})` }}
          />
        ) : null}
        {overlayUrl ? (
          <div
            className={`absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity ${
              overlayOpaque ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ ...fadeStyle, backgroundImage: `url(${overlayUrl})` }}
          />
        ) : null}
      </div>
    </div>
  )
}
