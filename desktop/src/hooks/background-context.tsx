import { createContext, useContext, type ReactNode } from 'react'
import { useBackground } from '@/hooks/use-background'
import { useBackgroundOpacity } from '@/hooks/use-background-opacity'

type BackgroundValue = ReturnType<typeof useBackground>
type BackgroundOpacityValue = ReturnType<typeof useBackgroundOpacity>

interface BackgroundContextValue {
  background: BackgroundValue
  opacity: BackgroundOpacityValue
}

const BackgroundContext = createContext<BackgroundContextValue | null>(null)

interface BackgroundProviderProps {
  userId: string
  children: ReactNode
}

/**
 * Provides a single wallpaper + opacity state tree for signed-in Home and Settings.
 * Avoids duplicate uploads/state when title-bar tabs keep Home mounted while Settings is open.
 * @param props - Signed-in user id and children.
 * @returns Context provider.
 */
export function BackgroundProvider({ userId, children }: BackgroundProviderProps) {
  const background = useBackground(userId)
  const opacity = useBackgroundOpacity(userId)
  return (
    <BackgroundContext.Provider value={{ background, opacity }}>
      {children}
    </BackgroundContext.Provider>
  )
}

/**
 * Reads wallpaper gallery state from the nearest {@link BackgroundProvider}.
 * @returns Shared wallpaper state and actions.
 */
export function useSharedBackground(): BackgroundValue {
  const value = useContext(BackgroundContext)
  if (!value) {
    throw new Error('useSharedBackground requires BackgroundProvider')
  }
  return value.background
}

/**
 * Reads wallpaper opacity from the nearest {@link BackgroundProvider}.
 * @returns Shared opacity state and setter.
 */
export function useSharedBackgroundOpacity(): BackgroundOpacityValue {
  const value = useContext(BackgroundContext)
  if (!value) {
    throw new Error('useSharedBackgroundOpacity requires BackgroundProvider')
  }
  return value.opacity
}
