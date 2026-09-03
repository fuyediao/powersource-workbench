import { createContext, useContext, type ReactNode } from 'react'
import { usePanelOpacity } from '@/hooks/use-panel-opacity'
import { useSearchPanelOpacity } from '@/hooks/use-search-panel-opacity'

type PanelOpacityValue = ReturnType<typeof usePanelOpacity>
type SearchPanelOpacityValue = ReturnType<typeof useSearchPanelOpacity>

interface GlassOpacityContextValue {
  panel: PanelOpacityValue
  searchPanel: SearchPanelOpacityValue
}

const GlassOpacityContext = createContext<GlassOpacityContextValue | null>(null)

interface GlassOpacityProviderProps {
  userId: string
  children: ReactNode
}

/**
 * Loads and applies glass panel / search-panel opacity for the whole signed-in shell
 * (Home stays mounted; Settings must not be the only place that sets `--panel-alpha`).
 * @param props - Signed-in user id and children.
 * @returns Context provider.
 */
export function GlassOpacityProvider({ userId, children }: GlassOpacityProviderProps) {
  const panel = usePanelOpacity(userId)
  const searchPanel = useSearchPanelOpacity(userId)
  return (
    <GlassOpacityContext.Provider value={{ panel, searchPanel }}>
      {children}
    </GlassOpacityContext.Provider>
  )
}

/**
 * Reads shared glass panel opacity from {@link GlassOpacityProvider}.
 * @returns Opacity state and setter (`--panel-alpha`).
 */
export function useSharedPanelOpacity(): PanelOpacityValue {
  const value = useContext(GlassOpacityContext)
  if (!value) {
    throw new Error('useSharedPanelOpacity requires GlassOpacityProvider')
  }
  return value.panel
}

/**
 * Reads shared search-suggestions panel opacity from {@link GlassOpacityProvider}.
 * @returns Opacity state and setter (`--search-panel-alpha`).
 */
export function useSharedSearchPanelOpacity(): SearchPanelOpacityValue {
  const value = useContext(GlassOpacityContext)
  if (!value) {
    throw new Error('useSharedSearchPanelOpacity requires GlassOpacityProvider')
  }
  return value.searchPanel
}
