/**
 * Registers the active rail's pages and expand / collapse / hover / hide mode
 * with the macOS Sidebar and Sidebar control application menus.
 */

import { useEffect } from 'react'
import type { SidebarMode } from '@/hooks/use-sidebar-mode'
import {
  patchSidebarRailMenuHandlers,
  setSidebarRailMenuView,
  unregisterSidebarRailMenuHost,
  type SidebarRailMenuItem,
} from '@/utils/sidebar-rail-menu'

/**
 * Pushes sidebar nav rows and mode radios into the native application menu.
 * Unregisters when the host unmounts.
 * @param options - Mode, page list, and selection handlers.
 * @returns Nothing.
 */
export function useSidebarRailMenuHost(options: {
  mode: SidebarMode
  setMode: (mode: SidebarMode) => void
  items: SidebarRailMenuItem[]
  selectedId: string | null
  onSelectItem: (id: string) => void
}): void {
  const { mode, setMode, items, selectedId, onSelectItem } = options

  useEffect(() => {
    return () => unregisterSidebarRailMenuHost()
  }, [])

  useEffect(() => {
    patchSidebarRailMenuHandlers({
      setSidebarMode: setMode,
      selectItem: onSelectItem,
    })
  }, [onSelectItem, setMode])

  useEffect(() => {
    setSidebarRailMenuView({
      sidebarMode: mode,
      items,
      selectedId,
    })
  }, [items, mode, selectedId])
}
