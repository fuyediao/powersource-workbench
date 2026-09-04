/**
 * Rasterizes Workbench brand SVGs to PNG, ICO, and ICNS used by the window,
 * tray, installer, and packaged builds. Each ICNS size is drawn from the SVG
 * so the 16x16 slot stays the brand mark. Tool packages install into a temp
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
const TOOL_PACKAGES = ['@resvg/resvg-js', 'to-ico']
const ICNS_PNG_TYPES = [
  { type: 'icp4', px: 16 },
  { type: 'ic11', px: 32 },
  { type: 'icp5', px: 32 },
  { type: 'ic12', px: 64 },
  { type: 'ic07', px: 128 },
  { type: 'ic13', px: 256 },
  { type: 'ic08', px: 256 },
  { type: 'ic14', px: 512 },
  { type: 'ic09', px: 512 },
  { type: 'ic10', px: 1024 },
]

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
 * Rasterizes an SVG to a resvg image (PNG bytes and raw pixels).
 * @param requireTool - Require bound to the temp tools folder.
 * @param svgPath - Absolute SVG path.
 * @param width - Output width in pixels.
 * @returns Rendered image.
 */
function renderSvgImage(requireTool, svgPath, width) {
  const { Resvg } = requireTool('@resvg/resvg-js')
  const svg = fs.readFileSync(svgPath)
  return new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
  }).render()
}

/**
 * Renders an SVG file to a PNG buffer.
 * @param requireTool - Require bound to the temp tools folder.
 * @param svgPath - Absolute SVG path.
 * @param width - Output width in pixels.
 * @returns PNG bytes.
 */
function renderSvg(requireTool, svgPath, width) {
  return renderSvgImage(requireTool, svgPath, width).asPng()
}

/**
 * Copies one channel from packed RGBA pixels.
 * @param rgba - Row-major RGBA bytes.
 * @param channel - Channel index (0=R, 1=G, 2=B, 3=A).
 * @returns Channel bytes.
 */
function rgbaChannel(rgba, channel) {
  const out = Buffer.alloc(rgba.length / 4)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = rgba[i * 4 + channel]
  }
  return out
}

/**
 * Encodes a byte plane with Apple PackBits (used by ICNS is32).
 * @param plane - Uncompressed channel bytes.
 * @returns PackBits payload.
 */
function encodePackBits(plane) {
  const chunks = []
  let offset = 0
  while (offset < plane.length) {
    const take = Math.min(128, plane.length - offset)
    const header = Buffer.from([take - 1])
    chunks.push(header, plane.subarray(offset, offset + take))
    offset += take
  }
  return Buffer.concat(chunks)
}

/**
 * Builds a complete ICNS file from PNG buffers and a 16x16 RGBA mask.
 * @param pngByPx - Map of pixel size to PNG bytes.
 * @param rgba16 - 16x16 RGBA pixels for the legacy is32 / s8mk slots.
 * @returns ICNS bytes.
 */
function packIcns(pngByPx, rgba16) {
  const chunks = [
    {
      type: 'is32',
      data: Buffer.concat([
        encodePackBits(rgbaChannel(rgba16, 0)),
        encodePackBits(rgbaChannel(rgba16, 1)),
        encodePackBits(rgbaChannel(rgba16, 2)),
      ]),
    },
    { type: 's8mk', data: rgbaChannel(rgba16, 3) },
  ]
  for (const { type, px } of ICNS_PNG_TYPES) {
    const png = pngByPx.get(px)
    if (!png) {
      throw new Error(`missing ${px}px PNG for ICNS type ${type}`)
    }
    chunks.push({ type, data: png })
  }
  const parts = []
  let bodyLength = 0
  for (const chunk of chunks) {
    const header = Buffer.alloc(8)
    header.write(chunk.type, 0, 4, 'ascii')
    header.writeUInt32BE(chunk.data.length + 8, 4)
    parts.push(header, chunk.data)
    bodyLength += header.length + chunk.data.length
  }
  const file = Buffer.alloc(8 + bodyLength)
  file.write('icns', 0, 4, 'ascii')
  file.writeUInt32BE(file.length, 4)
  Buffer.concat(parts).copy(file, 8)
  return file
}

const requireTool = loadToolRequire()
const toIco = requireTool('to-ico')

const appIconSvg = path.join(publicDir, 'app-icon.svg')
const appIcon16Svg = path.join(publicDir, 'app-icon-16.svg')
const traySvg = path.join(publicDir, 'tray-icon.svg')
const appIconPng = path.join(publicDir, 'app-icon.png')
const faviconIco = path.join(publicDir, 'favicon.ico')
const trayTemplate = path.join(publicDir, 'tray-iconTemplate.png')
const destIcns = path.join(buildDir, 'icon.icns')

fs.mkdirSync(buildDir, { recursive: true })

const pngByPx = new Map()
for (const px of new Set([
  ...ICO_SIZES,
  ...ICNS_PNG_TYPES.map((entry) => entry.px),
])) {
  const sourceSvg = px <= 16 ? appIcon16Svg : appIconSvg
  pngByPx.set(px, renderSvg(requireTool, sourceSvg, px))
}

const appPng = pngByPx.get(1024)
if (!appPng) {
  throw new Error('missing 1024px app icon PNG')
}
fs.writeFileSync(appIconPng, appPng)
console.info(`[icons] wrote ${path.relative(electronRoot, appIconPng)}`)

const icoPngs = ICO_SIZES.map((size) => {
  const png = pngByPx.get(size)
  if (!png) {
    throw new Error(`missing ${size}px ICO PNG`)
  }
  return png
})
fs.writeFileSync(faviconIco, await toIco(icoPngs))
console.info(`[icons] wrote ${path.relative(electronRoot, faviconIco)}`)

fs.writeFileSync(trayTemplate, renderSvg(requireTool, traySvg, TRAY_TEMPLATE_PX))
console.info(`[icons] wrote ${path.relative(electronRoot, trayTemplate)}`)

const icon16 = renderSvgImage(requireTool, appIcon16Svg, 16)
if (icon16.width !== 16 || icon16.height !== 16 || icon16.pixels.length !== 16 * 16 * 4) {
  throw new Error('16x16 app icon raster is not 16x16 RGBA')
}
fs.writeFileSync(destIcns, packIcns(pngByPx, icon16.pixels))
console.info(`[icons] wrote ${path.relative(electronRoot, destIcns)}`)
