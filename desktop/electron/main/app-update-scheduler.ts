import { type BrowserWindow, Notification, app, powerMonitor } from 'electron'
import {
  APP_UPDATE_AVAILABLE_EVENT,
  type AppMenuLanguage,
  type AppUpdateCheckResult,
} from '../shared/ipc'
import { checkForDesktopUpdate } from './app-updates'
import { getActiveMenuLanguage } from './application-menu'

/** How often the background scheduler polls the desktop feed. */
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

/** First check runs shortly after launch, once the window has settled. */
const INITIAL_CHECK_DELAY_MS = 60_000

/** Minimum gap between two resume-triggered checks (avoids a check burst on quick sleep/wake cycles). */
const RESUME_CHECK_COOLDOWN_MS = 30 * 60 * 1000

const NOTIFICATION_TEXT: Record<AppMenuLanguage, { title: string; body: (version: string) => string }> = {
  en: {
    title: 'GeoCRM update available',
    body: (version) => `Version ${version} is ready to install. Click to open GeoCRM.`,
  },
  'zh-TW': {
    title: 'GeoCRM 有新版本',
    body: (version) => `新版本 ${version} 已可安裝，點擊開啟 GeoCRM。`,
  },
  'zh-CN': {
    title: 'GeoCRM 有新版本',
    body: (version) => `新版本 ${version} 已可安装，点击打开 GeoCRM。`,
  },
}

let timer: NodeJS.Timeout | null = null
let lastCheckAt = 0
let lastNotifiedVersion = ''

/**
 * Starts the packaged-build background update scheduler: a periodic check
 * every {@link CHECK_INTERVAL_MS}, plus an extra check on OS resume (so a
 * laptop that sleeps through several cycles still catches up promptly).
 * Forced updates (below the server `minSupportedVersion` floor) push the
 * result to the renderer so the existing blocking gate can react without a
 * restart; everything else surfaces as a native, non-blocking OS notification.
 * @param getMainWindow - Resolves the main window (may be null while hidden/closed).
 * @returns Nothing. No-op outside packaged builds.
 */
export function startAppUpdateScheduler(getMainWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) {
    return
  }
  scheduleNextCheck(getMainWindow, INITIAL_CHECK_DELAY_MS)
  powerMonitor.on('resume', () => {
    if (Date.now() - lastCheckAt < RESUME_CHECK_COOLDOWN_MS) {
      return
    }
    void runScheduledCheck(getMainWindow)
  })
}

/**
 * Arms the next timed check.
 * @param getMainWindow - Resolves the main window.
 * @param delayMs - Delay before the next run.
 * @returns Nothing.
 */
function scheduleNextCheck(getMainWindow: () => BrowserWindow | null, delayMs: number): void {
  if (timer) {
    clearTimeout(timer)
  }
  timer = setTimeout(() => {
    void runScheduledCheck(getMainWindow).finally(() => {
      scheduleNextCheck(getMainWindow, CHECK_INTERVAL_MS)
    })
  }, delayMs)
}

/**
 * Runs one update check and reacts to the result (forced push or notification).
 * @param getMainWindow - Resolves the main window.
 * @returns Nothing. Swallows check errors; the next scheduled run retries.
 */
async function runScheduledCheck(getMainWindow: () => BrowserWindow | null): Promise<void> {
  lastCheckAt = Date.now()
  let result: AppUpdateCheckResult
  try {
    result = await checkForDesktopUpdate()
  } catch {
    return
  }
  if (result.status !== 'available') {
    return
  }
  if (result.forceUpdate) {
    pushForcedUpdate(getMainWindow, result)
    return
  }
  notifyNonBlocking(getMainWindow, result)
}

/**
 * Sends a forced-update result to the renderer so the blocking gate can show
 * immediately, matching the launch-time check.
 * @param getMainWindow - Resolves the main window.
 * @param result - Forced-update check result.
 * @returns Nothing.
 */
function pushForcedUpdate(getMainWindow: () => BrowserWindow | null, result: AppUpdateCheckResult): void {
  const win = getMainWindow()
  if (!win || win.isDestroyed()) {
    return
  }
  win.webContents.send(APP_UPDATE_AVAILABLE_EVENT, result)
}

/**
 * Shows a native OS notification for a non-forced update, de-duplicated by
 * version so the same release does not re-notify every 4 hours.
 * @param getMainWindow - Resolves the main window (focused on click).
 * @param result - Available (non-forced) check result.
 * @returns Nothing.
 */
function notifyNonBlocking(getMainWindow: () => BrowserWindow | null, result: AppUpdateCheckResult): void {
  const version = result.latestVersion?.trim()
  if (!version || version === lastNotifiedVersion || !Notification.isSupported()) {
    return
  }
  lastNotifiedVersion = version
  const text = NOTIFICATION_TEXT[getActiveMenuLanguage()] ?? NOTIFICATION_TEXT.en
  const notification = new Notification({
    title: text.title,
    body: text.body(version),
    silent: false,
  })
  notification.on('click', () => {
    const win = getMainWindow()
    if (!win || win.isDestroyed()) {
      return
    }
    win.show()
    win.focus()
  })
  notification.show()
}
