import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import {
  emptyLocaleTrees,
  mergeLocaleFile,
  type LocaleTree,
} from '../src/i18n/merge-locale-tree'

const VIRTUAL_ID = 'virtual:workbench-i18n-resources'
const RESOLVED_ID = `\0${VIRTUAL_ID}`

/**
 * Recursively lists JSON files under `dir`.
 * @param dir - Directory to walk.
 * @returns Absolute file paths.
 */
function listJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return []
  }
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...listJsonFiles(full))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.json')) {
      out.push(full)
    }
  }
  return out
}

/**
 * Reads every non-Clash locale JSON from disk and builds i18next resource trees.
 * @param localesDir - Absolute `src/i18n/locales` directory.
 * @returns i18next `resources` object.
 */
function buildResourceModule(localesDir: string): string {
  const trees = emptyLocaleTrees()
  const files = listJsonFiles(localesDir)
  if (files.length === 0) {
    throw new Error(`workbench locales: no JSON files under ${localesDir}`)
  }
  for (const file of files) {
    const rel = path.relative(localesDir, file).replaceAll('\\', '/')
    const slash = rel.indexOf('/')
    if (slash <= 0) {
      continue
    }
    const folder = rel.slice(0, slash)
    const rest = rel.slice(slash + 1).replace(/\.json$/u, '')
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
    mergeLocaleFile(trees, folder, rest, parsed)
  }
  assertForceUpdateKeys(trees.en)
  const resources = {
    en: { translation: trees.en },
    'zh-TW': { translation: trees['zh-TW'] },
    'zh-CN': { translation: trees['zh-CN'] },
  }
  return `export default ${JSON.stringify(resources)}`
}

/**
 * Fails the build when the force-update overlay strings are missing.
 * @param english - Merged English tree.
 * @returns Nothing.
 */
function assertForceUpdateKeys(english: LocaleTree): void {
  const settings = english.settings
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('workbench locales: missing settings namespace in en-us')
  }
  const updates = (settings as LocaleTree).updates
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    throw new Error('workbench locales: missing settings.updates in en-us')
  }
  const title = (updates as LocaleTree).forceTitle
  if (typeof title !== 'string' || title.length === 0) {
    throw new Error('workbench locales: missing settings.updates.forceTitle in en-us')
  }
}

/**
 * Inlines every app locale JSON into the renderer bundle at compile time so
 * packaged `file://` builds never fetch extra chunks (those 404 and `t()` shows raw keys).
 * @param localesDir - Absolute path to `src/i18n/locales`.
 * @returns Vite plugin.
 */
export function workbenchLocaleResourcesPlugin(localesDir: string): Plugin {
  const localesRoot = path.resolve(localesDir)
  return {
    name: 'workbench:locale-resources',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null
    },
    load(id) {
      if (id !== RESOLVED_ID) {
        return null
      }
      return buildResourceModule(localesDir)
    },
    buildStart() {
      for (const file of listJsonFiles(localesDir)) {
        this.addWatchFile(file)
      }
    },
    handleHotUpdate(ctx) {
      const changed = path.resolve(ctx.file)
      const underLocales =
        changed === localesRoot ||
        changed.startsWith(`${localesRoot}${path.sep}`)
      if (!underLocales || !changed.endsWith('.json')) {
        return
      }
      const virtualModule = ctx.server.moduleGraph.getModuleById(RESOLVED_ID)
      if (!virtualModule) {
        return
      }
      ctx.server.moduleGraph.invalidateModule(virtualModule)
      return [virtualModule, ...ctx.modules]
    },
  }
}
