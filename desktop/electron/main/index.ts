import { app, session, systemPreferences } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { APP_DISPLAY_NAME } from '../shared/app-identity'
import { AUTH_DEEP_LINK_SCHEME } from '../shared/ipc'
import { setupAgentOverlay, teardownAgentOverlay } from './agent-overlay'
import { configureAppWindows } from './app-windows'
import {
  configureLoginWindow,
  createLoginWindow,
  getForegroundWindow,
  setLoginSilentStart,
  showOrCreateSessionWindow,
} from './login-window'
import { startAppUpdateScheduler } from './app-update-scheduler'
import { setupApplicationMenu } from './application-menu'
import { disposeHarnessHosts, registerHarnessIpc } from './harness'
import { destroyAllInAppBrowserPanes, setupInAppBrowser } from './in-app-browser'
import { flushPendingAuthDeepLink, handleAuthDeepLink, registerIpcHandlers } from './ipc'
import { loadMainProcessEnv } from './load-env'
import { shouldStartHidden, syncLoginItemFromStore } from './login-launch'
import { getPlatformShell } from './platform'
import { setupSpotlight, teardownSpotlight } from './spotlight'
import { registerTabTransferIpc } from './tab-transfer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const platformShell = getPlatformShell()

/**
 * Enables Chromium GPU / compositor switches before the app is ready.
 * Hardware acceleration stays on (Electron default); these flags prefer GPU paths.
 */
function enableGpuPerformanceSwitches(): void {
  app.commandLine.appendSwitch('enable-gpu-rasterization')
  app.commandLine.appendSwitch('enable-zero-copy')
  app.commandLine.appendSwitch('ignore-gpu-blocklist')
  app.commandLine.appendSwitch('enable-features', 'CanvasOopRasterization')
}

enableGpuPerformanceSwitches()
app.setName(APP_DISPLAY_NAME)

/**
 * App root (package directory).
 *
 * Built layout:
 * - dist-electron/main/index.js
 * - dist-electron/preload/index.mjs
 * - dist/index.html
 */
process.env.APP_ROOT = path.join(__dirname, '../..')
loadMainProcessEnv(process.env.APP_ROOT)

export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// Required so Google OAuth `com.workbench.electron://` returns to this process.
// If `npm run dev` exits immediately, quit the old Electron in the Dock first.
if (!app.requestSingleInstanceLock()) {
  console.error(
    '[workbench] Another PowerSource Workbench instance is already running. Quit it, then retry.',
  )
  app.quit()
  process.exit(0)
}

const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')
const harnessE2EMode = process.env.WORKBENCH_HARNESS_E2E === '1'

/**
 * Handles a deep-link URL from argv or OS open-url.
 * @param argv - Process argv or a single URL string.
 * @returns Nothing.
 */
function consumeDeepLinkFromArgv(argv: string[]): void {
  const link = argv.find((arg) => arg.startsWith(`${AUTH_DEEP_LINK_SCHEME}://`))
  if (link) {
    handleAuthDeepLink(link)
  }
}

/**
 * Shows an existing app window, or opens a new one when none remain visible
 * (dock re-activate, second app instance, tray icon click).
 * @returns Nothing.
 */
async function showOrCreateAppWindow(): Promise<void> {
  await showOrCreateSessionWindow()
}

app.whenReady().then(async () => {
  configureAppWindows({
    preload,
    indexHtml,
    devServerUrl: VITE_DEV_SERVER_URL,
    publicDir: process.env.VITE_PUBLIC!,
    harnessE2EMode,
  })
  configureLoginWindow({
    preload,
    indexHtml,
    devServerUrl: VITE_DEV_SERVER_URL,
    publicDir: process.env.VITE_PUBLIC!,
  })
  setupApplicationMenu(() => getForegroundWindow())

  // Allow renderer getUserMedia / microphone (voice), geolocation (map /
  // weather), and HTML fullscreen (OnlyOffice slideshow "Full screen" calls
  // requestFullscreen() from the Document Server iframe).
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (
      permission === 'media' ||
      permission === 'mediaKeySystem' ||
      permission === 'geolocation' ||
      permission === 'fullscreen'
    ) {
      callback(true)
      return
    }
    callback(false)
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return (
      permission === 'media' ||
      permission === 'mediaKeySystem' ||
      permission === 'geolocation' ||
      permission === 'fullscreen'
    )
  })
  if (process.platform === 'darwin') {
    void systemPreferences.askForMediaAccess('microphone')
  }

  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(AUTH_DEEP_LINK_SCHEME, process.execPath, [
        path.resolve(process.argv[1]),
      ])
    }
  } else {
    app.setAsDefaultProtocolClient(AUTH_DEEP_LINK_SCHEME)
  }
  registerIpcHandlers()
  registerHarnessIpc()
  registerTabTransferIpc()
  syncLoginItemFromStore()
  platformShell.onAppReady(process.env.VITE_PUBLIC!, () => getForegroundWindow())
  setupInAppBrowser()
  startAppUpdateScheduler(() => getForegroundWindow())
  // Register Spotlight / Agent overlay IPC before the renderer loads — App.tsx
  // calls setEnabled on mount.
  setupSpotlight({
    preload,
    viteDevServerUrl: VITE_DEV_SERVER_URL,
    indexHtml,
    getMainWindow: () => getForegroundWindow(),
  })
  setupAgentOverlay({
    preload,
    viteDevServerUrl: VITE_DEV_SERVER_URL,
    indexHtml,
  })
  const startHidden = shouldStartHidden()
  setLoginSilentStart(startHidden)
  await createLoginWindow({ show: !startHidden })
  consumeDeepLinkFromArgv(process.argv)
  flushPendingAuthDeepLink()
})

app.on('will-quit', () => {
  destroyAllInAppBrowserPanes()
  teardownSpotlight()
  teardownAgentOverlay()
  disposeHarnessHosts()
})

// macOS delivers custom-scheme URLs here; register before ready so launch-via-URL is not missed.
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleAuthDeepLink(url)
})

app.on('window-all-closed', () => {
  if (platformShell.shouldKeepAliveOnAllClosed()) {
    return
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('second-instance', (_event, argv) => {
  consumeDeepLinkFromArgv(argv)
  void showOrCreateAppWindow()
})

app.on('activate', () => {
  void showOrCreateAppWindow()
})
