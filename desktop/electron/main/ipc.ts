import { BrowserWindow, app, ipcMain, shell, type IpcMainEvent } from 'electron'
import { reportClawdState } from './clawd-bridge'
import { CLAWD_BRIDGE_IPC_CHANNEL } from '../shared/clawd-bridge'
import {
  APP_IPC_CHANNEL,
  ASK_AI_IPC_CHANNEL,
  AUTH_DEEP_LINK_HOST,
  AUTH_DEEP_LINK_SCHEME,
  AUTH_IPC_CHANNEL,
  AUTH_SESSION_EVENT,
  MENU_IPC_CHANNEL,
  NET_IPC_CHANNEL,
  OFFICE_WORKSPACE_LEGACY_IPC_CHANNEL,
  HOME_APP_ORDER_IPC_CHANNEL,
  HOME_LIBRARY_IPC_CHANNEL,
  HOME_SETTINGS_IPC_CHANNEL,
  OPPORTUNITY_BOARD_LAYOUT_IPC_CHANNEL,
  OA_ERP_CREDENTIALS_IPC_CHANNEL,
  AI_MODEL_ALLOWLIST_IPC_CHANNEL,
  WINDOW_IPC_CHANNEL,
  type ApplicationMenuState,
} from '../shared/ipc'
import { INSTALL_LANGUAGE_SYNC_CHANNEL } from '../shared/install-language'
import { updateApplicationMenuState } from './application-menu'
import { openGoogleSignIn } from './auth/open-google'
import { parseAuthDeepLinkTokens } from './auth/parse-deep-link'
import { captureAskAiMainContent } from './ask-ai-capture'
import {
  getLoginLaunchSettings,
  setLoginLaunchSettings,
  type LoginLaunchSettings,
} from './login-launch'
import { fetchSuggestions } from './net/suggest'
import { fetchMarketQuotes, searchMarketAssets } from './net/markets'
import { fetchNewsBriefing } from './net/news'
import { fetchCurrencyCatalog, fetchCurrencyConvert } from './net/currency'
import { fetchPlaceName, fetchWeather, searchPlaces } from './net/weather'
import {
  exportLegacyOfficeWorkspaceFiles,
  retireLegacyOfficeWorkspace,
} from './office-workspace-legacy-export'
import {
  clearStoredAuthSession,
  getLastUsername,
  getStoredAuthSession,
  setLastUsername,
  setStoredAuthSession,
} from './auth-session-store'
import { getHomeAppOrder, setHomeAppOrder } from './home-app-order'
import {
  createHomeLibraryApp,
  linkHomeLibrarySite,
  listHomeLibraryCategories,
  listHomeLibraryCategoryApps,
  removeHomeLibraryApp,
  saveHomeLibraryCategoryOrder,
  searchHomeLibrarySites,
} from './home-library'
import {
  addHomeWallpaper,
  createHomeTodo,
  deleteHomeSearchHistory,
  deleteHomeTodo,
  getHomeSettings,
  listHomeMarketAssets,
  listHomeSearchHistory,
  listHomeTodos,
  listHomeWallpapers,
  patchHomeSettings,
  recordHomeSearchHistory,
  removeHomeWallpaper,
  saveHomeMarketAssets,
  setHomeTodoDone,
} from './home-settings'
import type { HomeMarketAssetDto, HomeSettingsRecord } from '../shared/home-settings'
import {
  clearOpportunityBoardLayout,
  getOpportunityBoardLayout,
  setOpportunityBoardLayout,
} from './opportunity-board-layout'
import {
  getOaErpCredentials,
  setOaErpCredentials,
  type OaErpCredentialsRecord,
} from './oa-erp-credentials'
import {
  getAiModelAllowlistOverride,
  listAiModelAllowlist,
  setAiModelAllowlistOverride,
} from './ai-model-allowlist'
import { checkForDesktopUpdate } from './app-updates'
import { installDesktopUpdate } from './app-update-install'
import { isAuxiliaryWindow } from './auxiliary-windows'
import { applyRendererSignedIn } from './login-window'
import { readInstallLanguage } from './install-language'

