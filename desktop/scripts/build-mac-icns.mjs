/**
 * Rebuilds `build/icon.icns` from `public/app-icon.svg`. Same output as
 * `icons:rasterize` so Windows and macOS keep a true 16x16 raster instead of
 * a bilinear shrink from 1024px.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const electronRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const rasterize = path.join(electronRoot, 'scripts/render-workbench-icons.mjs')
const result = spawnSync(process.execPath, [rasterize], {
  cwd: electronRoot,
  stdio: 'inherit',
})
if (result.status !== 0) {
  process.exit(result.status ?? 1)
}
