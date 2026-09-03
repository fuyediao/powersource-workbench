/**
 * Notable open-source components shipped with Workbench.
 * Package names, SPDX licenses, and homepages stay in source (not i18n).
 */
export interface OpenSourceNotice {
  id: string
  name: string
  license: string
  homepage: string
}

/**
 * Direct npm production dependency notice generated from installed package.json.
 */
export interface OpenSourceNpmNotice {
  name: string
  license: string
  homepage: string
}

/**
 * In-tree / runtime components called out with a short role description.
 */
export const BUNDLED_OPEN_SOURCE_NOTICES: readonly OpenSourceNotice[] = [
  {
    id: 'workbench',
    name: 'PowerSource Workbench',
    license: 'AGPL-3.0',
    homepage: '',
  },
  {
    id: 'electron',
    name: 'Electron',
    license: 'MIT',
    homepage: 'https://www.electronjs.org/',
  },
  {
    id: 'chromium',
    name: 'Chromium',
    license: 'BSD-3-Clause',
    homepage: 'https://www.chromium.org/',
  },
  {
    id: 'nodejs',
    name: 'Node.js',
    license: 'MIT',
    homepage: 'https://nodejs.org/',
  },
  {
    id: 'v8',
    name: 'V8',
    license: 'BSD-3-Clause',
    homepage: 'https://v8.dev/',
  },
  {
    id: 'react',
    name: 'React',
    license: 'MIT',
    homepage: 'https://react.dev/',
  },
  {
    id: 'atlas',
    name: 'Atlas Start',
    license: 'AGPL-3.0',
    homepage: '',
  },
  {
    id: 'aura',
    name: 'Aura',
    license: 'AGPL-3.0',
    homepage: '',
  },
  {
    id: 'onlyOffice',
    name: 'ONLYOFFICE Document Server',
    license: 'AGPL-3.0',
    homepage: 'https://github.com/ONLYOFFICE/DocumentServer',
  },
  {
    id: 'hermes',
    name: 'Hermes Agent',
    license: 'MIT',
    homepage: 'https://github.com/NousResearch/hermes-agent',
  },
  {
    id: 'codex',
    name: 'Codex',
    license: 'Apache-2.0',
    homepage: 'https://github.com/openai/codex',
  },
  {
    id: 'blocksuite',
    name: 'BlockSuite',
    license: 'MPL-2.0',
    homepage: 'https://github.com/toeverything/blocksuite',
  },
  {
    id: 'univer',
    name: 'Univer',
    license: 'Apache-2.0',
    homepage: 'https://github.com/dream-num/univer',
  },
  {
    id: 'scheduleX',
    name: 'Schedule-X',
    license: 'MIT',
    homepage: 'https://github.com/schedule-x/schedule-x',
  },
  {
    id: 'monaco',
    name: 'Monaco Editor',
    license: 'MIT',
    homepage: 'https://microsoft.github.io/monaco-editor/',
  },
  {
    id: 'mermaid',
    name: 'Mermaid',
    license: 'MIT',
    homepage: 'https://mermaid.js.org/',
  },
  {
    id: 'leaflet',
    name: 'Leaflet',
    license: 'BSD-2-Clause',
    homepage: 'https://leafletjs.com/',
  },
  {
    id: 'i18next',
    name: 'i18next',
    license: 'MIT',
    homepage: 'https://www.i18next.com/',
  },
  {
    id: 'supabase',
    name: 'supabase-js',
    license: 'MIT',
    homepage: 'https://github.com/supabase/supabase-js',
  },
  {
    id: 'yjs',
    name: 'Yjs',
    license: 'MIT',
    homepage: 'https://github.com/yjs/yjs',
  },
  {
    id: 'mui',
    name: 'MUI',
    license: 'MIT',
    homepage: 'https://mui.com/',
  },
  {
    id: 'radix',
    name: 'Radix UI',
    license: 'MIT',
    homepage: 'https://www.radix-ui.com/',
  },
  {
    id: 'preact',
    name: 'Preact',
    license: 'MIT',
    homepage: 'https://preactjs.com/',
  },
  {
    id: 'axios',
    name: 'Axios',
    license: 'MIT',
    homepage: 'https://axios-http.com/',
  },
  {
    id: 'echarts',
    name: 'Apache ECharts',
    license: 'Apache-2.0',
    homepage: 'https://echarts.apache.org/',
  },
  {
    id: 'katex',
    name: 'KaTeX',
    license: 'MIT',
    homepage: 'https://katex.org/',
  },
  {
    id: 'highlightjs',
    name: 'highlight.js',
    license: 'BSD-3-Clause',
    homepage: 'https://highlightjs.org/',
  },
  {
    id: 'lucide',
    name: 'Lucide',
    license: 'ISC',
    homepage: 'https://lucide.dev/',
  },
]

/**
 * Direct production dependencies already described in {@link BUNDLED_OPEN_SOURCE_NOTICES}.
 */
const BUNDLED_NPM_NAMES = new Set([
  '@blocksuite/affine',
  '@supabase/supabase-js',
  'axios',
  'echarts',
  'highlight.js',
  'i18next',
  'katex',
  'leaflet',
  'mermaid',
  'monaco-editor',
  'preact',
  'react',
  'react-dom',
  'react-i18next',
  'yjs',
])

/**
 * Whether an npm notice is already covered by the bundled list.
 * @param name - Package name.
 * @returns True when the package should not be repeated in the npm list.
 */
export function isBundledNpmNotice(name: string): boolean {
  return BUNDLED_NPM_NAMES.has(name)
}
