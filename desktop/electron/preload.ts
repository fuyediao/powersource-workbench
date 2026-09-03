import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('workbench', {
  platform: process.platform,
  getSystemLocale: (): Promise<string> => ipcRenderer.invoke('workbench:get-system-locale'),
})
