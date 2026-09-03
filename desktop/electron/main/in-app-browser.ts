/**
 * In-app browser panes hosted as WebContentsView (not `<webview>`).
 *
 * Tab switching: only the active pane is attached with real bounds; inactive panes
 * are detached and zero-sized. Home / Settings call `hideAll` (remove + park).
 * Bringing a tab forward uses `removeChildView` + `addChildView` (setTopBrowserView
 * replacement). See: https://github.com/electron/electron/issues/42061
 *
 * Multi-window: each pane tracks its own `host` BrowserWindow (there is no single
 * "the main window" — every Workbench window is a full shell). `activeTabId` /
 * `lastBounds` are therefore per-host, not module-global. Chrome-style tab
 * tear-off reparents a pane's native view onto a new host instead of destroying
 * and recreating it, so the loaded page and history survive the move.
 */

import { BrowserWindow, WebContentsView, ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import {
  BROWSER_IPC_CHANNEL,
  BROWSER_NAV_EVENT,
  OPEN_URL_IN_APP_EVENT,
} from '../shared/ipc'
import {
  isPowersourceLoginUrl,
  performSilentPowersourceLogin,
} from '../shared/powersource-login'

/** Navigation snapshot pushed to the renderer toolbar. */
export type BrowserNavState = {
  tabId: string
  url: string
  title: string
  /** Page `<link rel="icon">` (or equivalent) from Chromium; empty until known. */
  faviconUrl: string
  canGoBack: boolean
  canGoForward: boolean
}

type BrowserPane = {
  tabId: string
  view: WebContentsView
  faviconUrl: string
  /** Window currently hosting this pane's native view (reparented on tab tear-off). */
  host: BrowserWindow
}

/** Per-window in-app browser state (there is no single global "active tab"). */
type WindowBrowserState = {
  activeTabId: string | null
  lastBounds: { x: number; y: number; width: number; height: number }
}

/**
 * Picks a usable favicon URL from Chromium's `page-favicon-updated` list.
 * Later entries are typically higher-resolution.
 * @param favicons - Candidate URLs from the page.
 * @returns http(s) or data URL, or empty when none are usable.
 */
function pickPageFavicon(favicons: string[]): string {
  for (let index = favicons.length - 1; index >= 0; index -= 1) {
    const url = favicons[index]
    if (
      url &&
      (url.startsWith('https:') || url.startsWith('http:') || url.startsWith('data:'))
    ) {
      return url
    }
  }
  return ''
}

const panes = new Map<string, BrowserPane>()

/** Browser tab ids mid-transfer: `destroy` from the old host must detach, not close. */
const transferringTabIds = new Set<string>()

/** Per-window `{ activeTabId, lastBounds }`, keyed by the hosting BrowserWindow. */
const windowStates = new WeakMap<BrowserWindow, WindowBrowserState>()

/**
 * Off-screen parking rectangle for inactive panes.
 * Keeps a real (non-zero) size: zero-size bounds are ignored on Windows, which left the
 * pane painted at its previous rectangle.
 */
const PARK_BOUNDS = { x: -10000, y: -10000, width: 200, height: 200 }

/**
 * Returns (creating if needed) the active-tab / bounds state for one host window.
 * @param host - Window hosting one or more browser panes.
 * @returns Mutable per-window state.
 */
function stateFor(host: BrowserWindow): WindowBrowserState {
  const existing = windowStates.get(host)
  if (existing) {
    return existing
  }
  const created: WindowBrowserState = {
    activeTabId: null,
    lastBounds: { x: 0, y: 0, width: 0, height: 0 },
  }
  windowStates.set(host, created)
  return created
}

/**
 * Whether the URL can load in the in-app browser.
 *
 * @param url - Candidate URL
 * @returns True for http(s) or a blank bootstrap page
 */
function isWebUrl(url: string): boolean {
  return url.startsWith('https:') || url.startsWith('http:') || url === 'about:blank'
}

/**
 * Normalizes Electron navigation callback payloads (string URL or `{ url }`).
 *
 * @param urlOrDetails - `will-navigate` / redirect payload
 * @returns Absolute URL string, or empty when missing
 */
function navigationUrl(urlOrDetails: unknown): string {
  if (typeof urlOrDetails === 'string') {
    return urlOrDetails
  }
  if (
    urlOrDetails &&
    typeof urlOrDetails === 'object' &&
    'url' in urlOrDetails &&
    typeof (urlOrDetails as { url: unknown }).url === 'string'
  ) {
    return (urlOrDetails as { url: string }).url
  }
  return ''
}

/**
 * Asks a host window's renderer to open a new in-app browser title-bar tab.
 *
 * @param host - Window whose renderer should open the tab
 * @param url - Absolute http(s) URL
 */
function openUrlInAppBrowserTab(host: BrowserWindow, url: string): void {
  if (!isWebUrl(url) || host.isDestroyed()) {
    return
  }
  host.webContents.send(OPEN_URL_IN_APP_EVENT, url)
}

/**
 * Pushes URL / title / favicon / history flags to the matching renderer pane.
 *
 * @param tabId - Title-bar browser tab id
 * @param contents - Pane webContents
 */
function emitNav(tabId: string, contents: WebContents): void {
  const pane = panes.get(tabId)
  const host = pane?.host
  if (!host || host.isDestroyed() || contents.isDestroyed()) {
    return
  }
  const url = contents.getURL()
  const title = contents.getTitle()?.trim() ?? ''
  const state: BrowserNavState = {
    tabId,
    url,
    title,
    faviconUrl: pane?.faviconUrl ?? '',
    canGoBack: contents.navigationHistory.canGoBack(),
    canGoForward: contents.navigationHistory.canGoForward(),
  }
  host.webContents.send(BROWSER_NAV_EVENT, state)
}

/**
 * Forwards popup navigations (including about:blank then redirect) into a new tab.
 *
 * @param contents - Pane webContents
 * @param currentHost - Pane's host at popup time (resolved fresh in case of a prior transfer)
 */
function attachPopupHandling(contents: WebContents, currentHost: () => BrowserWindow | null): void {
  contents.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url)) {
      const host = currentHost()
      if (host) {
        openUrlInAppBrowserTab(host, url)
      }
      return { action: 'deny' }
    }
    if (url !== '' && url !== 'about:blank') {
      return { action: 'deny' }
    }
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        show: false,
        width: 0,
        height: 0,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
        },
      },
    }
  })

  contents.on('did-create-window', (popupWindow) => {
    const popupContents = popupWindow.webContents
    let forwarded = false

    /**
     * Opens the first real http(s) popup URL as an in-app tab, then closes the popup.
     *
     * @param rawUrl - Candidate navigation URL
     */
    function forwardUrl(rawUrl: string): void {
      if (forwarded || !isWebUrl(rawUrl)) {
        return
      }
      const host = currentHost()
      if (!host) {
        return
      }
      forwarded = true
      openUrlInAppBrowserTab(host, rawUrl)
      if (!popupWindow.isDestroyed()) {
        popupWindow.close()
      }
    }

    popupContents.on('will-navigate', (event, urlOrDetails) => {
      const next = navigationUrl(urlOrDetails)
      if (!isWebUrl(next)) {
        return
      }
      event.preventDefault()
      forwardUrl(next)
    })
    popupContents.on('will-redirect', (event, urlOrDetails) => {
      const next = navigationUrl(urlOrDetails)
      if (!isWebUrl(next)) {
        return
      }
      event.preventDefault()
      forwardUrl(next)
    })
    popupContents.on('did-navigate', (_event, url) => {
      forwardUrl(navigationUrl(url))
    })
    popupContents.on('did-finish-load', () => {
      if (!popupContents.isDestroyed()) {
        forwardUrl(popupContents.getURL())
      }
    })
  })
}

