/**
 * Builds `build/icon.icns` from `public/app-icon.png` for the DMG volume
 * icon (Finder still needs ICNS; the `.app` uses Icon Composer). Requires
 * macOS `sips` and `iconutil`.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const electronRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePng = path.join(electronRoot, 'public/app-icon.png')
const destIcns = path.join(electronRoot, 'build/icon.icns')

const ICONSET_SIZES = [
  { name: 'icon_16x16.png', px: 16 },
  { name: 'icon_16x16@2x.png', px: 32 },
  { name: 'icon_32x32.png', px: 32 },
  { name: 'icon_32x32@2x.png', px: 64 },
  { name: 'icon_128x128.png', px: 128 },
  { name: 'icon_128x128@2x.png', px: 256 },
  { name: 'icon_256x256.png', px: 256 },
  { name: 'icon_256x256@2x.png', px: 512 },
  { name: 'icon_512x512.png', px: 512 },
  { name: 'icon_512x512@2x.png', px: 1024 },
]

/**
 * Resizes a PNG with `sips`.
 * @param src - Source PNG path.
 * @param dest - Destination PNG path.
 * @param px - Width and height in pixels.
 * @returns Nothing.
 */
function resizePng(src, dest, px) {
  execFileSync('sips', ['-z', String(px), String(px), src, '--out', dest], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

if (process.platform !== 'darwin') {
  throw new Error('build-mac-icns requires macOS (sips + iconutil)')
}

if (!fs.existsSync(sourcePng)) {
  throw new Error(`Missing GeoCRM Default icon: ${sourcePng}`)
}

fs.mkdirSync(path.join(electronRoot, 'build'), { recursive: true })

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'geocrm-icon-'))
const iconsetDir = path.join(tmpRoot, 'icon.iconset')
fs.mkdirSync(iconsetDir)
try {
  for (const { name, px } of ICONSET_SIZES) {
    resizePng(sourcePng, path.join(iconsetDir, name), px)
  }
  execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', destIcns], {
    stdio: 'inherit',
  })
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
}

console.info(`[icons] wrote ${path.relative(electronRoot, destIcns)}`)
