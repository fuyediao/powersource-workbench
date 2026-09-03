/** Filename written by the Windows NSIS wizard with the chosen Settings language. */
export const INSTALL_LANGUAGE_FILE = 'install-language.txt'

/** Sync IPC channel used by preload so i18n can read the installer language at init. */
export const INSTALL_LANGUAGE_SYNC_CHANNEL = 'workbench:install-language-sync'

/** Settings locales that the Windows installer may persist. */
export type InstallAppLanguage = 'en' | 'zh-TW' | 'zh-CN'

/**
 * Parses a Settings language code from installer file bytes or text.
 * @param raw - File contents (UTF-8 or UTF-16LE) or a trimmed string.
 * @returns Supported locale, or null when missing/invalid.
 */
export function parseInstallLanguage(raw: string | Buffer | null | undefined): InstallAppLanguage | null {
  const text = decodeInstallLanguageText(raw)
  if (text === 'en' || text === 'zh-TW' || text === 'zh-CN') {
    return text
  }
  return null
}

/**
 * Decodes installer language file contents to a trimmed string.
 * Unicode NSIS `FileWrite` stores UTF-16LE; ASCII writes are UTF-8.
 * @param raw - File buffer or string.
 * @returns Trimmed text, or empty when unset.
 */
function decodeInstallLanguageText(raw: string | Buffer | null | undefined): string {
  if (raw == null) {
    return ''
  }
  if (typeof raw === 'string') {
    return raw.replace(/^\uFEFF/, '').trim()
  }
  if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe) {
    return raw.subarray(2).toString('utf16le').trim()
  }
  if (raw.length >= 2 && raw[1] === 0 && raw.length % 2 === 0) {
    return raw.toString('utf16le').replace(/^\uFEFF/, '').trim()
  }
  return raw.toString('utf8').replace(/^\uFEFF/, '').trim()
}
