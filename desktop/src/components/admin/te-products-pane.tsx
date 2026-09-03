/**
 * T&E Evaluation Products category list pane.
 */

import { useCallback } from 'react'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import {
  ProductCategoriesPane,
  type ProductCategoryRow,
} from '@/components/admin/product-categories-pane'
import {
  createTeProductCategory,
  deleteTeProductCategory,
  fetchTeProductCategories,
  reorderTeProductCategories,
  updateTeProductCategory,
} from '@/services/te-products-api'

interface TeProductsPaneProps {
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

/**
 * T&E form Step 4 product categories (web TeEvaluationProductsView parity).
 * @param props - Writes and navigation.
 * @returns Pane UI.
 */
export function TeProductsPane({ writes, onNavigate }: TeProductsPaneProps) {
  const loadCategories = useCallback(async (): Promise<ProductCategoryRow[]> => {
    const rows = await fetchTeProductCategories()
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
      i18nPrefix="admin.teProducts"
      categoryPath={(id) => `/products/te/categories/${encodeURIComponent(id)}`}
      loadCategories={loadCategories}
      createCategory={async (input) => {
        await createTeProductCategory(input)
      }}
      updateCategory={async (id, input) => {
        await updateTeProductCategory(id, input)
      }}
      deleteCategory={async (id) => {
        await deleteTeProductCategory(id)
      }}
      reorderCategories={reorderTeProductCategories}
    />
  )
}
