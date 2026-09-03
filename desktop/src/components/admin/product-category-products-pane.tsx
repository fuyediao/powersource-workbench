/**
 * Shared linked-SKU list for a product category (NEXDOT / T&E).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { useTableRowReorder } from '@/hooks/use-table-row-reorder'
import {
  ArrowLeftIcon,
  GripIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
} from '@/icons/AllIcons'
import {
  listProductCatalog,
  type ProductCatalogItem,
} from '@/services/product-catalog-api'

/** Linked SKU row shared by OBM / T&E category product lists. */
export interface LinkedProductRow {
  id: string
  linkId: string
  itemCode: string
  name: string
  notes: string | null
  sortOrder: number
}

interface ProductCategoryProductsPaneProps {
  categoryId: string
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
  i18nPrefix: 'admin.obmProducts' | 'admin.teProducts'
  backPath: string
  /**
   * Loads category name + linked products.
   * @returns Category meta and products, or null when missing.
   */
  loadCategory: (categoryId: string) => Promise<{
    name: string
    products: LinkedProductRow[]
  } | null>
  /**
   * Links a catalog SKU into the category.
   * @param categoryId - Parent category.
   * @param item - Catalog row.
   */
  linkProduct: (categoryId: string, item: ProductCatalogItem) => Promise<void>
  /**
   * Unlinks by link row id.
   * @param linkId - Join table primary key.
   */
  unlinkProduct: (linkId: string) => Promise<void>
  /**
   * Persists product order within the category.
   * @param orderedLinkIds - Link ids in display order.
   */
  reorderProducts: (orderedLinkIds: string[]) => Promise<void>
  /**
   * Label for a searched catalog item in the link modal.
   * @param item - Catalog row.
   */
  catalogLabel: (item: ProductCatalogItem) => string
}

/**
 * Category products sub-page: linked SKUs, reorder, search-and-link modal.
 * @param props - Category adapters and chrome.
 * @returns Pane UI.
 */
