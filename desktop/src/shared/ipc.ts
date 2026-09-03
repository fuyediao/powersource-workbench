/** OAuth deep-link scheme for Electron (must be on GoTrue allow-list). */
export const AUTH_DEEP_LINK_SCHEME = 'com.workbench.electron'

/** OAuth deep-link host. Full URI: com.workbench.electron://login-callback */
export const AUTH_DEEP_LINK_HOST = 'login-callback'

/** Full deep-link URI used as `next` for GET /auth/google. */
export const AUTH_DEEP_LINK_URI = `${AUTH_DEEP_LINK_SCHEME}://${AUTH_DEEP_LINK_HOST}`

/** IPC channel for network proxy method dispatch. */
export const NET_IPC_CHANNEL = 'workbench:net'

/** IPC channel for auth helpers (open Google OAuth). */
export const AUTH_IPC_CHANNEL = 'workbench:auth'

/** Event pushed from main when the OAuth deep link returns tokens. */
export const AUTH_SESSION_EVENT = 'workbench:auth-session'

/** IPC channel for frameless window controls (minimize / maximize / close). */
export const WINDOW_IPC_CHANNEL = 'workbench:window'

/** Event when maximized state changes. */
export const WINDOW_MAXIMIZED_EVENT = 'workbench:window-maximized'

/** Event when the BrowserWindow gains or loses focus. */
export const WINDOW_FOCUS_EVENT = 'workbench:window-focus'

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
