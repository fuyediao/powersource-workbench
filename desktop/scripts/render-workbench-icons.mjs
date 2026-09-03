/**
 * Rasterizes Workbench brand SVGs to PNG, ICO, and ICNS used by the window,
 * tray, installer, and packaged builds. Tool packages install into a temp
 * directory so desktop `node_modules` stays untouched.
 */
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const electronRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(electronRoot, 'public')
const buildDir = path.join(electronRoot, 'build')
const toolsDir = path.join(os.tmpdir(), 'workbench-icon-tools')
const ICO_SIZES = [16, 32, 48, 256]
const TRAY_TEMPLATE_PX = 72
const TOOL_PACKAGES = ['@resvg/resvg-js', 'to-ico', 'png2icons']

/**
 * Installs rasterize helpers into a temp folder when they are missing.
 * @returns Require function bound to the temp tools folder.
 */
function loadToolRequire() {
  fs.mkdirSync(toolsDir, { recursive: true })
  const manifestPath = path.join(toolsDir, 'package.json')
  if (!fs.existsSync(manifestPath)) {
    fs.writeFileSync(manifestPath, `${JSON.stringify({ private: true, type: 'commonjs' })}\n`)
  }
  const missing = TOOL_PACKAGES.filter((name) => {
    try {
      createRequire(manifestPath).resolve(name)
      return false
    } catch {
      return true
    }
  })
  if (missing.length > 0) {
    execFileSync('npm', ['install', '--no-audit', '--no-fund', ...missing], {
      cwd: toolsDir,
      stdio: 'inherit',
      shell: true,
    })
  }
  return createRequire(manifestPath)
}

/**
 * Renders an SVG file to a PNG buffer.
 * @param requireTool - Require bound to the temp tools folder.
 * @param svgPath - Absolute SVG path.
 * @param width - Output width in pixels.
 * @returns PNG bytes.
 */
function renderSvg(requireTool, svgPath, width) {
  const { Resvg } = requireTool('@resvg/resvg-js')
  const svg = fs.readFileSync(svgPath)
  return new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
  })
    .render()
    .asPng()
}

const requireTool = loadToolRequire()
const toIco = requireTool('to-ico')
const png2icons = requireTool('png2icons')

const appIconSvg = path.join(publicDir, 'app-icon.svg')
const traySvg = path.join(publicDir, 'tray-icon.svg')
const appIconPng = path.join(publicDir, 'app-icon.png')
const faviconIco = path.join(publicDir, 'favicon.ico')
const trayTemplate = path.join(publicDir, 'tray-iconTemplate.png')
const destIcns = path.join(buildDir, 'icon.icns')

fs.mkdirSync(buildDir, { recursive: true })

const appPng = renderSvg(requireTool, appIconSvg, 1024)
fs.writeFileSync(appIconPng, appPng)
console.info(`[icons] wrote ${path.relative(electronRoot, appIconPng)}`)

const icoPngs = ICO_SIZES.map((size) => renderSvg(requireTool, appIconSvg, size))
fs.writeFileSync(faviconIco, await toIco(icoPngs))
console.info(`[icons] wrote ${path.relative(electronRoot, faviconIco)}`)

fs.writeFileSync(trayTemplate, renderSvg(requireTool, traySvg, TRAY_TEMPLATE_PX))
console.info(`[icons] wrote ${path.relative(electronRoot, trayTemplate)}`)

const icns = png2icons.createICNS(appPng, png2icons.BILINEAR, 0)
if (!icns) {
  throw new Error('png2icons failed to build icon.icns')
}
fs.writeFileSync(destIcns, icns)
console.info(`[icons] wrote ${path.relative(electronRoot, destIcns)}`)
