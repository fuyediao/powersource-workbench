import { dialog } from 'electron'

import { clashHostWindow } from './host'

/** Filter shape accepted from the renderer's `@tauri-apps/plugin-dialog` shim. */
type DialogFilter = { name?: string; extensions: string[] }

/**
 * Opens a native file/directory picker (`show_open_dialog`), backing the Tauri
 * `@tauri-apps/plugin-dialog` `open()` shim used by the backup and tray-icon pickers.
 * @param options - `directory` / `multiple` / `filters`, mirroring the Tauri plugin's options.
 * @returns Selected path, paths (when `multiple`), or null when cancelled.
 */
export async function showOpenDialog(options: {
  directory?: boolean
  multiple?: boolean
  filters?: DialogFilter[]
}): Promise<string | string[] | null> {
  const properties: Array<'openFile' | 'openDirectory' | 'multiSelections'> = [
    options.directory ? 'openDirectory' : 'openFile',
  ]
  if (options.multiple) {
    properties.push('multiSelections')
  }
  const win = clashHostWindow()
  const result = win
    ? await dialog.showOpenDialog(win, {
        properties,
        filters: options.filters?.map((f) => ({ name: f.name ?? 'File', extensions: f.extensions })),
      })
    : await dialog.showOpenDialog({
        properties,
        filters: options.filters?.map((f) => ({ name: f.name ?? 'File', extensions: f.extensions })),
      })
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  return options.multiple ? result.filePaths : result.filePaths[0]
}

/**
 * Opens a native save picker (`show_save_dialog`), backing the Tauri plugin's `save()` shim
 * used by the backup-export flow.
 * @param options - `defaultPath` / `filters`.
 * @returns Selected destination path, or null when cancelled.
 */
export async function showSaveDialog(options: {
  defaultPath?: string
  filters?: DialogFilter[]
}): Promise<string | null> {
  const win = clashHostWindow()
  const dialogOptions = {
    defaultPath: options.defaultPath,
    filters: options.filters?.map((f) => ({ name: f.name ?? 'File', extensions: f.extensions })),
  }
  const result = win ? await dialog.showSaveDialog(win, dialogOptions) : await dialog.showSaveDialog(dialogOptions)
  if (result.canceled || !result.filePath) {
    return null
  }
  return result.filePath
}
