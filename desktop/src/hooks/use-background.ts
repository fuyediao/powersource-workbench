import { useEffect, useRef, useState } from 'react'
import {
  addWallpaper,
  clampWallpaperRotateSeconds,
  DEFAULT_WALLPAPER_ROTATE_ENABLED,
  DEFAULT_WALLPAPER_ROTATE_SECONDS,
  fetchActiveWallpaperPath,
  fetchActiveWallpaperUrl,
  fetchWallpaperRotateSettings,
  listWallpapers,
  MAX_BACKGROUND_BYTES,
  removeWallpaper,
  saveWallpaperRotateSettings,
  selectWallpaper,
  WALLPAPER_MANUAL_CROSSFADE_MS,
  WALLPAPER_ROTATE_CROSSFADE_MS,
  type WallpaperItem,
} from '@/utils/home/library-api'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export type BackgroundError = 'type' | 'size' | 'save' | 'limit'

/**
 * Builds the sessionStorage key for a cached wallpaper URL.
 * @param userId - Signed-in user id.
 * @returns Storage key.
 */
function wallpaperCacheKey(userId: string): string {
  return `atlas-wallpaper-url:${userId}`
}

/**
 * Preloads an image URL so the first paint after reveal is already decoded.
 * @param url - Image URL.
 * @returns The same URL when loaded, or rejects on failure.
 */
function preloadImage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(url)
    image.onerror = () => reject(new Error('Failed to preload wallpaper.'))
    image.src = url
  })
}

/**
 * Infers an image MIME type from the file name when `file.type` is empty.
 * @param file - Selected file.
 * @returns MIME type or empty string.
 */
function resolveImageType(file: File): string {
  if (file.type) {
    const mime = file.type.toLowerCase().split(';', 1)[0]?.trim() ?? ''
    if (mime === 'image/jpg' || mime === 'image/pjpeg') {
      return 'image/jpeg'
    }
    return mime
  }
  const name = file.name.toLowerCase()
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) {
    return 'image/jpeg'
  }
  if (name.endsWith('.png')) {
    return 'image/png'
  }
  if (name.endsWith('.webp')) {
    return 'image/webp'
  }
  return ''
}

/**
 * Manages the wallpaper gallery and the active page background.
 * Reveals the active wallpaper only after preload, and reuses a session cache on refresh.
 * @param userId - Signed-in user id, or null while unauthenticated.
 * @returns Background state and gallery actions.
 */
