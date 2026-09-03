/** OAuth deep-link scheme for Electron (must be on GoTrue allow-list). */
export const AUTH_DEEP_LINK_SCHEME = 'com.geocrm.electron'

/** OAuth deep-link host. Full URI: com.geocrm.electron://login-callback */
export const AUTH_DEEP_LINK_HOST = 'login-callback'

/** Full deep-link URI used as `next` for GET /auth/google. */
export const AUTH_DEEP_LINK_URI = `${AUTH_DEEP_LINK_SCHEME}://${AUTH_DEEP_LINK_HOST}`

/** IPC channel for network proxy method dispatch. */
export const NET_IPC_CHANNEL = 'geocrm:net'

/** IPC channel for auth helpers (open Google OAuth). */
export const AUTH_IPC_CHANNEL = 'geocrm:auth'

/** Event pushed from main when the OAuth deep link returns tokens. */
export const AUTH_SESSION_EVENT = 'geocrm:auth-session'

/** IPC channel for frameless window controls (minimize / maximize / close). */
export const WINDOW_IPC_CHANNEL = 'geocrm:window'

/** Event when maximized state changes. */
export const WINDOW_MAXIMIZED_EVENT = 'geocrm:window-maximized'

/** Event when the BrowserWindow gains or loses focus. */
export const WINDOW_FOCUS_EVENT = 'geocrm:window-focus'

/** Office editor kind persisted in the local workspace database. */
export type OfficeWorkspaceKind = 'docs' | 'sheets' | 'slides'

/** Lightweight office file row used by editor sidebars. */
export type OfficeWorkspaceFileSummary = {
  id: string
  kind: OfficeWorkspaceKind
  name: string
  color: string | null
  createdAt: number
  updatedAt: number
}

/** Complete persisted office file including its Univer snapshot. */
export type OfficeWorkspaceFile = OfficeWorkspaceFileSummary & {
  snapshot: Record<string, unknown>
}
