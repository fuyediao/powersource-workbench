/**
 * Relaxes `@blocksuite/icons` engines so Node 24+ (project engines) does not
 * spam EBADENGINE. Upstream still declares `>=18.19.0 <23.0.0`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const electronRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const nodeModules = path.join(electronRoot, 'node_modules')
const relaxedEngines = { node: '>=18.19.0' }

/**
 * Patches one `@blocksuite/icons` package.json engines field.
 * @param pkgPath - Absolute path to package.json.
 * @returns True when the file was modified.
 */
function patchPackageJson(pkgPath) {
  let pkg
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  } catch {
    return false
  }
  if (pkg.name !== '@blocksuite/icons') {
    return false
  }
  if (pkg.engines?.node === relaxedEngines.node) {
    return false
  }
  pkg.engines = { ...pkg.engines, ...relaxedEngines }
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
  return true
}

/**
 * Recursively finds nested `@blocksuite/icons/package.json` under `node_modules`.
 * @param dir - Directory to search.
 * @param out - Collector.
 * @param depth - Recursion depth guard.
 */
function collectIconsPackages(dir, out, depth = 0) {
  if (depth > 24 || !fs.existsSync(dir)) {
    return
  }
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    if (entry.name === '.bin' || entry.name === 'electron' || entry.name === '.cache') {
      continue
    }
    const full = path.join(dir, entry.name)
    if (entry.name === 'icons' && path.basename(dir) === '@blocksuite') {
      const pkgPath = path.join(full, 'package.json')
      if (fs.existsSync(pkgPath)) {
        out.push(pkgPath)
      }
    }
    if (entry.name === 'node_modules' || entry.name === '@blocksuite' || entry.name.startsWith('@')) {
      collectIconsPackages(full, out, depth + 1)
      continue
    }
    // Descend into package folders that may nest another node_modules.
    const nestedNm = path.join(full, 'node_modules')
    if (fs.existsSync(nestedNm)) {
      collectIconsPackages(nestedNm, out, depth + 1)
    }
  }
}

const targets = []
collectIconsPackages(nodeModules, targets)
const unique = [...new Set(targets)]
let patched = 0
for (const pkgPath of unique) {
  if (patchPackageJson(pkgPath)) {
    patched += 1
  }
}
if (patched > 0) {
  console.log(`[patch-blocksuite-icons-engines] updated engines on ${patched} package(s)`)
}
