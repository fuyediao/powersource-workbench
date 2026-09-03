/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEPLOYMENT_DOMAIN?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_WORKBENCH_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface WorkbenchBridge {
  platform: NodeJS.Platform
}

interface Window {
  workbench?: WorkbenchBridge
}