const netHandlers = {
  /**
   * Loads search suggestions for an engine.
   * @param engine - Search engine id.
   * @param query - Search text.
   * @returns Suggestion strings.
   */
  fetchSuggestions: async (engine: 'Google' | 'Bing' | 'Yahoo', query: string) =>
    fetchSuggestions(engine, query),

  /**
   * Loads live market quotes.
   * @param assets - Selected assets.
   * @returns Quotes.
   */
  fetchMarketQuotes: async (
    assets: Array<{ id: string; symbol: string; name: string; kind: 'crypto' | 'stock' }>,
  ) => fetchMarketQuotes(assets),

  /**
   * Searches market assets.
   * @param query - Search text.
   * @returns Hits.
   */
  searchMarketAssets: async (query: string) => searchMarketAssets(query),

  /**
   * Loads news briefing items.
   * @returns Feed items.
   */
  fetchNewsBriefing: async () => fetchNewsBriefing(1),

  /**
   * Loads current weather for a coordinate.
   * @param latitude - Degrees north.
   * @param longitude - Degrees east.
   * @returns Current conditions.
   */
  fetchWeather: async (latitude: number, longitude: number) => fetchWeather(latitude, longitude),

  /**
   * Reverse-geocodes a coordinate.
   * @param latitude - Degrees north.
   * @param longitude - Degrees east.
   * @param language - App UI language.
   * @returns Place label, or null.
   */
  fetchPlaceName: async (latitude: number, longitude: number, language: string) =>
    fetchPlaceName(latitude, longitude, language),

  /**
   * Searches cities and places.
   * @param query - Free-text place name.
   * @param language - App UI language.
   * @returns Matching places.
   */
  searchPlaces: async (query: string, language: string) => searchPlaces(query, language),

  /**
   * Loads the fiat and crypto FX catalog.
   * @returns Catalog entries.
   */
  fetchCurrencyCatalog: async () => fetchCurrencyCatalog(),

  /**
   * Converts an amount between two currencies.
   * @param amount - Source amount.
   * @param from - Source currency code.
   * @param to - Target currency code.
   * @returns Conversion result.
   */
  fetchCurrencyConvert: async (amount: number, from: string, to: string) =>
    fetchCurrencyConvert(amount, from, to),
} as const

/**
 * Resolves the BrowserWindow that sent an IPC event.
 * @param event - IPC event.
 * @returns Window or null.
 */
function windowFromEvent(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

/**
 * Validates a non-empty string received over IPC.
 * @param value - Candidate string.
 * @param label - Field label used in errors.
 * @returns Trimmed string.
 */
function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} is required.`)
  }
  return value.trim()
}

/**
 * Validates a list of non-empty strings received over IPC.
 * @param value - Candidate array.
 * @param label - Field label used in errors.
 * @returns Trimmed string values.
 */
function requiredStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`)
  }
  return value.map((item) => requiredString(item, label))
}

/**
 * Reads an ArrayBuffer (or view) received over IPC.
 * @param value - Candidate bytes.
 * @param label - Field label used in errors.
 * @returns Copy as Uint8Array.
 */
function requiredBytes(value: unknown, label: string): Uint8Array {
  if (value instanceof Uint8Array) {
    return value
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value)
  }
  throw new Error(`${label} is required.`)
}

/**
 * Reads optional thumbnail bytes received over IPC.
 * @param value - Candidate bytes, or null.
 * @returns Copy as Uint8Array, or null.
 */
function optionalBytes(value: unknown): Uint8Array | null {
  if (value == null) {
    return null
  }
  return requiredBytes(value, 'Wallpaper thumbnail')
}

/**
 * Picks known Home settings fields from an IPC payload.
 * @param value - Partial settings object.
 * @returns Typed patch.
 */
