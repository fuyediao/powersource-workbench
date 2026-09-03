import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { arrayMove } from '@dnd-kit/sortable'
import type { TitleBarTab, TitleBarTabId } from '@/components/layout/MacStyleTitleBar'
import {
  FEATURE_TAB_LABEL_KEY,
  isFeatureTabId,
  isFolioPageTabId,
  type FeatureTabId,
} from '@/constants/feature-tabs'
import {
  isBrowserTabId,
  tabLabelFromUrl,
} from '@/utils/settings/link-open-preference'
import { preloadCalendarFeature } from '@/utils/calendar/preload-calendar'

/**
 * Starts Calendar chunks when that tab is about to show.
 * @param tabId - Title-bar tab id.
 * @returns Nothing.
 */
function preloadIfCalendarTab(tabId: string): void {
  if (tabId === 'calendar') {
    preloadCalendarFeature()
  }
}

/** sessionStorage key so Ctrl+R keeps the active title-bar screen. */
const TITLE_TABS_SESSION_KEY = 'workbench.electron.titleTabs.v1'

/**
 * Cross-window title-bar tab payload (Chrome-style tab tear-off / merge).
 * Keep in sync with `TabTransferKind` / `TabTransferPayload` in
 * `electron/shared/ipc.ts`.
 */
export interface TabTransferPayload {
  id: string
  kind: 'settings' | 'feature' | 'browser' | 'folio'
  feature?: string
  url?: string
  pageId?: string
  title?: string
  faviconUrl?: string
}

export interface BrowserTabState {
  id: TitleBarTabId
  url: string
  title: string
  /** Page favicon from Chromium; omitted until the site reports one. */
  faviconUrl?: string
}

export interface FolioTabState {
  id: TitleBarTabId
  pageId: string
  title: string
}

interface PersistedTitleTabs {
  screen: TitleBarTabId
  openTabs: TitleBarTabId[]
  browserTabs: BrowserTabState[]
  folioTabs: FolioTabState[]
}

/**
 * Returns whether a tab id is a known closable title-bar tab.
 *
 * @param id - Candidate tab id
 * @returns True for settings / features (Home is a chrome button, not a tab)
 */
function isStaticTabId(id: string): boolean {
  return id === 'settings' || isFeatureTabId(id)
}

/**
 * Drops the legacy Home tab id from persisted strip state.
 * @param tabs - Proposed tab order.
 * @returns Order without `home`.
 */
function stripHomeTab(tabs: TitleBarTabId[]): TitleBarTabId[] {
  return tabs.filter((id) => id !== 'home')
}

/**
 * Loads title-bar tab state saved for the current session (survives reload).
 *
 * @returns Parsed state, or null when missing / invalid
 */
