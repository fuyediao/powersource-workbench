import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ExternalLinkIcon,
  GlobeIcon,
  RefreshIcon,
} from '@/icons/AllIcons'
import { matchPowersourceLoginSystem } from '@/constants/powersource-endpoints'
import { tryPowersourceAutoLogin } from '@/services/powersource-auto-login'
import { openExternalUrl } from '@/utils/shared/api'
import { tabLabelFromUrl } from '@/utils/settings/link-open-preference'

interface InAppBrowserProps {
  /** Title-bar browser tab id (`browser:…`). */
  tabId: string
  /** Initial URL loaded into the native pane. */
  initialUrl: string
  /** Whether this browser pane is the active title-bar tab. */
  active: boolean
  /** Signed-in user id (OA/ERP Settings credentials). */
  userId: string
  /** Reports page title (or hostname fallback) and favicon for the tab strip. */
  onTitleChange: (title: string, faviconUrl: string) => void
}

/**
 * Invokes a main-process in-app browser method.
 *
 * @param method - Browser IPC method
 * @param args - Method arguments
 */
function browserInvoke(method: string, ...args: unknown[]): void {
  void window.workbench?.browser?.invoke?.(method, ...args)
}

/**
 * Returns whether a URL is the themed start page instead of a loaded site.
 * @param url - Candidate URL.
 * @returns True for empty or about:blank.
 */
function isBrowserStartUrl(url: string): boolean {
  const trimmed = url.trim()
  return trimmed === '' || trimmed === 'about:blank'
}

/**
 * In-app browser chrome + native WebContentsView pane (not `<webview>`).
 * Only the active tab calls `show`; leaving the tab cancels pending show frames
 * so Home is not covered again after `hideAll`.
 *
 * @param props - Tab id, initial URL, user id, and tab metadata callbacks
 * @returns In-app browser UI
 */
