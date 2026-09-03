import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const electronRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const mihomoRoot = path.join(electronRoot, 'src/lib/mihomo')
const binDir = path.join(mihomoRoot, 'bin')
const outName = process.platform === 'win32' ? 'mihomo.exe' : 'mihomo'
const outPath = path.join(binDir, outName)
const force = process.argv.includes('--force') || process.argv.includes('-f')
const optional = process.argv.includes('--optional')

/**
 * Logs a prebuild status line.
 * @param message - Message.
 */
function log(message) {
  console.log(`[clash:prebuild] ${message}`)
}

/**
 * Compiles in-tree MetaCubeX Mihomo (`src/lib/mihomo`) into `bin/`.
 */
function buildMihomo() {
  if (!force && fs.existsSync(outPath)) {
    log(`using ${outPath}`)
    return
  }
  fs.mkdirSync(binDir, { recursive: true })
  log(`go build ${path.relative(electronRoot, outPath)}`)
  const result = spawnSync(
    'go',
    [
      'build',
      '-tags',
      'with_gvisor',
      '-trimpath',
      '-ldflags',
      '-s -w -buildid=',
      '-o',
      outPath,
      '.',
    ],
    {
      cwd: mihomoRoot,
      env: { ...process.env, CGO_ENABLED: '0' },
      stdio: 'inherit',
    },
  )
  if (result.error) {
    throw new Error(
      `Go is required to build in-tree Mihomo (${result.error.message}).`,
    )
  }
  if (result.status !== 0) {
    throw new Error(`go build exited with code ${result.status ?? 'unknown'}`)
  }
  if (!fs.existsSync(outPath)) {
    throw new Error(`go build did not write ${outPath}`)
  }
}

try {
  buildMihomo()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  if (optional) {
    console.warn(`[clash:prebuild] ${message}`)
    process.exit(0)
  }
  console.error(`[clash:prebuild] ${message}`)
  process.exit(1)
}
