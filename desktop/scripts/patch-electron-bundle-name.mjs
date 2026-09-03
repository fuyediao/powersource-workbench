/**
 * macOS `npm run dev` launches `node_modules/electron/dist/Electron.app`.
 * Dock tooltips read CFBundleName from that bundle, not package.json productName.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DISPLAY_NAME = 'GeoCRM'
const scriptDir = path.dirname(fileURLToPath(import.meta.url))

if (process.platform !== 'darwin') {
  process.exit(0)
}

const plistPath = path.join(
  scriptDir,
  '../node_modules/electron/dist/Electron.app/Contents/Info.plist',
)

if (!fs.existsSync(plistPath)) {
  process.exit(0)
}

/**
 * Reads a string key from the Electron.app Info.plist.
 * @param key - Plist key.
 * @returns Value, or empty when missing.
 */
function readPlistString(key) {
  try {
    return execFileSync('plutil', ['-extract', key, 'raw', plistPath], {
      encoding: 'utf8',
    }).trim()
  } catch {
    return ''
  }
}

/**
 * Writes a string key on the Electron.app Info.plist.
 * @param key - Plist key.
 * @param value - Display name.
 * @returns Nothing.
 */
function writePlistString(key, value) {
  try {
    execFileSync('plutil', ['-replace', key, '-string', value, plistPath])
  } catch {
    execFileSync('plutil', ['-insert', key, '-string', value, plistPath])
  }
}

if (readPlistString('CFBundleName') !== APP_DISPLAY_NAME) {
  writePlistString('CFBundleName', APP_DISPLAY_NAME)
}
if (readPlistString('CFBundleDisplayName') !== APP_DISPLAY_NAME) {
  writePlistString('CFBundleDisplayName', APP_DISPLAY_NAME)
}
