import { randomUUID } from 'node:crypto'
import dgram from 'node:dgram'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { app, clipboard, shell } from 'electron'

import { CLASH_EVENT_CHANNEL, CLASH_MIXED_PORT } from '../../shared/clash'
import {
  createLocalBackup,
  createWebdavBackup,
  deleteLocalBackup,
  deleteWebdavBackup,
  exportLocalBackup,
  importLocalBackup,
  listLocalBackup,
  listWebdavBackup,
  restoreLocalBackup,
  restoreWebdavBackup,
  saveWebdavConfig,
} from './backup'
import {
  dnsConfigExists,
  readDnsConfigContent,
  saveDnsConfig,
  validateDnsConfig,
} from './dns'
import { showOpenDialog, showSaveDialog } from './dialogs'
import {
  getRuntimeConfig,
  getRuntimeExistsKeys,
  getRuntimeLogs,
  getRuntimeProxyChainConfig,
  runEnhance,
  updateProxyChainConfigInRuntime,
} from './enhance'
import { clashHostContents, clashHostWindow } from './host'
import { applyHotkeys, setHotkeyHandler } from './hotkeys'
import {
  disableAutoLightweightMode,
  enableAutoLightweightMode,
  enterLightweightMode,
  exitLightweightMode,
} from './lightweight'
import { getLoginLaunchSettings } from '../login-launch'
import { buildProxyView, clashInfoPayload, mihomoFetch, mihomoRequest, patchMihomoConfig } from './mihomo-api'
import { closeMihomoWs, openMihomoWs } from './mihomo-ws'
import { getNextUpdateTime, refreshProfileTimers } from './profile-timer'
import { applyRuntimeToCore, computeRunState } from './runtime-state'
import {
  installService,
  isServiceInstalled,
  reinstallService,
  setPreferSidecar,
  uninstallService,
} from './service'
import { readSidecarLogs, resolveMihomoBinary, sidecarUptimeMs, writeRuntimeConfig } from './sidecar'
import {
  ensureClashDirs,
  loadProfilesIndex,
  loadVergeStore,
  patchVergeStore,
  profilePath,
  saveProfilesIndex,
} from './store'
import { getAutoProxy, getSystemProxy, setSystemProxy } from './sysproxy'
import type { ClashCoreName, ClashProfileItem, ClashVergeStore } from './types'
import { checkMediaUnlock, defaultUnlockItems } from './unlock'
import { invokeUwpTool } from './uwp'

/**
 * Emits a Tauri-style event into the GeoCRM renderer (Clash island).
 * @param name - Event name.
 * @param payload - Payload.
 */
export function emitClashEvent(name: string, payload: unknown): void {
  const contents = clashHostContents()
  contents?.send(CLASH_EVENT_CHANNEL, { name, payload })
}

/**
 * Reloads runtime YAML from the current profile and applies it to whichever Mihomo instance
 * should be running (sidecar or the privileged service).
 */
async function applyCurrentProfile(): Promise<void> {
  await writeRuntimeConfig()
  await applyRuntimeToCore()
  const index = loadProfilesIndex()
  emitClashEvent('verge://refresh-clash-config', 'ok')
  emitClashEvent('verge://refresh-profiles', 'ok')
  emitClashEvent('verge://run-state-changed', await computeRunState())
  emitClashEvent('profile-changed', index.current ?? '')
}

const validOutcome = { status: 'valid' as const }

/**
 * Parses a Clash core id from invoke args.
 * `verge-mihomo-alpha` is accepted as an alias of Mihomo.
 * @param args - Command args.
 * @returns `verge-mihomo`, or null when invalid.
 */
function parseClashCore(args: Record<string, unknown>): ClashCoreName | null {
  const clashCore = String(args.clashCore ?? args.clash_core ?? '')
  if (clashCore === 'verge-mihomo' || clashCore === 'verge-mihomo-alpha') {
    return 'verge-mihomo'
  }
  return null
}

/**
 * Fields whose change requires re-running the enhance pipeline and reapplying the runtime
 * config (mirrors the `RESTART_CORE` / `CLASH_CONFIG` update flags Clash Verge's
 * `determine_update_flags` computes from a Verge patch).
 */