/**
 * Whether a pane is currently a child of its host window's contentView.
 *
 * @param pane - Browser pane
 * @returns True when attached
 */
function isPaneChild(pane: BrowserPane): boolean {
  if (pane.host.isDestroyed()) {
    return false
  }
  return pane.host.contentView.children.includes(pane.view)
}

/**
 * Forces a window to repaint after a pane is detached or moved off-screen.
 * A removed WebContentsView can otherwise keep its last frame on screen until the
 * next window repaint (electron#44652).
 * @param host - Window to repaint.
 */
function repaintHost(host: BrowserWindow): void {
  if (host.isDestroyed() || host.webContents.isDestroyed()) {
    return
  }
  host.webContents.invalidate()
}

/**
 * Moves a pane off-screen and marks it hidden (used for inactive / hidden panes).
 *
 * @param pane - Browser pane
 */
function parkPane(pane: BrowserPane): void {
  try {
    pane.view.setVisible(false)
    pane.view.setBounds({ ...PARK_BOUNDS })
  } catch {
    // Destroyed.
  }
}

/**
 * Official z-order pattern: re-adding an existing child brings it to the front.
 *
 * @param pane - Browser pane
 */
function setTopPane(pane: BrowserPane): void {
  const host = pane.host
  if (host.isDestroyed()) {
    return
  }
  try {
    host.contentView.removeChildView(pane.view)
  } catch {
    // Not a child yet.
  }
  host.contentView.addChildView(pane.view)
  pane.view.setVisible(true)
}