function parseHomeSettingsPatch(value: unknown): Partial<HomeSettingsRecord> {
  if (!value || typeof value !== 'object') {
    throw new Error('Home settings payload is required.')
  }
  const raw = value as Record<string, unknown>
  const patch: Partial<HomeSettingsRecord> = {}
  const stringKeys: (keyof HomeSettingsRecord)[] = [
    'searchEngine',
    'appearanceTheme',
    'accentHue',
    'clockAccentHue',
    'currencyFrom',
    'currencyTo',
    'weatherPlace',
    'weatherSource',
    'backgroundPath',
  ]
  for (const key of stringKeys) {
    if (typeof raw[key] === 'string' || raw[key] === null) {
      ;(patch as Record<string, unknown>)[key] = raw[key]
    }
  }
  const numberKeys: (keyof HomeSettingsRecord)[] = [
    'panelOpacity',
    'searchPanelOpacity',
    'backgroundOpacity',
    'accentShade',
    'clockAccentShade',
    'iconRadius',
    'searchRadius',
    'wallpaperRotateSeconds',
    'weatherLatitude',
    'weatherLongitude',
  ]
  for (const key of numberKeys) {
    if (typeof raw[key] === 'number' || raw[key] === null) {
      ;(patch as Record<string, unknown>)[key] = raw[key]
    }
  }
  const boolKeys: (keyof HomeSettingsRecord)[] = [
    'wallpaperRotateEnabled',
    'showWeather',
    'showMarkets',
    'showNews',
    'showTodo',
    'showCurrency',
    'showSchedule',
    'showMail',
    'showFocus',
    'showApps',
    'peekApps',
  ]
  for (const key of boolKeys) {
    if (typeof raw[key] === 'boolean') {
      ;(patch as Record<string, unknown>)[key] = raw[key]
    }
  }
  const arrayKeys: (keyof HomeSettingsRecord)[] = [
    'asideWidgetOrderLeft',
    'asideWidgetOrderRight',
    'asideWidgetOrder',
  ]
  for (const key of arrayKeys) {
    if (Array.isArray(raw[key])) {
      ;(patch as Record<string, unknown>)[key] = raw[key]
    }
  }
  return patch
}

/**
 * Parses a market-asset list from IPC.
 * @param value - Candidate array.
 * @returns Sanitized assets.
 */
function parseMarketAssets(value: unknown): HomeMarketAssetDto[] {
  if (!Array.isArray(value)) {
    throw new Error('Market assets must be an array.')
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return []
    }
    const record = item as Record<string, unknown>
    if (
      typeof record.id !== 'string'
      || typeof record.symbol !== 'string'
      || typeof record.name !== 'string'
      || (record.kind !== 'crypto' && record.kind !== 'stock')
    ) {
      return []
    }
    return [
      {
        id: record.id,
        symbol: record.symbol,
        name: record.name,
        kind: record.kind,
      },
    ]
  })
}

/** Deep link received before any BrowserWindow existed. */
let pendingAuthDeepLink: string | null = null

/**
 * Forwards OAuth tokens from a deep link to all renderer windows.
 * Queues the URL when the main window is not ready yet (macOS open-url).
 * @param rawUrl - Deep-link URL.
 * @returns Nothing.
 */
export function handleAuthDeepLink(rawUrl: string): void {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return
  }
  if (url.protocol !== `${AUTH_DEEP_LINK_SCHEME}:` || url.hostname !== AUTH_DEEP_LINK_HOST) {
    return
  }

  const tokens = parseAuthDeepLinkTokens(rawUrl)
  if (!tokens) {
    return
  }

  const windows = BrowserWindow.getAllWindows().filter(
    (win) => !win.isDestroyed() && !isAuxiliaryWindow(win),
  )
  if (windows.length === 0) {
    pendingAuthDeepLink = rawUrl
    return
  }

  pendingAuthDeepLink = null
  for (const win of windows) {
    win.webContents.send(AUTH_SESSION_EVENT, tokens)
    if (win.isMinimized()) {
      win.restore()
    }
    win.show()
    win.focus()
  }
}

