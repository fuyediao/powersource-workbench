import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  HARNESS_EVENT,
  HARNESS_CANVAS_CONSOLE_EVENT,
  HARNESS_IPC_CHANNEL,
  HARNESS_PTY_DATA_EVENT,
  HARNESS_PTY_EXIT_EVENT,
  type HarnessApprovalDecisionWire,
  type HarnessHostStatus,
  type HarnessStartOptions,
  type HarnessStartTurnExtras,
} from '../shared/harness'
import { INSTALL_LANGUAGE_SYNC_CHANNEL } from '../shared/install-language'
import type {
  HomeLibraryAppDto,
  HomeLibraryCategoryDto,
  HomeLibrarySiteHitDto,
} from '../shared/home-library'
import type {
  HomeMarketAssetDto,
  HomeSearchHistoryItemDto,
  HomeSettingsRecord,
  HomeTodoItemDto,
  HomeWallpaperItemDto,
} from '../shared/home-settings'
import {
  CLAWD_BRIDGE_IPC_CHANNEL,
  type ClawdBridgeActivity,
} from '../shared/clawd-bridge'
import {
  APP_IPC_CHANNEL,
  ASK_AI_IPC_CHANNEL,
  APP_UPDATE_AVAILABLE_EVENT,
  APP_UPDATE_PROGRESS_EVENT,
  AUTH_IPC_CHANNEL,
  type StoredAuthSessionPayload,
  AUTH_SESSION_EVENT,
  MENU_AURA_EVENT,
  MENU_AURA_LIBRARY_EVENT,
  MENU_CHAT_EVENT,
  MENU_FILE_EVENT,
  MENU_IPC_CHANNEL,
  MENU_MAIL_EVENT,
  MENU_CLASH_EVENT,
  MENU_ORDERS_EVENT,
  MENU_CALENDAR_EVENT,
  MENU_TEAM_EVENT,
  MENU_FOLIO_EVENT,
  MENU_OFFICE_EVENT,
  MENU_NAVIGATE_EVENT,
  MENU_MAP_EVENT,
  NET_IPC_CHANNEL,
  BROWSER_IPC_CHANNEL,
  BROWSER_NAV_EVENT,
  OPEN_SETTINGS_EVENT,
  OPEN_URL_IN_APP_EVENT,
  SIGN_OUT_EVENT,
  MENU_LANGUAGE_EVENT,
  TAB_TRANSFER_IPC_CHANNEL,
  TAB_TRANSFER_RECEIVE_EVENT,
  APP_WINDOW_HIDE_HOME_ARG,
  APP_WINDOW_LOGIN_ARG,
  type TabTransferPayload,
  isAppWindowPeer,
  type AppWindowPeer,
  OFFICE_WORKSPACE_LEGACY_IPC_CHANNEL,
  HOME_APP_ORDER_IPC_CHANNEL,
  HOME_LIBRARY_IPC_CHANNEL,
  HOME_SETTINGS_IPC_CHANNEL,
  OPPORTUNITY_BOARD_LAYOUT_IPC_CHANNEL,
  OA_ERP_CREDENTIALS_IPC_CHANNEL,
  AI_MODEL_ALLOWLIST_IPC_CHANNEL,
  type AiModelAllowlistRow,
  SPOTLIGHT_IPC_CHANNEL,
  SPOTLIGHT_SHOWN_EVENT,
  AGENT_OVERLAY_IPC_CHANNEL,
  AGENT_OVERLAY_SHOWN_EVENT,
  WINDOW_FOCUS_EVENT,
  WINDOW_FULLSCREEN_EVENT,
  WINDOW_IPC_CHANNEL,
  WINDOW_MAXIMIZED_EVENT,
  type ApplicationMenuState,
  type AppUpdateCheckResult,
  type AppUpdateInstallProgress,
  type AskAiCaptureResult,
  type AuraMenuAction,
  type AuraLibraryMenuAction,
  type ChatMenuAction,
  type ClashMenuAction,
  type LoginLaunchSettings,
  type MailMenuAction,
  type OrdersMenuAction,
  type CalendarMenuAction,
  type TeamMenuAction,
  type FolioMenuAction,
  type OfficeMenuAction,
  type MenuFileAction,
  type MenuNavigateTarget,
  type AppMenuLanguage,
  type MapMenuAction,
  type LegacyOfficeWorkspaceFile,
} from '../shared/ipc'
import {
  AGENT_OVERLAY_ACCELERATOR,
  SPOTLIGHT_ACCELERATOR,
  USES_CUSTOM_TITLE_BAR,
  USES_CUSTOM_TRAFFIC_LIGHTS,
  USES_NATIVE_APPLICATION_MENU,
} from '../shared/platform'

/**
 * Invokes a main-process network proxy method.
 * @param method - Net handler name.
 * @param args - Handler arguments.
 * @returns Handler result.
 */
function netInvoke(method: string, ...args: unknown[]): Promise<unknown> {
  return ipcRenderer.invoke(NET_IPC_CHANNEL, method, ...args)
}

/**
 * Invokes a main-process window chrome method.
 * @param method - Window handler name.
 * @returns Handler result.
 */
function windowInvoke(method: string): Promise<unknown> {
  return ipcRenderer.invoke(WINDOW_IPC_CHANNEL, method)
}

/**
 * Invokes a Spotlight IPC method; soft-fails when the main handler is not ready yet.
 * @param method - Spotlight method name.
 * @param args - Method arguments.
 * @returns Handler result, or `null` when no handler is registered.
 */
function spotlightInvoke(method: string, ...args: unknown[]): Promise<unknown> {
  return ipcRenderer.invoke(SPOTLIGHT_IPC_CHANNEL, method, ...args).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('No handler registered')) {
      return null
    }
    throw error
  })
}

/**
 * Invokes an Agent overlay IPC method; soft-fails when the main handler is not ready yet.
 * @param method - Overlay method name.
 * @param args - Method arguments.
 * @returns Handler result, or `null` when no handler is registered.
 */
function agentOverlayInvoke(method: string, ...args: unknown[]): Promise<unknown> {
  return ipcRenderer.invoke(AGENT_OVERLAY_IPC_CHANNEL, method, ...args).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('No handler registered')) {
      return null
    }
    throw error
  })
}

/**
 * Typed Workbench desktop bridge for the renderer.
 */
