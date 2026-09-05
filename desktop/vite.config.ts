import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv, normalizePath, type Plugin } from 'vite'
import { workbenchLocaleResourcesPlugin } from './scripts/vite-plugin-workbench-locales'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { electronSimple } from 'vite-plugin-electron/multi-env'
import { notBundle } from 'vite-plugin-electron/plugin'
import svgr from 'vite-plugin-svgr'
import pkg from './package.json' with { type: 'json' }

const packageDir = path.dirname(fileURLToPath(import.meta.url))
/** Root of the in-tree Univer OSS engine (source, no npm `@univerjs/*`). See `src/lib/univer/ORIGIN.md`. */
const univerRoot = path.join(packageDir, 'src/lib/univer')
/** Root of the in-tree Schedule-X packages (published dist, no npm `@schedule-x/*`). See `src/lib/schedule-x/ORIGIN.md`. */
const scheduleXRoot = path.join(packageDir, 'src/lib/schedule-x')
/** Renderer `src/` root (`@/`). */
const srcRoot = path.join(packageDir, 'src')
const nodeModulesRoot = path.join(packageDir, 'node_modules')

/**
 * List installed `lodash.*` CJS packages under node_modules.
 * @returns Package names.
 */
function listLodashDotPackages(): string[] {
  if (!fs.existsSync(nodeModulesRoot)) {
    return []
  }
  return fs
    .readdirSync(nodeModulesRoot)
    .filter((name) => /^lodash\.[a-z]+$/.test(name))
}

/**
 * Serve every `lodash.*` package as an ESM default export (they ship CJS-only).
 * @returns Vite plugin.
 */
function shimLodashDotCjsDefault(): Plugin {
  const prefix = '\0workbench-lodash-cjs:'
  return {
    name: 'workbench:shim-lodash-dot-cjs',
    enforce: 'pre',
    resolveId(id) {
      if (/^lodash\.[a-z]+$/.test(id)) {
        const pkgDir = path.join(nodeModulesRoot, id)
        if (fs.existsSync(pkgDir)) {
          return `${prefix}${id}`
        }
      }
      return null
    },
    load(id) {
      if (!id.startsWith(prefix)) {
        return null
      }
      const name = id.slice(prefix.length)
      const pkgJsonPath = path.join(nodeModulesRoot, name, 'package.json')
      if (!fs.existsSync(pkgJsonPath)) {
        return null
      }
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as {
        main?: string
      }
      const mainRel = pkgJson.main ?? 'index.js'
      const mainAbs = path.join(nodeModulesRoot, name, mainRel)
      if (!fs.existsSync(mainAbs)) {
        return null
      }
      const cjs = fs.readFileSync(mainAbs, 'utf8')
      return `
const module = { exports: {} };
const exports = module.exports;
${cjs}
export default module.exports;
`
    },
  }
}

/**
 * Maps an upstream `@univerjs/<name>` package to its categorized folder under `src/lib/univer`.
 * @param name - Bare package name (`core`, `sheets-ui`, `slides`, …).
 * @returns Path relative to `univerRoot` (`shared/core`, `excel/sheets-ui`, `powerpoint/slides`, …).
 */
function univerPackageRel(name: string): string {
  if (name === 'docs' || name.startsWith('docs-')) {
    return `docs/${name}`
  }
  if (name === 'slides' || name.startsWith('slides-')) {
    return `powerpoint/${name}`
  }
  if (
    name === 'sheets' ||
    name.startsWith('sheets-') ||
    name === 'find-replace' ||
    name === 'data-validation'
  ) {
    return `excel/${name}`
  }
  return `shared/${name}`
}

/**
 * Resolves `@univerjs/<pkg>` (except npm `@univerjs/icons`) to the categorized in-tree engine.
 * @returns Vite plugin.
 */
function resolveUniverEngine(): Plugin {
  return {
    name: 'workbench:resolve-univer-engine',
    enforce: 'pre',
    resolveId(id) {
      const facade = /^@univerjs\/([a-z0-9-]+)\/facade$/.exec(id)
      if (facade?.[1]) {
        return path.join(univerRoot, univerPackageRel(facade[1]), 'facade/index.ts')
      }
      const css = /^@univerjs\/([a-z0-9-]+)\/lib\/index\.css$/.exec(id)
      if (css?.[1]) {
        return path.join(univerRoot, univerPackageRel(css[1]), 'lib/index.css')
      }
      const bare = /^@univerjs\/(?!icons$)([a-z0-9-]+)$/.exec(id)
      if (bare?.[1]) {
        return path.join(univerRoot, univerPackageRel(bare[1]), 'index.ts')
      }
      return null
    },
  }
}

/** In-tree Schedule-X package folders under `src/lib/schedule-x`. */
const SCHEDULE_X_PACKAGES = new Set([
  'calendar',
  'react',
  'events-service',
  'drag-and-drop',
  'resize',
  'shared',
  'date-picker',
  'translations',
  'theme-default',
])

