import { app, BrowserWindow, ipcMain, nativeTheme, net, protocol } from 'electron'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'workbench',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
])

/**
 * Registers a secure application protocol for production renderer files.
 * @returns Nothing.
 */
function registerApplicationProtocol(): void {
  const rendererRoot = path.resolve(currentDirectory, '../dist')
  protocol.handle('workbench', (request) => {
    const requestURL = new URL(request.url)
    const relativePath = decodeURIComponent(requestURL.pathname).replace(/^\/+/, '') || 'index.html'
    const filePath = path.resolve(rendererRoot, relativePath)
    if (filePath !== rendererRoot && !filePath.startsWith(rendererRoot + path.sep)) {
      return new Response('Invalid application path', { status: 400 })
    }
    return net.fetch(pathToFileURL(filePath).toString())
  })
}

/**
 * Creates the primary Workbench window.
 * @returns The newly created browser window.
 */
function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'PowerSource Workbench',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111315' : '#f4f6f7',
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(currentDirectory, 'preload.mjs'),
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void window.loadURL('workbench://app/index.html')
  }
  return window
}

app.setName('PowerSource Workbench')

app.whenReady().then(() => {
  registerApplicationProtocol()
  ipcMain.handle('workbench:get-system-locale', () => app.getLocale())
  createMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
