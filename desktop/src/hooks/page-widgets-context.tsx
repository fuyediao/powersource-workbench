import { createContext, useContext, type ReactNode } from 'react'
import { usePageWidgets } from '@/hooks/use-page-widgets'

type PageWidgetsValue = ReturnType<typeof usePageWidgets>

const PageWidgetsContext = createContext<PageWidgetsValue | null>(null)

interface PageWidgetsProviderProps {
  userId: string
  children: ReactNode
}

/**
 * Provides a single home-widget visibility / aside-order store for signed-in
 * Home and Settings. Home stays mounted under a hidden tab while Settings runs,
 * so duplicate {@link usePageWidgets} hooks would otherwise diverge.
 * @param props - Signed-in user id and children.
 * @returns Context provider.
 */
export function PageWidgetsProvider({ userId, children }: PageWidgetsProviderProps) {
  const pageWidgets = usePageWidgets(userId)
  return (
    <PageWidgetsContext.Provider value={pageWidgets}>
      {children}
    </PageWidgetsContext.Provider>
  )
}

/**
 * Reads page-widget visibility and setters from {@link PageWidgetsProvider}.
 * @returns Shared widget state and actions.
 */
export function useSharedPageWidgets(): PageWidgetsValue {
  const value = useContext(PageWidgetsContext)
  if (!value) {
    throw new Error('useSharedPageWidgets requires PageWidgetsProvider')
  }
  return value
}