const CORE_REAPPLY_FIELDS: Array<keyof ClashVergeStore> = [
  'enable_tun_mode',
  'clash_mode',
  'clash_log_level',
  'clash_ipv6',
  'clash_allow_lan',
  'clash_unified_delay',
  'enable_external_controller',
  'verge_socks_enabled',
  'verge_socks_port',
  'verge_http_enabled',
  'verge_port',
  'verge_redir_enabled',
  'verge_redir_port',
  'verge_tproxy_enabled',
  'verge_tproxy_port',
]

/**
 * Applies side effects for a `patch_verge_config` payload beyond persisting the JSON store:
 * global hotkeys, auto-lightweight mode, system proxy, and re-running the enhance pipeline for
 * control-plane / TUN fields.
 *
 * `enable_auto_launch` / `enable_silent_start` are intentionally ignored here: the OS login item
 * is owned exclusively by GeoCRM Preferences (`setLoginLaunchSettings` via the Preferences
 * section) so a stale `verge.yaml` can never overwrite it.
 * @param payload - Patch payload as sent by the renderer.
 * @param next - Store state after the patch was written.
 */
async function applyVergePatchSideEffects(
  payload: Record<string, unknown>,
  next: ClashVergeStore,
): Promise<void> {
  if (typeof payload.enable_system_proxy === 'boolean') {
    await setSystemProxy(payload.enable_system_proxy, CLASH_MIXED_PORT)
  }
  if ('hotkeys' in payload || 'enable_global_hotkey' in payload) {
    applyHotkeys(next.hotkeys, next.enable_global_hotkey ?? true)
  }
  if ('enable_auto_light_weight_mode' in payload || 'auto_light_weight_minutes' in payload) {
    if (next.enable_auto_light_weight_mode) {
      enableAutoLightweightMode(next.auto_light_weight_minutes ?? 10)
    } else {
      disableAutoLightweightMode()
    }
  }
  if (CORE_REAPPLY_FIELDS.some((field) => field in payload)) {
    await applyCurrentProfile()
  }
}

/**
 * Registers hotkey-function handlers once the command dispatcher module loads.
 */
function registerHotkeyHandlers(): void {
  setHotkeyHandler('open_or_close_dashboard', () => {
    const win = clashHostWindow()
    if (!win) return
    if (win.isVisible() && win.isFocused()) {
      win.hide()
    } else {
      win.show()
      win.focus()
    }
  })
  setHotkeyHandler('clash_mode_rule', () => void patchMihomoConfig({ mode: 'rule' }))
  setHotkeyHandler('clash_mode_global', () => void patchMihomoConfig({ mode: 'global' }))
  setHotkeyHandler('clash_mode_direct', () => void patchMihomoConfig({ mode: 'direct' }))
  setHotkeyHandler('toggle_system_proxy', () => {
    const verge = loadVergeStore()
    const next = !(verge.enable_system_proxy ?? false)
    patchVergeStore({ enable_system_proxy: next })
    void setSystemProxy(next, CLASH_MIXED_PORT)
  })
  setHotkeyHandler('toggle_tun_mode', () => {
    const verge = loadVergeStore()
    patchVergeStore({ enable_tun_mode: !(verge.enable_tun_mode ?? false) })
    void applyCurrentProfile()
  })
  setHotkeyHandler('entry_lightweight_mode', () => enterLightweightMode())
  setHotkeyHandler('reactivate_profiles', () => void applyCurrentProfile())
}

registerHotkeyHandlers()

/**
 * Binds a throwaway TCP/UDP listener to check whether `host:port` is already taken.
 * @param transport - `tcp` or `udp`.
 * @param host - Bind host.
 * @param port - Bind port.
 * @returns True when the port was free (and has already been released).
 */
function probePort(transport: 'tcp' | 'udp', host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (transport === 'tcp') {
      const server = net.createServer()
      server.once('error', () => resolve(false))
      server.listen(port, host, () => {
        server.close(() => resolve(true))
      })
      return
    }
    const socket = dgram.createSocket('udp4')
    socket.once('error', () => resolve(false))
    socket.bind(port, host, () => {
      socket.close(() => resolve(true))
    })
  })
}