/**
 * Reparents an existing pane onto a new host window (Chrome-style tab tear-off /
 * merge). The `WebContentsView` — and its loaded page, history, and cookies —
 * survives the move; only the native attach point changes.
 *
 * @param pane - Browser pane to move
 * @param newHost - Window that now owns the tab
 */
function reparentPane(pane: BrowserPane, newHost: BrowserWindow): void {
  const oldHost = pane.host
  if (oldHost === newHost) {
    return
  }
  try {
    if (!oldHost.isDestroyed() && oldHost.contentView.children.includes(pane.view)) {
      oldHost.contentView.removeChildView(pane.view)
    }
  } catch {
    // Already detached.
  }
  if (!oldHost.isDestroyed()) {
    const oldState = stateFor(oldHost)
    if (oldState.activeTabId === pane.tabId) {
      oldState.activeTabId = null
    }
    repaintHost(oldHost)
  }
  pane.host = newHost
  parkPane(pane)
}

/**
 * Detaches a pane from its current host without closing the underlying
 * `WebContentsView` — used when a tear-off's source-window unmount would
 * otherwise `destroy` the pane before the target window reparents it.
 *
 * @param pane - Browser pane being torn off
 */
function detachPaneKeepAlive(pane: BrowserPane): void {
  parkPane(pane)
  const host = pane.host
  if (!host.isDestroyed()) {
    try {
      host.contentView.removeChildView(pane.view)
    } catch {
      // Already detached.
    }
    const state = stateFor(host)
    if (state.activeTabId === pane.tabId) {
      state.activeTabId = null
    }
    repaintHost(host)
  }
}

/**
 * Creates (or returns) the WebContentsView pane for a browser tab.
 *
 * @param tabId - Title-bar browser tab id
 * @param initialUrl - First URL when the pane is created
 * @param host - Window that owns this pane
 * @returns Pane, or null when the URL is not loadable
 */
