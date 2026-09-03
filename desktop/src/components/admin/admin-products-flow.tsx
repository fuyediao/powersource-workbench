/**
 * Products Function path router (catalog / NEXDOT / T&E).
 */

import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { ObmCategoryProductsPane } from '@/components/admin/obm-category-products-pane'
import { ObmProductsPane } from '@/components/admin/obm-products-pane'
import { ProductCatalogDetailPane } from '@/components/admin/product-catalog-detail-pane'
import {
  parseProductCatalogDetailPath,
  ProductCatalogPane,
} from '@/components/admin/product-catalog-pane'
import { TeCategoryProductsPane } from '@/components/admin/te-category-products-pane'
import { TeProductsPane } from '@/components/admin/te-products-pane'
import type { AdminModuleKey } from '@/constants/admin-modules'

interface AdminProductsFlowProps {
  path: string | null
  moduleKey: AdminModuleKey | null
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

/**
 * Parses `/products/nexdot/categories/:categoryId`.
 * @param path - Shell path.
 * @returns Category id or null.
 */
export function parseObmCategoryProductsPath(path: string | null): string | null {
  if (!path) {
    return null
  }
  const match = /^\/products\/nexdot\/categories\/([^/]+)\/?$/.exec(path)
  const id = match?.[1]?.trim()
  return id && id.length > 0 ? decodeURIComponent(id) : null
}

/**
 * Parses `/products/te/categories/:categoryId`.
 * @param path - Shell path.
 * @returns Category id or null.
 */
export function parseTeCategoryProductsPath(path: string | null): string | null {
  if (!path) {
    return null
  }
  const match = /^\/products\/te\/categories\/([^/]+)\/?$/.exec(path)
  const id = match?.[1]?.trim()
  return id && id.length > 0 ? decodeURIComponent(id) : null
}

/**
 * Routes Products shell paths to catalog / NEXDOT / T&E panes.
 * @param props - Active path, writes, navigation.
 * @returns Pane UI.
 */
export function AdminProductsFlow({
  path,
  moduleKey,
  writes,
  onNavigate,
}: AdminProductsFlowProps) {
  const { t } = useTranslation()
  const catalogId = parseProductCatalogDetailPath(path)
  const obmCategoryId = parseObmCategoryProductsPath(path)
  const teCategoryId = parseTeCategoryProductsPath(path)

  if (catalogId) {
    return (
      <ProductCatalogDetailPane
        productId={catalogId}
        writes={writes}
        onNavigate={onNavigate}
      />
    )
  }
  if (path === '/products/catalog' || moduleKey === 'product_catalog') {
    return <ProductCatalogPane onNavigate={onNavigate} />
  }
  if (obmCategoryId) {
    return (
      <ObmCategoryProductsPane
        categoryId={obmCategoryId}
        writes={writes}
        onNavigate={onNavigate}
      />
    )
  }
  if (path === '/products/nexdot' || moduleKey === 'obm_products') {
    return <ObmProductsPane writes={writes} onNavigate={onNavigate} />
  }
  if (teCategoryId) {
    return (
      <TeCategoryProductsPane
        categoryId={teCategoryId}
        writes={writes}
        onNavigate={onNavigate}
      />
    )
  }
  if (path === '/products/te' || moduleKey === 'te_products') {
    return <TeProductsPane writes={writes} onNavigate={onNavigate} />
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      {writes?.readOnly ? (
        <p className="text-sm font-semibold text-muted">{t('admin.moduleAccess.readOnly')}</p>
      ) : null}
      <p className="text-sm font-medium text-muted">{t('admin.content.comingSoon')}</p>
    </div>
  )
}
