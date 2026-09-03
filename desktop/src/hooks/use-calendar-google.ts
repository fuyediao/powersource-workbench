/**
 * Optional Google Calendar connect / sync for personal scope.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { resolveAppPublicOrigin } from '@/config/deployment-urls'
import {
  disconnectGoogleCalendar,
  getGoogleCalendarAccount,
  googleAccountNeedsReauth,
  listGoogleCalendars,
  setGoogleCalendarSelection,
  startGoogleCalendarOAuth,
  syncGoogleCalendar,
  type CalendarGoogleAccount,
  type GoogleCalendarListItem,
} from '@/services/calendar-google-api'
import { openExternalUrl } from '@/utils/shared/api'

export interface UseCalendarGoogleResult {
  account: CalendarGoogleAccount | null
  googleCalendars: GoogleCalendarListItem[]
  needsReauth: boolean
  canWrite: boolean
  isLoading: boolean
  isConnecting: boolean
  isSyncing: boolean
  error: string | null
  refreshAccount: () => Promise<void>
  refreshGoogleCalendars: () => Promise<void>
  connect: () => Promise<boolean>
  cancelConnect: () => void
  sync: () => Promise<boolean>
  setSelection: (calendarIds: string[]) => Promise<boolean>
  disconnect: () => Promise<boolean>
}

/**
 * Manages Google Calendar OAuth, multi-calendar selection, and bidirectional sync.
 * @returns Account state and actions.
 */
export function useCalendarGoogle(): UseCalendarGoogleResult {
  const [account, setAccount] = useState<CalendarGoogleAccount | null>(null)
  const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendarListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const waitAbortRef = useRef(false)

  /**
   * Reloads the linked account from the API.
   * @param options - Pass quiet to avoid disabling Sync while refreshing.
   * @returns Nothing.
   */
  const refreshAccount = useCallback(async (options?: { quiet?: boolean }) => {
    if (!options?.quiet) {
      setIsLoading(true)
    }
    try {
      const next = await getGoogleCalendarAccount()
      setAccount(next)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'load_failed')
      setAccount(null)
    } finally {
      if (!options?.quiet) {
        setIsLoading(false)
      }
    }
  }, [])

  /**
   * Reloads Google calendarList entries when linked.
   * @returns Nothing.
   */
  const refreshGoogleCalendars = useCallback(async () => {
    try {
      const next = await getGoogleCalendarAccount()
      if (!next || next.status === 'disconnected') {
        setGoogleCalendars([])
        return
      }
      if (googleAccountNeedsReauth(next)) {
        setGoogleCalendars([])
        return
      }
      const items = await listGoogleCalendars()
      setGoogleCalendars(items)
    } catch {
      setGoogleCalendars([])
    }
  }, [])

  useEffect(() => {
    void refreshAccount()
  }, [refreshAccount])

  useEffect(() => {
    if (!account || googleAccountNeedsReauth(account)) {
      setGoogleCalendars([])
      return
    }
    void refreshGoogleCalendars()
  }, [account, refreshGoogleCalendars])

  /**
   * Cancels an in-progress OAuth poll.
   * @returns Nothing.
   */
  const cancelConnect = useCallback(() => {
    waitAbortRef.current = true
  }, [])

  /**
   * Opens Google OAuth and polls until the account appears or updates.
   * @returns Whether linking succeeded.
   */
  const connect = useCallback(async (): Promise<boolean> => {
    setIsConnecting(true)
    setError(null)
    waitAbortRef.current = false
    try {
      const before = await getGoogleCalendarAccount()
      const returnOrigin = resolveAppPublicOrigin()
      const url = await startGoogleCalendarOAuth(undefined, returnOrigin || undefined)
      await openExternalUrl(url)
      const deadline = Date.now() + 3 * 60 * 1000
      while (Date.now() < deadline && !waitAbortRef.current) {
        await new Promise((resolve) => {
          window.setTimeout(resolve, 2000)
        })
        if (waitAbortRef.current) {
          return false
        }
        const next = await getGoogleCalendarAccount()
        if (!next || next.status !== 'active' || !next.canWrite) {
          continue
        }
        if (
          !before ||
          next.updatedAt !== before.updatedAt ||
          next.email !== before.email ||
          before.status !== 'active' ||
          !before.canWrite
        ) {
          setAccount(next)
          await refreshGoogleCalendars()
          return true
        }
      }
      if (!waitAbortRef.current) {
        setError('connect_timeout')
        await refreshAccount({ quiet: true })
      }
      return false
    } catch (err) {
      setError(err instanceof Error ? err.message : 'connect_failed')
      return false
    } finally {
      setIsConnecting(false)
    }
  }, [refreshAccount, refreshGoogleCalendars])

  /**
   * Runs bidirectional sync for selected Google calendars.
   * @returns Whether sync succeeded.
   */
  const sync = useCallback(async (): Promise<boolean> => {
    setIsSyncing(true)
    setError(null)
    try {
      await syncGoogleCalendar()
      await refreshAccount({ quiet: true })
      await refreshGoogleCalendars()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'sync_failed')
      return false
    } finally {
      setIsSyncing(false)
    }
  }, [refreshAccount, refreshGoogleCalendars])

  /**
   * Updates Google calendar selection (mirrors via API). Does not sync events —
   * callers should sync only when newly selecting a calendar.
   * @param calendarIds - Selected Google calendar ids.
   * @returns Whether selection succeeded.
   */
  const setSelection = useCallback(
    async (calendarIds: string[]): Promise<boolean> => {
      setError(null)
      try {
        await setGoogleCalendarSelection(calendarIds)
        await refreshAccount({ quiet: true })
        await refreshGoogleCalendars()
        return true
      } catch (err) {
        setError(err instanceof Error ? err.message : 'selection_failed')
        return false
      }
    },
    [refreshAccount, refreshGoogleCalendars],
  )

  /**
   * Disconnects Google Calendar (keeps imported events).
   * @returns Whether disconnect succeeded.
   */
  const disconnect = useCallback(async (): Promise<boolean> => {
    setError(null)
    try {
      await disconnectGoogleCalendar()
      setAccount(null)
      setGoogleCalendars([])
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'disconnect_failed')
      return false
    }
  }, [])

  const needsReauth = googleAccountNeedsReauth(account)

  return {
    account,
    googleCalendars,
    needsReauth,
    canWrite: Boolean(account?.canWrite && account.status === 'active'),
    isLoading,
    isConnecting,
    isSyncing,
    error,
    refreshAccount,
    refreshGoogleCalendars,
    connect,
    cancelConnect,
    sync,
    setSelection,
    disconnect,
  }
}
