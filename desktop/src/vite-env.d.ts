/// <reference types="vite/client" />

interface WorkbenchBridge {
  platform: NodeJS.Platform
  getSystemLocale: () => Promise<string>
}

interface Window {
  workbench?: WorkbenchBridge
}
