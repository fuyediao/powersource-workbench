/**
 * Serves local Home wallpaper files to the renderer over workbench-wallpaper://.
 */

import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import { HOME_WALLPAPER_SCHEME } from '../shared/home-settings'
import { resolveHomeWallpaperFile } from './home-settings'

/**
 * Registers the privileged wallpaper scheme. Must run before `app.whenReady`.
 * @returns Nothing.
 */
export function registerHomeWallpaperScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: HOME_WALLPAPER_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ])
}

/**
 * Handles wallpaper protocol requests after the app is ready.
 * @returns Nothing.
 */
export function attachHomeWallpaperProtocol(): void {
  protocol.handle(HOME_WALLPAPER_SCHEME, async (request) => {
    const filePath = resolveHomeWallpaperFile(request.url)
    if (!filePath) {
      return new Response('Not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(filePath).href)
  })
}
