import { shell } from 'electron'
import { resolveGeocrmApiBaseUrl } from '../net/api-client'
import { AUTH_DEEP_LINK_URI } from '../../shared/ipc'

/**
 * Opens the system browser at geocrm-api Google OAuth with Electron deep-link return.
 * @returns Nothing.
 */
export async function openGoogleSignIn(): Promise<void> {
  const api = resolveGeocrmApiBaseUrl()
  if (!api) {
    throw new Error('VITE_DEPLOYMENT_DOMAIN is not set')
  }
  const next = encodeURIComponent(AUTH_DEEP_LINK_URI)
  const url = `${api}/auth/google?next=${next}`
  await shell.openExternal(url)
}