export function ProductCategoryProductsPane({
  categoryId,
  writes,
  onNavigate,
  i18nPrefix,
  backPath,
  loadCategory,
  linkProduct,
  unlinkProduct,
  reorderProducts,
  catalogLabel,
}: ProductCategoryProductsPaneProps) {
  const { t } = useTranslation()
  const canCreate = Boolean(writes?.canCreate)
  const canUpdate = Boolean(writes?.canEdit)
  const canDelete = Boolean(writes?.canDelete)
  const canWriteAny = canCreate || canUpdate || canDelete

  const [categoryName, setCategoryName] = useState('')
  const [products, setProducts] = useState<LinkedProductRow[]>([])
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ProductCatalogItem[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [unlinkTarget, setUnlinkTarget] = useState<LinkedProductRow | null>(null)
  const searchTimer = useRef<number | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    setNotFound(false)
    try {
      const row = await loadCategory(categoryId)
      if (!row) {
        setNotFound(true)
        setCategoryName('')
        setProducts([])
        return
      }
      setCategoryName(row.name)
      setProducts(row.products)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setProducts([])
    } finally {
      setLoading(false)
    }
  }, [categoryId, loadCategory])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    return () => {
      if (searchTimer.current != null) {
        window.clearTimeout(searchTimer.current)
      }
    }
  }, [])

  const linkedIds = useMemo(() => new Set(products.map((p) => p.id)), [products])

  const reorder = useCallback(
    async (orderedLinkIds: string[]): Promise<void> => {
      setSaving(true)
      setError(null)
      const snapshot = products
      try {
        const map = new Map(products.map((p) => [p.linkId, p]))
        setProducts(
          orderedLinkIds.map((linkId, index) => {
            const row = map.get(linkId)
            if (!row) {
              throw new Error('Product not found')
            }
            return { ...row, sortOrder: index + 1 }
          }),
        )
        await reorderProducts(orderedLinkIds)
      } catch (e) {
        setProducts(snapshot)
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setSaving(false)
      }
    },
    [products, reorderProducts],
  )

  const {
    isReordering,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
    isDragging,
    isDragOver,
  } = useTableRowReorder(reorder)

  /**
   * Runs catalog search for the link modal.
   */
  async function runSearch(query: string): Promise<void> {
    setSearching(true)
    setSearchError(null)
    try {
      const result = await listProductCatalog({
        search: query,
        activeOnly: true,
        pageSize: 20,
      })
      setSearchResults(result.items)
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : String(e))
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  /**
   * Opens the search-and-link modal.
   */
  function openLinkModal(): void {
    setSearchQuery('')
    setSearchResults([])
    setSearchError(null)
    setLinkOpen(true)
    void runSearch('')
  }

  /**
   * Links a searched catalog product.
   * @param item - Catalog row.
   */
  async function handleLink(item: ProductCatalogItem): Promise<void> {
    if (linkedIds.has(item.id)) {
      return
    }
    setLinkingId(item.id)
    setSaving(true)
    try {
      await linkProduct(categoryId, item)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLinkingId(null)
      setSaving(false)
    }
  }

  /**
   * Confirms unlink.
   */
  async function confirmUnlink(): Promise<void> {
    if (!unlinkTarget) {
      return
    }
    setSaving(true)
    try {
      await unlinkProduct(unlinkTarget.linkId)
      setUnlinkTarget(null)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-ink/10 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-brand transition hover:bg-brand/10"
              aria-label={t(`${i18nPrefix}.backToCategories`)}
              onClick={() => onNavigate(backPath)}
            >
              <ArrowLeftIcon className="size-5" aria-hidden />
            </button>
            <span className="truncate text-xl font-extrabold text-brand">
              {notFound
                ? t(`${i18nPrefix}.categoryNotFound`)
                : categoryName || t(`${i18nPrefix}.categoryProductsTitle`)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={loading || notFound}
              className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10"
              onClick={() => void reload()}
            >
              <RefreshIcon className={`size-4 ${loading ? 'animate-spin' : ''}`} />
              {t(`${i18nPrefix}.refresh`)}
            </button>
            {canCreate && !notFound ? (
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg"
                onClick={openLinkModal}
              >
                <PlusIcon className="size-4" />
                {t(`${i18nPrefix}.addProduct`)}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-5 sm:p-6">
      {!canWriteAny ? (
        <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          {t(`${i18nPrefix}.readOnlyHint`)}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-300">
          {error}
        </p>
      ) : null}

      {!notFound ? (
        <div className="overflow-hidden rounded-3xl border border-ink/10 bg-white/60 dark:bg-white/5">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white/90 text-left text-xs font-bold tracking-wide text-muted uppercase dark:bg-zinc-950/90">
                <tr>
                  <th className="px-4 py-3">{t(`${i18nPrefix}.col.sortOrder`)}</th>
                  <th className="px-4 py-3">{t(`${i18nPrefix}.col.code`)}</th>
                  <th className="px-4 py-3">{t(`${i18nPrefix}.col.name`)}</th>
                  <th className="px-4 py-3">{t(`${i18nPrefix}.col.notes`)}</th>
                  {canWriteAny ? (
                    <th className="px-4 py-3">{t(`${i18nPrefix}.col.actions`)}</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {loading && products.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canWriteAny ? 5 : 4}
                      className="px-4 py-10 text-center text-muted"
                    >
                      {t(`${i18nPrefix}.loading`)}
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canWriteAny ? 5 : 4}
                      className="px-4 py-10 text-center text-muted"
                    >
                      {t(`${i18nPrefix}.noProducts`)}
                    </td>
                  </tr>
                ) : (
                  products.map((product) => (
                    <tr
                      key={product.linkId}
                      className={`border-t border-ink/5 text-ink ${
                        isDragging(product.linkId) ? 'opacity-50' : ''
                      } ${isDragOver(product.linkId) ? 'bg-brand/10' : ''}`}
                      onDragOver={
                        canUpdate
                          ? (e) => onDragOver(e, product.linkId)
                          : undefined
                      }
                      onDragLeave={canUpdate ? onDragLeave : undefined}
                      onDrop={
                        canUpdate
                          ? (e) =>
                              void onDrop(e, product.linkId, () =>
                                products.map((p) => p.linkId),
                              )
                          : undefined
                      }
                    >
                      <td className="px-4 py-3 tabular-nums">
                        <div className="flex items-center gap-1">
                          {canUpdate ? (
                            <button
                              type="button"
                              draggable
                              disabled={saving || isReordering}
                              aria-label={t(`${i18nPrefix}.dragHandle`)}
                              className={`rounded p-1 text-muted hover:bg-brand/10 hover:text-ink disabled:opacity-40 ${
                                saving || isReordering
                                  ? 'cursor-not-allowed'
                                  : 'cursor-grab active:cursor-grabbing'
                              }`}
                              onDragStart={(e) => onDragStart(e, product.linkId)}
                              onDragEnd={onDragEnd}
                            >
                              <GripIcon className="size-4" />
                            </button>
                          ) : null}
                          <span>{product.sortOrder}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-brand">
                        {product.itemCode}
                      </td>
                      <td className="px-4 py-3 font-medium">{product.name}</td>
                      <td className="max-w-xs truncate px-4 py-3 text-muted">
                        {product.notes || '—'}
                      </td>
                      {canWriteAny ? (
                        <td className="px-4 py-3">
                          {canDelete ? (
                            <button
                              type="button"
                              disabled={saving}
                              title={t(`${i18nPrefix}.unlinkProduct`)}
                              aria-label={t(`${i18nPrefix}.unlinkProduct`)}
                              className="rounded p-1.5 text-muted hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-50"
                              onClick={() => setUnlinkTarget(product)}
                            >
                              <TrashIcon className="size-3.5" />
                            </button>
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      </div>

      {linkOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setLinkOpen(false)
            }
          }}
        >
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-3xl border border-ink/10 bg-white p-5 shadow-2xl dark:bg-zinc-950">
            <h3 className="text-lg font-bold text-ink">{t(`${i18nPrefix}.linkProductTitle`)}</h3>
            <p className="mt-1 text-sm text-muted">{t(`${i18nPrefix}.searchHint`)}</p>
            <div className="relative mt-4">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={searchQuery}
                placeholder={t(`${i18nPrefix}.searchPlaceholder`)}
                className="w-full rounded-2xl border border-ink/10 bg-white/80 py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5"
                onChange={(e) => {
                  const value = e.target.value
                  setSearchQuery(value)
                  if (searchTimer.current != null) {
                    window.clearTimeout(searchTimer.current)
                  }
                  searchTimer.current = window.setTimeout(() => {
                    void runSearch(value)
                  }, 300)
                }}
              />
            </div>
            {searchError ? <p className="mt-2 text-sm text-rose-500">{searchError}</p> : null}
            <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-2xl border border-ink/10">
              {searching && searchResults.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted">
                  {t(`${i18nPrefix}.loading`)}
                </p>
              ) : searchResults.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted">
                  {t(`${i18nPrefix}.noSearchResults`)}
                </p>
              ) : (
                <ul className="divide-y divide-ink/5">
                  {searchResults.map((item) => {
                    const linked = linkedIds.has(item.id)
                    return (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">
                            {catalogLabel(item)}
                          </p>
                          <p className="font-mono text-xs text-brand">{item.itemCode}</p>
                        </div>
                        {linked ? (
                          <span className="shrink-0 text-xs font-semibold text-muted">
                            {t(`${i18nPrefix}.alreadyLinked`)}
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={saving || linkingId === item.id}
                            className="shrink-0 rounded-xl bg-brand px-3 py-1.5 text-xs font-bold text-brand-fg disabled:opacity-50"
                            onClick={() => void handleLink(item)}
                          >
                            {t(`${i18nPrefix}.link`)}
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="rounded-2xl border border-ink/10 px-4 py-2 text-sm font-bold text-ink"
                onClick={() => setLinkOpen(false)}
              >
                {t(`${i18nPrefix}.cancel`)}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {unlinkTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setUnlinkTarget(null)
            }
          }}
        >
          <div className="w-full max-w-sm rounded-3xl border border-ink/10 bg-white p-5 shadow-2xl dark:bg-zinc-950">
            <h3 className="text-lg font-bold text-ink">
              {t(`${i18nPrefix}.unlinkProductTitle`)}
            </h3>
            <p className="mt-2 text-sm text-muted">
              {t(`${i18nPrefix}.unlinkProductConfirm`, { name: unlinkTarget.name })}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-2xl border border-ink/10 px-4 py-2 text-sm font-bold text-ink"
                onClick={() => setUnlinkTarget(null)}
              >
                {t(`${i18nPrefix}.cancel`)}
              </button>
              <button
                type="button"
                disabled={saving}
                className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                onClick={() => void confirmUnlink()}
              >
                {t(`${i18nPrefix}.unlink`)}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
