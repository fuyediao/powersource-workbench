import type { User } from '@supabase/supabase-js'
import { AdminProductsFlow } from '@/components/admin/admin-products-flow'
import { AdminShell } from '@/components/admin/admin-shell'
import { PRODUCTS_NAV_GROUPS } from '@/constants/admin-modules'

interface ProductsPageProps {
  userId: string
  user: User
}

/**
 * Products Home Function: Product Electronic Catalog, NEXDOT Products, and
 * T&E Evaluation Products in the shared Admin shell.
 * @param props - Signed-in user.
 * @returns Products UI.
 */
export function ProductsPage({ userId }: ProductsPageProps) {
  return (
    <AdminShell
      userId={userId}
      entryKey="desktop_products"
      navGroups={PRODUCTS_NAV_GROUPS}
      storageKey="geocrm-electron-products-sidebar-mode"
      titleKey="products.sidebar.title"
    >
      {({ path, moduleKey, writes, navigate }) => (
        <AdminProductsFlow
          path={path}
          moduleKey={moduleKey}
          writes={writes}
          onNavigate={navigate}
        />
      )}
    </AdminShell>
  )
}
