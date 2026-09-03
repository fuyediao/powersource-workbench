/**
 * NEXDOT Home Function page (CMS + dealer users).
 */

import type { User } from '@supabase/supabase-js'
import { AdminNexdotFlow } from '@/components/admin/admin-nexdot-flow'
import { AdminShell } from '@/components/admin/admin-shell'
import { NEXDOT_NAV_GROUPS } from '@/constants/admin-modules'

interface NexdotPageProps {
  userId: string
  user: User
}

/**
 * NEXDOT Home Function: storefront CMS and dealer users in the shared Admin shell
 * (legacy DB module keys remain `obm` / `obm_users`).
 * @param props - Signed-in user.
 * @returns NEXDOT UI.
 */
export function NexdotPage({ userId }: NexdotPageProps) {
  return (
    <AdminShell
      userId={userId}
      entryKey="desktop_nexdot"
      navGroups={NEXDOT_NAV_GROUPS}
      storageKey="geocrm-electron-nexdot-sidebar-mode"
      titleKey="nexdot.sidebar.title"
    >
      {({ path, moduleKey, writes, navigate }) => (
        <AdminNexdotFlow
          path={path}
          moduleKey={moduleKey}
          writes={writes}
          onNavigate={navigate}
        />
      )}
    </AdminShell>
  )
}
