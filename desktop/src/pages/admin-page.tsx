import type { User } from '@supabase/supabase-js'
import { useTranslation } from 'react-i18next'
import { AdminAgentFlow } from '@/components/admin/admin-agent-flow'
import { AdminCompetitorFlow } from '@/components/admin/admin-competitor-flow'
import { AdminCustomersFlow } from '@/components/admin/admin-customers-flow'
import { AdminFollowUpsFlow } from '@/components/admin/admin-follow-ups-flow'
import { AdminKolFlow } from '@/components/admin/admin-kol-flow'
import { AdminLeadFlow } from '@/components/admin/admin-lead-flow'
import { AdminOpportunityListFlow } from '@/components/admin/admin-opportunity-list-flow'
import { AdminShell } from '@/components/admin/admin-shell'
import { AdminVisitLogFlow } from '@/components/admin/admin-visit-log-flow'
import { ContactsListPane } from '@/components/admin/contacts-list-pane'
import { ADMIN_CRM_NAV_GROUPS } from '@/constants/admin-modules'
import { parseCustomerDrillPath } from '@/utils/customer-routes'
import { stripAdminPathQuery } from '@/utils/follow-up-routes'
import { parseVisitLogDrillPath } from '@/utils/visit-log-routes'

interface AdminPageProps {
  userId: string
  user: User
}

/**
 * CRM Admin Function page: classic CRM modules only (Orders / Products / NEXDOT /
 * T&E live in their own Home Function apps).
 * @param props - Signed-in user.
 * @returns Admin UI.
 */
export function AdminPage({ userId }: AdminPageProps) {
  const { t } = useTranslation()

  return (
    <AdminShell
      userId={userId}
      entryKey="desktop_admin"
      navGroups={ADMIN_CRM_NAV_GROUPS}
      storageKey="geocrm-electron-admin-sidebar-mode"
      titleKey="admin.sidebar.title"
    >
      {({ path, moduleKey, writes, navigate }) => {
        const pathOnly = path ? stripAdminPathQuery(path) : null
        const customerDrill = parseCustomerDrillPath(path)
        if (customerDrill || path === '/admin/customers' || moduleKey === 'customers') {
          return (
            <AdminCustomersFlow
              userId={userId}
              path={path}
              writes={writes}
              onNavigate={navigate}
            />
          )
        }
        if (path === '/admin/contacts' || moduleKey === 'contacts') {
          return <ContactsListPane onNavigate={navigate} />
        }
        const visitDrill = parseVisitLogDrillPath(path)
        if (
          visitDrill ||
          path === '/admin/visit-log' ||
          moduleKey === 'visit_log'
        ) {
          return (
            <AdminVisitLogFlow
              userId={userId}
              path={path}
              writes={writes}
              onNavigate={navigate}
            />
          )
        }
        if (pathOnly?.startsWith('/admin/leads') || moduleKey === 'leads') {
          return (
            <AdminLeadFlow
              userId={userId}
              path={path}
              writes={writes}
              onNavigate={navigate}
            />
          )
        }
        if (pathOnly?.startsWith('/admin/opportunities-list')) {
          return (
            <AdminOpportunityListFlow
              userId={userId}
              path={path}
              writes={writes}
              onNavigate={navigate}
            />
          )
        }
        if (
          pathOnly?.startsWith('/admin/follow-ups') ||
          moduleKey === 'follow_ups'
        ) {
          return (
            <AdminFollowUpsFlow
              userId={userId}
              path={path}
              writes={writes}
              onNavigate={navigate}
            />
          )
        }
        if (pathOnly?.startsWith('/admin/kol') || moduleKey === 'kol') {
          return (
            <AdminKolFlow
              userId={userId}
              path={path}
              writes={writes}
              onNavigate={navigate}
            />
          )
        }
        if (pathOnly?.startsWith('/admin/agent') || moduleKey === 'agent') {
          return (
            <AdminAgentFlow path={path} writes={writes} onNavigate={navigate} />
          )
        }
        if (
          pathOnly?.startsWith('/admin/competitor-list') ||
          moduleKey === 'competitor_map'
        ) {
          return (
            <AdminCompetitorFlow
              path={path}
              writes={writes}
              onNavigate={navigate}
            />
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
