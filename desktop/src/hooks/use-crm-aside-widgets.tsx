/**
 * Shared CRM data for home aside widgets (schedule / focus / mail unread).
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
import { fetchDashboardBundle } from '@/services/dashboard-api'
import {
  listHomeScheduleFollowUps,
  type HomeScheduleItem,
} from '@/services/follow-ups-api'
import { fetchMailUnreadSummary } from '@/services/mail-api'

interface CrmAsideWidgetsState {
  schedule: HomeScheduleItem[]
  /** Total planned follow-ups (may exceed preview length). */
  scheduleTotal: number
  businessFocus: {
    recentLeads: number
    recentAccounts: number
    activeOpportunities: number
  }
  mailUnreadTotal: number
  mailUnreadLoaded: boolean
  mailUnreadFetchFailed: boolean
  loading: boolean
  refresh: () => Promise<void>
}

const CrmAsideWidgetsContext = createContext<CrmAsideWidgetsState | null>(null)

interface CrmAsideWidgetsProviderProps {
  /** Signed-in user id (schedule is owner-scoped). */
  userId: string
  children: ReactNode
}

/**
 * Provides one shared CRM data load for schedule / focus / mail home widgets.
 * @param props - User id and children.
 * @returns Provider element.
 */
export function CrmAsideWidgetsProvider({
  userId,
  children,
}: CrmAsideWidgetsProviderProps) {
  const [schedule, setSchedule] = useState<HomeScheduleItem[]>([])
  const [scheduleTotal, setScheduleTotal] = useState(0)
  const [businessFocus, setBusinessFocus] = useState({
    recentLeads: 0,
    recentAccounts: 0,
    activeOpportunities: 0,
  })
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
      const [scheduleResult, bundle, mailTotal] = await Promise.all([
        listHomeScheduleFollowUps(userId).catch(() => ({
          items: [] as HomeScheduleItem[],
          totalCount: 0,
        })),
        fetchDashboardBundle('week').catch(() => null),
        fetchMailUnreadSummary().catch(() => {
          mailFailed = true
          return 0
        }),
      ])
      setSchedule(scheduleResult.items)
      setScheduleTotal(scheduleResult.totalCount)
      if (bundle) {
        setBusinessFocus(bundle.businessFocus)
      } else {
        setBusinessFocus({
          recentLeads: 0,
          recentAccounts: 0,
          activeOpportunities: 0,
        })
      }
      setMailUnreadTotal(mailTotal)
      setMailUnreadFetchFailed(mailFailed)
    } catch {
      setSchedule([])
      setScheduleTotal(0)
      setBusinessFocus({
        recentLeads: 0,
        recentAccounts: 0,
        activeOpportunities: 0,
      })
    } finally {
      setMailUnreadLoaded(true)
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo(
    () => ({
      schedule,
      scheduleTotal,
      businessFocus,
      mailUnreadTotal,
      mailUnreadLoaded,
      mailUnreadFetchFailed,
      loading,
      refresh,
    }),
    [
      schedule,
      scheduleTotal,
      businessFocus,
      mailUnreadTotal,
      mailUnreadLoaded,
      mailUnreadFetchFailed,
      loading,
      refresh,
    ],
  )

  return (
    <CrmAsideWidgetsContext.Provider value={value}>
      {children}
    </CrmAsideWidgetsContext.Provider>
  )
}

/**
 * Reads CRM aside widget data from {@link CrmAsideWidgetsProvider}.
 * @returns Shared CRM aside widget state.
 */
export function useCrmAsideWidgets(): CrmAsideWidgetsState {
  const ctx = useContext(CrmAsideWidgetsContext)
  if (!ctx) {
    throw new Error('useCrmAsideWidgets must be used within CrmAsideWidgetsProvider')
  }
  return ctx
}