/**
 * Dispatches a Clash Verge `invoke` command.
 * @param cmd - Tauri command name.
 * @param args - Argument object.
 * @returns Command result.
 */
export async function handleClashCommand(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
  switch (cmd) {
    case 'get_profiles': {
      const index = loadProfilesIndex()
      return { current: index.current, items: index.items }
    }
    case 'patch_profiles_config': {
      const profiles = args.profiles as { current?: string } | undefined
      const index = loadProfilesIndex()
      if (profiles?.current) {
        index.current = profiles.current
        saveProfilesIndex(index)
        await applyCurrentProfile()
      }
      return validOutcome
    }
    case 'create_profile': {
      const item = (args.item ?? {}) as Partial<ClashProfileItem>
      const fileData = typeof args.fileData === 'string' ? args.fileData : ''
      const uid = randomUUID()
      const file = `${uid}.yaml`
      fs.writeFileSync(profilePath(file), fileData || 'proxies: []\nproxy-groups: []\nrules:\n  - MATCH,DIRECT\n', 'utf8')
      const index = loadProfilesIndex()
      index.items.push({
        uid,
        type: item.type ?? (item.url ? 'remote' : 'local'),
        name: item.name?.trim() || 'Profile',
        desc: item.desc,
        file,
        url: item.url,
        updated: Date.now(),
        option: item.option,
      })
      if (!index.current) {
        index.current = uid
      }
      saveProfilesIndex(index)
      refreshProfileTimers()
      emitClashEvent('verge://refresh-profiles', 'ok')
      return
    }
    case 'import_profile': {
      const url = String(args.url ?? '')
      if (!url.startsWith('http')) {
        throw new Error('Profile URL must be http(s)')
      }
      const response = await fetch(url, {
        headers: { 'User-Agent': 'clash-verge/GeoCRM' },
      })
      if (!response.ok) {
        throw new Error(`Import failed (${response.status})`)
      }
      const body = await response.text()
      const uid = randomUUID()
      const file = `${uid}.yaml`
      fs.writeFileSync(profilePath(file), body, 'utf8')
      const index = loadProfilesIndex()
      const option = args.option as ClashProfileItem['option'] | undefined
      index.items.push({
        uid,
        type: 'remote',
        name: new URL(url).hostname,
        file,
        url,
        updated: Date.now(),
        option,
      })
      if (!index.current) {
        index.current = uid
      }
      saveProfilesIndex(index)
      refreshProfileTimers()
      emitClashEvent('verge://refresh-profiles', 'ok')
      return
    }
    case 'update_profile': {
      const uid = String(args.index ?? '')
      const index = loadProfilesIndex()
      const item = index.items.find((row) => row.uid === uid)
      if (!item?.url) {
        return
      }
      const response = await fetch(item.url, {
        headers: { 'User-Agent': 'clash-verge/GeoCRM' },
      })
      if (!response.ok) {
        throw new Error(`Update failed (${response.status})`)
      }
      fs.writeFileSync(profilePath(item.file), await response.text(), 'utf8')
      item.updated = Date.now()
      const option = args.option as ClashProfileItem['option'] | undefined
      if (option) {
        item.option = { ...item.option, ...option }
      }
      saveProfilesIndex(index)
      refreshProfileTimers()
      if (index.current === uid) {
        await applyCurrentProfile()
      }
      emitClashEvent('verge://refresh-profiles', 'ok')
      return
    }
    case 'delete_profile': {
      const uid = String(args.index ?? '')
      const index = loadProfilesIndex()
      const item = index.items.find((row) => row.uid === uid)
      if (item) {
        try {
          fs.unlinkSync(profilePath(item.file))
        } catch {
          // Missing file.
        }
      }
      index.items = index.items.filter((row) => row.uid !== uid)
      const wasCurrent = index.current === uid
      if (wasCurrent) {
        index.current = index.items[0]?.uid
      }
      saveProfilesIndex(index)
      refreshProfileTimers()
      if (wasCurrent) {
        await applyCurrentProfile()
      }
      emitClashEvent('verge://refresh-profiles', 'ok')
      return
    }
    case 'patch_profile': {
      const uid = String(args.index ?? '')
      const patch = (args.profile ?? {}) as Partial<ClashProfileItem>
      const index = loadProfilesIndex()
      const item = index.items.find((row) => row.uid === uid)
      if (item) {
        Object.assign(item, patch)
        saveProfilesIndex(index)
        refreshProfileTimers()
        emitClashEvent('verge://refresh-profiles', 'ok')
      }
      return
    }
    case 'reorder_profile': {
      const activeId = String(args.activeId ?? '')
      const overId = String(args.overId ?? '')
      const index = loadProfilesIndex()
      const from = index.items.findIndex((row) => row.uid === activeId)
      const to = index.items.findIndex((row) => row.uid === overId)
      if (from >= 0 && to >= 0) {
        const [moved] = index.items.splice(from, 1)
        if (moved) {
          index.items.splice(to, 0, moved)
          saveProfilesIndex(index)
        }
      }
      return
    }
    case 'read_profile_file': {
      const uid = String(args.index ?? '')
      const item = loadProfilesIndex().items.find((row) => row.uid === uid)
      if (!item) {
        return ''
      }
      const abs = profilePath(item.file)
      return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : ''
    }
    case 'save_profile_file': {
      const uid = String(args.index ?? '')
      const fileData = String(args.fileData ?? '')
      const item = loadProfilesIndex().items.find((row) => row.uid === uid)
      if (item) {
        fs.writeFileSync(profilePath(item.file), fileData, 'utf8')
      }
      return validOutcome
    }
    case 'view_profile': {
      const uid = String(args.index ?? '')
      const item = loadProfilesIndex().items.find((row) => row.uid === uid)
      if (!item) {
        throw new Error(`Profile not found: ${uid}`)
      }
      const abs = profilePath(item.file)
      if (!fs.existsSync(abs)) {
        throw new Error(`file not found "${abs}"`)
      }
      const err = await shell.openPath(abs)
      if (err) {
        throw new Error(err)
      }
      return
    }
    case 'enhance_profiles': {
      const outcome = await runEnhance()
      await applyRuntimeToCore()
      emitClashEvent('verge://refresh-clash-config', 'ok')
      return outcome
    }
    case 'mihomo_http': {
      const pathname = String(args.pathname ?? '/')
      const method = String(args.method ?? 'GET')
      const body = typeof args.body === 'string' ? args.body : undefined
      return mihomoRequest(pathname, { method, body })
    }
    case 'mihomo_ws_open': {
      const pathname = String(args.pathname ?? '/')
      const sessionId = typeof args.id === 'string' ? args.id : undefined
      return openMihomoWs(
        pathname,
        (id, data) => {
          emitClashEvent(`mihomo-ws:${id}`, { type: 'Text', data })
        },
        sessionId,
      )
    }
    case 'mihomo_ws_close': {
      closeMihomoWs(String(args.id ?? ''))
      return
    }
    case 'get_clash_info':
      return clashInfoPayload()
    case 'get_clash_mode': {
      const configs = await mihomoFetch<{ mode?: string }>('/configs')
      return configs?.mode ?? 'rule'
    }
    case 'get_runtime_config':
      return getRuntimeConfig()
    case 'get_runtime_exists':
      return getRuntimeExistsKeys()
    case 'get_runtime_yaml': {
      const { runtimeFile } = ensureClashDirs()
      return fs.existsSync(runtimeFile) ? fs.readFileSync(runtimeFile, 'utf8') : ''
    }
    case 'get_runtime_logs':
      return getRuntimeLogs()
    case 'get_runtime_proxy_chain_config':
      return getRuntimeProxyChainConfig(String(args.proxyChainExitNode ?? ''))
    case 'update_proxy_chain_config_in_runtime':
      updateProxyChainConfigInRuntime(args.proxyChainConfig)
      return
    case 'patch_clash_config': {
      const payload = (args.payload ?? args) as Record<string, unknown>
      await patchMihomoConfig(payload)
      emitClashEvent('verge://refresh-clash-config', 'ok')
      return
    }
    case 'patch_clash_mode': {
      const mode = String(args.payload ?? args.mode ?? 'rule')
      await patchMihomoConfig({ mode })
      emitClashEvent('verge://refresh-clash-config', 'ok')
      return
    }
    case 'get_proxy_view':
      return buildProxyView()
    case 'record_selected_node': {
      const groupName = String(args.groupName ?? '')
      const node = String(args.node ?? '')
      if (groupName && node) {
        await mihomoFetch(`/proxies/${encodeURIComponent(groupName)}`, {
          method: 'PUT',
          body: JSON.stringify({ name: node }),
        })
      }
      return
    }
    case 'sync_tray_proxy_selection':
      return
    case 'get_clash_logs':
      return readSidecarLogs()
    case 'get_verge_config':
      return loadVergeStore()
    case 'patch_verge_config': {
      const payload = (args.payload ?? args) as Record<string, unknown>
      const next = patchVergeStore(payload)
      await applyVergePatchSideEffects(payload, next)
      emitClashEvent('verge://refresh-verge-config', 'ok')
      return next
    }
    case 'get_sys_proxy':
      return getSystemProxy(CLASH_MIXED_PORT)
    case 'get_auto_proxy':
      return getAutoProxy()
    case 'get_embedded_server_port':
      return CLASH_MIXED_PORT
    case 'restart_core':
      await applyCurrentProfile()
      return
    case 'change_clash_core': {
      const clashCore = parseClashCore(args)
      if (!clashCore) {
        return { detail: `Unsupported Clash core: ${String(args.clashCore ?? args.clash_core ?? '')}` }
      }
      patchVergeStore({ clash_core: clashCore })
      const err = await applyRuntimeToCore()
      if (err) {
        return { detail: err }
      }
      emitClashEvent('verge://refresh-clash-config', 'ok')
      emitClashEvent('verge://refresh-verge-config', 'ok')
      emitClashEvent('verge://run-state-changed', await computeRunState())
      return null
    }
    case 'restart_app':
      app.relaunch()
      app.exit(0)
      return
    case 'get_app_dir':
      return ensureClashDirs().root
    case 'open_app_dir':
      await shell.openPath(ensureClashDirs().root)
      return
    case 'open_core_dir': {
      const binary = resolveMihomoBinary()
      await shell.openPath(binary ? path.dirname(binary) : ensureClashDirs().root)
      return
    }
    case 'open_logs_dir':
      await shell.openPath(ensureClashDirs().logs)
      return
    case 'open_web_url': {
      const url = String(args.url ?? '')
      if (url.startsWith('http')) {
        await shell.openExternal(url)
      }
      return
    }
    case 'get_runtime_state':
      return computeRunState()
    case 'get_pending_failures':
      return []
    case 'get_auto_launch_status':
      return getLoginLaunchSettings().openAtLogin
    case 'get_app_uptime':
      return sidecarUptimeMs()
    case 'get_system_info': {
      const runState = await computeRunState()
      return {
        system_name: process.platform,
        system_version: os.release(),
        system_kernel_version: os.version?.() ?? '',
        system_arch: process.arch,
        app_version: app.getVersion(),
        app_core_mode: runState.mode,
        app_is_admin: runState.isAdmin,
      }
    }
    case 'get_network_interfaces':
      return Object.keys(os.networkInterfaces())
    case 'get_system_hostname':
      return os.hostname()
    case 'get_network_interfaces_info': {
      const interfaces = os.networkInterfaces()
      return Object.entries(interfaces).map(([name, addrs], index) => ({
        name,
        mac_addr: addrs?.find((a) => a.mac && a.mac !== '00:00:00:00:00:00')?.mac,
        index,
        addr: (addrs ?? []).map((a) =>
          a.family === 'IPv6'
            ? { V6: { ip: a.address, netmask: a.netmask } }
            : { V4: { ip: a.address, netmask: a.netmask } },
        ),
      }))
    }
    case 'copy_clash_env': {
      const proxyUrl = `http://127.0.0.1:${CLASH_MIXED_PORT}`
      const env =
        process.platform === 'win32'
          ? `$env:HTTP_PROXY="${proxyUrl}"; $env:HTTPS_PROXY="${proxyUrl}"; $env:ALL_PROXY="${proxyUrl}"`
          : `export http_proxy="${proxyUrl}"; export https_proxy="${proxyUrl}"; export all_proxy="${proxyUrl}"`
      clipboard.writeText(env)
      return
    }
    case 'install_service':
      await installService()
      await applyCurrentProfile()
      return
    case 'uninstall_service':
      await uninstallService()
      await applyCurrentProfile()
      return
    case 'reinstall_service':
    case 'repair_service':
      await reinstallService()
      await applyCurrentProfile()
      return
    case 'continue_with_sidecar':
      setPreferSidecar()
      await applyCurrentProfile()
      return
    case 'entry_lightweight_mode':
      enterLightweightMode()
      return
    case 'exit_lightweight_mode':
      exitLightweightMode()
      return
    case 'invoke_uwp_tool':
      await invokeUwpTool()
      return
    case 'open_devtools':
      clashHostContents()?.openDevTools({ mode: 'detach' })
      return
    case 'exit_app':
      app.quit()
      return
    case 'export_diagnostic_info': {
      const runState = await computeRunState()
      const logs = readSidecarLogs().slice(-40)
      const text = [
        `GeoCRM ${app.getVersion()}`,
        `Platform: ${process.platform} ${os.release()} (${process.arch})`,
        `Core mode: ${runState.mode} (service: ${runState.service})`,
        `Service installed: ${await isServiceInstalled()}`,
        '',
        '--- Recent Mihomo log tail ---',
        ...logs,
      ].join('\n')
      clipboard.writeText(text)
      return
    }
    case 'create_webdav_backup':
      await createWebdavBackup()
      return
    case 'create_local_backup':
      createLocalBackup()
      return
    case 'delete_webdav_backup':
      await deleteWebdavBackup(String(args.filename ?? ''))
      return
    case 'delete_local_backup':
      deleteLocalBackup(String(args.filename ?? ''))
      return
    case 'restore_webdav_backup':
      await restoreWebdavBackup(String(args.filename ?? ''))
      await applyCurrentProfile()
      emitClashEvent('verge://refresh-verge-config', 'ok')
      return
    case 'restore_local_backup':
      restoreLocalBackup(String(args.filename ?? ''))
      await applyCurrentProfile()
      emitClashEvent('verge://refresh-verge-config', 'ok')
      return
    case 'import_local_backup':
      return importLocalBackup(String(args.source ?? ''))
    case 'export_local_backup':
      exportLocalBackup(String(args.filename ?? ''), String(args.destination ?? ''))
      return
    case 'save_webdav_config':
      saveWebdavConfig(String(args.url ?? ''), String(args.username ?? ''), String(args.password ?? ''))
      return
    case 'list_webdav_backup':
      return listWebdavBackup()
    case 'list_local_backup':
      return listLocalBackup()
    case 'save_dns_config':
      saveDnsConfig(args.dnsConfig)
      return
    case 'apply_dns_config':
      await applyCurrentProfile()
      return
    case 'check_dns_config_exists':
      return dnsConfigExists()
    case 'get_dns_config_content':
      return readDnsConfigContent()
    case 'validate_dns_config':
      return validateDnsConfig()
    case 'test_delay': {
      const url = String(args.url ?? '')
      const started = Date.now()
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 10000)
        await fetch(url, { method: 'HEAD', signal: controller.signal })
        clearTimeout(timer)
        return Date.now() - started
      } catch {
        return 10000
      }
    }
    case 'probe_listener': {
      const request = (args.request ?? {}) as { address?: string; transports?: Array<'tcp' | 'udp'> }
      const [host, portText] = (request.address ?? '').split(':')
      const port = Number(portText)
      if (!host || !Number.isFinite(port)) {
        return { status: 'invalid', message: `Invalid listener address: ${request.address ?? ''}` }
      }
      for (const transport of request.transports ?? ['tcp']) {
        const available = await probePort(transport, host, port)
        if (!available) {
          return { status: 'conflict', port, transport }
        }
      }
      return { status: 'available' }
    }
    case 'save_proxy_ports': {
      const settings = (args.settings ?? {}) as {
        mixedPort?: number
        socks?: { enabled: boolean; port: number }
        http?: { enabled: boolean; port: number }
        redir?: { enabled: boolean; port: number }
        tproxy?: { enabled: boolean; port: number }
      }
      const checks: Array<{ enabled?: boolean; port?: number; transport: 'tcp' | 'udp' }> = [
        { enabled: settings.socks?.enabled, port: settings.socks?.port, transport: 'tcp' },
        { enabled: settings.http?.enabled, port: settings.http?.port, transport: 'tcp' },
        { enabled: settings.redir?.enabled, port: settings.redir?.port, transport: 'tcp' },
        { enabled: settings.tproxy?.enabled, port: settings.tproxy?.port, transport: 'udp' },
      ]
      for (const check of checks) {
        if (!check.enabled || !check.port) continue
        const available = await probePort(check.transport, '127.0.0.1', check.port)
        if (!available) {
          return { status: 'conflict', port: check.port, transport: check.transport }
        }
      }
      patchVergeStore({
        verge_socks_enabled: settings.socks?.enabled,
        verge_socks_port: settings.socks?.port,
        verge_http_enabled: settings.http?.enabled,
        verge_port: settings.http?.port,
        verge_redir_enabled: settings.redir?.enabled,
        verge_redir_port: settings.redir?.port,
        verge_tproxy_enabled: settings.tproxy?.enabled,
        verge_tproxy_port: settings.tproxy?.port,
      })
      await applyCurrentProfile()
      return { status: 'saved' }
    }
    case 'get_next_update_time':
      return getNextUpdateTime(String(args.uid ?? ''))
    case 'get_unlock_items':
      return defaultUnlockItems()
    case 'check_media_unlock':
      return checkMediaUnlock(typeof args.name === 'string' ? args.name : undefined)
    case 'show_open_dialog':
      return showOpenDialog(args as { directory?: boolean; multiple?: boolean; filters?: Array<{ name?: string; extensions: string[] }> })
    case 'show_save_dialog':
      return showSaveDialog(args as { defaultPath?: string; filters?: Array<{ name?: string; extensions: string[] }> })
    case 'copy_icon_file': {
      const source = String(args.path ?? '')
      const iconInfo = (args.iconInfo ?? {}) as { name?: string }
      const name = iconInfo.name ?? 'common'
      if (!fs.existsSync(source)) {
        throw new Error(`Icon file not found: ${source}`)
      }
      const iconsDir = path.join(ensureClashDirs().root, 'icons')
      fs.mkdirSync(iconsDir, { recursive: true })
      const ext = path.extname(source).toLowerCase() || '.png'
      for (const staleExt of ['.png', '.ico']) {
        if (staleExt === ext) continue
        const stale = path.join(iconsDir, `${name}${staleExt}`)
        if (fs.existsSync(stale)) {
          fs.unlinkSync(stale)
        }
      }
      fs.copyFileSync(source, path.join(iconsDir, `${name}${ext}`))
      return
    }
    case 'download_icon_cache': {
      const url = String(args.url ?? '')
      const name = String(args.name ?? 'icon')
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Failed to download icon (HTTP ${response.status})`)
      }
      const iconsDir = path.join(ensureClashDirs().root, 'icons')
      fs.mkdirSync(iconsDir, { recursive: true })
      const ext = path.extname(new URL(url).pathname).toLowerCase() || '.png'
      const dest = path.join(iconsDir, `${name}${ext}`)
      fs.writeFileSync(dest, Buffer.from(await response.arrayBuffer()))
      return dest
    }
    default:
      throw new Error(`Unhandled Clash invoke: ${cmd}`)
  }
}