/**
 * Resolves a Schedule-X source path that may omit an extension or end at a folder.
 * @param absBase - Absolute path without requiring a file extension.
 * @returns Existing file path, or `null` when nothing matches.
 */
function resolveScheduleXFile(absBase: string): string | null {
  if (fs.existsSync(absBase) && fs.statSync(absBase).isFile()) {
    return absBase
  }
  const candidates = [
    `${absBase}.tsx`,
    `${absBase}.ts`,
    `${absBase}.jsx`,
    `${absBase}.js`,
    path.join(absBase, 'index.tsx'),
    path.join(absBase, 'index.ts'),
    path.join(absBase, 'index.js'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate
    }
  }
  return null
}

/**
 * Resolves `@schedule-x/<pkg>` and deep `@schedule-x/<pkg>/src/...` to in-tree source.
 * Theme CSS maps to published `theme-default/lib/*.css` (like Univer `lib/index.css`).
 * @returns Vite plugin.
 */
function resolveScheduleXEngine(): Plugin {
  return {
    name: 'workbench:resolve-schedule-x',
    enforce: 'pre',
    resolveId(id) {
      const themeBare = id === '@schedule-x/theme-default'
      const themeSub = /^@schedule-x\/theme-default\/(.+)$/.exec(id)
      if (themeBare || themeSub) {
        const sub = themeSub?.[1]
        if (!sub || sub === 'dist/index.css' || sub === 'index.css') {
          return path.join(scheduleXRoot, 'theme-default/lib/index.css')
        }
        const distCss = /^dist\/(.+\.css)$/.exec(sub)
        if (distCss?.[1]) {
          return path.join(scheduleXRoot, 'theme-default/lib', distCss[1])
        }
        if (sub.endsWith('.css')) {
          return path.join(scheduleXRoot, 'theme-default/lib', path.basename(sub))
        }
        return null
      }

      // `@schedule-x/<pkg>/src` (package root) or `@schedule-x/<pkg>/src/...`
      const deep = /^@schedule-x\/([a-z0-9-]+)\/src(?:\/(.*))?$/.exec(id)
      if (deep?.[1] && SCHEDULE_X_PACKAGES.has(deep[1])) {
        const rest = deep[2]
        return resolveScheduleXFile(
          rest
            ? path.join(scheduleXRoot, deep[1], 'src', rest)
            : path.join(scheduleXRoot, deep[1], 'src', 'index'),
        )
      }

      const bare = /^@schedule-x\/([a-z0-9-]+)$/.exec(id)
      if (bare?.[1] && SCHEDULE_X_PACKAGES.has(bare[1])) {
        if (bare[1] === 'calendar') {
          return resolveScheduleXFile(
            path.join(scheduleXRoot, 'calendar', 'src', 'workbench-entry'),
          )
        }
        return resolveScheduleXFile(
          path.join(scheduleXRoot, bare[1], 'src', 'index'),
        )
      }
      return null
    },
  }
}

/**
 * Resolves a source path that may omit an extension or end at a folder.
 * @param absBase - Absolute path without requiring a file extension.
 * @returns Existing file path, or `null` when nothing matches.
 */
function resolveSrcFile(absBase: string): string | null {
  if (fs.existsSync(absBase) && fs.statSync(absBase).isFile()) {
    return normalizePath(absBase)
  }
  const candidates = [
    `${absBase}.tsx`,
    `${absBase}.ts`,
    `${absBase}.jsx`,
    `${absBase}.js`,
    `${absBase}.json`,
    `${absBase}.scss`,
    `${absBase}.css`,
    `${absBase}.svg`,
    path.join(absBase, 'index.tsx'),
    path.join(absBase, 'index.ts'),
    path.join(absBase, 'index.js'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return normalizePath(candidate)
    }
  }
  return null
}

/**
 * Resolves `@/` to `src/`.
 * @returns Vite plugin.
 */
function resolveSrcAlias(): Plugin {
  return {
    name: 'workbench:resolve-src-alias',
    enforce: 'pre',
    resolveId(id) {
      if (!id.startsWith('@/')) {
        return null
      }
      const suffix = id.slice(2)
      const queryIndex = suffix.indexOf('?')
      const filePart = queryIndex >= 0 ? suffix.slice(0, queryIndex) : suffix
      const query = queryIndex >= 0 ? suffix.slice(queryIndex) : ''
      const resolved = resolveSrcFile(path.join(srcRoot, filePart))
      return resolved ? `${resolved}${query}` : null
    },
  }
}

/**
 * Compiles Preact JSX for in-tree Schedule-X packages (calendar / shared / plugins).
 * The React adapter under `schedule-x/react` stays on the normal React JSX pipeline.
 * @returns Vite plugin.
 */
function scheduleXPreactJsx(): Plugin {
  const preactEngine =
    /[\\/]src[\\/]lib[\\/]schedule-x[\\/](?!react(?:[\\/]|$))/
  return {
    name: 'workbench:schedule-x-preact-jsx',
    enforce: 'pre',
    async transform(code, id) {
      const normalized = id.replaceAll('\\', '/')
      if (!preactEngine.test(normalized) || !/\.[jt]sx$/.test(normalized)) {
        return null
      }
      const { transformWithOxc } = await import('vite')
      return transformWithOxc(code, id, {
        lang: normalized.endsWith('.tsx') ? 'tsx' : 'ts',
        jsx: {
          runtime: 'automatic',
          importSource: 'preact',
        },
      })
    },
  }
}

