/**
 * T&E Evaluation Products category linked SKUs pane.
 */

import { useCallback } from 'react'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import {
  ProductCategoryProductsPane,
  type LinkedProductRow,
} from '@/components/admin/product-category-products-pane'
import {
  productCatalogCustomerLabel,
  type ProductCatalogItem,
} from '@/services/product-catalog-api'
import {
  createTeEvaluationProduct,
  deleteTeEvaluationProduct,
  fetchTeProductCategories,
  reorderTeEvaluationProducts,
} from '@/services/te-products-api'

interface TeCategoryProductsPaneProps {
  categoryId: string
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

/**
 * Linked catalog SKUs for one T&E evaluation category.
 * @param props - Category id, writes, navigation.
 * @returns Pane UI.
 */
export function TeCategoryProductsPane({
  categoryId,
  writes,
  onNavigate,
}: TeCategoryProductsPaneProps) {
  const loadCategory = useCallback(
    async (
      id: string,
    ): Promise<{ name: string; products: LinkedProductRow[] } | null> => {
      const categories = await fetchTeProductCategories()
      const category = categories.find((c) => c.id === id)
      if (!category) {
        return null
      }
      return {
        name: category.name,
        products: category.products.map((p) => ({
          id: p.id,
          linkId: p.linkId,
          itemCode: p.itemCode,
          name: p.name,
          notes: p.notes,
          sortOrder: p.sortOrder,
        })),
      }
    },
    [],
  )

  const linkProduct = useCallback(
    async (catId: string, item: ProductCatalogItem): Promise<void> => {
      const categories = await fetchTeProductCategories()
      const category = categories.find((c) => c.id === catId)
      const sortOrder = (category?.products.length ?? 0) + 1
      await createTeEvaluationProduct({
        categoryId: catId,
        productId: item.id,
        sortOrder,
      })
    },
    [],
  )

  return (
    <ProductCategoryProductsPane
      categoryId={categoryId}
      writes={writes}
      onNavigate={onNavigate}
      i18nPrefix="admin.teProducts"
      backPath="/products/te"
      loadCategory={loadCategory}
      linkProduct={linkProduct}
      unlinkProduct={deleteTeEvaluationProduct}
      reorderProducts={reorderTeEvaluationProducts}
      catalogLabel={productCatalogCustomerLabel}
    />
  )
}
