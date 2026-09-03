/**
 * NEXDOT (OBM) Products category list pane.
 */

import { useCallback } from 'react'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import {
  ProductCategoriesPane,
  type ProductCategoryRow,
} from '@/components/admin/product-categories-pane'
import {
  createObmProductCategory,
  deleteObmProductCategory,
  fetchObmProductCategories,
  reorderObmProductCategories,
  updateObmProductCategory,
} from '@/services/obm-products-api'

interface ObmProductsPaneProps {
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

/**
 * NEXDOT storefront product categories (web ObmProductsView parity).
 * @param props - Writes and navigation.
 * @returns Pane UI.
 */
export function ObmProductsPane({ writes, onNavigate }: ObmProductsPaneProps) {
  const loadCategories = useCallback(async (): Promise<ProductCategoryRow[]> => {
    const rows = await fetchObmProductCategories()
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      productCount: c.products.length,
    }))
  }, [])

  return (
    <ProductCategoriesPane
      writes={writes}
      onNavigate={onNavigate}
      i18nPrefix="admin.obmProducts"
      categoryPath={(id) => `/products/nexdot/categories/${encodeURIComponent(id)}`}
      loadCategories={loadCategories}
      createCategory={async (input) => {
        await createObmProductCategory(input)
      }}
      updateCategory={async (id, input) => {
        await updateObmProductCategory(id, input)
      }}
      deleteCategory={async (id) => {
        await deleteObmProductCategory(id)
      }}
      reorderCategories={reorderObmProductCategories}
    />
  )
}
