import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'

import { resolveMihomoBinary } from './sidecar'
import { ensureClashDirs } from './store'

const execFileAsync = promisify(execFile)

const LAUNCHD_LABEL = 'com.geocrm.mihomo'
const LAUNCHD_PLIST_PATH = `/Library/LaunchDaemons/${LAUNCHD_LABEL}.plist`
const WINDOWS_SERVICE_NAME = 'GeoCrmMihomo'
const SYSTEMD_UNIT_NAME = 'geocrm-mihomo.service'
const SYSTEMD_UNIT_PATH = `/etc/systemd/system/${SYSTEMD_UNIT_NAME}`

/** Persisted "keep using the unprivileged sidecar" acknowledgement (`continue_with_sidecar`). */
function statePath(): string {
  return path.join(ensureClashDirs().root, 'service-state.json')
}

/**
 * Whether the user explicitly chose to stay on the unprivileged sidecar (declined the
 * install-service prompt). Cleared once a service is installed.
 * @returns True when the sidecar-only choice is on record.
 */
export function preferSidecar(): boolean {
  try {
    const raw = JSON.parse(fs.readFileSync(statePath(), 'utf8')) as { preferSidecar?: boolean }
    return Boolean(raw.preferSidecar)
  } catch {
    return false
  }
}

/**
 * Records the "continue with sidecar" acknowledgement (`continue_with_sidecar`).
 */
export function setPreferSidecar(): void {
  fs.writeFileSync(statePath(), `${JSON.stringify({ preferSidecar: true }, null, 2)}\n`, 'utf8')
}

/**
 * Clears the "continue with sidecar" acknowledgement, called once a service is installed so a
 * later uninstall goes back to prompting instead of silently staying on the sidecar.
 */
function clearPreferSidecar(): void {
  try {
    fs.unlinkSync(statePath())
  } catch {
    // Nothing to clear.
  }
}

/**
 * Runs a shell command elevated (admin/root), matching Clash Verge's install-service prompts.
 * macOS uses an AppleScript admin prompt; Windows a UAC `Start-Process -Verb RunAs`; Linux
 * `pkexec`.
 * @param command - Full shell command line to execute elevated.
 */
