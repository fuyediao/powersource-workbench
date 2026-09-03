import { createContext, useContext, type ReactNode } from 'react'
import { useAppearance } from '@/hooks/use-appearance'

type AppearanceValue = ReturnType<typeof useAppearance>

const AppearanceContext = createContext<AppearanceValue | null>(null)

interface AppearanceProviderProps {
  userId: string
  children: ReactNode
}

/**
 * Provides a single appearance state tree for signed-in pages (avoids light-theme flash on tab switch).
 * @param props - Signed-in user id and children.
 * @returns Context provider.
 */
export function AppearanceProvider({ userId, children }: AppearanceProviderProps) {
  const appearance = useAppearance(userId)
  return (
    <AppearanceContext.Provider value={appearance}>{children}</AppearanceContext.Provider>
  )
}

/**
 * Reads appearance from the nearest {@link AppearanceProvider}.
 * @returns Shared appearance state and setters.
 */
export function useSharedAppearance(): AppearanceValue {
  const value = useContext(AppearanceContext)
  if (!value) {
    throw new Error('useSharedAppearance requires AppearanceProvider')
  }
  return value
}