function loadPersistedTitleTabs(): PersistedTitleTabs | null {
  try {
    const raw = sessionStorage.getItem(TITLE_TABS_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedTitleTabs>
    if (!Array.isArray(parsed.openTabs) || typeof parsed.screen !== 'string') {
      return null
    }
    const browserTabs = Array.isArray(parsed.browserTabs)
      ? parsed.browserTabs.filter(
          (tab): tab is BrowserTabState =>
            Boolean(tab) &&
            typeof tab === 'object' &&
            typeof tab.id === 'string' &&
            isBrowserTabId(tab.id) &&
            typeof tab.url === 'string' &&
            typeof tab.title === 'string',
        ).map((tab) => ({
          ...tab,
          faviconUrl:
            typeof tab.faviconUrl === 'string' && tab.faviconUrl.trim()
              ? tab.faviconUrl
              : undefined,
        }))
      : []
    const folioTabs: FolioTabState[] = []
    const browserIds = new Set(browserTabs.map((tab) => tab.id))
    const openTabs = stripHomeTab(
      parsed.openTabs.filter(
        (id): id is TitleBarTabId =>
          typeof id === 'string' &&
          (isStaticTabId(id) || (isBrowserTabId(id) && browserIds.has(id)) || folioTabs.some((tab) => tab.id === id)),
      ),
    )
    const screen =
      parsed.screen === 'home' || openTabs.includes(parsed.screen) ? parsed.screen : 'home'
    return { screen, openTabs, browserTabs, folioTabs }
  } catch {
    return null
  }
}

/**
 * Writes title-bar tab state to sessionStorage.
 *
 * @param state - Active screen, open tabs, and browser tab metadata
 * @returns Nothing
 */
function persistTitleTabs(state: PersistedTitleTabs): void {
  try {
    sessionStorage.setItem(TITLE_TABS_SESSION_KEY, JSON.stringify(state))
  } catch {
    // Ignore quota / private-mode failures.
  }
}

/**
 * Clears persisted title-bar tabs (e.g. on sign-out).
 *
 * @returns Nothing
 */
function clearPersistedTitleTabs(): void {
  try {
    sessionStorage.removeItem(TITLE_TABS_SESSION_KEY)
  } catch {
    // ignore
  }
}

/**
 * Chrome-style Settings + feature + in-app browser title-bar tabs.
 * Home is a persistent chrome button, not an entry in the strip.
 * @param signedIn - Whether an authenticated session is active.
 * @param showHomeLauncher - False on torn-off windows (no Home chrome; last tab closes the window).
 * @returns Tab strip state and navigation helpers.
 */
export function useTitleTabs(signedIn: boolean, showHomeLauncher = true): {
  screen: TitleBarTabId
  /** Closable title-bar tab ids currently open (excludes Home). */
  openTabs: TitleBarTabId[]
  tabs: TitleBarTab[] | undefined
  browserTabs: BrowserTabState[]
  folioTabs: FolioTabState[]
  openSettings: () => void
  openFeature: (feature: FeatureTabId) => void
  openBrowserTab: (url: string) => void
  openFolioPage: (pageId: string, title?: string) => void
  setBrowserTabTitle: (tabId: TitleBarTabId, title: string, faviconUrl?: string) => void
  selectTab: (tabId: TitleBarTabId) => void
  closeTab: (tabId: TitleBarTabId) => void
  reorderTabs: (activeId: TitleBarTabId, overId: TitleBarTabId) => void
  /**
   * Tears off a closable tab into a new/merged window (Chrome-style drag).
   * Removes the tab locally only when another window accepted it.
   */
  beginTabTransfer: (
    tabId: TitleBarTabId,
    screenPoint: { x: number; y: number },
  ) => Promise<boolean>
  /**
   * Moves a closable tab into a brand-new window (context-menu "Open in new
   * window"). Never merges onto an existing caption.
   */
  openTabInNewWindow: (tabId: TitleBarTabId) => Promise<boolean>
  /**
   * Moves a closable tab into another existing app window.
   * Satellite windows close when this was their last tab.
   */
  moveTabToWindow: (tabId: TitleBarTabId, windowId: number) => Promise<boolean>
} {
  const { t } = useTranslation()
  const settingsTitle = t('settings.title')
  const browserFallback = t('browser.tabFallback')
  const folioUntitled = t('folio.untitled')
  const initial = useMemo(() => loadPersistedTitleTabs(), [])
  const [screen, setScreen] = useState<TitleBarTabId>(initial?.screen ?? 'home')
  const [openTabs, setOpenTabs] = useState<TitleBarTabId[]>(initial?.openTabs ?? [])
  const [browserTabs, setBrowserTabs] = useState<BrowserTabState[]>(
    initial?.browserTabs ?? [],
  )
  const [folioTabs, setFolioTabs] = useState<FolioTabState[]>(initial?.folioTabs ?? [])
  const wasSignedInRef = useRef(signedIn)
  const signedInRef = useRef(signedIn)
  signedInRef.current = signedIn
  const pendingTransfersRef = useRef<TabTransferPayload[]>([])
  const openTabsRef = useRef(openTabs)
  openTabsRef.current = openTabs

  useEffect(() => {
    preloadIfCalendarTab(screen)
  }, [screen])

  useEffect(() => {
    const wasSignedIn = wasSignedInRef.current
    wasSignedInRef.current = signedIn

    // Only reset when the user actually signs out — not while auth is still loading.
    if (!signedIn) {
      if (wasSignedIn) {
        clearPersistedTitleTabs()
        setScreen('home')
        setOpenTabs([])
        setBrowserTabs([])
        setFolioTabs([])
        pendingTransfersRef.current = []
      }
      return
    }

    const saved = loadPersistedTitleTabs()
    if (saved) {
      setScreen(saved.screen)
      setOpenTabs(saved.openTabs)
      setBrowserTabs(saved.browserTabs)
      setFolioTabs(saved.folioTabs)
    }
    const queued = pendingTransfersRef.current
    pendingTransfersRef.current = []
    for (const payload of queued) {
      acceptTransferredTab(payload)
    }
  }, [signedIn])

  useEffect(() => {
    if (!signedIn) return
    persistTitleTabs({ screen, openTabs, browserTabs, folioTabs })
  }, [signedIn, screen, openTabs, browserTabs, folioTabs])

  /**
   * Opens Settings as a tab (or focuses it if already open).
   * @returns Nothing.
   */
  function openSettings(): void {
    setOpenTabs((tabs) => (tabs.includes('settings') ? tabs : [...tabs, 'settings']))
    setScreen('settings')
  }

  /**
   * Opens a Workbench feature page as a closable title-bar tab.
   * @param feature - Feature id (`chat` / `messages` / `mail` / `calendar` / `map` / `admin` / `aura` / `folio` / `docs` / `sheets` / `slides`).
   * @returns Nothing.
   */
  const openFeature = useCallback((feature: FeatureTabId): void => {
    preloadIfCalendarTab(feature)
    setOpenTabs((tabs) => (tabs.includes(feature) ? tabs : [...tabs, feature]))
    setScreen(feature)
  }, [])

  /**
   * Opens an http(s) URL in a new closable in-app browser tab.
   * @param url - Absolute URL.
   * @returns Nothing.
   */
  const openBrowserTab = useCallback((url: string): void => {
    const id = `browser:${crypto.randomUUID()}` as TitleBarTabId
    setBrowserTabs((tabs) => [...tabs, { id, url, title: tabLabelFromUrl(url) }])
    setOpenTabs((tabs) => [...tabs, id])
    setScreen(id)
  }, [])

  /** Open or focus a per-page Folio title tab. */
  const openFolioPage = useCallback((pageId: string, title = ''): void => {
    const id = `folio:${pageId}` as TitleBarTabId
    setFolioTabs((tabs) => tabs.some((tab) => tab.id === id)
      ? tabs.map((tab) => tab.id === id && title ? { ...tab, title } : tab)
      : [...tabs, { id, pageId, title }])
    setOpenTabs((tabs) => tabs.includes(id) ? tabs : [...tabs, id])
    setScreen(id)
  }, [])

  /**
   * Updates the title-bar label and favicon for an in-app browser tab.
   * @param tabId - Browser tab id.
   * @param title - Document title or hostname.
   * @param faviconUrl - Page `<link rel="icon">` URL, or empty to clear.
   * @returns Nothing.
   */
  const setBrowserTabTitle = useCallback((
    tabId: TitleBarTabId,
    title: string,
    faviconUrl?: string,
  ): void => {
    const trimmed = title.trim()
    const nextFavicon = faviconUrl?.trim() ?? ''
    setBrowserTabs((tabs) => {
      const target = tabs.find((tab) => tab.id === tabId)
      if (!target) {
        return tabs
      }
      const nextTitle = trimmed || target.title
      const storedFavicon = nextFavicon || undefined
      if (target.title === nextTitle && (target.faviconUrl ?? '') === (storedFavicon ?? '')) {
        return tabs
      }
      return tabs.map((tab) =>
        tab.id === tabId ? { ...tab, title: nextTitle, faviconUrl: storedFavicon } : tab,
      )
    })
  }, [])

  /**
   * Selects a title-bar tab.
   * @param tabId - Tab to activate.
   * @returns Nothing.
   */
  function selectTab(tabId: TitleBarTabId): void {
    preloadIfCalendarTab(tabId)
    setScreen(tabId)
  }

  /**
   * Closes a closable title-bar tab (Settings, feature, or browser).
   * @param tabId - Tab to close.
   * @returns Nothing.
   */
  function closeTab(tabId: TitleBarTabId): void {
    if (tabId === 'home') {
      return
    }
    setOpenTabs((tabs) => {
      const index = tabs.indexOf(tabId)
      const next = tabs.filter((id) => id !== tabId)
      if (next.length === 0 && !showHomeLauncher) {
        setScreen('home')
        queueMicrotask(() => {
          void window.workbench?.window?.close()
        })
        return next
      }
      if (screen === tabId) {
        const fallback = next[Math.max(0, index - 1)] ?? 'home'
        setScreen(fallback)
      }
      return next
    })
    if (isBrowserTabId(tabId)) {
      setBrowserTabs((tabs) => tabs.filter((tab) => tab.id !== tabId))
    }
    if (isFolioPageTabId(tabId)) setFolioTabs((tabs) => tabs.filter((tab) => tab.id !== tabId))
  }

  /**
   * Reorders title-bar tabs by drag-and-drop.
   * @param activeId - Dragged tab id.
   * @param overId - Drop target tab id.
   * @returns Nothing.
   */
  function reorderTabs(activeId: TitleBarTabId, overId: TitleBarTabId): void {
    if (activeId === overId || activeId === 'home' || overId === 'home') {
      return
    }
    setOpenTabs((tabs) => {
      const oldIndex = tabs.indexOf(activeId)
      const newIndex = tabs.indexOf(overId)
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
        return tabs
      }
      return arrayMove(tabs, oldIndex, newIndex)
    })
  }

  /**
   * Serializes one closable tab for a cross-window transfer.
   * @param tabId - Tab to serialize.
   * @returns Payload for the main process, or null when the tab is not transferable.
   */
  function buildTransferPayload(tabId: TitleBarTabId): TabTransferPayload | null {
    if (tabId === 'settings') {
      return { id: 'settings', kind: 'settings', title: settingsTitle }
    }
    if (isFeatureTabId(tabId)) {
      return { id: tabId, kind: 'feature', feature: tabId, title: t(FEATURE_TAB_LABEL_KEY[tabId]) }
    }
    if (isBrowserTabId(tabId)) {
      const tab = browserTabs.find((browser) => browser.id === tabId)
      if (!tab) {
        return null
      }
      return {
        id: tabId,
        kind: 'browser',
        url: tab.url,
        title: tab.title || browserFallback,
        faviconUrl: tab.faviconUrl,
      }
    }
    if (isFolioPageTabId(tabId)) {
      const tab = folioTabs.find((folio) => folio.id === tabId)
      if (!tab) {
        return null
      }
      return { id: tabId, kind: 'folio', pageId: tab.pageId, title: tab.title || folioUntitled }
    }
    return null
  }

  /**
   * Inserts a tab received from another window (tear-off / merge target) and
   * focuses it. Duplicates of an already-open Settings / feature / Folio tab
   * focus the existing tab instead of opening a second copy.
   * @param payload - Serialized tab from the main process.
   * @returns Nothing.
   */
  function acceptTransferredTab(payload: TabTransferPayload): void {
    if (payload.kind === 'settings') {
      setOpenTabs((tabs) => (tabs.includes('settings') ? tabs : [...tabs, 'settings']))
      setScreen('settings')
      return
    }
    if (payload.kind === 'feature') {
      const feature = payload.feature
      if (!feature || !isFeatureTabId(feature)) {
        return
      }
      preloadIfCalendarTab(feature)
      setOpenTabs((tabs) => (tabs.includes(feature) ? tabs : [...tabs, feature]))
      setScreen(feature)
      return
    }
    const id = payload.id as TitleBarTabId
    if (payload.kind === 'browser') {
      if (!payload.url) {
        return
      }
      setBrowserTabs((tabs) =>
        tabs.some((tab) => tab.id === id)
          ? tabs
          : [
              ...tabs,
              {
                id,
                url: payload.url as string,
                title: payload.title || browserFallback,
                faviconUrl: payload.faviconUrl,
              },
            ],
      )
      setOpenTabs((tabs) => (tabs.includes(id) ? tabs : [...tabs, id]))
      setScreen(id)
      return
    }
    if (payload.kind === 'folio') {
      if (!payload.pageId) {
        return
      }
      setFolioTabs((tabs) =>
        tabs.some((tab) => tab.id === id)
          ? tabs
          : [...tabs, { id, pageId: payload.pageId as string, title: payload.title ?? folioUntitled }],
      )
      setOpenTabs((tabs) => (tabs.includes(id) ? tabs : [...tabs, id]))
      setScreen(id)
    }
  }

  const acceptTransferredTabRef = useRef(acceptTransferredTab)
  acceptTransferredTabRef.current = acceptTransferredTab

  useEffect(() => {
    const unsubscribe = window.workbench?.tabs?.onReceive((payload) => {
      if (!signedInRef.current) {
        pendingTransfersRef.current.push(payload)
        return
      }
      acceptTransferredTabRef.current(payload)
    })
    // Handshake after subscribe so a tear-off that created this window is not
    // delivered (and dropped) before the listener exists.
    void window.workbench?.tabs?.ready?.()
    return () => {
      unsubscribe?.()
      void window.workbench?.tabs?.unready?.()
    }
  }, [])

  /**
   * Serializes a tab, marks in-app browser panes as transferring, invokes the
   * main-process move, and removes the tab locally when accepted.
   * @param tabId - Tab to move.
   * @param send - Main-process transfer (drop onto a point, or force a new window).
   * @returns True when another window accepted the tab.
   */
  async function transferTabAway(
    tabId: TitleBarTabId,
    send: (payload: TabTransferPayload) => Promise<{ accepted: boolean } | undefined>,
  ): Promise<boolean> {
    if (tabId === 'home') {
      return false
    }
    const payload = buildTransferPayload(tabId)
    if (!payload) {
      return false
    }
    if (isBrowserTabId(tabId)) {
      await window.workbench?.browser?.invoke?.('markTransferring', tabId)
    }
    const result = await send(payload)
    if (!result?.accepted) {
      return false
    }
    const remaining = openTabsRef.current.filter((id) => id !== tabId).length
    closeTab(tabId)
    if (!showHomeLauncher && remaining === 0) {
      queueMicrotask(() => {
        void window.workbench?.window?.close()
      })
    }
    return true
  }

  /**
   * Tears off a closable tab: asks the main process to merge it onto another
   * app window's title bar, or spawn a brand-new window at the drop point.
   * Removes the tab locally only when accepted elsewhere — dropping back
   * inside this window's own bounds is a no-op cancel.
   * @param tabId - Tab being dragged out of the strip.
   * @param screenPoint - Screen coordinates where the drag ended.
   * @returns True when another window accepted the tab.
   */
  async function beginTabTransfer(
    tabId: TitleBarTabId,
    screenPoint: { x: number; y: number },
  ): Promise<boolean> {
    return transferTabAway(tabId, (payload) => window.workbench?.tabs?.dropTab(payload, screenPoint))
  }

  /**
   * Opens the tab in a new app window (never merges) and removes it here.
   * @param tabId - Tab to move.
   * @returns True when the new window accepted the tab.
   */
  async function openTabInNewWindow(tabId: TitleBarTabId): Promise<boolean> {
    return transferTabAway(tabId, (payload) => window.workbench?.tabs?.openInNewWindow(payload))
  }

  /**
   * Moves a tab into another existing app window (Chrome "Move tab to window").
   * @param tabId - Tab to move.
   * @param windowId - Destination `BrowserWindow.id`.
   * @returns True when the destination accepted the tab.
   */
  async function moveTabToWindow(tabId: TitleBarTabId, windowId: number): Promise<boolean> {
    return transferTabAway(tabId, (payload) =>
      window.workbench?.tabs?.moveToWindow(payload, windowId),
    )
  }

  const tabs = useMemo((): TitleBarTab[] | undefined => {
    if (!signedIn) {
      return undefined
    }
    const browserById = new Map(browserTabs.map((tab) => [tab.id, tab]))
    const folioById = new Map(folioTabs.map((tab) => [tab.id, tab]))
    return openTabs.flatMap((id): TitleBarTab[] => {
      if (id === 'home') {
        return []
      }
      if (id === 'settings') {
        return [
          {
            id: 'settings',
            label: settingsTitle,
            closable: true,
          },
        ]
      }
      if (isFeatureTabId(id)) {
        return [
          {
            id,
            label: t(FEATURE_TAB_LABEL_KEY[id]),
            closable: true,
          },
        ]
      }
      if (isBrowserTabId(id)) {
        const browser = browserById.get(id)
        return [
          {
            id,
            label: browser?.title || browserFallback,
            closable: true,
            faviconUrl: browser?.faviconUrl,
          },
        ]
      }
      if (isFolioPageTabId(id)) {
        return [{ id, label: folioById.get(id)?.title || folioUntitled, closable: true }]
      }
      return []
    })
  }, [browserFallback, browserTabs, folioTabs, folioUntitled, openTabs, settingsTitle, signedIn, t])

  useEffect(() => {
    if (!signedIn) {
      return
    }
    const active = tabs?.find((tab) => tab.id === screen)
    const label = screen === 'home' || !active ? t('nav.home') : active.label
    void window.workbench?.tabs?.setWindowLabel?.(label)
  }, [screen, signedIn, t, tabs])

  return {
    screen,
    openTabs,
    tabs,
    browserTabs,
    folioTabs,
    openSettings,
    openFeature,
    openBrowserTab,
    openFolioPage,
    setBrowserTabTitle,
    selectTab,
    closeTab,
    reorderTabs,
    beginTabTransfer,
    openTabInNewWindow,
    moveTabToWindow,
  }
}
