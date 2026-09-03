import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const BYPASS = '127.0.0.1,localhost,*.local,169.254/16'
const WINDOWS_INTERNET_SETTINGS_KEY =
  String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings`

/**
 * Notifies WinINet (Internet Explorer / WinHTTP consumers) that proxy settings changed, via a
 * small inline `Add-Type` P/Invoke of `InternetSetOptionW` — no compiled helper binary needed.
 */
async function notifyWindowsProxyChanged(): Promise<void> {
  const script =
    'Add-Type -MemberDefinition ' +
    '\'[DllImport("wininet.dll", SetLastError = true)] public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);\' ' +
    '-Name WinInet -Namespace GeoCrm; ' +
    '[GeoCrm.WinInet]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0) | Out-Null; ' +
    '[GeoCrm.WinInet]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0) | Out-Null'
  await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script])
}

/**
 * Enables or disables the Windows system proxy via the WinHTTP/WinINet registry keys
 * (`HKCU\...\Internet Settings`), then notifies running processes of the change.
 * @param enable - True to point at the local mixed port.
 * @param port - Mixed-port number.
 */
async function setWindowsSystemProxy(enable: boolean, port: number): Promise<void> {
  if (enable) {
    await execFileAsync('reg', ['add', WINDOWS_INTERNET_SETTINGS_KEY, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '1', '/f'])
    await execFileAsync('reg', [
      'add',
      WINDOWS_INTERNET_SETTINGS_KEY,
      '/v',
      'ProxyServer',
      '/t',
      'REG_SZ',
      '/d',
      `127.0.0.1:${port}`,
      '/f',
    ])
    await execFileAsync('reg', [
      'add',
      WINDOWS_INTERNET_SETTINGS_KEY,
      '/v',
      'ProxyOverride',
      '/t',
      'REG_SZ',
      '/d',
      `${BYPASS.replace(/,/g, ';')};<local>`,
      '/f',
    ])
  } else {
    await execFileAsync('reg', ['add', WINDOWS_INTERNET_SETTINGS_KEY, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '0', '/f'])
  }
  await notifyWindowsProxyChanged()
}

/**
 * Reads the current Windows system proxy state from the registry.
 * @param port - Mixed-port number (for the reported server string).
 */
async function getWindowsSystemProxy(port: number): Promise<{ enable: boolean; server: string; bypass: string }> {
  try {
    const { stdout } = await execFileAsync('reg', [
      'query',
      WINDOWS_INTERNET_SETTINGS_KEY,
      '/v',
      'ProxyEnable',
    ])
    const enabled = /0x1/.test(stdout)
    return { enable: enabled, server: enabled ? `127.0.0.1:${port}` : '', bypass: BYPASS }
  } catch {
    return { enable: false, server: '', bypass: BYPASS }
  }
}

/**
 * Enables or disables the GNOME system proxy (`gsettings org.gnome.system.proxy`). A no-op
 * (with a console notice) on non-GNOME desktops, matching the plan's documented scope.
 * @param enable - True to point at the local mixed port.
 * @param port - Mixed-port number.
 */
async function setLinuxSystemProxy(enable: boolean, port: number): Promise<void> {
  const mode = enable ? 'manual' : 'none'
  try {
    await execFileAsync('gsettings', ['set', 'org.gnome.system.proxy', 'mode', mode])
    if (enable) {
      for (const kind of ['http', 'https', 'socks']) {
        await execFileAsync('gsettings', ['set', `org.gnome.system.proxy.${kind}`, 'host', '127.0.0.1'])
        await execFileAsync('gsettings', ['set', `org.gnome.system.proxy.${kind}`, 'port', String(port)])
      }
      await execFileAsync('gsettings', [
        'set',
        'org.gnome.system.proxy',
        'ignore-hosts',
        `['127.0.0.1', 'localhost', '::1']`,
      ])
    }
  } catch {
    console.warn('[clash] gsettings unavailable (non-GNOME desktop); system proxy left unchanged')
  }
}

/**
 * Reads the current GNOME system proxy state. Returns disabled on non-GNOME desktops.
 * @param port - Mixed-port number (for the reported server string).
 */
async function getLinuxSystemProxy(port: number): Promise<{ enable: boolean; server: string; bypass: string }> {
  try {
    const { stdout } = await execFileAsync('gsettings', ['get', 'org.gnome.system.proxy', 'mode'])
    const enabled = stdout.trim() === "'manual'"
    return { enable: enabled, server: enabled ? `127.0.0.1:${port}` : '', bypass: BYPASS }
  } catch {
    return { enable: false, server: '', bypass: BYPASS }
  }
}

/**
 * Enables or disables the OS system proxy on the current platform (macOS `networksetup`,
 * Windows registry/WinHTTP, or GNOME `gsettings` on Linux).
 * @param enable - True to point at the local mixed port.
 * @param port - Mixed-port number.
 */
export async function setSystemProxy(enable: boolean, port: number): Promise<void> {
  if (process.platform === 'darwin') {
    await setMacSystemProxy(enable, port)
  } else if (process.platform === 'win32') {
    await setWindowsSystemProxy(enable, port)
  } else if (process.platform === 'linux') {
    await setLinuxSystemProxy(enable, port)
  }
}

/**
 * Reads the current OS system proxy state on the current platform.
 * @param port - Mixed-port number.
 */
export async function getSystemProxy(port: number): Promise<{ enable: boolean; server: string; bypass: string }> {
  if (process.platform === 'win32') {
    return getWindowsSystemProxy(port)
  }
  if (process.platform === 'linux') {
    return getLinuxSystemProxy(port)
  }
  return getMacSystemProxy(port)
}

/**
 * Reads any OS-level auto-proxy (PAC) URL, independent of the manual proxy toggle
 * (`get_auto_proxy`). Returns disabled when the OS reports no PAC URL.
 */
export async function getAutoProxy(): Promise<{ enable: boolean; url: string }> {
  try {
    if (process.platform === 'darwin') {
      const services = await listMacServices()
      for (const service of services) {
        const { stdout } = await execFileAsync('networksetup', ['-getautoproxyurl', service])
        const enabledMatch = /Enabled:\s*Yes/i.test(stdout)
        const urlMatch = /^URL:\s*(.+)$/m.exec(stdout)
        if (enabledMatch && urlMatch?.[1]) {
          return { enable: true, url: urlMatch[1].trim() }
        }
      }
      return { enable: false, url: '' }
    }
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync('reg', [
        'query',
        WINDOWS_INTERNET_SETTINGS_KEY,
        '/v',
        'AutoConfigURL',
      ])
      const match = /AutoConfigURL\s+REG_SZ\s+(.+)/.exec(stdout)
      return match?.[1] ? { enable: true, url: match[1].trim() } : { enable: false, url: '' }
    }
    if (process.platform === 'linux') {
      const { stdout: mode } = await execFileAsync('gsettings', ['get', 'org.gnome.system.proxy', 'mode'])
      if (mode.trim() !== "'auto'") {
        return { enable: false, url: '' }
      }
      const { stdout: url } = await execFileAsync('gsettings', ['get', 'org.gnome.system.proxy', 'autoconfig-url'])
      const trimmed = url.trim().replace(/^'|'$/g, '')
      return { enable: trimmed.length > 0, url: trimmed }
    }
  } catch {
    // No PAC configured, or the OS tool is unavailable.
  }
  return { enable: false, url: '' }
}

/**
 * Lists enabled macOS network services (skips disabled `*` rows).
 * @returns Service names.
 */
async function listMacServices(): Promise<string[]> {
  const { stdout } = await execFileAsync('networksetup', ['-listallnetworkservices'])
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('*') && !line.includes('disabled'))
    .slice(1)
}

/**
 * Enables or disables the macOS system HTTP/HTTPS/SOCKS proxy for every service.
 * @param enable - True to point at the local mixed port.
 * @param port - Mixed-port number.
 */
export async function setMacSystemProxy(enable: boolean, port: number): Promise<void> {
  if (process.platform !== 'darwin') {
    return
  }
  const services = await listMacServices()
  for (const service of services) {
    if (enable) {
      const host = '127.0.0.1'
      const portText = String(port)
      await execFileAsync('networksetup', ['-setwebproxy', service, host, portText])
      await execFileAsync('networksetup', ['-setsecurewebproxy', service, host, portText])
      await execFileAsync('networksetup', ['-setsocksfirewallproxy', service, host, portText])
      await execFileAsync('networksetup', ['-setproxybypassdomains', service, ...BYPASS.split(',')])
      await execFileAsync('networksetup', ['-setwebproxystate', service, 'on'])
      await execFileAsync('networksetup', ['-setsecurewebproxystate', service, 'on'])
      await execFileAsync('networksetup', ['-setsocksfirewallproxystate', service, 'on'])
    } else {
      await execFileAsync('networksetup', ['-setwebproxystate', service, 'off'])
      await execFileAsync('networksetup', ['-setsecurewebproxystate', service, 'off'])
      await execFileAsync('networksetup', ['-setsocksfirewallproxystate', service, 'off'])
    }
  }
}

/**
 * Reads whether any macOS service currently has the web proxy on.
 * @returns Enable flag and server string.
 */
export async function getMacSystemProxy(port: number): Promise<{
  enable: boolean
  server: string
  bypass: string
}> {
  if (process.platform !== 'darwin') {
    return { enable: false, server: '', bypass: '' }
  }
  try {
    const services = await listMacServices()
    const wifi = services.find((name) => /wi-?fi/i.test(name)) ?? services[0]
    if (!wifi) {
      return { enable: false, server: '', bypass: '' }
    }
    const { stdout } = await execFileAsync('networksetup', ['-getwebproxy', wifi])
    const enabled = /Enabled:\s*Yes/i.test(stdout)
    return {
      enable: enabled,
      server: enabled ? `127.0.0.1:${port}` : '',
      bypass: BYPASS,
    }
  } catch {
    return { enable: false, server: '', bypass: '' }
  }
}