async function runElevated(command: string): Promise<void> {
  if (process.platform === 'darwin') {
    const escaped = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    await execFileAsync('osascript', ['-e', `do shell script "${escaped}" with administrator privileges`])
    return
  }
  if (process.platform === 'win32') {
    const inner = command.replace(/'/g, "''")
    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Start-Process powershell.exe -ArgumentList '-NoProfile','-Command','${inner}' -Verb RunAs -Wait`,
    ])
    return
  }
  await execFileAsync('pkexec', ['sh', '-c', command])
}

/**
 * Absolute path to `runtime.yaml`'s directory, shared verbatim between the sidecar and the
 * privileged service (same controller socket, so the rest of the app is unaffected by which
 * one is actually running Mihomo).
 */
function runtimeArgs(): { binary: string; runtimeFile: string; dir: string } {
  const binary = resolveMihomoBinary()
  if (!binary) {
    throw new Error('Mihomo sidecar binary is missing. Run npm run clash:prebuild (needs Go).')
  }
  const { runtimeFile } = ensureClashDirs()
  return { binary, runtimeFile, dir: path.dirname(runtimeFile) }
}

/**
 * Builds the macOS LaunchDaemon plist that runs Mihomo as root.
 */
function buildLaunchdPlist(): string {
  const { binary, runtimeFile, dir } = runtimeArgs()
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${binary}</string>
    <string>-f</string>
    <string>${runtimeFile}</string>
    <string>-d</string>
    <string>${dir}</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${dir}/mihomo-service.log</string>
  <key>StandardErrorPath</key><string>${dir}/mihomo-service.log</string>
</dict>
</plist>
`
}

/**
 * Installs and starts the privileged Mihomo daemon on the current platform, matching the
 * plan's "TUN + privileged service" design (same Go Mihomo binary as root/SYSTEM, one shared
 * controller socket).
 */
export async function installService(): Promise<void> {
  const { binary, runtimeFile, dir } = runtimeArgs()
  fs.mkdirSync(dir, { recursive: true })

  if (process.platform === 'darwin') {
    const plist = buildLaunchdPlist()
    const tmpPlist = path.join(app.getPath('temp'), `${LAUNCHD_LABEL}.plist`)
    fs.writeFileSync(tmpPlist, plist, 'utf8')
    await runElevated(
      [
        `cp '${tmpPlist}' '${LAUNCHD_PLIST_PATH}'`,
        `chown root:wheel '${LAUNCHD_PLIST_PATH}'`,
        `chmod 644 '${LAUNCHD_PLIST_PATH}'`,
        `launchctl bootstrap system '${LAUNCHD_PLIST_PATH}' 2>/dev/null || launchctl load '${LAUNCHD_PLIST_PATH}'`,
      ].join(' && '),
    )
    clearPreferSidecar()
    return
  }

  if (process.platform === 'win32') {
    await runElevated(
      [
        `sc.exe create ${WINDOWS_SERVICE_NAME} binPath= "\\"${binary}\\" -f \\"${runtimeFile}\\" -d \\"${dir}\\"" start= auto`,
        `sc.exe start ${WINDOWS_SERVICE_NAME}`,
      ].join(' ; '),
    )
    clearPreferSidecar()
    return
  }

  if (process.platform === 'linux') {
    const unit = `[Unit]
Description=GeoCRM Mihomo (privileged, TUN-capable)
After=network.target

[Service]
Type=simple
ExecStart=${binary} -f ${runtimeFile} -d ${dir}
Restart=on-failure

[Install]
WantedBy=multi-user.target
`
    const tmpUnit = path.join(app.getPath('temp'), SYSTEMD_UNIT_NAME)
    fs.writeFileSync(tmpUnit, unit, 'utf8')
    await runElevated(
      [
        `cp '${tmpUnit}' '${SYSTEMD_UNIT_PATH}'`,
        'systemctl daemon-reload',
        `systemctl enable --now ${SYSTEMD_UNIT_NAME}`,
      ].join(' && '),
    )
    clearPreferSidecar()
    return
  }

  throw new Error(`Unsupported platform for the privileged service: ${process.platform}`)
}

/**
 * Stops and removes the privileged Mihomo daemon.
 */
export async function uninstallService(): Promise<void> {
  if (process.platform === 'darwin') {
    await runElevated(
      [
        `launchctl bootout system/${LAUNCHD_LABEL} 2>/dev/null || launchctl unload '${LAUNCHD_PLIST_PATH}' 2>/dev/null || true`,
        `rm -f '${LAUNCHD_PLIST_PATH}'`,
      ].join(' ; '),
    )
    return
  }
  if (process.platform === 'win32') {
    await runElevated(
      [`sc.exe stop ${WINDOWS_SERVICE_NAME}`, `sc.exe delete ${WINDOWS_SERVICE_NAME}`].join(' ; '),
    )
    return
  }
  if (process.platform === 'linux') {
    await runElevated(
      [
        `systemctl disable --now ${SYSTEMD_UNIT_NAME} 2>/dev/null || true`,
        `rm -f '${SYSTEMD_UNIT_PATH}'`,
        'systemctl daemon-reload',
      ].join(' && '),
    )
    return
  }
}

/**
 * Reinstalls the privileged daemon (uninstall then install), matching `reinstall_service` /
 * `repair_service` (same remedy in this design — there is no separate versioned Rust helper
 * to repair in place).
 */
export async function reinstallService(): Promise<void> {
  try {
    await uninstallService()
  } catch {
    // Best-effort: proceed to install even if nothing was installed yet.
  }
  await installService()
}

/**
 * Whether the privileged daemon is installed on this platform (service/unit exists), without
 * requiring elevation to check.
 */
export async function isServiceInstalled(): Promise<boolean> {
  try {
    if (process.platform === 'darwin') {
      return fs.existsSync(LAUNCHD_PLIST_PATH)
    }
    if (process.platform === 'win32') {
      await execFileAsync('sc.exe', ['query', WINDOWS_SERVICE_NAME])
      return true
    }
    if (process.platform === 'linux') {
      return fs.existsSync(SYSTEMD_UNIT_PATH)
    }
  } catch {
    return false
  }
  return false
}

/**
 * Whether the privileged daemon is currently running.
 */
export async function isServiceRunning(): Promise<boolean> {
  try {
    if (process.platform === 'darwin') {
      const { stdout } = await execFileAsync('launchctl', ['list', LAUNCHD_LABEL])
      return stdout.trim().length > 0
    }
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync('sc.exe', ['query', WINDOWS_SERVICE_NAME])
      return /RUNNING/.test(stdout)
    }
    if (process.platform === 'linux') {
      const { stdout } = await execFileAsync('systemctl', ['is-active', SYSTEMD_UNIT_NAME])
      return stdout.trim() === 'active'
    }
  } catch {
    return false
  }
  return false
}

/**
 * Whether this Electron process itself is already elevated (root/administrator), matching
 * `app_is_admin`. Electron never launches elevated on its own; this only ever reports true
 * when the user explicitly ran GeoCRM with `sudo`/an admin shell.
 */
export async function isProcessElevated(): Promise<boolean> {
  if (process.platform === 'win32') {
    try {
      await execFileAsync('net', ['session'])
      return true
    } catch {
      return false
    }
  }
  const getuid = (process as NodeJS.Process & { getuid?: () => number }).getuid
  return typeof getuid === 'function' && getuid() === 0
}