export function useBackground(userId: string | null): {
  dataUrl: string | null
  activePath: string | null
  items: WallpaperItem[]
  loading: boolean
  error: BackgroundError | null
  rotateEnabled: boolean
  rotateSeconds: number
  crossfadeMs: number
  setRotateEnabled: (enabled: boolean) => void
  setRotateSeconds: (seconds: number) => void
  setFromFile: (file: File) => Promise<BackgroundError | null>
  select: (path: string) => Promise<BackgroundError | null>
  remove: (id: string) => Promise<BackgroundError | null>
  clear: () => Promise<BackgroundError | null>
  clearError: () => void
} {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [activePath, setActivePath] = useState<string | null>(null)
  const [items, setItems] = useState<WallpaperItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<BackgroundError | null>(null)
  const [rotateEnabled, setRotateEnabledState] = useState(DEFAULT_WALLPAPER_ROTATE_ENABLED)
  const [rotateSeconds, setRotateSecondsState] = useState(DEFAULT_WALLPAPER_ROTATE_SECONDS)
  const [crossfadeMs, setCrossfadeMs] = useState(WALLPAPER_MANUAL_CROSSFADE_MS)
  const persistQueueRef = useRef(Promise.resolve())
  /** Latest path to persist; `undefined` means nothing queued, `null` means clear. */
  const pendingPersistPathRef = useRef<string | null | undefined>(undefined)
  const itemsRef = useRef(items)
  const activePathRef = useRef(activePath)
  const selectRef = useRef<
    (path: string, fadeMs?: number) => Promise<BackgroundError | null>
  >(async () => null)
  const rotateSaveTimer = useRef<number | null>(null)
  const pendingRotate = useRef<{ enabled: boolean; seconds: number } | null>(null)
  const userIdRef = useRef(userId)
  itemsRef.current = items
  activePathRef.current = activePath
  userIdRef.current = userId

  useEffect(() => {
    if (!userId) {
      setDataUrl(null)
      setActivePath(null)
      setItems([])
      setRotateEnabledState(DEFAULT_WALLPAPER_ROTATE_ENABLED)
      setRotateSecondsState(DEFAULT_WALLPAPER_ROTATE_SECONDS)
      setLoading(false)
      return
    }

    let active = true
    let applyEpoch = 0
    const cacheKey = wallpaperCacheKey(userId)
    const cached = sessionStorage.getItem(cacheKey)

    /**
     * Applies a wallpaper URL after preload and updates the session cache.
     * @param url - Signed wallpaper URL, or null to clear.
     * @param epoch - Apply generation; stale preloads are ignored.
     * @returns Nothing.
     */
    async function applyUrl(url: string | null, epoch: number): Promise<void> {
      if (!url) {
        if (active && epoch === applyEpoch) {
          setDataUrl(null)
          sessionStorage.removeItem(cacheKey)
        }
        return
      }
      try {
        const ready = await preloadImage(url)
        if (active && epoch === applyEpoch) {
          setDataUrl(ready)
          sessionStorage.setItem(cacheKey, ready)
        }
      } catch {
        if (epoch === applyEpoch) {
          sessionStorage.removeItem(cacheKey)
        }
      }
    }

    if (cached) {
      void applyUrl(cached, applyEpoch).catch(() => undefined)
    }

    setLoading(true)
    void Promise.all([
      fetchActiveWallpaperPath(userId),
      fetchActiveWallpaperUrl(userId),
      listWallpapers(userId),
      fetchWallpaperRotateSettings(userId),
    ])
      .then(async ([path, url, gallery, rotate]) => {
        if (!active) {
          return
        }
        applyEpoch += 1
        const epoch = applyEpoch
        setActivePath(path)
        setItems(gallery)
        setRotateEnabledState(rotate.enabled)
        setRotateSecondsState(rotate.seconds)
        await applyUrl(url, epoch)
      })
      .catch(() => {
        if (active && !cached) {
          setDataUrl(null)
          setActivePath(null)
          setItems([])
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [userId])

  useEffect(() => {
    /**
     * Flushes any debounced rotate preference write.
     * @returns Nothing.
     */
    function flushPendingRotateSave(): void {
      if (rotateSaveTimer.current !== null) {
        window.clearTimeout(rotateSaveTimer.current)
        rotateSaveTimer.current = null
      }
      if (pendingRotate.current === null) {
        return
      }
      const value = pendingRotate.current
      pendingRotate.current = null
      const currentUserId = userIdRef.current
      if (!currentUserId) {
        return
      }
      void saveWallpaperRotateSettings(currentUserId, value).catch(() => undefined)
    }

    window.addEventListener('pagehide', flushPendingRotateSave)
    return () => {
      window.removeEventListener('pagehide', flushPendingRotateSave)
      flushPendingRotateSave()
    }
  }, [])

  useEffect(() => {
    if (!rotateEnabled || items.length < 2) {
      return
    }

    const timer = window.setInterval(() => {
      const gallery = itemsRef.current
      if (gallery.length < 2) {
        return
      }
      const current = activePathRef.current
      const index = gallery.findIndex((item) => item.path === current)
      const nextIndex = index < 0 ? 0 : (index + 1) % gallery.length
      const next = gallery[nextIndex]
      if (!next || next.path === current) {
        return
      }
      void selectRef.current(next.path, WALLPAPER_ROTATE_CROSSFADE_MS)
    }, rotateSeconds * 1000 + WALLPAPER_ROTATE_CROSSFADE_MS)

    return () => {
      window.clearInterval(timer)
    }
  }, [rotateEnabled, rotateSeconds, items.length])

  /**
   * Schedules a debounced upsert of rotate preferences.
   * @param enabled - Whether rotation is on.
   * @param seconds - Interval in seconds.
   * @returns Nothing.
   */
  function scheduleRotateSave(enabled: boolean, seconds: number): void {
    const currentUserId = userIdRef.current
    if (!currentUserId) {
      return
    }
    pendingRotate.current = { enabled, seconds }
    if (rotateSaveTimer.current !== null) {
      window.clearTimeout(rotateSaveTimer.current)
    }
    rotateSaveTimer.current = window.setTimeout(() => {
      rotateSaveTimer.current = null
      const value = pendingRotate.current
      if (value === null) {
        return
      }
      pendingRotate.current = null
      void saveWallpaperRotateSettings(currentUserId, value).catch(() => undefined)
    }, 250)
  }

  /**
   * Updates whether wallpaper auto-rotate is enabled.
   * @param enabled - Next enabled state.
   * @returns Nothing.
   */
  function setRotateEnabled(enabled: boolean): void {
    setRotateEnabledState(enabled)
    scheduleRotateSave(enabled, rotateSeconds)
  }

  /**
   * Updates the wallpaper auto-rotate interval (clamped to >= 10s).
   * @param seconds - Next interval in seconds.
   * @returns Nothing.
   */
  function setRotateSeconds(seconds: number): void {
    const next = clampWallpaperRotateSeconds(seconds)
    setRotateSecondsState(next)
    scheduleRotateSave(rotateEnabled, next)
  }

  /**
   * Validates and uploads an image into the wallpaper library (auto-selects it).
   * @param file - Selected image file.
   * @returns Error code when rejected, otherwise null.
   */
  async function setFromFile(file: File): Promise<BackgroundError | null> {
    if (!userId) {
      return 'save'
    }
    const mime = resolveImageType(file)
    if (!ALLOWED_TYPES.has(mime)) {
      setError('type')
      return 'type'
    }
    if (file.size > MAX_BACKGROUND_BYTES) {
      setError('size')
      return 'size'
    }

    setError(null)
    setLoading(true)
    try {
      const saved = await addWallpaper(userId, file, mime)
      const [path, gallery] = await Promise.all([
        fetchActiveWallpaperPath(userId),
        listWallpapers(userId),
      ])
      await preloadImage(saved)
      setCrossfadeMs(WALLPAPER_MANUAL_CROSSFADE_MS)
      setDataUrl(saved)
      setActivePath(path)
      setItems(gallery)
      sessionStorage.setItem(wallpaperCacheKey(userId), saved)
      return null
    } catch (reason: unknown) {
      if (reason instanceof Error && reason.message === 'WALLPAPER_LIMIT') {
        setError('limit')
        return 'limit'
      }
      const message = reason instanceof Error ? reason.message : 'unknown error'
      console.error('Wallpaper upload failed:', message)
      setError('save')
      return 'save'
    } finally {
      setLoading(false)
    }
  }

  /**
   * Queues a coalesced write of `user_settings.background_path` (null clears).
   * @param path - Storage path to activate, or null to clear.
   * @returns Nothing.
   */
  function enqueueBackgroundPersist(path: string | null): void {
    const signedInUserId = userIdRef.current
    if (!signedInUserId) {
      return
    }
    pendingPersistPathRef.current = path
    persistQueueRef.current = persistQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (pendingPersistPathRef.current === undefined) {
          return
        }
        const toPersist = pendingPersistPathRef.current
        pendingPersistPathRef.current = undefined
        try {
          await selectWallpaper(signedInUserId, toPersist)
          if (!toPersist || activePathRef.current !== toPersist) {
            return
          }
          const hasGalleryUrl = itemsRef.current.some(
            (item) => item.path === toPersist && Boolean(item.url),
          )
          if (hasGalleryUrl) {
            return
          }
          const signed = await fetchActiveWallpaperUrl(signedInUserId)
          if (!signed || activePathRef.current !== toPersist) {
            return
          }
          await preloadImage(signed)
          setDataUrl(signed)
          sessionStorage.setItem(wallpaperCacheKey(signedInUserId), signed)
        } catch {
          setError('save')
        }
      })
  }

  /**
   * Activates an existing wallpaper from the library.
   * Applies the gallery URL immediately, then persists the latest selection in order.
   * @param path - Storage path to select.
   * @param fadeMs - Crossfade duration; defaults to the fast manual switch.
   * @returns Error code when rejected, otherwise null.
   */
  async function select(
    path: string,
    fadeMs: number = WALLPAPER_MANUAL_CROSSFADE_MS,
  ): Promise<BackgroundError | null> {
    if (!userId) {
      return 'save'
    }
    if (path === activePathRef.current) {
      return null
    }

    setCrossfadeMs(fadeMs)
    const galleryUrl = itemsRef.current.find((item) => item.path === path)?.url ?? null
    setError(null)
    setActivePath(path)

    if (galleryUrl) {
      setDataUrl(galleryUrl)
      sessionStorage.setItem(wallpaperCacheKey(userId), galleryUrl)
      void preloadImage(galleryUrl).catch(() => undefined)
    }

    enqueueBackgroundPersist(path)
    return null
  }

  selectRef.current = select

  /**
   * Deletes one wallpaper from the library.
   * @param id - Wallpaper row id.
   * @returns Error code when rejected, otherwise null.
   */
  async function remove(id: string): Promise<BackgroundError | null> {
    if (!userId) {
      return 'save'
    }
    setError(null)
    setLoading(true)
    try {
      const url = await removeWallpaper(userId, id)
      const [path, gallery] = await Promise.all([
        fetchActiveWallpaperPath(userId),
        listWallpapers(userId),
      ])
      if (url) {
        await preloadImage(url)
        setCrossfadeMs(WALLPAPER_MANUAL_CROSSFADE_MS)
        setDataUrl(url)
        sessionStorage.setItem(wallpaperCacheKey(userId), url)
      } else {
        setCrossfadeMs(WALLPAPER_MANUAL_CROSSFADE_MS)
        setDataUrl(null)
        sessionStorage.removeItem(wallpaperCacheKey(userId))
      }
      setActivePath(path)
      setItems(gallery)
      return null
    } catch {
      setError('save')
      return 'save'
    } finally {
      setLoading(false)
    }
  }

  /**
   * Clears the active wallpaper selection (keeps the library).
   * @returns Error code when rejected, otherwise null.
   */
  async function clear(): Promise<BackgroundError | null> {
    if (!userId) {
      return 'save'
    }
    setError(null)
    setCrossfadeMs(WALLPAPER_MANUAL_CROSSFADE_MS)
    setDataUrl(null)
    setActivePath(null)
    sessionStorage.removeItem(wallpaperCacheKey(userId))
    enqueueBackgroundPersist(null)
    return null
  }

  return {
    dataUrl,
    activePath,
    items,
    loading,
    error,
    rotateEnabled,
    rotateSeconds,
    crossfadeMs,
    setRotateEnabled,
    setRotateSeconds,
    setFromFile,
    select,
    remove,
    clear,
    clearError: () => setError(null),
  }
}

