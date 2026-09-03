/**
 * Shared mail unread data for the home aside mail widget.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { fetchMailUnreadSummary } from '@/services/mail-api'

interface CrmAsideWidgetsState {
  mailUnreadTotal: number
  mailUnreadLoaded: boolean
  mailUnreadFetchFailed: boolean
  loading: boolean
  refresh: () => Promise<void>
}

const CrmAsideWidgetsContext = createContext<CrmAsideWidgetsState | null>(null)

interface CrmAsideWidgetsProviderProps {
  children: ReactNode
}

/**
 * Provides one shared mail-unread load for the home mail widget.
 * @param props - Children.
 * @returns Provider element.
 */
export function CrmAsideWidgetsProvider({
  children,
}: CrmAsideWidgetsProviderProps) {
  const [mailUnreadTotal, setMailUnreadTotal] = useState(0)
  const [mailUnreadLoaded, setMailUnreadLoaded] = useState(false)
  const [mailUnreadFetchFailed, setMailUnreadFetchFailed] = useState(false)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    setMailUnreadLoaded(false)
    setMailUnreadFetchFailed(false)
    let mailFailed = false
    try {
      const mailTotal = await fetchMailUnreadSummary().catch(() => {
        mailFailed = true
        return 0
      })
      setMailUnreadTotal(mailTotal)
      setMailUnreadFetchFailed(mailFailed)
    } finally {
      setMailUnreadLoaded(true)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo(
    () => ({
      mailUnreadTotal,
      mailUnreadLoaded,
      mailUnreadFetchFailed,
      loading,
      refresh,
    }),
    [mailUnreadTotal, mailUnreadLoaded, mailUnreadFetchFailed, loading, refresh],
  )

  return (
    <CrmAsideWidgetsContext.Provider value={value}>
      {children}
    </CrmAsideWidgetsContext.Provider>
  )
}

/**
 * Reads aside mail widget data from {@link CrmAsideWidgetsProvider}.
 * @returns Shared mail unread state.
 */
export function useCrmAsideWidgets(): CrmAsideWidgetsState {
  const ctx = useContext(CrmAsideWidgetsContext)
  if (!ctx) {
    throw new Error('useCrmAsideWidgets must be used within CrmAsideWidgetsProvider')
  }
  return ctx
}
