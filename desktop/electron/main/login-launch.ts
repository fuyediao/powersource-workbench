import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/** Argv flag registered with the OS login item for silent (tray-only) starts. */
export const HIDDEN_LAUNCH_ARG = '--workbench-hidden'

export interface LoginLaunchSettings {
  openAtLogin: boolean
  silentLaunch: boolean
}

const DEFAULTS: LoginLaunchSettings = {
  openAtLogin: false,
  silentLaunch: false,
}

/**
 * Resolves the on-disk preferences path under Electron userData.
 * @returns Absolute JSON path.
 */
function storePath(): string {
  return path.join(app.getPath('userData'), 'login-launch.json')
}

/**
 * Reads persisted launch preferences, or null when missing/invalid.
 * @returns Stored settings or null.
 */
function readStore(): LoginLaunchSettings | null {
  try {
    const raw = fs.readFileSync(storePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<LoginLaunchSettings>
    if (typeof parsed.openAtLogin !== 'boolean') {
      return null
    }
    return {
      openAtLogin: parsed.openAtLogin,
      silentLaunch: parsed.openAtLogin && Boolean(parsed.silentLaunch),
    }
  } catch {
    return null
  }
}

/**
 * Writes launch preferences to disk.
 * @param settings - Values to persist.
 * @returns Nothing.
 */
function writeStore(settings: LoginLaunchSettings): void {
  fs.writeFileSync(storePath(), `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
}

/**
 * Extra argv for login-item relaunch (`--workbench-hidden`, plus the main entry in dev).
 * @param silent - Whether silent launch is requested.
 * @returns Argument list (may be empty).
 */
function extraLoginArgs(silent: boolean): string[] {
  const args: string[] = []
  if (!app.isPackaged) {
    const entry = process.argv[1]
    if (entry && !entry.startsWith('-')) {
      args.push(path.resolve(entry))
    }
  }
  if (silent) {
    args.push(HIDDEN_LAUNCH_ARG)
  }
  return args
}

/**
 * Applies OS login-item registration from app preferences.
 * Packaged macOS omits `path` (SMAppService / Login Items). Windows and Electron
 * dev pass `process.execPath` plus argv so silent launch can use `--workbench-hidden`.
 * @param settings - Desired open-at-login / silent flags.
 * @returns Nothing.
 */
function applyLoginItem(settings: LoginLaunchSettings): void {
  const silent = settings.openAtLogin && settings.silentLaunch
  const args = extraLoginArgs(silent)

  if (process.platform === 'darwin' && app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: settings.openAtLogin,
      openAsHidden: silent,
      ...(args.length > 0 ? { args } : {}),
    })
    return
  }

  app.setLoginItemSettings({
    openAtLogin: settings.openAtLogin,
    openAsHidden: silent,
    path: process.execPath,
    args,
  })
}

/**
 * Re-applies the stored login item to the OS (keeps System Settings in sync).
 * @returns Nothing.
 */
export function syncLoginItemFromStore(): void {
  const stored = readStore()
  if (stored) {
    applyLoginItem(stored)
  }
}

/**
 * Loads current launch-at-login preferences (file, else OS fallback).
 * @returns Current settings.
 */
export function getLoginLaunchSettings(): LoginLaunchSettings {
  const stored = readStore()
  if (stored) {
    return stored
  }
  try {
    const os =
      process.platform === 'darwin' && app.isPackaged
        ? app.getLoginItemSettings()
        : app.getLoginItemSettings({ path: process.execPath, args: extraLoginArgs(false) })
    return {
      openAtLogin: Boolean(os.openAtLogin),
      silentLaunch: Boolean(os.openAsHidden),
    }
  } catch {
    return { ...DEFAULTS }
  }
}

/**
 * Updates launch-at-login preferences and syncs the OS login item.
 * Silent launch is forced off when open-at-login is off.
 * @param next - Partial update from the renderer.
 * @returns Effective settings after write.
 */
export function setLoginLaunchSettings(
  next: Partial<LoginLaunchSettings>,
): LoginLaunchSettings {
  const current = getLoginLaunchSettings()
  const openAtLogin = next.openAtLogin ?? current.openAtLogin
  const silentLaunch = openAtLogin && (next.silentLaunch ?? current.silentLaunch)
  const settings: LoginLaunchSettings = { openAtLogin, silentLaunch }
  writeStore(settings)
  applyLoginItem(settings)
  return settings
}

/**
 * Whether this macOS process looks like a login-item / launchd start.
 * `wasOpenedAtLogin` is unreliable on macOS 13+; `LaunchInstanceID` is set by login launch.
 * @returns True when started at login.
 */
function darwinLaunchedAtLogin(): boolean {
  try {
    const os = app.getLoginItemSettings()
    if (os.wasOpenedAtLogin || os.wasOpenedAsHidden) {
      return true
    }
  } catch {
    // Fall through to env heuristic.
  }
  return Boolean(process.env.LaunchInstanceID)
}

/**
 * Whether this process should keep the main window hidden (tray only).
 * True for `--workbench-hidden`, or macOS silent launch when started at login.
 * @returns True to start hidden.
 */
export function shouldStartHidden(): boolean {
  if (process.argv.includes(HIDDEN_LAUNCH_ARG)) {
    return true
  }
  if (process.platform !== 'darwin') {
    return false
  }
  const stored = readStore()
  if (!stored?.openAtLogin || !stored.silentLaunch) {
    return false
  }
  return darwinLaunchedAtLogin()
}