/**
 * True when `id` is a raw Univer engine `.css` file (Tailwind v3 `@apply` source), not the
 * published `lib/index.css` Workbench actually loads.
 * @param id - Vite module id.
 * @returns Whether Tailwind v4 should skip the file.
 */
function isUniverEngineSourceCss(id: string): boolean {
  const normalized = id.replaceAll('\\', '/')
  if (!normalized.includes('/src/lib/univer/') || !normalized.endsWith('.css')) {
    return false
  }
  return !normalized.endsWith('/lib/index.css')
}

/**
 * Skips raw component CSS inside `src/lib/univer`.
 * @returns Vite plugin that no-ops matching CSS modules before Tailwind sees them.
 */
function skipUniverEngineSourceCss(): Plugin {
  return {
    name: 'workbench:skip-univer-engine-source-css',
    enforce: 'pre',
    load(id) {
      return isUniverEngineSourceCss(id) ? '' : null
    },
  }
}

const external = Object.keys(
  'dependencies' in pkg ? (pkg.dependencies as Record<string, string>) : {},
)

/** Workbench Electron renderer / Vite port (independent from workbench-web 4564). */
const RENDERER_PORT = 4580

const lodashDotPackages = listLodashDotPackages()

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const isServe = command === 'serve'
  const isBuild = command === 'build'
  const sourcemap = isServe || !!process.env.VSCODE_DEBUG
  const env = loadEnv(mode, packageDir, '')

  return {
    define: {
      // Vendored Aura reads this as a compile-time constant.
      AURA_VERSION: JSON.stringify(pkg.version),
      OS_PLATFORM: JSON.stringify(process.platform),
      // Bake public client env into the main process (packaged builds have no shell env).
      'process.env.VITE_DEPLOYMENT_DOMAIN': JSON.stringify(env.VITE_DEPLOYMENT_DOMAIN ?? ''),
      'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY ?? ''),
    },
    // Aura editor classes assign fields in `super()` then redeclare them;
    // ES2022 field init would wipe them to undefined (blank editor).
    esbuild: {
      tsconfigRaw: {
        compilerOptions: {
          useDefineForClassFields: false,
          // Univer engine (`src/lib/univer`) uses legacy parameter decorators for
          // its `@wendellhu/redi` dependency injection (e.g. `constructor(@ILogService ...)`).
          experimentalDecorators: true,
        },
      },
    },
    resolve: {
      alias: [
        {
          find: '@',
          replacement: srcRoot,
        },
      ],
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      include: [
        'mermaid',
        'katex',
        'highlight.js',
        'echarts',
        'abcjs',
        'flowchart.js',
        'markmap-lib',
        'markmap-view',
        '@viz-js/viz',
        'unified',
        'remark-parse',
        'remark-gfm',
        'remark-rehype',
        'rehype-stringify',
        ...lodashDotPackages,
      ],
      exclude: ['@plantuml/core/viz-global.js'],
    },
    server: {
      // Match Aura: bind IPv4 so Electron (`127.0.0.1`) and Windows localhost agree.
      host: '127.0.0.1',
      port: RENDERER_PORT,
      strictPort: true,
    },
    plugins: [
      workbenchLocaleResourcesPlugin(path.join(packageDir, 'src/i18n/locales')),
      shimLodashDotCjsDefault(),
      resolveSrcAlias(),
      resolveScheduleXEngine(),
      scheduleXPreactJsx(),
      svgr({ include: '**/*.svg?react' }),
      react({
        // Preact calendar engine JSX is handled by `scheduleXPreactJsx`.
        exclude: [
          /node_modules/,
          /src[\\/]lib[\\/]schedule-x[\\/](?!react(?:[\\/]|$))/,
        ],
      }),
      resolveUniverEngine(),
      skipUniverEngineSourceCss(),
      tailwindcss(),
      electronSimple({
        main: {
          input: 'electron/main/index.ts',
          plugins: [notBundle()],
          options: {
            build: {
              // Window / tray / Dock icons are loaded from renderer `dist/`
              // (`VITE_PUBLIC`). Copying `public/` into main/preload triples
              // those files in the packaged asar.
              copyPublicDir: false,
              sourcemap,
              minify: isBuild,
              outDir: 'dist-electron/main',
              rolldownOptions: {
                external,
              },
            },
          },
        },
        preload: {
          input: 'electron/preload/index.ts',
          plugins: [notBundle()],
          options: {
            build: {
              copyPublicDir: false,
              sourcemap: sourcemap ? 'inline' : undefined,
              minify: isBuild,
              outDir: 'dist-electron/preload',
              rolldownOptions: {
                external,
              },
            },
          },
        },
      }),
    ],
    clearScreen: false,
  }
})