contextBridge.exposeInMainWorld('workbench', {
  auth: {
    /**
     * Opens Google OAuth in the system browser via workbench-api.
     * @returns Nothing.
     */
    openGoogleSignIn: (): Promise<void> =>
      ipcRenderer.invoke(AUTH_IPC_CHANNEL, 'openGoogleSignIn') as Promise<void>,

    /**
     * Tells the main process whether this renderer has a Workbench session so
     * it can switch between the compact login window and the main shell.
     * @param signedIn - True when a session is active.
     * @returns Nothing.
     */
    setSignedIn: (signedIn: boolean): Promise<void> =>
      ipcRenderer.invoke(AUTH_IPC_CHANNEL, 'setSignedIn', signedIn) as Promise<void>,

    /**
     * Reads the machine-local session cache (survives login-window destroy).
     * @returns Stored tokens, or null.
     */
    getStoredSession: (): Promise<StoredAuthSessionPayload | null> =>
      ipcRenderer.invoke(AUTH_IPC_CHANNEL, 'getStoredSession') as Promise<
        StoredAuthSessionPayload | null
      >,

    /**
     * Writes the machine-local session cache before the login window is torn down.
     * @param session - Tokens to keep.
     * @returns Nothing.
     */
    setStoredSession: (session: StoredAuthSessionPayload): Promise<void> =>
      ipcRenderer.invoke(AUTH_IPC_CHANNEL, 'setStoredSession', session) as Promise<void>,

    /**
     * Clears cached tokens. Last username is kept.
     * @returns Nothing.
     */
    clearStoredSession: (): Promise<void> =>
      ipcRenderer.invoke(AUTH_IPC_CHANNEL, 'clearStoredSession') as Promise<void>,

    /**
     * Reads the last successful username for the login form.
     * @returns Username, or an empty string.
     */
    getLastUsername: (): Promise<string> =>
      ipcRenderer.invoke(AUTH_IPC_CHANNEL, 'getLastUsername') as Promise<string>,

    /**
     * Remembers the last successful username.
     * @param username - Workbench username.
     * @returns Nothing.
     */
    setLastUsername: (username: string): Promise<void> =>
      ipcRenderer.invoke(AUTH_IPC_CHANNEL, 'setLastUsername', username) as Promise<void>,

    /**
     * Subscribes to OAuth deep-link token payloads from the main process.
     * @param listener - Callback with access/refresh tokens (or error).
     * @returns Unsubscribe function.
     */
    onSession: (
      listener: (payload: {
        accessToken: string
        refreshToken: string
        expiresIn: number
        tokenType: string
        error?: string
      }) => void,
    ): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: {
          accessToken: string
          refreshToken: string
          expiresIn: number
          tokenType: string
          error?: string
        },
      ): void => {
        listener(payload)
      }
      ipcRenderer.on(AUTH_SESSION_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(AUTH_SESSION_EVENT, handler)
      }
    },
  },
  net: {
    /**
     * Calls a network proxy method in the main process.
     * @param method - Method name.
     * @param args - Arguments.
     * @returns Result.
     */
    invoke: netInvoke,
  },
  officeWorkspaceLegacy: {
    /**
     * One-shot export of every row from the retired Univer-era
     * `office-workspace.sqlite`, read once so the renderer can upload each
     * as a personal `office_files` Supabase row.
     * @returns Legacy rows, or an empty array when the database never existed.
     */
    export: (): Promise<LegacyOfficeWorkspaceFile[]> =>
      ipcRenderer.invoke(
        OFFICE_WORKSPACE_LEGACY_IPC_CHANNEL,
        'export',
      ) as Promise<LegacyOfficeWorkspaceFile[]>,
    /**
     * Deletes `office-workspace.sqlite` after a successful export.
     * @returns Nothing.
     */
    retire: (): Promise<void> =>
      ipcRenderer.invoke(OFFICE_WORKSPACE_LEGACY_IPC_CHANNEL, 'retire') as Promise<void>,
  },
  homeAppOrder: {
    /**
     * Reads the persisted Home Apps tile order for one user.
     * @param userId - Auth user id.
     * @returns Ordered feature tile ids.
     */
    get: (userId: string): Promise<string[]> =>
      ipcRenderer.invoke(HOME_APP_ORDER_IPC_CHANNEL, 'get', userId) as Promise<string[]>,
    /**
     * Writes the Home Apps tile order for one user.
     * @param userId - Auth user id.
     * @param appIds - Ordered feature tile ids.
     * @returns Nothing.
     */
    set: (userId: string, appIds: string[]): Promise<void> =>
      ipcRenderer.invoke(HOME_APP_ORDER_IPC_CHANNEL, 'set', userId, appIds) as Promise<void>,
  },
  homeLibrary: {
    /**
     * Lists Home website categories from local SQLite.
     * @returns Ordered categories.
     */
    listCategories: (): Promise<HomeLibraryCategoryDto[]> =>
      ipcRenderer.invoke(HOME_LIBRARY_IPC_CHANNEL, 'listCategories') as Promise<
        HomeLibraryCategoryDto[]
      >,
    /**
     * Lists one user's websites in a category.
     * @param userId - Auth user id.
     * @param categoryId - Category id.
     * @returns Ordered apps.
     */
    listCategoryApps: (userId: string, categoryId: string): Promise<HomeLibraryAppDto[]> =>
      ipcRenderer.invoke(
        HOME_LIBRARY_IPC_CHANNEL,
        'listCategoryApps',
        userId,
        categoryId,
      ) as Promise<HomeLibraryAppDto[]>,
    /**
     * Creates a local site and links it into the user's category.
     * @param userId - Auth user id.
     * @param categoryId - Category id.
     * @param fields - URL and display name.
     * @returns Created app.
     */
    createApp: (
      userId: string,
      categoryId: string,
      fields: { url: string; name: string },
    ): Promise<HomeLibraryAppDto> =>
      ipcRenderer.invoke(
        HOME_LIBRARY_IPC_CHANNEL,
        'createApp',
        userId,
        categoryId,
        fields,
      ) as Promise<HomeLibraryAppDto>,
    /**
     * Links an existing local site into the user's category.
     * @param userId - Auth user id.
     * @param categoryId - Category id.
     * @param siteId - Site id.
     * @returns Linked app.
     */
    linkSite: (userId: string, categoryId: string, siteId: string): Promise<HomeLibraryAppDto> =>
      ipcRenderer.invoke(
        HOME_LIBRARY_IPC_CHANNEL,
        'linkSite',
        userId,
        categoryId,
        siteId,
      ) as Promise<HomeLibraryAppDto>,
    /**
     * Saves website order for one user category.
     * @param userId - Auth user id.
     * @param categoryId - Category id.
     * @param itemIds - Ordered site ids.
     * @returns Nothing.
     */
    saveOrder: (userId: string, categoryId: string, itemIds: string[]): Promise<void> =>
      ipcRenderer.invoke(
        HOME_LIBRARY_IPC_CHANNEL,
        'saveOrder',
        userId,
        categoryId,
        itemIds,
      ) as Promise<void>,
    /**
     * Unlinks a site from the user's category.
     * @param userId - Auth user id.
     * @param categoryId - Category id.
     * @param siteId - Site id.
     * @returns Remaining apps.
     */
    removeApp: (
      userId: string,
      categoryId: string,
      siteId: string,
    ): Promise<HomeLibraryAppDto[]> =>
      ipcRenderer.invoke(
        HOME_LIBRARY_IPC_CHANNEL,
        'removeApp',
        userId,
        categoryId,
        siteId,
      ) as Promise<HomeLibraryAppDto[]>,
    /**
     * Searches the local site catalog.
     * @param userId - Auth user id.
     * @param categoryId - Category id.
     * @param query - Search text.
     * @returns Matching sites not already in the category.
     */
    searchSites: (
      userId: string,
      categoryId: string,
      query: string,
    ): Promise<HomeLibrarySiteHitDto[]> =>
      ipcRenderer.invoke(
        HOME_LIBRARY_IPC_CHANNEL,
        'searchSites',
        userId,
        categoryId,
        query,
      ) as Promise<HomeLibrarySiteHitDto[]>,
  },
  homeSettings: {
    /**
     * Loads Home / Settings appearance and widget prefs from local SQLite.
     * @param userId - Auth user id.
     * @returns Stored settings, or product defaults.
     */
    getSettings: (userId: string): Promise<HomeSettingsRecord> =>
      ipcRenderer.invoke(HOME_SETTINGS_IPC_CHANNEL, 'getSettings', userId) as Promise<
        HomeSettingsRecord
      >,
    /**
     * Merges a Home / Settings patch into local SQLite.
     * @param userId - Auth user id.
     * @param patch - Fields to overwrite.
     * @returns Stored settings after the merge.
     */
    patchSettings: (
      userId: string,
      patch: Partial<HomeSettingsRecord>,
    ): Promise<HomeSettingsRecord> =>
      ipcRenderer.invoke(
        HOME_SETTINGS_IPC_CHANNEL,
        'patchSettings',
        userId,
        patch,
      ) as Promise<HomeSettingsRecord>,
    /**
     * Lists local wallpaper files for one user.
     * @param userId - Auth user id.
     * @returns Wallpaper items with custom-protocol URLs.
     */
    listWallpapers: (userId: string): Promise<HomeWallpaperItemDto[]> =>
      ipcRenderer.invoke(HOME_SETTINGS_IPC_CHANNEL, 'listWallpapers', userId) as Promise<
        HomeWallpaperItemDto[]
      >,
    /**
     * Writes a wallpaper file and makes it active.
     * @param userId - Auth user id.
     * @param bytes - Full image bytes.
     * @param mimeType - Image MIME type.
     * @param thumbBytes - Optional thumbnail bytes.
     * @returns Created wallpaper item.
     */
    addWallpaper: (
      userId: string,
      bytes: ArrayBuffer,
      mimeType: string,
      thumbBytes: ArrayBuffer | null,
    ): Promise<HomeWallpaperItemDto> =>
      ipcRenderer.invoke(
        HOME_SETTINGS_IPC_CHANNEL,
        'addWallpaper',
        userId,
        bytes,
        mimeType,
        thumbBytes,
      ) as Promise<HomeWallpaperItemDto>,
    /**
     * Deletes one wallpaper file.
     * @param userId - Auth user id.
     * @param wallpaperId - Wallpaper row id.
     * @returns Custom-protocol URL for the new active wallpaper, or null.
     */
    removeWallpaper: (userId: string, wallpaperId: string): Promise<string | null> =>
      ipcRenderer.invoke(
        HOME_SETTINGS_IPC_CHANNEL,
        'removeWallpaper',
        userId,
        wallpaperId,
      ) as Promise<string | null>,
    /**
     * Loads local todos for one user.
     * @param userId - Auth user id.
     * @returns Todo items.
     */
    listTodos: (userId: string): Promise<HomeTodoItemDto[]> =>
      ipcRenderer.invoke(HOME_SETTINGS_IPC_CHANNEL, 'listTodos', userId) as Promise<
        HomeTodoItemDto[]
      >,
    /**
     * Creates a local todo.
     * @param userId - Auth user id.
     * @param text - Todo text.
     * @returns Created todo.
     */
    createTodo: (userId: string, text: string): Promise<HomeTodoItemDto> =>
      ipcRenderer.invoke(HOME_SETTINGS_IPC_CHANNEL, 'createTodo', userId, text) as Promise<
        HomeTodoItemDto
      >,
    /**
     * Updates whether a local todo is completed.
     * @param userId - Auth user id.
     * @param todoId - Todo id.
     * @param done - Completed flag.
     * @returns Nothing.
     */
    setTodoDone: (userId: string, todoId: string, done: boolean): Promise<void> =>
      ipcRenderer.invoke(
        HOME_SETTINGS_IPC_CHANNEL,
        'setTodoDone',
        userId,
        todoId,
        done,
      ) as Promise<void>,
    /**
     * Deletes a local todo.
     * @param userId - Auth user id.
     * @param todoId - Todo id.
     * @returns Nothing.
     */
    deleteTodo: (userId: string, todoId: string): Promise<void> =>
      ipcRenderer.invoke(HOME_SETTINGS_IPC_CHANNEL, 'deleteTodo', userId, todoId) as Promise<void>,
    /**
     * Loads the local markets-widget selection.
     * @param userId - Auth user id.
     * @returns Selected assets.
     */
    listMarketAssets: (userId: string): Promise<HomeMarketAssetDto[]> =>
      ipcRenderer.invoke(HOME_SETTINGS_IPC_CHANNEL, 'listMarketAssets', userId) as Promise<
        HomeMarketAssetDto[]
      >,
    /**
     * Replaces the local markets-widget selection.
     * @param userId - Auth user id.
     * @param assets - Selected assets.
     * @returns Stored assets.
     */
    saveMarketAssets: (
      userId: string,
      assets: HomeMarketAssetDto[],
    ): Promise<HomeMarketAssetDto[]> =>
      ipcRenderer.invoke(
        HOME_SETTINGS_IPC_CHANNEL,
        'saveMarketAssets',
        userId,
        assets,
      ) as Promise<HomeMarketAssetDto[]>,
    /**
     * Loads local Home search history.
     * @param userId - Auth user id.
     * @returns History items.
     */
    listSearchHistory: (userId: string): Promise<HomeSearchHistoryItemDto[]> =>
      ipcRenderer.invoke(HOME_SETTINGS_IPC_CHANNEL, 'listSearchHistory', userId) as Promise<
        HomeSearchHistoryItemDto[]
      >,
    /**
     * Records a Home search query locally.
     * @param userId - Auth user id.
     * @param query - Search text.
     * @param engine - Engine id.
     * @returns Updated history.
     */
    recordSearchHistory: (
      userId: string,
      query: string,
      engine: string,
    ): Promise<HomeSearchHistoryItemDto[]> =>
      ipcRenderer.invoke(
        HOME_SETTINGS_IPC_CHANNEL,
        'recordSearchHistory',
        userId,
        query,
        engine,
      ) as Promise<HomeSearchHistoryItemDto[]>,
    /**
     * Deletes one local search-history row.
     * @param userId - Auth user id.
     * @param historyId - Row id.
     * @returns Updated history.
     */
    deleteSearchHistory: (
      userId: string,
      historyId: string,
    ): Promise<HomeSearchHistoryItemDto[]> =>
      ipcRenderer.invoke(
        HOME_SETTINGS_IPC_CHANNEL,
        'deleteSearchHistory',
        userId,
        historyId,
      ) as Promise<HomeSearchHistoryItemDto[]>,
  },
  opportunityBoardLayout: {
    /**
     * Reads the persisted Opportunities board layout JSON for one user.
     * @param userId - Auth user id.
     * @returns Layout JSON, or null when unset.
     */
    get: (userId: string): Promise<string | null> =>
      ipcRenderer.invoke(OPPORTUNITY_BOARD_LAYOUT_IPC_CHANNEL, 'get', userId) as Promise<
        string | null
      >,
    /**
     * Writes the Opportunities board layout JSON for one user.
     * @param userId - Auth user id.
     * @param layoutJson - Serialized layout payload.
     * @returns Nothing.
     */
    set: (userId: string, layoutJson: string): Promise<void> =>
      ipcRenderer.invoke(
        OPPORTUNITY_BOARD_LAYOUT_IPC_CHANNEL,
        'set',
        userId,
        layoutJson,
      ) as Promise<void>,
    /**
     * Deletes the Opportunities board layout for one user.
     * @param userId - Auth user id.
     * @returns Nothing.
     */
    clear: (userId: string): Promise<void> =>
      ipcRenderer.invoke(OPPORTUNITY_BOARD_LAYOUT_IPC_CHANNEL, 'clear', userId) as Promise<void>,
  },
  oaErpCredentials: {
    /**
     * Reads local OA/ERP usernames and passwords for one user.
     * @param userId - Auth user id.
     * @returns Stored credentials, or null when unset.
     */
    get: (
      userId: string,
    ): Promise<{
      oaUsername: string
      oaPassword: string
      erpUsername: string
      erpPassword: string
    } | null> =>
      ipcRenderer.invoke(OA_ERP_CREDENTIALS_IPC_CHANNEL, 'get', userId) as Promise<{
        oaUsername: string
        oaPassword: string
        erpUsername: string
        erpPassword: string
      } | null>,
    /**
     * Writes local OA/ERP usernames and passwords for one user.
     * @param userId - Auth user id.
     * @param record - Credential fields.
     * @returns Nothing.
     */
    set: (
      userId: string,
      record: {
        oaUsername: string
        oaPassword: string
        erpUsername: string
        erpPassword: string
      },
    ): Promise<void> =>
      ipcRenderer.invoke(OA_ERP_CREDENTIALS_IPC_CHANNEL, 'set', userId, record) as Promise<void>,
  },
  aiModelAllowlist: {
    /**
     * Lists every explicit desktop model enable/disable override.
     * @returns Stored override rows (not the whole catalog).
     */
    list: (): Promise<AiModelAllowlistRow[]> =>
      ipcRenderer.invoke(AI_MODEL_ALLOWLIST_IPC_CHANNEL, 'list') as Promise<AiModelAllowlistRow[]>,
    /**
     * Reads one explicit override.
     * @param provider - Catalog provider id.
     * @param modelId - Vendor or local runtime model id.
     * @returns Stored flag, or null when the model uses the default.
     */
    get: (provider: string, modelId: string): Promise<boolean | null> =>
      ipcRenderer.invoke(AI_MODEL_ALLOWLIST_IPC_CHANNEL, 'get', provider, modelId) as Promise<
        boolean | null
      >,
    /**
     * Persists one explicit enable/disable override.
     * @param provider - Catalog provider id.
     * @param modelId - Vendor or local runtime model id.
     * @param enabled - Whether the model should appear in desktop pickers.
     * @returns Nothing.
     */
    set: (provider: string, modelId: string, enabled: boolean): Promise<void> =>
      ipcRenderer.invoke(
        AI_MODEL_ALLOWLIST_IPC_CHANNEL,
        'set',
        provider,
        modelId,
        enabled,
      ) as Promise<void>,
  },
  harness: {
    /** True only when Electron was launched by the Harness E2E suite. */
    testMode: process.argv.includes('--harness-e2e-renderer'),
    /** Reads local Harness preferences from the main-process SQLite store. */
    getDevicePreferences: (legacyValue?: unknown): Promise<import('../shared/harness').HarnessDevicePreferences> =>
      ipcRenderer.invoke(HARNESS_IPC_CHANNEL, 'getDevicePreferences', legacyValue) as Promise<import('../shared/harness').HarnessDevicePreferences>,
    /** Replaces local Harness preferences in the main-process SQLite store. */
    setDevicePreferences: (value: import('../shared/harness').HarnessDevicePreferences): Promise<import('../shared/harness').HarnessDevicePreferences> =>
      ipcRenderer.invoke(HARNESS_IPC_CHANNEL, 'setDevicePreferences', value) as Promise<import('../shared/harness').HarnessDevicePreferences>,
    /**
     * Reports whether a local Codex workflow binary is installed.
     * @returns Availability and resolved path.
     */
    status: (): Promise<HarnessHostStatus> =>
      ipcRenderer.invoke(HARNESS_IPC_CHANNEL, 'status') as Promise<HarnessHostStatus>,
    /**
     * Starts the local workflow process and opens a thread.
     * @param options - Working directory, permission profile, provider key.
     * @returns Nothing.
     */
    start: (options: HarnessStartOptions): Promise<void> =>
      ipcRenderer.invoke(HARNESS_IPC_CHANNEL, 'start', options) as Promise<void>,
    /** Returns the current host projection after a tab transfer. */
    snapshot: (): Promise<unknown[]> =>
      ipcRenderer.invoke(HARNESS_IPC_CHANNEL, 'snapshot') as Promise<unknown[]>,
    /**
     * Submits one task and starts a turn.
     * @param text - Task text.
     * @param extras - Optional wake-job id to complete after the turn.
     * @returns Nothing.
     */
    startTurn: (text: string, extras?: HarnessStartTurnExtras): Promise<void> =>
      ipcRenderer.invoke(HARNESS_IPC_CHANNEL, 'startTurn', text, extras ?? null) as Promise<void>,
    /**
     * Returns the default Documents/Harness work folder.
     * @returns Absolute path.
     */
    defaultWorkFolder: (): Promise<string> =>
      ipcRenderer.invoke(HARNESS_IPC_CHANNEL, 'defaultWorkFolder') as Promise<string>,
    /**
     * Opens a native directory picker for the Harness work folder.
     * @returns Selected path, or null when cancelled.
     */
    pickWorkFolder: (): Promise<string | null> =>
      ipcRenderer.invoke(HARNESS_IPC_CHANNEL, 'pickWorkFolder') as Promise<string | null>,
    /**
     * Opens a native picker for composer file attachments.
     * @returns Selected absolute paths.
     */
    pickFiles: (): Promise<string[]> =>
      ipcRenderer.invoke(HARNESS_IPC_CHANNEL, 'pickFiles') as Promise<string[]>,
    /**
     * Returns the absolute path for a File dropped onto the renderer.
     * @param file - OS file from a drag-and-drop payload.
     * @returns Absolute path, or an empty string when unavailable.
     */
    getPathForFile: (file: File): string => {
      try {
        return webUtils.getPathForFile(file)
      } catch {
        return ''
      }
    },
    /**
     * Opens a native picker for one composer folder attachment.
     * @returns Selected absolute path, or null when cancelled.
     */
    pickAttachmentFolder: (): Promise<string | null> =>
      ipcRenderer.invoke(HARNESS_IPC_CHANNEL, 'pickAttachmentFolder') as Promise<string | null>,
    /** Lists one level of the active Harness workspace. */
    listWorkspace: (cwd?: string | null, relativePath = ''): Promise<import('../shared/harness').HarnessWorkspaceEntry[]> =>
      ipcRenderer.invoke(HARNESS_IPC_CHANNEL, 'listWorkspace', cwd ?? null, relativePath) as Promise<import('../shared/harness').HarnessWorkspaceEntry[]>,
    /** Reads one text preview from the active Harness workspace. */
    readWorkspaceFile: (cwd: string | null | undefined, relativePath: string): Promise<import('../shared/harness').HarnessWorkspaceFile> =>
      ipcRenderer.invoke(HARNESS_IPC_CHANNEL, 'readWorkspaceFile', cwd ?? null, relativePath) as Promise<import('../shared/harness').HarnessWorkspaceFile>,
    /** Saves one editable HTML or Markdown document in the Canvas folder. */
    writeCanvasFile: (cwd: string | null | undefined, relativePath: string, content: string): Promise<import('../shared/harness').HarnessWorkspaceFile> =>
      ipcRenderer.invoke(HARNESS_IPC_CHANNEL, 'writeCanvasFile', cwd ?? null, relativePath, content) as Promise<import('../shared/harness').HarnessWorkspaceFile>,
    /** Copies live Canvas files into the conversation archive without clearing them. */
    snapshotCanvas: (cwd: string | null | undefined, historyId: string): Promise<void> =>
      ipcRenderer.invoke(HARNESS_IPC_CHANNEL, 'snapshotCanvas', cwd ?? null, historyId) as Promise<void>,
    /** Archives the current conversation Canvas and clears the live preview folder. */
    parkCanvas: (cwd: string | null | undefined, historyId?: string | null): Promise<void> =>
      ipcRenderer.invoke(HARNESS_IPC_CHANNEL, 'parkCanvas', cwd ?? null, historyId ?? null) as Promise<void>,
    /** Restores archived Canvas files for one conversation into the live folder. */
    restoreCanvas: (cwd: string | null | undefined, historyId: string): Promise<boolean> =>
      ipcRenderer.invoke(HARNESS_IPC_CHANNEL, 'restoreCanvas', cwd ?? null, historyId) as Promise<boolean>,
    /** Shows the isolated native HTML preview at renderer placeholder bounds. */
    showCanvasPreview: (bounds: { x: number; y: number; width: number; height: number }, document: string): Promise<void> =>
      ipcRenderer.invoke(HARNESS_IPC_CHANNEL, 'showCanvasPreview', bounds, document) as Promise<void>,
    /** Hides the isolated native HTML preview. */
    hideCanvasPreview: (): Promise<void> =>
      ipcRenderer.invoke(HARNESS_IPC_CHANNEL, 'hideCanvasPreview') as Promise<void>,
    /** Subscribes to console output from the isolated native HTML preview. */
    onCanvasConsole: (callback: (entry: { level: 'info' | 'warning' | 'error'; message: string }) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, entry: { level: 'info' | 'warning' | 'error'; message: string }): void => callback(entry)
      ipcRenderer.on(HARNESS_CANVAS_CONSOLE_EVENT, listener)
      return () => ipcRenderer.removeListener(HARNESS_CANVAS_CONSOLE_EVENT, listener)
    },
    /**
     * Spawns the OS login shell in a PTY for one Terminal tab.
     * @param sessionId - Tab session id.
     * @param cwd - Harness work folder.
     * @param cols - Initial columns.
     * @param rows - Initial rows.
     * @returns Nothing.
     */
    ptySpawn: (sessionId: string, cwd: string | null | undefined, cols: number, rows: number): Promise<void> =>
      ipcRenderer.invoke(HARNESS_IPC_CHANNEL, 'ptySpawn', sessionId, cwd ?? null, cols, rows) as Promise<void>,
    /**
     * Writes raw keystrokes into one Terminal PTY.
     * @param sessionId - Tab session id.
     * @param data - UTF-8 input.
     * @returns Nothing.
     */
    ptyWrite: (sessionId: string, data: string): Promise<void> =>
      ipcRenderer.invoke(HARNESS_IPC_CHANNEL, 'ptyWrite', sessionId, data) as Promise<void>,
    /**
     * Resizes one Terminal PTY to the xterm grid.
     * @param sessionId - Tab session id.
     * @param cols - Columns.
     * @param rows - Rows.
     * @returns Nothing.
     */
    ptyResize: (sessionId: string, cols: number, rows: number): Promise<void> =>
      ipcRenderer.invoke(HARNESS_IPC_CHANNEL, 'ptyResize', sessionId, cols, rows) as Promise<void>,
    /**
     * Kills one Terminal PTY.
     * @param sessionId - Tab session id.
     * @returns Nothing.
     */
    ptyDispose: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke(HARNESS_IPC_CHANNEL, 'ptyDispose', sessionId) as Promise<void>,
    /** Reads the Git working-tree snapshot for the Harness Review page. */
    readReview: (cwd?: string | null): Promise<import('../shared/harness').HarnessReviewSnapshot> =>
      ipcRenderer.invoke(HARNESS_IPC_CHANNEL, 'readReview', cwd ?? null) as Promise<import('../shared/harness').HarnessReviewSnapshot>,
    /**
     * Starts OAuth for one configured MCP server.
     * @param name - MCP config name.
     * @returns Nothing.
     */
    mcpLogin: (name: string): Promise<void> =>
      ipcRenderer.invoke(HARNESS_IPC_CHANNEL, 'mcpLogin', name) as Promise<void>,
    /** Lists connectors from the signed-in Codex app directory. */
    listConnectors: (forceRefetch = false): Promise<import('../shared/harness').HarnessAppConnector[]> =>
      ipcRenderer.invoke(HARNESS_IPC_CHANNEL, 'listConnectors', forceRefetch) as Promise<import('../shared/harness').HarnessAppConnector[]>,
    /** Opens the provider-owned connector installation flow. */
    installConnector: (connectorId: string, installUrl: string): Promise<void> =>
      ipcRenderer.invoke(HARNESS_IPC_CHANNEL, 'installConnector', connectorId, installUrl) as Promise<void>,
    /** Lists native displays and windows available to Computer Use. */
    listComputerTargets: (): Promise<import('../shared/harness').HarnessComputerTarget[]> =>
      ipcRenderer.invoke(HARNESS_IPC_CHANNEL, 'listComputerTargets') as Promise<import('../shared/harness').HarnessComputerTarget[]>,
    /**
     * Cancels the in-flight turn.
     * @returns Nothing.
     */
    interrupt: (): Promise<void> =>
      ipcRenderer.invoke(HARNESS_IPC_CHANNEL, 'interrupt') as Promise<void>,
    /**
     * Answers a pending approval request.
     * @param requestId - Approval identifier from the event.
     * @param decision - Allow once / allow for session / deny.
     * @returns Nothing.
     */
    respondToApproval: (
      requestId: string,
      decision: HarnessApprovalDecisionWire,
    ): Promise<void> =>
      ipcRenderer.invoke(
        HARNESS_IPC_CHANNEL,
        'respondToApproval',
        requestId,
        decision,
      ) as Promise<void>,
    /**
     * Terminates the workflow process for this window.
     * @returns Nothing.
     */
    dispose: (): Promise<void> =>
      ipcRenderer.invoke(HARNESS_IPC_CHANNEL, 'dispose') as Promise<void>,
    /**
     * Subscribes to workflow events (items, approvals, turn lifecycle).
     * @param listener - Receives one event payload.
     * @returns Unsubscribe function.
     */
    onEvent: (listener: (event: unknown) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown): void => {
        listener(payload)
      }
      ipcRenderer.on(HARNESS_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(HARNESS_EVENT, handler)
      }
    },
    /**
     * Subscribes to PTY output for one Terminal tab.
     * @param listener - Receives session id and UTF-8 chunk.
     * @returns Unsubscribe function.
     */
    onPtyData: (listener: (sessionId: string, data: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown): void => {
        if (!payload || typeof payload !== 'object') return
        const record = payload as Record<string, unknown>
        if (typeof record.sessionId !== 'string' || typeof record.data !== 'string') return
        listener(record.sessionId, record.data)
      }
      ipcRenderer.on(HARNESS_PTY_DATA_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(HARNESS_PTY_DATA_EVENT, handler)
      }
    },
    /**
     * Subscribes to PTY exit for one Terminal tab.
     * @param listener - Receives session id and exit code.
     * @returns Unsubscribe function.
     */
    onPtyExit: (listener: (sessionId: string, exitCode: number) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown): void => {
        if (!payload || typeof payload !== 'object') return
        const record = payload as Record<string, unknown>
        if (typeof record.sessionId !== 'string' || typeof record.exitCode !== 'number') return
        listener(record.sessionId, record.exitCode)
      }
      ipcRenderer.on(HARNESS_PTY_EXIT_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(HARNESS_PTY_EXIT_EVENT, handler)
      }
    },
  },
  clawd: {
    /**
     * Reports Ask / Ask AI lifecycle to standalone Clawd on Desk.
     * @param activity - Session event.
     * @returns Nothing.
     */
    reportActivity: (activity: ClawdBridgeActivity): Promise<void> =>
      ipcRenderer.invoke(CLAWD_BRIDGE_IPC_CHANNEL, 'reportActivity', activity) as Promise<void>,
  },
  shell: {
    /**
     * Opens an http(s), mailto, or tel URL via the OS handler.
     * @param url - Absolute URL.
     * @returns Nothing.
     */
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke('workbench:open-external', url) as Promise<void>,
  },
  askAi: {
    /**
     * Captures the main window minus the Ask AI sidebar as a JPEG.
     * @param excludeRightPx - Sidebar width in CSS pixels
     * @returns JPEG payload, or null when capture fails
     */
    captureMainContent: (excludeRightPx: number): Promise<AskAiCaptureResult | null> =>
      ipcRenderer.invoke(ASK_AI_IPC_CHANNEL, 'captureMainContent', excludeRightPx) as Promise<
        AskAiCaptureResult | null
      >,
  },
  window: {
    /** True when the renderer should paint a caption overlay (tabs / Ask AI / pin). */
    usesCustomTitleBar: USES_CUSTOM_TITLE_BAR,
    /** True when the renderer paints traffic lights (Windows). macOS uses native lights. */
    usesCustomTrafficLights: USES_CUSTOM_TRAFFIC_LIGHTS,
    /** True when Aura File / Edit / Format / View live on the macOS application menu. */
    usesNativeApplicationMenu: USES_NATIVE_APPLICATION_MENU,
    /**
     * False on windows spawned by tab tear-off / Open in new window (no Home
     * launcher; closing the last tab closes the window).
     */
    showHomeLauncher: !process.argv.includes(APP_WINDOW_HIDE_HOME_ARG),
    /** True in the compact sign-in window (no Home, tabs, Ask AI, or pin). */
    isLoginWindow: process.argv.includes(APP_WINDOW_LOGIN_ARG),
    /**
     * Minimizes the current window.
     * @returns Nothing.
     */
    minimize: (): Promise<void> => windowInvoke('minimize') as Promise<void>,
    /**
     * Toggles maximize / restore for the current window.
     * @returns Whether the window is maximized after the toggle.
     */
    maximize: (): Promise<boolean> => windowInvoke('maximize') as Promise<boolean>,
    /**
     * Closes the current window.
     * @returns Nothing.
     */
    close: (): Promise<void> => windowInvoke('close') as Promise<void>,
    /**
     * Reads whether the current window is maximized.
     * @returns Maximized state.
     */
    isMaximized: (): Promise<boolean> => windowInvoke('isMaximized') as Promise<boolean>,
    /**
     * Reads whether the current window is focused.
     * @returns Focused state.
     */
    isFocused: (): Promise<boolean> => windowInvoke('isFocused') as Promise<boolean>,
    /**
     * Reads whether the current window is in native fullscreen.
     * @returns Fullscreen state.
     */
    isFullScreen: (): Promise<boolean> => windowInvoke('isFullScreen') as Promise<boolean>,
    /**
     * Reads whether the current window is always on top.
     * @returns Always-on-top state.
     */
    isAlwaysOnTop: (): Promise<boolean> => windowInvoke('isAlwaysOnTop') as Promise<boolean>,
    /**
     * Toggles always-on-top for the current window.
     * @returns Whether the window is always on top after the toggle.
     */
    toggleAlwaysOnTop: (): Promise<boolean> =>
      windowInvoke('toggleAlwaysOnTop') as Promise<boolean>,
    /**
     * Subscribes to maximize / unmaximize.
     * @param listener - Callback with maximized flag.
     * @returns Unsubscribe function.
     */
    onMaximizedChange: (listener: (maximized: boolean) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, maximized: boolean): void => {
        listener(maximized)
      }
      ipcRenderer.on(WINDOW_MAXIMIZED_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(WINDOW_MAXIMIZED_EVENT, handler)
      }
    },
    /**
     * Subscribes to window focus / blur.
     * @param listener - Callback with focused flag.
     * @returns Unsubscribe function.
     */
    onFocusChange: (listener: (focused: boolean) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, focused: boolean): void => {
        listener(focused)
      }
      ipcRenderer.on(WINDOW_FOCUS_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(WINDOW_FOCUS_EVENT, handler)
      }
    },
    /**
     * Subscribes to native fullscreen enter / leave.
     * @param listener - Callback with fullscreen flag.
     * @returns Unsubscribe function.
     */
    onFullScreenChange: (listener: (fullScreen: boolean) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, fullScreen: boolean): void => {
        listener(fullScreen)
      }
      ipcRenderer.on(WINDOW_FULLSCREEN_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(WINDOW_FULLSCREEN_EVENT, handler)
      }
    },
    /**
     * Subscribes when the tray (or main process) asks to open Settings.
     * @param listener - Callback.
     * @returns Unsubscribe function.
     */
    onOpenSettings: (listener: (section?: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, section?: unknown): void => {
        listener(typeof section === 'string' ? section : undefined)
      }
      ipcRenderer.on(OPEN_SETTINGS_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(OPEN_SETTINGS_EVENT, handler)
      }
    },
    /**
     * Subscribes when the tray (or app menu) asks to sign out.
     * @param listener - Callback.
     * @returns Unsubscribe function.
     */
    onSignOut: (listener: () => void): (() => void) => {
      const handler = (): void => {
        listener()
      }
      ipcRenderer.on(SIGN_OUT_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(SIGN_OUT_EVENT, handler)
      }
    },
  },
  menu: {
    /**
     * Updates native application-menu checkmarks, labels, and File enablement.
     * @param state - Current screen and translated labels.
     * @returns Nothing.
     */
    setState: (state: ApplicationMenuState): Promise<void> =>
      ipcRenderer.invoke(MENU_IPC_CHANNEL, 'setState', state) as Promise<void>,
    /**
     * Subscribes when Go / View asks to open a page.
     * @param listener - Callback with the navigation target.
     * @returns Unsubscribe function.
     */
    onNavigate: (listener: (target: MenuNavigateTarget) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, target: MenuNavigateTarget): void => {
        listener(target)
      }
      ipcRenderer.on(MENU_NAVIGATE_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(MENU_NAVIGATE_EVENT, handler)
      }
    },
    /**
     * Subscribes when Workbench → Language is chosen (including while signed out).
     * @param listener - Callback with the selected locale.
     * @returns Unsubscribe function.
     */
    onLanguage: (listener: (language: AppMenuLanguage) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, language: AppMenuLanguage): void => {
        listener(language)
      }
      ipcRenderer.on(MENU_LANGUAGE_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(MENU_LANGUAGE_EVENT, handler)
      }
    },
    /**
     * Subscribes when File → Open / Save / Close Tab is chosen.
     * @param listener - Callback with the file action.
     * @returns Unsubscribe function.
     */
    onFileAction: (listener: (action: MenuFileAction) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, action: MenuFileAction): void => {
        listener(action)
      }
      ipcRenderer.on(MENU_FILE_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(MENU_FILE_EVENT, handler)
      }
    },
    /**
     * Subscribes when Aura File / Edit / Format / View is chosen on macOS.
     * @param listener - Callback with the Aura action id.
     * @returns Unsubscribe function.
     */
    onAuraAction: (listener: (action: AuraMenuAction) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, action: AuraMenuAction): void => {
        listener(action)
      }
      ipcRenderer.on(MENU_AURA_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(MENU_AURA_EVENT, handler)
      }
    },
    /**
     * Subscribes when an Aura Scope / Groups / Library command is chosen on macOS.
     * @param listener - Callback with the Aura library action.
     * @returns Unsubscribe function.
     */
    onAuraLibraryAction: (listener: (action: AuraLibraryMenuAction) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, action: AuraLibraryMenuAction): void => {
        listener(action)
      }
      ipcRenderer.on(MENU_AURA_LIBRARY_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(MENU_AURA_LIBRARY_EVENT, handler)
      }
    },
    /**
     * Subscribes when a Map page command is chosen on macOS.
     * @param listener - Callback with the Map action.
     * @returns Unsubscribe function.
     */
    onMapAction: (listener: (action: MapMenuAction) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, action: MapMenuAction): void => {
        listener(action)
      }
      ipcRenderer.on(MENU_MAP_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(MENU_MAP_EVENT, handler)
      }
    },
    /**
     * Subscribes when a Mail page command is chosen on macOS.
     * @param listener - Callback with the Mail action.
     * @returns Unsubscribe function.
     */
    onMailAction: (listener: (action: MailMenuAction) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, action: MailMenuAction): void => {
        listener(action)
      }
      ipcRenderer.on(MENU_MAIL_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(MENU_MAIL_EVENT, handler)
      }
    },
    /**
     * Subscribes when a Folio page command is chosen on macOS.
     * @param listener - Callback with the Folio action.
     * @returns Unsubscribe function.
     */
    onFolioAction: (listener: (action: FolioMenuAction) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, action: FolioMenuAction): void => {
        listener(action)
      }
      ipcRenderer.on(MENU_FOLIO_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(MENU_FOLIO_EVENT, handler)
      }
    },
    /**
     * Subscribes when an Office page command is chosen on macOS.
     * @param listener - Callback with the Office action.
     * @returns Unsubscribe function.
     */
    onOfficeAction: (listener: (action: OfficeMenuAction) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, action: OfficeMenuAction): void => {
        listener(action)
      }
      ipcRenderer.on(MENU_OFFICE_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(MENU_OFFICE_EVENT, handler)
      }
    },
    /**
     * Subscribes when a Chat page command is chosen on macOS.
     * @param listener - Callback with the Chat action.
     * @returns Unsubscribe function.
     */
    onChatAction: (listener: (action: ChatMenuAction) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, action: ChatMenuAction): void => {
        listener(action)
      }
      ipcRenderer.on(MENU_CHAT_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(MENU_CHAT_EVENT, handler)
      }
    },
    /**
     * Subscribes when a Clash page command is chosen on macOS.
     * @param listener - Callback with the Clash action.
     * @returns Unsubscribe function.
     */
    onClashAction: (listener: (action: ClashMenuAction) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, action: ClashMenuAction): void => {
        listener(action)
      }
      ipcRenderer.on(MENU_CLASH_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(MENU_CLASH_EVENT, handler)
      }
    },
    /**
     * Subscribes when an Orders page command is chosen on macOS.
     * @param listener - Callback with the Orders action.
     * @returns Unsubscribe function.
     */
    onOrdersAction: (listener: (action: OrdersMenuAction) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, action: OrdersMenuAction): void => {
        listener(action)
      }
      ipcRenderer.on(MENU_ORDERS_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(MENU_ORDERS_EVENT, handler)
      }
    },
    /**
     * Subscribes when a Calendar page command is chosen on macOS.
     * @param listener - Callback with the Calendar action.
     * @returns Unsubscribe function.
     */
    onCalendarAction: (listener: (action: CalendarMenuAction) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, action: CalendarMenuAction): void => {
        listener(action)
      }
      ipcRenderer.on(MENU_CALENDAR_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(MENU_CALENDAR_EVENT, handler)
      }
    },
    /**
     * Subscribes when a Team page command is chosen on macOS.
     * @param listener - Callback with the Team action.
     * @returns Unsubscribe function.
     */
    onTeamAction: (listener: (action: TeamMenuAction) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, action: TeamMenuAction): void => {
        listener(action)
      }
      ipcRenderer.on(MENU_TEAM_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(MENU_TEAM_EVENT, handler)
      }
    },
  },
  spotlight: {
    /**
     * Toggles the Spotlight BrowserWindow.
     * @returns Nothing.
     */
    toggle: (): Promise<void> => spotlightInvoke('toggle') as Promise<void>,
    /**
     * Hides the Spotlight BrowserWindow.
     * @returns Nothing.
     */
    hide: (): Promise<void> => spotlightInvoke('hide') as Promise<void>,
    /**
     * Arms the global Spotlight shortcut after sign-in (disarmed on the login screen).
     * @param enabled - True when a session is active.
     * @returns Nothing.
     */
    setEnabled: (enabled: boolean): Promise<void> =>
      spotlightInvoke('setEnabled', enabled) as Promise<void>,
    /** Platform Spotlight chord (`Control+Shift+Space` on macOS, `Alt+Space` elsewhere). */
    accelerator: SPOTLIGHT_ACCELERATOR,
    /**
     * Whether the main process owns the Spotlight shortcut (renderer must not also toggle).
     * @returns True when the global shortcut is registered.
     */
    usesGlobalShortcut: (): Promise<boolean> =>
      spotlightInvoke('usesGlobalShortcut') as Promise<boolean>,
    /**
     * Resizes the Spotlight window to the given content height.
     * @param height - Content height in CSS pixels.
     * @returns Nothing.
     */
    resize: (height: number): Promise<void> =>
      spotlightInvoke('resize', height) as Promise<void>,
    /**
     * Asks the main window to open a URL (in-app tab or `workbench://` page).
     * @param url - Absolute http(s) or `workbench://` URL.
     * @returns Nothing.
     */
    openInMain: (url: string): Promise<void> =>
      spotlightInvoke('openInMain', url) as Promise<void>,
    /**
     * Subscribes when Spotlight is shown (focus the search input).
     * @param listener - Callback.
     * @returns Unsubscribe function.
     */
    onShown: (listener: () => void): (() => void) => {
      const handler = (): void => {
        listener()
      }
      ipcRenderer.on(SPOTLIGHT_SHOWN_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(SPOTLIGHT_SHOWN_EVENT, handler)
      }
    },
    /**
     * Subscribes the main window to in-app URL open requests from Spotlight.
     * @param listener - Callback with the URL.
     * @returns Unsubscribe function.
     */
    onOpenInApp: (listener: (url: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, url: string): void => {
        listener(url)
      }
      ipcRenderer.on(OPEN_URL_IN_APP_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(OPEN_URL_IN_APP_EVENT, handler)
      }
    },
  },
  agentOverlay: {
    /**
     * Toggles the always-on-top Agent overlay.
     * @returns Nothing.
     */
    toggle: (): Promise<void> => agentOverlayInvoke('toggle') as Promise<void>,
    /**
     * Hides the Agent overlay.
     * @returns Nothing.
     */
    hide: (): Promise<void> => agentOverlayInvoke('hide') as Promise<void>,
    /**
     * Arms the overlay shortcut after sign-in (disarmed on the login screen).
     * @param enabled - True when a session is active.
     * @returns Nothing.
     */
    setEnabled: (enabled: boolean): Promise<void> =>
      agentOverlayInvoke('setEnabled', enabled) as Promise<void>,
    /** Platform overlay chord (`Control+G` on macOS, `Alt+G` elsewhere). */
    accelerator: AGENT_OVERLAY_ACCELERATOR,
    /**
     * Whether the main process owns the overlay shortcut (renderer must not also toggle).
     * @returns True when the global shortcut is registered.
     */
    usesGlobalShortcut: (): Promise<boolean> =>
      agentOverlayInvoke('usesGlobalShortcut') as Promise<boolean>,
    /**
     * Subscribes when the Agent overlay is shown (focus the composer).
     * @param listener - Callback.
     * @returns Unsubscribe function.
     */
    onShown: (listener: () => void): (() => void) => {
      const handler = (): void => {
        listener()
      }
      ipcRenderer.on(AGENT_OVERLAY_SHOWN_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(AGENT_OVERLAY_SHOWN_EVENT, handler)
      }
    },
  },
  browser: {
    /**
     * Calls an in-app browser WebContentsView method in the main process.
     * @param method - Method name.
     * @param args - Arguments.
     * @returns Result.
     */
    invoke: (method: string, ...args: unknown[]): Promise<unknown> =>
      ipcRenderer.invoke(BROWSER_IPC_CHANNEL, method, ...args),
    /**
     * Subscribes to pane URL / title / favicon / history updates.
     * @param listener - Callback with navigation state.
     * @returns Unsubscribe function.
     */
    onNav: (
      listener: (state: {
        tabId: string
        url: string
        title: string
        faviconUrl: string
        canGoBack: boolean
        canGoForward: boolean
      }) => void,
    ): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        state: {
          tabId: string
          url: string
          title: string
          faviconUrl: string
          canGoBack: boolean
          canGoForward: boolean
        },
      ): void => {
        listener(state)
      }
      ipcRenderer.on(BROWSER_NAV_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(BROWSER_NAV_EVENT, handler)
      }
    },
  },
  app: {
    /**
     * Reads the Settings language chosen in the Windows installer, if any.
     * Sync so i18n can apply it before the first render.
     * @returns Locale code, or null when unset (dev / non-Windows / already in Settings).
     */
    getInstallLanguage: (): string | null => {
      try {
        const value: unknown = ipcRenderer.sendSync(INSTALL_LANGUAGE_SYNC_CHANNEL)
        return typeof value === 'string' ? value : null
      } catch {
        return null
      }
    },
    /**
     * Reads the desktop app version from Electron.
     * @returns Semver string from package.json / build metadata.
     */
    getVersion: (): Promise<string> =>
      ipcRenderer.invoke(APP_IPC_CHANNEL, 'getVersion') as Promise<string>,
    /**
     * Whether this process is a packaged desktop build.
     * @returns True for installed builds; false for `npm run dev`.
     */
    isPackaged: (): Promise<boolean> =>
      ipcRenderer.invoke(APP_IPC_CHANNEL, 'isPackaged') as Promise<boolean>,
    /**
     * Checks the hosted desktop feed for a newer installer.
     * @returns Update-check result.
     */
    checkForUpdates: (): Promise<AppUpdateCheckResult> =>
      ipcRenderer.invoke(APP_IPC_CHANNEL, 'checkForUpdates') as Promise<AppUpdateCheckResult>,
    /**
     * Downloads the hosted installer and applies it, then relaunches or quits.
     * @param downloadUrl - Manifest download URL.
     * @param fileName - Suggested installer file name.
     * @returns Nothing.
     */
    installUpdate: (downloadUrl: string, fileName?: string): Promise<void> =>
      ipcRenderer.invoke(APP_IPC_CHANNEL, 'installUpdate', downloadUrl, fileName ?? '') as Promise<void>,
    /**
     * Subscribes to in-app installer download / install progress.
     * @param listener - Progress callback.
     * @returns Unsubscribe function.
     */
    onInstallProgress: (listener: (progress: AppUpdateInstallProgress) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: AppUpdateInstallProgress): void => {
        listener(progress)
      }
      ipcRenderer.on(APP_UPDATE_PROGRESS_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(APP_UPDATE_PROGRESS_EVENT, handler)
      }
    },
    /**
     * Subscribes to background update-scheduler results (periodic + resume
     * checks). Forced results should trigger the same blocking gate as the
     * launch-time check; non-forced results are already surfaced via a
     * native OS notification and do not require renderer handling.
     * @param listener - Check-result callback.
     * @returns Unsubscribe function.
     */
    onUpdateAvailable: (listener: (result: AppUpdateCheckResult) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, result: AppUpdateCheckResult): void => {
        listener(result)
      }
      ipcRenderer.on(APP_UPDATE_AVAILABLE_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(APP_UPDATE_AVAILABLE_EVENT, handler)
      }
    },
    /**
     * Quits the desktop app (used after opening a required installer download).
     * @returns Nothing.
     */
    quit: (): Promise<void> =>
      ipcRenderer.invoke(APP_IPC_CHANNEL, 'quit') as Promise<void>,
    /**
     * Reads open-at-login / silent-launch preferences.
     * @returns Current settings.
     */
    getLoginLaunchSettings: (): Promise<LoginLaunchSettings> =>
      ipcRenderer.invoke(APP_IPC_CHANNEL, 'getLoginLaunchSettings') as Promise<LoginLaunchSettings>,
    /**
     * Updates open-at-login / silent-launch preferences.
     * @param patch - Fields to change.
     * @returns Effective settings after write.
     */
    setLoginLaunchSettings: (patch: Partial<LoginLaunchSettings>): Promise<LoginLaunchSettings> =>
      ipcRenderer.invoke(
        APP_IPC_CHANNEL,
        'setLoginLaunchSettings',
        patch,
      ) as Promise<LoginLaunchSettings>,
    /**
     * Sets the Dock / taskbar unread badge.
     * @param count - Unread count (0 clears the badge).
     * @returns Applied count.
     */
    setBadgeCount: (count: number): Promise<number> =>
      ipcRenderer.invoke(APP_IPC_CHANNEL, 'setBadgeCount', count) as Promise<number>,
  },
  tabs: {
    /**
     * Drops a torn-off title-bar tab at a screen point: merges onto another
     * app window's caption, or spawns a new app window when the point misses
     * every window.
     * @param payload - Serialized tab.
     * @param point - Screen point where the drag ended.
     * @returns Whether the tab was accepted elsewhere.
     */
    dropTab: (
      payload: TabTransferPayload,
      point: { x: number; y: number },
    ): Promise<{ accepted: boolean }> =>
      ipcRenderer.invoke(TAB_TRANSFER_IPC_CHANNEL, 'dropTab', payload, point) as Promise<{
        accepted: boolean
      }>,
    /**
     * Moves a title-bar tab into a brand-new app window (never merges).
     * @param payload - Serialized tab.
     * @returns Whether the new window accepted the tab.
     */
    openInNewWindow: (payload: TabTransferPayload): Promise<{ accepted: boolean }> =>
      ipcRenderer.invoke(TAB_TRANSFER_IPC_CHANNEL, 'openInNewWindow', payload) as Promise<{
        accepted: boolean
      }>,
    /**
     * Moves a title-bar tab into an existing peer window.
     * @param payload - Serialized tab.
     * @param windowId - Destination `BrowserWindow.id`.
     * @returns Whether the destination accepted the tab.
     */
    moveToWindow: (
      payload: TabTransferPayload,
      windowId: number,
    ): Promise<{ accepted: boolean }> =>
      ipcRenderer.invoke(TAB_TRANSFER_IPC_CHANNEL, 'moveToWindow', payload, windowId) as Promise<{
        accepted: boolean
      }>,
    /**
     * Lists other live app windows (empty when this is the only one).
     * @returns Peer window ids and titles.
     */
    listPeerWindows: async (): Promise<AppWindowPeer[]> => {
      const list: unknown = await ipcRenderer.invoke(TAB_TRANSFER_IPC_CHANNEL, 'listPeerWindows')
      return Array.isArray(list) ? list.filter(isAppWindowPeer) : []
    },
    /**
     * Reports this window's active tab (or Home) label for the Move-to submenu.
     * @param label - Display title.
     * @returns Nothing.
     */
    setWindowLabel: (label: string): Promise<void> =>
      ipcRenderer.invoke(TAB_TRANSFER_IPC_CHANNEL, 'setWindowLabel', label) as Promise<void>,
    /**
     * Tells main this renderer is listening for {@link TAB_TRANSFER_RECEIVE_EVENT}.
     * Call after `onReceive` is subscribed; tear-off into a brand-new window
     * queues the tab until this handshake, otherwise the send is dropped.
     * @returns Nothing.
     */
    ready: (): Promise<void> =>
      ipcRenderer.invoke(TAB_TRANSFER_IPC_CHANNEL, 'ready') as Promise<void>,
    /**
     * Drops the ready flag (effect cleanup / React Strict Mode remount).
     * @returns Nothing.
     */
    unready: (): Promise<void> =>
      ipcRenderer.invoke(TAB_TRANSFER_IPC_CHANNEL, 'unready') as Promise<void>,
    /**
     * Subscribes to tabs transferred into this window (tear-off / merge target).
     * @param listener - Callback with the serialized tab.
     * @returns Unsubscribe function.
     */
    onReceive: (listener: (payload: TabTransferPayload) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: TabTransferPayload): void => {
        listener(payload)
      }
      ipcRenderer.on(TAB_TRANSFER_RECEIVE_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(TAB_TRANSFER_RECEIVE_EVENT, handler)
      }
    },
  },
})