function ensurePane(tabId: string, initialUrl: string, host: BrowserWindow): BrowserPane | null {
  const existing = panes.get(tabId)
  if (existing) {
    return existing
  }
  if (host.isDestroyed() || !isWebUrl(initialUrl)) {
    return null
  }

  const view = new WebContentsView({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  const pane: BrowserPane = { tabId, view, faviconUrl: '', host }
  panes.set(tabId, pane)
  parkPane(pane)

  const contents = view.webContents
  attachPopupHandling(contents, () => {
    const current = panes.get(tabId)
    return current && !current.host.isDestroyed() ? current.host : null
  })
  contents.on('did-navigate', () => {
    const current = panes.get(tabId)
    if (current) {
      current.faviconUrl = ''
    }
    emitNav(tabId, contents)
  })
  contents.on('did-navigate-in-page', () => {
    emitNav(tabId, contents)
  })
  contents.on('did-finish-load', () => {
    emitNav(tabId, contents)
  })
  contents.on('page-title-updated', () => {
    emitNav(tabId, contents)
  })
  contents.on('page-favicon-updated', (_event, favicons) => {
    const current = panes.get(tabId)
    if (current) {
      current.faviconUrl = pickPageFavicon(favicons)
    }
    emitNav(tabId, contents)
  })
  contents.on('destroyed', () => {
    // React Strict Mode remounts the same tabId quickly: the old webContents
    // 'destroyed' must not delete a newer pane that reused the tab id.
    const current = panes.get(tabId)
    const cleanupHost = current?.host ?? host
    if (current && current.view === view) {
      panes.delete(tabId)
      transferringTabIds.delete(tabId)
      const state = stateFor(current.host)
      if (state.activeTabId === tabId) {
        state.activeTabId = null
      }
    }
    if (cleanupHost && !cleanupHost.isDestroyed()) {
      try {
        cleanupHost.contentView.removeChildView(view)
      } catch {
        // Already detached.
      }
    }
  })

  void contents.loadURL(initialUrl)
  return pane
}

/**
 * Shows one browser tab on top (community sample pattern).
 * All other browser panes stay attached underneath with the same bounds.
 * When Home / Settings is active (`activeTabId === null` after hideAll), only
 * an explicit show for the newly selected browser tab may reattach panes —
 * never re-stack siblings that were parked off-screen.
 *
 * @param tabId - Title-bar browser tab id
 * @param bounds - DIP bounds for the content area
 */
function showTab(
  tabId: string,
  bounds: { x: number; y: number; width: number; height: number },
  host: BrowserWindow,
): void {
  const pane = panes.get(tabId)
  if (!pane || pane.host !== host || bounds.width < 2 || bounds.height < 2) {
    return
  }
  const state = stateFor(host)
  state.activeTabId = tabId
  state.lastBounds = {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
  }

  if (host.isDestroyed()) {
    return
  }

  // Park non-active panes on this host off-screen while keeping the active one
  // on top. Panes belonging to other windows are left untouched.
  let detached = false
  for (const other of panes.values()) {
    if (other.tabId === tabId || other.host !== host) {
      continue
    }
    parkPane(other)
    if (isPaneChild(other)) {
      try {
        host.contentView.removeChildView(other.view)
        detached = true
      } catch {
        // Already detached.
      }
    }
  }

  if (!isPaneChild(pane)) {
    host.contentView.addChildView(pane.view)
  }
  setTopPane(pane)
  pane.view.setVisible(true)
  pane.view.setBounds({ ...state.lastBounds })
  if (detached) {
    repaintHost(host)
  }
}

/**
 * Removes every browser pane belonging to one window so Home / Settings can
 * paint there. Parks tracked panes, detaches them, then sweeps orphan
 * WebContentsView children left behind when a late `destroyed` event cleared
 * the pane map (Strict Mode remount). Panes hosted by other windows are untouched.
 * @param host - Window whose panes should hide.
 */
function hideAllPanes(host: BrowserWindow): void {
  stateFor(host).activeTabId = null
  const trackedViews = new Set<WebContentsView>()
  for (const pane of panes.values()) {
    if (pane.host !== host) {
      continue
    }
    trackedViews.add(pane.view)
    parkPane(pane)
    if (!host.isDestroyed()) {
      try {
        host.contentView.removeChildView(pane.view)
      } catch {
        // Already detached.
      }
    }
  }
  // Orphan sweep: views still attached after the map was cleared by a stale destroy.
  if (!host.isDestroyed()) {
    const orphans = host.contentView.children.filter(
      (child): child is WebContentsView =>
        child instanceof WebContentsView && !trackedViews.has(child),
    )
    for (const child of orphans) {
      try {
        child.setVisible(false)
        child.setBounds({ ...PARK_BOUNDS })
        host.contentView.removeChildView(child)
      } catch {
        // Destroyed mid-sweep.
      }
      try {
        if (!child.webContents.isDestroyed()) {
          child.webContents.close({ waitForBeforeUnload: false })
        }
      } catch {
        // Already closed.
      }
    }
    repaintHost(host)
  }
}

/**
 * Parks one pane without hiding every other in-app browser tab.
 * @param tabId - Title-bar browser tab id
 */
function hideTab(tabId: string): void {
  const pane = panes.get(tabId)
  if (!pane) {
    return
  }
  parkPane(pane)
  const host = pane.host
  if (!host.isDestroyed() && isPaneChild(pane)) {
    try {
      host.contentView.removeChildView(pane.view)
    } catch {
      // Already detached.
    }
  }
  const state = stateFor(host)
  if (state.activeTabId === tabId) {
    state.activeTabId = null
  }
  if (!host.isDestroyed()) {
    repaintHost(host)
  }
}

/**
 * Destroys one in-app browser pane.
 *
 * @param tabId - Title-bar browser tab id
 */
function destroyPane(tabId: string): void {
  const pane = panes.get(tabId)
  if (!pane) {
    return
  }
  panes.delete(tabId)
  transferringTabIds.delete(tabId)
  const host = pane.host
  const state = stateFor(host)
  if (state.activeTabId === tabId) {
    state.activeTabId = null
  }
  if (!host.isDestroyed()) {
    try {
      host.contentView.removeChildView(pane.view)
    } catch {
      // Already detached.
    }
  }
  const contents = pane.view.webContents
  if (!contents.isDestroyed()) {
    contents.close({ waitForBeforeUnload: false })
  }
  if (!host.isDestroyed()) {
    repaintHost(host)
  }
}

/**
 * Destroys every in-app browser pane owned by one window (that window's `closed`).
 * Panes belonging to other windows are untouched.
 * @param host - Window that just closed.
 */
export function destroyInAppBrowserPanesForWindow(host: BrowserWindow): void {
  const tabIds: string[] = []
  for (const pane of panes.values()) {
    if (pane.host === host) {
      tabIds.push(pane.tabId)
    }
  }
  for (const tabId of tabIds) {
    destroyPane(tabId)
  }
}

/**
 * Destroys every in-app browser pane in every window (app quit only).
 */
export function destroyAllInAppBrowserPanes(): void {
  const tabIds: string[] = []
  for (const tabId of panes.keys()) {
    tabIds.push(tabId)
  }
  for (const tabId of tabIds) {
    destroyPane(tabId)
  }
}

/**
 * IPC methods for renderer-driven in-app browser panes.
 */
const browserHandlers = {
  /**
   * Ensures a pane exists (creating it on this sender's window) and loads the
   * initial URL on first create. When the pane already exists on a different
   * window — a Chrome-style tab tear-off / merge just moved it here —
   * reparents the native view onto this sender's window instead.
   *
   * @param event - IPC event (sender resolves the owning window)
   * @param tabId - Title-bar browser tab id
   * @param url - Initial http(s) URL
   */
  attach: async (event: IpcMainInvokeEvent, tabId: string, url: string): Promise<void> => {
    const host = BrowserWindow.fromWebContents(event.sender)
    if (!host) {
      return
    }
    const existing = panes.get(tabId)
    if (existing) {
      if (existing.host !== host) {
        reparentPane(existing, host)
      }
      return
    }
    ensurePane(tabId, url, host)
  },

  /**
   * Shows this tab on top with the given bounds (browser ↔ browser switch).
   *
   * @param event - IPC event (sender resolves the owning window)
   * @param tabId - Title-bar browser tab id
   * @param bounds - DIP bounds
   */
  show: async (
    event: IpcMainInvokeEvent,
    tabId: string,
    bounds: { x: number; y: number; width: number; height: number },
  ): Promise<void> => {
    const host = BrowserWindow.fromWebContents(event.sender)
    if (host) {
      showTab(tabId, bounds, host)
    }
  },

  /**
   * Updates bounds for the active stacked panes (resize / layout).
   *
   * @param event - IPC event (sender resolves the owning window)
   * @param tabId - Title-bar browser tab id that is active
   * @param bounds - DIP bounds including visible flag
   */
  setBounds: async (
    event: IpcMainInvokeEvent,
    tabId: string,
    bounds: { x: number; y: number; width: number; height: number; visible: boolean },
  ): Promise<void> => {
    const host = BrowserWindow.fromWebContents(event.sender)
    if (!host) {
      return
    }
    if (!bounds.visible || bounds.width < 2 || bounds.height < 2) {
      // Ignore zero-size "show" from inactive size-0 placeholders; only hideAll clears.
      if (stateFor(host).activeTabId === tabId) {
        hideAllPanes(host)
      }
      return
    }
    showTab(tabId, bounds, host)
  },

  /**
   * Hides every pane on this sender's window when the active title-bar tab is
   * not an in-app browser.
   * @param event - IPC event (sender resolves the owning window)
   */
  hideAll: async (event: IpcMainInvokeEvent): Promise<void> => {
    const host = BrowserWindow.fromWebContents(event.sender)
    if (host) {
      hideAllPanes(host)
    }
  },

  /**
   * Navigates back in the pane history.
   *
   * @param _event - Unused (no host context needed)
   * @param tabId - Title-bar browser tab id
   */
  goBack: async (_event: IpcMainInvokeEvent, tabId: string): Promise<void> => {
    const pane = panes.get(tabId)
    if (!pane || pane.view.webContents.isDestroyed()) {
      return
    }
    if (pane.view.webContents.navigationHistory.canGoBack()) {
      pane.view.webContents.navigationHistory.goBack()
    }
  },

  /**
   * Navigates forward in the pane history.
   *
   * @param _event - Unused (no host context needed)
   * @param tabId - Title-bar browser tab id
   */
  goForward: async (_event: IpcMainInvokeEvent, tabId: string): Promise<void> => {
    const pane = panes.get(tabId)
    if (!pane || pane.view.webContents.isDestroyed()) {
      return
    }
    if (pane.view.webContents.navigationHistory.canGoForward()) {
      pane.view.webContents.navigationHistory.goForward()
    }
  },

  /**
   * Reloads the current pane URL.
   *
   * @param _event - Unused (no host context needed)
   * @param tabId - Title-bar browser tab id
   */
  reload: async (_event: IpcMainInvokeEvent, tabId: string): Promise<void> => {
    const pane = panes.get(tabId)
    if (!pane || pane.view.webContents.isDestroyed()) {
      return
    }
    pane.view.webContents.reload()
  },

  /**
   * Parks this pane so a start page or inactive placeholder can paint.
   *
   * @param _event - Unused (no host context needed)
   * @param tabId - Title-bar browser tab id
   */
  hide: async (_event: IpcMainInvokeEvent, tabId: string): Promise<void> => {
    hideTab(tabId)
  },

  /**
   * Loads an http(s) URL in an existing pane, creating the pane when needed.
   *
   * @param event - IPC event (sender resolves the owning window)
   * @param tabId - Title-bar browser tab id
   * @param url - Absolute http(s) URL
   */
  loadURL: async (event: IpcMainInvokeEvent, tabId: string, url: string): Promise<void> => {
    if (!isWebUrl(url) || url === 'about:blank') {
      return
    }
    const existing = panes.get(tabId)
    if (!existing) {
      const host = BrowserWindow.fromWebContents(event.sender)
      if (host) {
        ensurePane(tabId, url, host)
      }
      return
    }
    if (existing.view.webContents.isDestroyed()) {
      return
    }
    await existing.view.webContents.loadURL(url)
  },

  /**
   * Marks a browser tab as mid-transfer: the next `destroy` from this pane's
   * current host detaches the native view instead of closing it, so a
   * Chrome-style tab tear-off / merge can reparent the loaded page onto the
   * target window instead of losing it.
   * @param _event - Unused (no host context needed)
   * @param tabId - Title-bar browser tab id being torn off
   */
  markTransferring: async (_event: IpcMainInvokeEvent, tabId: string): Promise<void> => {
    if (panes.has(tabId)) {
      transferringTabIds.add(tabId)
    }
  },

  /**
   * Destroys the pane when the title-bar tab closes — unless it was just
   * marked as transferring, in which case the view is detached (kept alive)
   * so the target window can reparent it via `attach`.
   *
   * @param event - IPC event (sender resolves the owning window)
   * @param tabId - Title-bar browser tab id
   */
  destroy: async (event: IpcMainInvokeEvent, tabId: string): Promise<void> => {
    if (transferringTabIds.has(tabId)) {
      transferringTabIds.delete(tabId)
      const pane = panes.get(tabId)
      const callerHost = BrowserWindow.fromWebContents(event.sender)
      // Only detach if this caller's window still owns the pane — the target
      // window's `attach` may have already reparented it onto itself.
      if (pane && callerHost && pane.host === callerHost) {
        detachPaneKeepAlive(pane)
      }
      return
    }
    const host = panes.get(tabId)?.host
    destroyPane(tabId)
    if (!host || host.isDestroyed()) {
      return
    }
    const state = stateFor(host)
    if (state.activeTabId && panes.has(state.activeTabId) && state.lastBounds.width > 1) {
      showTab(state.activeTabId, state.lastBounds, host)
    } else if (![...panes.values()].some((pane) => pane.host === host)) {
      hideAllPanes(host)
    }
  },

  /**
   * Silently logs into POWERSOURCE OA or ERP, then loads the app home page
   * (`V_Main.aspx` for OA, `/Home` for ERP) so the login UI is skipped on success.
   *
   * @param _event - Unused (no host context needed)
   * @param tabId - Title-bar browser tab id
   * @param loginUrl - Absolute OA/ERP login origin URL
   * @param username - OA or ERP username (typically PS + 4 digits)
   * @param password - OA or ERP password
   * @returns `{ ok, finalUrl?, reason? }`
   */
  silentLogin: async (
    _event: IpcMainInvokeEvent,
    tabId: string,
    loginUrl: string,
    username: string,
    password: string,
  ): Promise<{ ok: boolean; finalUrl?: string; reason?: string }> => {
    const pane = panes.get(tabId)
    if (!pane || pane.view.webContents.isDestroyed()) {
      return { ok: false, reason: 'no_pane' }
    }
    if (typeof loginUrl !== 'string' || !isPowersourceLoginUrl(loginUrl)) {
      return { ok: false, reason: 'not_powersource_login' }
    }
    if (typeof username !== 'string' || typeof password !== 'string') {
      return { ok: false, reason: 'invalid_credentials' }
    }

    try {
      pane.view.webContents.stop()
    } catch {
      // Navigation may already be idle.
    }

    const result = await performSilentPowersourceLogin(
      pane.view.webContents.session,
      loginUrl,
      username,
      password,
    )
    if (result.ok) {
      await pane.view.webContents.loadURL(result.finalUrl)
      return { ok: true, finalUrl: result.finalUrl }
    }

    // Fall back to the normal login page for manual sign-in.
    await pane.view.webContents.loadURL(new URL('/', loginUrl).href)
    return { ok: false, reason: result.reason }
  },
} as const

type BrowserMethod = keyof typeof browserHandlers

/**
 * Registers in-app browser IPC. Call once before the first window loads.
 * @returns Nothing.
 */
export function setupInAppBrowser(): void {
  ipcMain.removeHandler(BROWSER_IPC_CHANNEL)
  ipcMain.handle(BROWSER_IPC_CHANNEL, async (event, method: string, ...args: unknown[]) => {
    const handler = browserHandlers[method as BrowserMethod]
    if (!handler) {
      throw new Error(`Unknown browser method: ${method}`)
    }
    return (handler as (event: IpcMainInvokeEvent, ...params: unknown[]) => Promise<unknown>)(
      event,
      ...args,
    )
  })
}
