import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_ASIDE_WIDGET_ORDER_LEFT,
  DEFAULT_ASIDE_WIDGET_ORDER_RIGHT,
  normalizeAsideWidgetRails,
  type AsideWidgetId,
  type AsideWidgetRails,
} from '@/constants/aside-widgets'
import {
  DEFAULT_PAGE_WIDGETS,
  fetchPageWidgets,
  saveAsideWidgetOrder,
  savePageWidgets,
  type PageWidgetVisibility,
} from '@/utils/home/library-api'

export type { PageWidgetVisibility, AsideWidgetId, AsideWidgetRails }

const DEFAULT_RAILS: AsideWidgetRails = {
  left: DEFAULT_ASIDE_WIDGET_ORDER_LEFT,
  right: DEFAULT_ASIDE_WIDGET_ORDER_RIGHT,
}

/**
 * Loads and updates home widget visibility and aside rails, persisting to local SQLite.
 * @param userId - Signed-in user id, or null while unauthenticated.
 * @returns Visibility flags, left/right orders, and setters.
 */
export function usePageWidgets(userId: string | null): {
  widgets: PageWidgetVisibility
  asideRails: AsideWidgetRails
  /** @deprecated Prefer asideRails.right; alias for older Settings callers. */
  asideOrder: AsideWidgetId[]
  setShowWeather: (visible: boolean) => void
  setShowMarkets: (visible: boolean) => void
  setShowNews: (visible: boolean) => void
  setShowTodo: (visible: boolean) => void
  setShowCurrency: (visible: boolean) => void
  setShowSchedule: (visible: boolean) => void
  setShowMail: (visible: boolean) => void
  setShowFocus: (visible: boolean) => void
  setShowApps: (visible: boolean) => void
  setPeekApps: (visible: boolean) => void
  setAsideRails: (rails: AsideWidgetRails) => void
  /** @deprecated Prefer setAsideRails. */
  setAsideOrder: (order: AsideWidgetId[]) => void
  restoreDefaults: () => void
} {
  const [widgets, setWidgets] = useState<PageWidgetVisibility>(DEFAULT_PAGE_WIDGETS)
  const [asideRails, setAsideRailsState] = useState<AsideWidgetRails>(DEFAULT_RAILS)
  const saveTimer = useRef<number | null>(null)
  const orderTimer = useRef<number | null>(null)
  const pendingWidgets = useRef<PageWidgetVisibility | null>(null)
  const pendingRails = useRef<AsideWidgetRails | null>(null)
  const userIdRef = useRef<string | null>(userId)
  userIdRef.current = userId

  useEffect(() => {
    if (!userId) {
      setWidgets(DEFAULT_PAGE_WIDGETS)
      setAsideRailsState(DEFAULT_RAILS)
      return
    }

    let active = true
    void fetchPageWidgets(userId)
      .then((next) => {
        if (active) {
          setWidgets(next.visibility)
          setAsideRailsState(next.asideRails)
        }
      })
      .catch(() => {
        if (active) {
          setWidgets(DEFAULT_PAGE_WIDGETS)
          setAsideRailsState(DEFAULT_RAILS)
        }
      })
    return () => {
      active = false
    }
  }, [userId])

  useEffect(() => {
    /**
     * Flushes debounced visibility / order writes to local SQLite immediately.
     * @returns Nothing.
     */
    function flushPendingSave(): void {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
      if (orderTimer.current !== null) {
        window.clearTimeout(orderTimer.current)
        orderTimer.current = null
      }
      const currentUserId = userIdRef.current
      if (!currentUserId) {
        pendingWidgets.current = null
        pendingRails.current = null
        return
      }
      if (pendingWidgets.current !== null) {
        const value = pendingWidgets.current
        pendingWidgets.current = null
        void savePageWidgets(currentUserId, value).catch(() => undefined)
      }
      if (pendingRails.current !== null) {
        const value = pendingRails.current
        pendingRails.current = null
        void saveAsideWidgetOrder(currentUserId, value).catch(() => undefined)
      }
    }

    window.addEventListener('pagehide', flushPendingSave)
    return () => {
      window.removeEventListener('pagehide', flushPendingSave)
      flushPendingSave()
    }
  }, [])

  /**
   * Updates visibility immediately and persists after a short debounce.
   * @param updater - Next flags, or a function of the current flags.
   * @returns Nothing.
   */
  function persist(
    updater: PageWidgetVisibility | ((current: PageWidgetVisibility) => PageWidgetVisibility),
  ): void {
    setWidgets((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater
      const signedInUserId = userIdRef.current
      if (!signedInUserId) {
        return next
      }
      pendingWidgets.current = next
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current)
      }
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null
        const value = pendingWidgets.current
        if (value === null) {
          return
        }
        pendingWidgets.current = null
        void savePageWidgets(signedInUserId, value).catch(() => undefined)
      }, 250)
      return next
    })
  }

  /**
   * Updates left/right aside rails immediately and persists after a short debounce.
   * @param rails - Next left/right widget ids.
   * @returns Nothing.
   */
  function setAsideRails(rails: AsideWidgetRails): void {
    const next = normalizeAsideWidgetRails(rails.left, rails.right)
    setAsideRailsState(next)
    const signedInUserId = userIdRef.current
    if (!signedInUserId) {
      return
    }
    pendingRails.current = next
    if (orderTimer.current !== null) {
      window.clearTimeout(orderTimer.current)
    }
    orderTimer.current = window.setTimeout(() => {
      orderTimer.current = null
      const value = pendingRails.current
      if (value === null) {
        return
      }
      pendingRails.current = null
      void saveAsideWidgetOrder(signedInUserId, value).catch(() => undefined)
    }, 250)
  }

  /**
   * Legacy single-list setter: treats the list as the right rail (left cleared).
   * @param order - Top-to-bottom widget ids for the right rail.
   * @returns Nothing.
   */
  function setAsideOrder(order: AsideWidgetId[]): void {
    setAsideRails({ left: [], right: order })
  }

  /**
   * Toggles the weather card.
   * @param visible - Whether the weather card should show.
   * @returns Nothing.
   */
  function setShowWeather(visible: boolean): void {
    persist((current) => ({ ...current, showWeather: visible }))
  }

  /**
   * Toggles the markets card.
   * @param visible - Whether the markets card should show.
   * @returns Nothing.
   */
  function setShowMarkets(visible: boolean): void {
    persist((current) => ({ ...current, showMarkets: visible }))
  }

  /**
   * Toggles the news briefing card.
   * @param visible - Whether the news card should show.
   * @returns Nothing.
   */
  function setShowNews(visible: boolean): void {
    persist((current) => ({ ...current, showNews: visible }))
  }

  /**
   * Toggles the todo list card.
   * @param visible - Whether the todo card should show.
   * @returns Nothing.
   */
  function setShowTodo(visible: boolean): void {
    persist((current) => ({ ...current, showTodo: visible }))
  }

  /**
   * Toggles the currency converter card.
   * @param visible - Whether the currency card should show.
   * @returns Nothing.
   */
  function setShowCurrency(visible: boolean): void {
    persist((current) => ({ ...current, showCurrency: visible }))
  }

  /**
   * Toggles the schedule reminder card.
   * @param visible - Whether the schedule card should show.
   * @returns Nothing.
   */
  function setShowSchedule(visible: boolean): void {
    persist((current) => ({ ...current, showSchedule: visible }))
  }

  /**
   * Toggles the mail unread reminder card.
   * @param visible - Whether the mail card should show.
   * @returns Nothing.
   */
  function setShowMail(visible: boolean): void {
    persist((current) => ({ ...current, showMail: visible }))
  }

  /**
   * Toggles the business-focus card.
   * @param visible - Whether the focus card should show.
   * @returns Nothing.
   */
  function setShowFocus(visible: boolean): void {
    persist((current) => ({ ...current, showFocus: visible }))
  }

  /**
   * Toggles the home apps panel. Clears the legacy peek-only flag (category rail removed).
   * @param visible - Whether the apps panel should show.
   * @returns Nothing.
   */
  function setShowApps(visible: boolean): void {
    persist((current) => ({
      ...current,
      showApps: visible,
      peekApps: false,
    }))
  }

  /**
   * Legacy peek-only setter; prefer {@link setShowApps} (rail is always hidden).
   * @param visible - Whether the apps panel should show without the rail flag.
   * @returns Nothing.
   */
  function setPeekApps(visible: boolean): void {
    persist((current) => ({ ...current, peekApps: visible }))
  }

  /**
   * Restores default widget visibility and aside rails for the signed-in user.
   * @returns Nothing.
   */
  function restoreDefaults(): void {
    persist(DEFAULT_PAGE_WIDGETS)
    setAsideRails(DEFAULT_RAILS)
  }

  return {
    widgets,
    asideRails,
    asideOrder: asideRails.right,
    setShowWeather,
    setShowMarkets,
    setShowNews,
    setShowTodo,
    setShowCurrency,
    setShowSchedule,
    setShowMail,
    setShowFocus,
    setShowApps,
    setPeekApps,
    setAsideRails,
    setAsideOrder,
    restoreDefaults,
  }
}
