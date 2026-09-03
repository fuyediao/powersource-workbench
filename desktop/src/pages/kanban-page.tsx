/**
 * Electron 看板 Function: Admin-style sidebar with workbench + opportunity board.
 */

import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { AdminShell } from '@/components/admin/admin-shell'
import { OpportunitiesBoardPane } from '@/components/admin/opportunities-board-pane'
import { DashboardPane } from '@/components/kanban/dashboard-pane'
import { SalesBoardPane } from '@/components/kanban/sales-board-pane'
import { KANBAN_NAV_GROUPS } from '@/constants/admin-modules'
import { writeAdminActivePath } from '@/utils/admin-active-path'
import {
  consumePendingKanbanPath,
  KANBAN_SIDEBAR_MODE_KEY,
  subscribeKanbanPathRequest,
} from '@/utils/kanban/kanban-open-request'
import { isOpportunityListPath } from '@/utils/opportunity-list-routes'

interface KanbanPageProps {
  userId: string
  user: User
}

/**
 * Board page host with Admin-style sidebar chrome.
 * @param props - Signed-in user.
 * @returns Kanban shell UI.
 */
export function KanbanPage({
  userId,
  user: _user,
}: KanbanPageProps) {
  const [requestedPath, setRequestedPath] = useState<string | null>(
    () => consumePendingKanbanPath(),
  )

  useEffect(() => {
    return subscribeKanbanPathRequest((path) => {
      setRequestedPath(path)
    })
  }, [])

  /**
   * Board card clicks open opportunity detail in Admin (list stays there).
   * @param path - Target path from the board pane.
   * @returns Nothing.
   */
  const openOpportunityInAdmin = useCallback(
    (path: string) => {
      if (!isOpportunityListPath(path)) {
        return
      }
      writeAdminActivePath(path)
    },
    [],
  )

  return (
    <AdminShell
      userId={userId}
      entryKey="desktop_kanban"
      navGroups={KANBAN_NAV_GROUPS}
      storageKey={KANBAN_SIDEBAR_MODE_KEY}
      titleKey="kanban.sidebar.title"
      initialPath={requestedPath}
    >
      {({ path }) => {
        const pathOnly = path
          ? ((path.split('#')[0] ?? path).split('?')[0] ?? path)
          : null
        if (pathOnly === '/kanban/opportunities') {
          return (
            <OpportunitiesBoardPane
              userId={userId}
              onNavigate={openOpportunityInAdmin}
            />
          )
        }
        if (pathOnly === '/kanban/sales') {
          return <SalesBoardPane />
        }
        return <DashboardPane />
      }}
    </AdminShell>
  )
}