export function InAppBrowser({
  tabId,
  initialUrl,
  active,
  userId,
  onTitleChange,
}: InAppBrowserProps) {
  const { t } = useTranslation()
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [loadedUrl, setLoadedUrl] = useState(initialUrl)
  const [address, setAddress] = useState(() => (isBrowserStartUrl(initialUrl) ? '' : initialUrl))
  const [pageTitle, setPageTitle] = useState(() =>
    isBrowserStartUrl(initialUrl) ? '' : tabLabelFromUrl(initialUrl),
  )
  const [faviconUrl, setFaviconUrl] = useState('')
  const [faviconFailed, setFaviconFailed] = useState(false)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const startPage = isBrowserStartUrl(loadedUrl)
  const displayedTitle = startPage ? t('browser.newTab') : pageTitle || t('browser.tabFallback')

  /**
   * Asks main to stack this tab on top with the placeholder’s DIP bounds.
   * @param urlOverride - Loaded URL when React state has not flushed yet.
   */
  const showPane = useCallback(
    (urlOverride?: string): void => {
      const el = hostRef.current
      const url = urlOverride ?? loadedUrl
      if (!el || !active || isBrowserStartUrl(url)) {
        return
      }
      const rect = el.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) {
        return
      }
      browserInvoke('show', tabId, {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      })
    },
    [active, loadedUrl, tabId],
  )

  const showPaneRef = useRef(showPane)
  showPaneRef.current = showPane

  useEffect(() => {
    let cancelled = false
    /**
     * Attaches the native pane; for OA/ERP, silent-POSTs credentials then opens main.
     */
    async function boot(): Promise<void> {
      const invoke = window.workbench?.browser?.invoke
      if (!invoke) {
        return
      }
      const isPowersource = Boolean(matchPowersourceLoginSystem(initialUrl))
      if (isBrowserStartUrl(initialUrl) && !isPowersource) {
        return
      }
      // Bootstrap blank so the login form never paints when silent login succeeds.
      await invoke('attach', tabId, isPowersource ? 'about:blank' : initialUrl)
      if (cancelled) {
        return
      }
      if (isPowersource) {
        const result = await tryPowersourceAutoLogin(tabId, initialUrl, userId)
        if (cancelled) {
          return
        }
        // No saved password / API skip: open the login page for manual sign-in.
        if (result === 'skip') {
          await invoke('loadURL', tabId, initialUrl)
        }
      }
      if (!cancelled) {
        showPaneRef.current()
      }
    }
    void boot()
    return () => {
      cancelled = true
      browserInvoke('destroy', tabId)
    }
  }, [initialUrl, tabId, userId])

  useEffect(() => {
    const unsubscribe = window.workbench?.browser?.onNav?.((state) => {
      if (state.tabId !== tabId) {
        return
      }
      const nextUrl = state.url || ''
      if (nextUrl) {
        setLoadedUrl(nextUrl)
        setAddress(isBrowserStartUrl(nextUrl) ? '' : nextUrl)
      }
      setCanGoBack(state.canGoBack)
      setCanGoForward(state.canGoForward)
      const label = isBrowserStartUrl(nextUrl)
        ? ''
        : state.title.trim() || tabLabelFromUrl(nextUrl || initialUrl)
      const nextFavicon = state.faviconUrl?.trim() ?? ''
      setPageTitle(label)
      setFaviconUrl(nextFavicon)
      setFaviconFailed(false)
      onTitleChange(isBrowserStartUrl(nextUrl) ? t('browser.newTab') : label, nextFavicon)
    })
    return () => {
      unsubscribe?.()
    }
  }, [initialUrl, onTitleChange, t, tabId])

  useEffect(() => {
    if (!active || startPage) {
      browserInvoke('hide', tabId)
      return
    }
    // Layout may still be settling after leaving size-0; retry a couple of frames.
    // Nested rAF must be cancelled on deactivate — otherwise show runs after Home hideAll
    // and WebContentsView covers the shell again.
    // Re-attach before show so a Home orphan-sweep that closed the pane can recreate it.
    let cancelled = false
    const rafIds: number[] = []
    /**
     * Ensures the native pane exists, then shows it while this effect owns the tab.
     */
    function safeShow(): void {
      if (cancelled || isBrowserStartUrl(loadedUrl)) {
        return
      }
      void window.workbench?.browser?.invoke?.('attach', tabId, loadedUrl).then(() => {
        if (!cancelled) {
          showPane()
        }
      })
    }
    safeShow()
    rafIds.push(
      window.requestAnimationFrame(() => {
        safeShow()
        rafIds.push(window.requestAnimationFrame(safeShow))
      }),
    )
    const el = hostRef.current
    if (!el) {
      return () => {
        cancelled = true
        for (const id of rafIds) {
          window.cancelAnimationFrame(id)
        }
      }
    }
    const observer = new ResizeObserver(() => {
      safeShow()
    })
    observer.observe(el)
    window.addEventListener('resize', safeShow)
    return () => {
      cancelled = true
      for (const id of rafIds) {
        window.cancelAnimationFrame(id)
      }
      observer.disconnect()
      window.removeEventListener('resize', safeShow)
    }
  }, [active, loadedUrl, showPane, startPage, tabId])

  /**
   * Navigates to the address-bar value when it is a valid http(s) URL.
   * @returns Nothing.
   */
  async function commitAddress(): Promise<void> {
    const trimmed = address.trim()
    if (!trimmed) {
      return
    }
    let next = trimmed
    if (!/^https?:\/\//i.test(next)) {
      next = `https://${next}`
    }
    if (!next.startsWith('https:') && !next.startsWith('http:')) {
      return
    }
    const invoke = window.workbench?.browser?.invoke
    if (!invoke) {
      return
    }
    await invoke('loadURL', tabId, next)
    setLoadedUrl(next)
    setAddress(next)
    showPaneRef.current(next)
  }

  return (
    <div
      className={
        active
          ? 'flex h-full min-h-0 flex-col bg-canvas'
          : 'pointer-events-none invisible absolute inset-0 size-0 overflow-hidden'
      }
      aria-hidden={!active}
    >
      <div className="relative z-10 flex shrink-0 flex-col border-b border-zinc-950/10 bg-panel/90 backdrop-blur-md dark:border-white/10 dark:bg-zinc-950/80">
        {startPage ? null : (
          <div className="flex min-w-0 items-center gap-1.5 px-3 pt-2">
            {faviconUrl && !faviconFailed ? (
              <img
                src={faviconUrl}
                alt=""
                draggable={false}
                className="size-3.5 shrink-0"
                onError={() => {
                  setFaviconFailed(true)
                }}
              />
            ) : null}
            <div className="truncate text-xs font-medium text-muted">{displayedTitle}</div>
          </div>
        )}
        <div className={`flex items-center gap-2 px-3 pb-2 ${startPage ? 'pt-2' : 'pt-1'}`}>
          <button
            type="button"
            className="grid size-8 place-items-center rounded-xl text-brand transition hover:bg-brand/10 disabled:opacity-35"
            disabled={!canGoBack}
            onClick={() => {
              browserInvoke('goBack', tabId)
            }}
            aria-label={t('browser.back')}
          >
            <ArrowLeftIcon className="size-4" />
          </button>
          <button
            type="button"
            className="grid size-8 place-items-center rounded-xl text-brand transition hover:bg-brand/10 disabled:opacity-35"
            disabled={!canGoForward}
            onClick={() => {
              browserInvoke('goForward', tabId)
            }}
            aria-label={t('browser.forward')}
          >
            <ArrowRightIcon className="size-4" />
          </button>
          <button
            type="button"
            className="grid size-8 place-items-center rounded-xl text-brand transition hover:bg-brand/10"
            disabled={startPage}
            onClick={() => {
              browserInvoke('reload', tabId)
            }}
            aria-label={t('browser.reload')}
          >
            <RefreshIcon className="size-4" />
          </button>
          <form
            className="min-w-0 flex-1"
            onSubmit={(event) => {
              event.preventDefault()
              void commitAddress()
            }}
          >
            <input
              type="text"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="w-full rounded-xl border border-zinc-950/10 bg-zinc-950/5 px-3 py-1.5 text-sm text-ink outline-none placeholder:text-muted focus:border-brand dark:border-white/10 dark:bg-white/5"
              spellCheck={false}
              placeholder={t('browser.startPlaceholder')}
              aria-label={t('browser.address')}
            />
          </form>
          <button
            type="button"
            className="grid size-8 place-items-center rounded-xl text-brand transition hover:bg-brand/10 disabled:opacity-35"
            disabled={!address.trim()}
            onClick={() => {
              void openExternalUrl(address)
            }}
            aria-label={t('browser.openExternal')}
          >
            <ExternalLinkIcon className="size-4" />
          </button>
        </div>
      </div>
      <div ref={hostRef} className="relative min-h-0 w-full flex-1 bg-canvas">
        {startPage ? (
          <div
            className="flex h-full min-h-0 flex-col items-center justify-center gap-3 px-6 text-center"
            data-testid="in-app-browser-start"
          >
            <span className="grid size-16 place-items-center rounded-full bg-zinc-950/5 text-muted dark:bg-white/10">
              <GlobeIcon className="size-8" aria-hidden />
            </span>
            <h2 className="text-lg font-extrabold tracking-tight text-ink">{t('browser.startTitle')}</h2>
            <p className="max-w-xs text-sm font-medium text-muted">{t('browser.startBody')}</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
