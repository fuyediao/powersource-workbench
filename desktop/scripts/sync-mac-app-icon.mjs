/**
 * Copies macos-M Icon Composer `AppIcon.icon` into `build/icon.icon` and
 * rasterizes Foreground.svg onto a light squircle `public/app-icon.png`.
 * `dock.setIcon` does not clip a square, so the plate must already be rounded.
 * Windows `public/favicon.ico` is left unchanged.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const electronRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const macosIconDir = path.join(
  electronRoot,
  '../workbench-macos-M/workbench-macos-M/AppIcon.icon',
)
const destIconDir = path.join(electronRoot, 'build/icon.icon')
const publicDir = path.join(electronRoot, 'public')
const swiftScript = path.join(electronRoot, 'scripts/sync-mac-app-icon.swift')
const assetsDir = path.join(macosIconDir, 'Assets')

if (process.platform !== 'darwin') {
  throw new Error('sync-mac-app-icon requires macOS (Swift + AppKit)')
}

if (!fs.existsSync(path.join(macosIconDir, 'icon.json'))) {
  throw new Error(`Missing macos-M Icon Composer bundle: ${macosIconDir}`)
}

fs.mkdirSync(path.join(electronRoot, 'build'), { recursive: true })
fs.rmSync(destIconDir, { recursive: true, force: true })
fs.cpSync(macosIconDir, destIconDir, { recursive: true })
console.info(`[icons] copied ${path.relative(electronRoot, destIconDir)}`)

execFileSync(
  'swift',
  [
    swiftScript,
    path.join(assetsDir, 'Foreground.svg'),
    publicDir,
  ],
  { stdio: 'inherit' },
)
