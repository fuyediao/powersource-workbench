import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { fetchOpenLinksMode, saveOpenLinksMode } from '@/utils/home/library-api'
import { openExternalUrl } from '@/utils/shared/api'
import { setAppOpenUrlHandler } from '@/utils/shared/open-app-url'
import {
  loadLinkOpenMode,
  saveLinkOpenMode,
  type LinkOpenMode,
} from '@/utils/settings/link-open-preference'

interface LinkOpenContextValue {
  mode: LinkOpenMode
  setMode: (mode: LinkOpenMode) => void
  /** Opens a URL in-app or in the system browser per preference. */
  openUrl: (url: string) => void
  /** Always opens an http(s) URL as an in-app browser title-bar tab. */
  openInApp: (url: string) => void
}

const LinkOpenContext = createContext<LinkOpenContextValue | null>(null)

interface LinkOpenProviderProps {
  children: ReactNode
  /** Opens an http(s) URL as a Chrome-style in-app browser tab. */
  onOpenInApp: (url: string) => void
  /** Signed-in user id; when set, Open links is stored in Home SQLite. */
  userId?: string | null
}

/**
 * Provides signed-in link opening (in-app webview tab vs system browser).
 * Login / OAuth continue to use {@link openExternalUrl} directly.
 * @param props - Children, in-app open handler, and optional user id.
 * @returns Context provider.
 */
export function LinkOpenProvider({ children, onOpenInApp, userId }: LinkOpenProviderProps) {
  const [mode, setModeState] = useState<LinkOpenMode>(() => loadLinkOpenMode())
  const userEditedRef = useRef(false)

  useEffect(() => {
    userEditedRef.current = false
    if (!userId) {
      return
    }
    let cancelled = false
    void fetchOpenLinksMode(userId).then((next) => {
      if (!cancelled && !userEditedRef.current) {
        setModeState(next)
      }
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  /**
   * Updates and persists the link-open mode.
   * @param next - Target mode.
   * @returns Nothing.
   */
  const setMode = useCallback(
    (next: LinkOpenMode): void => {
      userEditedRef.current = true
      setModeState(next)
      saveLinkOpenMode(next)
      if (userId) {
        void saveOpenLinksMode(userId, next)
      }
    },
    [userId],
  )

  /**
   * Opens a URL according to the current preference.
   * @param url - Absolute http(s) URL.
   * @returns Nothing.
   */
  const openUrl = useCallback(
    (url: string): void => {
      if (!url.startsWith('https:') && !url.startsWith('http:')) {
        return
      }
      if (mode === 'inApp') {
        onOpenInApp(url)
        return
      }
      void openExternalUrl(url)
    },
    [mode, onOpenInApp],
  )

  /**
   * Always opens in an in-app browser title-bar tab (ignores preference).
   * @param url - Absolute http(s) URL.
   * @returns Nothing.
   */
  const openInApp = useCallback(
    (url: string): void => {
      if (!url.startsWith('https:') && !url.startsWith('http:')) {
        return
      }
      onOpenInApp(url)
    },
    [onOpenInApp],
  )

  useEffect(() => {
    setAppOpenUrlHandler(openUrl)
    return () => {
      setAppOpenUrlHandler(null)
    }
  }, [openUrl])

  const value = useMemo(
    (): LinkOpenContextValue => ({ mode, setMode, openUrl, openInApp }),
    [mode, setMode, openUrl, openInApp],
  )

  return <LinkOpenContext.Provider value={value}>{children}</LinkOpenContext.Provider>
}

/**
 * Supplies link handling only when a signed-in app shell has not already provided it.
 * @param props - Child content that may render links outside the authenticated shell.
 * @returns Existing context content or a system-browser fallback provider.
 */
export function LinkOpenFallbackProvider({ children }: { children: ReactNode }) {
  const existing = useContext(LinkOpenContext)
  if (existing) return children
  return (
    <LinkOpenProvider onOpenInApp={(url) => void openExternalUrl(url)}>
      {children}
    </LinkOpenProvider>
  )
}

/**
 * Accesses link-open preference and open helper (must be under {@link LinkOpenProvider}).
 * @returns Link-open context.
 */
export function useLinkOpen(): LinkOpenContextValue {
  const ctx = useContext(LinkOpenContext)
  if (!ctx) {
    throw new Error('useLinkOpen must be used within LinkOpenProvider')
  }
  return ctx
}
