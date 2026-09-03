/**
 * NEXDOT (OBM) category linked products pane.
 */

import { useCallback } from 'react'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import {
  ProductCategoryProductsPane,
  type LinkedProductRow,
} from '@/components/admin/product-category-products-pane'
import {
  createObmLinkedProduct,
  deleteObmLinkedProduct,
  fetchObmProductCategories,
  reorderObmLinkedProducts,
} from '@/services/obm-products-api'
import {
  productCatalogObmLabel,
  type ProductCatalogItem,
} from '@/services/product-catalog-api'

interface ObmCategoryProductsPaneProps {
  categoryId: string
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

/**
 * Linked catalog SKUs for one NEXDOT category.
 * @param props - Category id, writes, navigation.
 * @returns Pane UI.
 */
export function ObmCategoryProductsPane({
  categoryId,
  writes,
  onNavigate,
}: ObmCategoryProductsPaneProps) {
  const loadCategory = useCallback(
    async (
      id: string,
    ): Promise<{ name: string; products: LinkedProductRow[] } | null> => {
      const categories = await fetchObmProductCategories()
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
      const categories = await fetchObmProductCategories()
      const category = categories.find((c) => c.id === catId)
      const sortOrder = (category?.products.length ?? 0) + 1
      await createObmLinkedProduct({
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
      i18nPrefix="admin.obmProducts"
      backPath="/products/nexdot"
      loadCategory={loadCategory}
      linkProduct={linkProduct}
      unlinkProduct={deleteObmLinkedProduct}
      reorderProducts={reorderObmLinkedProducts}
      catalogLabel={productCatalogObmLabel}
    />
  )
}
