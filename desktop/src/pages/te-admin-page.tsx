import type { User } from '@supabase/supabase-js'
import { useTranslation } from 'react-i18next'
import { AdminShell } from '@/components/admin/admin-shell'
import { TeApplicationsFlow } from '@/components/admin/te-applications-flow'
import { TeCommunityFlow } from '@/components/admin/te-community-flow'
import { TeMediaFlow } from '@/components/admin/te-media-flow'
import { TeMarketingPane } from '@/components/admin/te-marketing-pane'
import { TePartnerDepartmentsPane } from '@/components/admin/te-partner-departments-pane'
import { TeUsersFlow } from '@/components/admin/te-users-flow'
import { TE_ADMIN_NAV_GROUPS } from '@/constants/admin-modules'
import { useDesktopDomainWritesContext } from '@/hooks/use-desktop-domain-writes'
import { parseTeApplicationDrillPath } from '@/utils/te-application-routes'
import { parseTeCommunityDrillPath } from '@/utils/te-community-routes'
import { parseTeMediaDrillPath } from '@/utils/te-media-routes'
import { parseTeUserDrillPath } from '@/utils/te-user-routes'

interface TeAdminPageProps {
  userId: string
  user: User
}

/**
 * Bind the partner-departments pane to its dedicated desktop write resource.
 * @returns Partner-departments management pane.
 */
function TePartnerDepartmentsRoute() {
  const writes = useDesktopDomainWritesContext()
  return <TePartnerDepartmentsPane writes={writes.capabilitiesFor('departments')} />
}

/**
 * Strip query/hash from a T&E Admin shell path.
 * @param path - Raw shell path.
 * @returns Path without query or hash.
 */
function teAdminPathOnly(path: string | null): string | null {
  if (!path) {
    return null
  }
  return (path.split('#')[0] ?? path).split('?')[0] ?? path
}

/**
 * T&E Admin Home Function (`workbench://te-admin`): applications / users /
 * community / marketing / partner departments / media — not the Nextorch
 * `workbench://te` site picker.
 * @param props - Signed-in user.
 * @returns T&E Admin UI.
 */
export function TeAdminPage({ userId }: TeAdminPageProps) {
  const { t } = useTranslation()

  return (
    <AdminShell
      userId={userId}
      entryKey="desktop_te_admin"
      navGroups={TE_ADMIN_NAV_GROUPS}
      storageKey="workbench-electron-te-admin-sidebar-mode"
      titleKey="teAdmin.sidebar.title"
    >
      {({ path, moduleKey, writes, navigate }) => {
        const pathOnly = teAdminPathOnly(path)

        if (pathOnly === '/te-admin/marketing') {
          return <TeMarketingPane onNavigate={navigate} />
        }

        if (pathOnly === '/te-admin/partner-departments') {
          return <TePartnerDepartmentsRoute />
        }

        if (
          parseTeUserDrillPath(path) ||
          pathOnly === '/te-admin/users' ||
          moduleKey === 'te_users'
        ) {
          return <TeUsersFlow path={path} writes={writes} onNavigate={navigate} />
        }

        if (
          parseTeCommunityDrillPath(path) ||
          pathOnly === '/te-admin/community' ||
          moduleKey === 'te_community'
        ) {
          return <TeCommunityFlow path={path} writes={writes} onNavigate={navigate} />
        }

        if (
          parseTeMediaDrillPath(path) ||
          pathOnly === '/te-admin/media' ||
          moduleKey === 'media'
        ) {
          return <TeMediaFlow path={path} writes={writes} onNavigate={navigate} />
        }

        if (
          parseTeApplicationDrillPath(path) ||
          pathOnly === '/te-admin' ||
          moduleKey === 'te'
        ) {
          return (
            <TeApplicationsFlow path={path} writes={writes} onNavigate={navigate} />
          )
        }

        return (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            {writes?.readOnly ? (
              <p className="text-sm font-semibold text-muted">
                {t('admin.moduleAccess.readOnly')}
              </p>
            ) : null}
            <p className="text-sm font-medium text-muted">{t('admin.content.comingSoon')}</p>
          </div>
        )
      }}
    </AdminShell>
  )
}