/**
 * Delivers a deep link that arrived before the main window was created.
 * @returns Nothing.
 */
export function flushPendingAuthDeepLink(): void {
  if (!pendingAuthDeepLink) {
    return
  }
  const queued = pendingAuthDeepLink
  pendingAuthDeepLink = null
  handleAuthDeepLink(queued)
}

/**
 * Replies with the Windows installer Settings language (sync; used at i18n init).
 * @param event - IPC event whose `returnValue` is set.
 * @returns Nothing.
 */
function replyInstallLanguage(event: IpcMainEvent): void {
  event.returnValue = readInstallLanguage()
}

/**
 * Registers IPC handlers for auth and start-page network proxies.
 * @returns Nothing.
 */
export function registerIpcHandlers(): void {
  ipcMain.on(INSTALL_LANGUAGE_SYNC_CHANNEL, replyInstallLanguage)

  ipcMain.handle(AUTH_IPC_CHANNEL, async (_event, method: string, ...args: unknown[]) => {
    if (method === 'openGoogleSignIn') {
      await openGoogleSignIn()
      return
    }
    if (method === 'setSignedIn') {
      await applyRendererSignedIn(args[0] === true)
      return
    }
    if (method === 'getStoredSession') {
      return getStoredAuthSession()
    }
    if (method === 'setStoredSession') {
      const payload = args[0]
      if (!payload || typeof payload !== 'object') {
        throw new Error('Auth session payload is required.')
      }
      const record = payload as {
        accessToken?: unknown
        expiresAt?: unknown
        refreshToken?: unknown
      }
      setStoredAuthSession({
        accessToken: requiredString(record.accessToken, 'Auth access token'),
        refreshToken: requiredString(record.refreshToken, 'Auth refresh token'),
        expiresAt: typeof record.expiresAt === 'number' ? record.expiresAt : 0,
      })
      return
    }
    if (method === 'clearStoredSession') {
      clearStoredAuthSession()
      return
    }
    if (method === 'getLastUsername') {
      return getLastUsername()
    }
    if (method === 'setLastUsername') {
      setLastUsername(requiredString(args[0], 'Auth username'))
      return
    }
    throw new Error(`Unknown auth method: ${method}`)
  })

  ipcMain.handle(NET_IPC_CHANNEL, async (_event, method: string, ...args: unknown[]) => {
    const handler = netHandlers[method as keyof typeof netHandlers]
    if (!handler) {
      throw new Error(`Unknown net method: ${method}`)
    }
    return (handler as (...params: unknown[]) => Promise<unknown>)(...args)
  })

  ipcMain.handle(
    OFFICE_WORKSPACE_LEGACY_IPC_CHANNEL,
    async (_event, method: string): Promise<unknown> => {
      if (method === 'export') {
        return exportLegacyOfficeWorkspaceFiles()
      }
      if (method === 'retire') {
        retireLegacyOfficeWorkspace()
        return null
      }
      throw new Error(`Unknown legacy office workspace method: ${method}`)
    },
  )

  ipcMain.handle(
    HOME_APP_ORDER_IPC_CHANNEL,
    async (_event, method: string, ...args: unknown[]): Promise<unknown> => {
      if (method === 'get') {
        return getHomeAppOrder(requiredString(args[0], 'Home app order user id'))
      }
      if (method === 'set') {
        setHomeAppOrder(
          requiredString(args[0], 'Home app order user id'),
          requiredStringArray(args[1], 'Home app id'),
        )
        return null
      }
      throw new Error(`Unknown home app order method: ${method}`)
    },
  )

  ipcMain.handle(
    HOME_LIBRARY_IPC_CHANNEL,
    async (_event, method: string, ...args: unknown[]): Promise<unknown> => {
      if (method === 'listCategories') {
        return listHomeLibraryCategories()
      }
      if (method === 'listCategoryApps') {
        return listHomeLibraryCategoryApps(
          requiredString(args[0], 'Home library user id'),
          requiredString(args[1], 'Home library category id'),
        )
      }
      if (method === 'createApp') {
        const fields = args[2]
        if (!fields || typeof fields !== 'object') {
          throw new Error('Home library app fields are required.')
        }
        const record = fields as { url?: unknown; name?: unknown }
        return createHomeLibraryApp(
          requiredString(args[0], 'Home library user id'),
          requiredString(args[1], 'Home library category id'),
          {
            url: requiredString(record.url, 'Home library url'),
            name: requiredString(record.name, 'Home library name'),
          },
        )
      }
      if (method === 'linkSite') {
        return linkHomeLibrarySite(
          requiredString(args[0], 'Home library user id'),
          requiredString(args[1], 'Home library category id'),
          requiredString(args[2], 'Home library site id'),
        )
      }
      if (method === 'saveOrder') {
        saveHomeLibraryCategoryOrder(
          requiredString(args[0], 'Home library user id'),
          requiredString(args[1], 'Home library category id'),
          requiredStringArray(args[2], 'Home library site id'),
        )
        return null
      }
      if (method === 'removeApp') {
        return removeHomeLibraryApp(
          requiredString(args[0], 'Home library user id'),
          requiredString(args[1], 'Home library category id'),
          requiredString(args[2], 'Home library site id'),
        )
      }
      if (method === 'searchSites') {
        if (typeof args[2] !== 'string') {
          throw new Error('Home library search is required.')
        }
        return searchHomeLibrarySites(
          requiredString(args[0], 'Home library user id'),
          requiredString(args[1], 'Home library category id'),
          args[2],
        )
      }
      throw new Error(`Unknown home library method: ${method}`)
    },
  )

  ipcMain.handle(
    HOME_SETTINGS_IPC_CHANNEL,
    async (_event, method: string, ...args: unknown[]): Promise<unknown> => {
      if (method === 'getSettings') {
        return getHomeSettings(requiredString(args[0], 'Home settings user id'))
      }
      if (method === 'patchSettings') {
        return patchHomeSettings(
          requiredString(args[0], 'Home settings user id'),
          parseHomeSettingsPatch(args[1]),
        )
      }
      if (method === 'listWallpapers') {
        return listHomeWallpapers(requiredString(args[0], 'Home settings user id'))
      }
      if (method === 'addWallpaper') {
        return addHomeWallpaper(
          requiredString(args[0], 'Home settings user id'),
          requiredBytes(args[1], 'Wallpaper bytes'),
          requiredString(args[2], 'Wallpaper MIME type'),
          optionalBytes(args[3]),
        )
      }
      if (method === 'removeWallpaper') {
        return removeHomeWallpaper(
          requiredString(args[0], 'Home settings user id'),
          requiredString(args[1], 'Wallpaper id'),
        )
      }
      if (method === 'listTodos') {
        return listHomeTodos(requiredString(args[0], 'Home settings user id'))
      }
      if (method === 'createTodo') {
        return createHomeTodo(
          requiredString(args[0], 'Home settings user id'),
          requiredString(args[1], 'Todo text'),
        )
      }
      if (method === 'setTodoDone') {
        setHomeTodoDone(
          requiredString(args[0], 'Home settings user id'),
          requiredString(args[1], 'Todo id'),
          args[2] === true,
        )
        return null
      }
      if (method === 'deleteTodo') {
        deleteHomeTodo(
          requiredString(args[0], 'Home settings user id'),
          requiredString(args[1], 'Todo id'),
        )
        return null
      }
      if (method === 'listMarketAssets') {
        return listHomeMarketAssets(requiredString(args[0], 'Home settings user id'))
      }
      if (method === 'saveMarketAssets') {
        return saveHomeMarketAssets(
          requiredString(args[0], 'Home settings user id'),
          parseMarketAssets(args[1]),
        )
      }
      if (method === 'listSearchHistory') {
        return listHomeSearchHistory(requiredString(args[0], 'Home settings user id'))
      }
      if (method === 'recordSearchHistory') {
        return recordHomeSearchHistory(
          requiredString(args[0], 'Home settings user id'),
          requiredString(args[1], 'Search query'),
          requiredString(args[2], 'Search engine'),
        )
      }
      if (method === 'deleteSearchHistory') {
        return deleteHomeSearchHistory(
          requiredString(args[0], 'Home settings user id'),
          requiredString(args[1], 'Search history id'),
        )
      }
      throw new Error(`Unknown home settings method: ${method}`)
    },
  )

  ipcMain.handle(
    OPPORTUNITY_BOARD_LAYOUT_IPC_CHANNEL,
    async (_event, method: string, ...args: unknown[]): Promise<unknown> => {
      if (method === 'get') {
        return getOpportunityBoardLayout(
          requiredString(args[0], 'Opportunity board layout user id'),
        )
      }
      if (method === 'set') {
        setOpportunityBoardLayout(
          requiredString(args[0], 'Opportunity board layout user id'),
          requiredString(args[1], 'Opportunity board layout JSON'),
        )
        return null
      }
      if (method === 'clear') {
        clearOpportunityBoardLayout(
          requiredString(args[0], 'Opportunity board layout user id'),
        )
        return null
      }
      throw new Error(`Unknown opportunity board layout method: ${method}`)
    },
  )

  ipcMain.handle(
    OA_ERP_CREDENTIALS_IPC_CHANNEL,
    async (_event, method: string, ...args: unknown[]): Promise<unknown> => {
      if (method === 'get') {
        return getOaErpCredentials(requiredString(args[0], 'OA/ERP credentials user id'))
      }
      if (method === 'set') {
        const userId = requiredString(args[0], 'OA/ERP credentials user id')
        const payload = args[1]
        if (!payload || typeof payload !== 'object') {
          throw new Error('OA/ERP credentials payload is invalid.')
        }
        const record = payload as Record<string, unknown>
        const next: OaErpCredentialsRecord = {
          oaUsername: typeof record.oaUsername === 'string' ? record.oaUsername : '',
          oaPassword: typeof record.oaPassword === 'string' ? record.oaPassword : '',
          erpUsername: typeof record.erpUsername === 'string' ? record.erpUsername : '',
          erpPassword: typeof record.erpPassword === 'string' ? record.erpPassword : '',
        }
        setOaErpCredentials(userId, next)
        return null
      }
      throw new Error(`Unknown OA/ERP credentials method: ${method}`)
    },
  )

  ipcMain.handle(
    AI_MODEL_ALLOWLIST_IPC_CHANNEL,
    async (_event, method: string, ...args: unknown[]): Promise<unknown> => {
      if (method === 'list') {
        return listAiModelAllowlist()
      }
      if (method === 'get') {
        return getAiModelAllowlistOverride(
          requiredString(args[0], 'AI model allowlist provider'),
          requiredString(args[1], 'AI model allowlist model id'),
        )
      }
      if (method === 'set') {
        setAiModelAllowlistOverride(
          requiredString(args[0], 'AI model allowlist provider'),
          requiredString(args[1], 'AI model allowlist model id'),
          Boolean(args[2]),
        )
        return null
      }
      throw new Error(`Unknown AI model allowlist method: ${method}`)
    },
  )

  ipcMain.handle(WINDOW_IPC_CHANNEL, async (event, method: string) => {
    const win = windowFromEvent(event)
    if (!win) {
      return null
    }
    switch (method) {
      case 'minimize':
        win.minimize()
        return null
      case 'maximize':
        if (win.isMaximized()) {
          win.unmaximize()
        } else {
          win.maximize()
        }
        return win.isMaximized()
      case 'close':
        win.close()
        return null
      case 'isMaximized':
        return win.isMaximized()
      case 'isFocused':
        return win.isFocused()
      case 'isFullScreen':
        return win.isFullScreen()
      case 'isAlwaysOnTop':
        return win.isAlwaysOnTop()
      case 'toggleAlwaysOnTop': {
        const next = !win.isAlwaysOnTop()
        win.setAlwaysOnTop(next)
        return next
      }
      default:
        throw new Error(`Unknown window method: ${method}`)
    }
  })

  ipcMain.handle(ASK_AI_IPC_CHANNEL, async (event, method: string, ...args: unknown[]) => {
    if (method !== 'captureMainContent') {
      throw new Error(`Unknown Ask AI method: ${method}`)
    }
    const win = windowFromEvent(event)
    if (!win) {
      return null
    }
    const excludeRightPx = typeof args[0] === 'number' && Number.isFinite(args[0]) ? args[0] : 0
    return captureAskAiMainContent(win, excludeRightPx)
  })

  ipcMain.handle(
    APP_IPC_CHANNEL,
    async (_event, method: string, ...args: unknown[]): Promise<unknown> => {
      if (method === 'getVersion') {
        return app.getVersion()
      }
      if (method === 'isPackaged') {
        return app.isPackaged
      }
      if (method === 'checkForUpdates') {
        return checkForDesktopUpdate()
      }
      if (method === 'installUpdate') {
        const downloadUrl = typeof args[0] === 'string' ? args[0] : ''
        const fileName = typeof args[1] === 'string' ? args[1] : ''
        await installDesktopUpdate(_event.sender, downloadUrl, fileName)
        return true
      }
      if (method === 'quit') {
        app.quit()
        return true
      }
      if (method === 'getLoginLaunchSettings') {
        return getLoginLaunchSettings()
      }
      if (method === 'setLoginLaunchSettings') {
        const patch = (args[0] ?? {}) as Partial<LoginLaunchSettings>
        return setLoginLaunchSettings(patch)
      }
      if (method === 'setBadgeCount') {
        const raw = args[0]
        const count = typeof raw === 'number' ? raw : Number(raw)
        const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
        app.setBadgeCount(n)
        if (process.platform === 'darwin') {
          app.dock?.setBadge(n > 0 ? String(n) : '')
        }
        return n
      }
      throw new Error(`Unknown app method: ${method}`)
    },
  )

  ipcMain.handle('workbench:open-external', async (_event, url: string) => {
    if (typeof url !== 'string') {
      throw new Error('URL must be a string.')
    }
    const allowed =
      url.startsWith('https:')
      || url.startsWith('http:')
      || url.startsWith('mailto:')
      || url.startsWith('tel:')
    if (!allowed) {
      throw new Error('Only http(s), mailto, and tel URLs can be opened externally.')
    }
    await shell.openExternal(url)
  })

  ipcMain.handle(MENU_IPC_CHANNEL, async (_event, method: string, ...args: unknown[]) => {
    if (method === 'setState') {
      const next = (args[0] ?? {}) as ApplicationMenuState
      updateApplicationMenuState(next)
      return null
    }
    throw new Error(`Unknown menu method: ${method}`)
  })

  ipcMain.handle(
    CLAWD_BRIDGE_IPC_CHANNEL,
    async (_event, method: string, ...args: unknown[]): Promise<null> => {
      if (method === 'reportActivity') {
        const raw = args[0]
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
          return null
        }
        const record = raw as Record<string, unknown>
        const sessionId = typeof record.sessionId === 'string' ? record.sessionId : ''
        const event = typeof record.event === 'string' ? record.event : ''
        const state = typeof record.state === 'string' ? record.state : ''
        reportClawdState({
          sessionId,
          event,
          state,
          cwd: typeof record.cwd === 'string' ? record.cwd : undefined,
          toolName: typeof record.toolName === 'string' ? record.toolName : undefined,
        })
        return null
      }
      throw new Error(`Unknown Clawd bridge method: ${method}`)
    },
  )
}
