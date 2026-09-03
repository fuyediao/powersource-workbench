/**
 * Multi-select electronic-catalog product picker (visit-log interested
 * products and KOL tested products).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CloseIcon, SearchIcon } from '@/icons/AllIcons'
import {
  listProductCatalog,
  productCatalogCustomerLabel,
  type ProductCatalogItem,
} from '@/services/product-catalog-api'
import { fetchProductCatalogIdLabelMap } from '@/services/orders-te-api'

/** Optional UI copy so other surfaces (KOL tested products) can reuse this picker. */
export type ProductCatalogPickerCopy = {
  placeholder: string
  searchPlaceholder: string
  hint: string
  empty: string
  loadFailed: string
  removeAria: string
}

interface VisitLogProductPickerProps {
  selectedProductIds: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  /** When set, replaces visit-log i18n strings. */
  copy?: ProductCatalogPickerCopy
}

/**
 * Searchable product multi-select with chips.
 * @param props - Selected ids and change handler.
 * @returns Picker UI.
 */
export function VisitLogProductPicker({
  selectedProductIds,
  onChange,
  disabled = false,
  copy,
}: VisitLogProductPickerProps) {
  const { t } = useTranslation()
  const placeholder =
    copy?.placeholder ?? t('admin.visitLog.modal.interestedProductsPlaceholder')
  const searchPlaceholder =
    copy?.searchPlaceholder ??
    t('admin.visitLog.modal.interestedProductsSearchPlaceholder')
  const hint = copy?.hint ?? t('admin.visitLog.modal.interestedProductsHint')
  const empty = copy?.empty ?? t('admin.visitLog.modal.interestedProductsEmpty')
  const loadFailedText =
    copy?.loadFailed ?? t('admin.visitLog.modal.interestedProductsLoadFailed')
  const removeAria =
    copy?.removeAria ?? t('admin.visitLog.modal.removeInterestedProduct')
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<ProductCatalogItem[]>([])
  const [labelById, setLabelById] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const seq = useRef(0)
  const searchTimer = useRef<number | null>(null)

  /**
   * Loads labels for already-selected products.
   * @returns Nothing.
   */
  const loadSelectedLabels = useCallback(async (): Promise<void> => {
    try {
      const map = await fetchProductCatalogIdLabelMap()
      setLabelById((prev) => ({ ...map, ...prev }))
    } catch {
      // Keep existing labels.
    }
  }, [])

  /**
   * Searches active catalog products.
   * @param query - Search text.
   * @returns Nothing.
   */
  const searchProducts = useCallback(async (query: string): Promise<void> => {
    const sequence = ++seq.current
    setLoading(true)
    setLoadFailed(false)
    try {
      const result = await listProductCatalog({
        search: query,
        page: 1,
        pageSize: 50,
        status: 'active',
      })
      if (sequence !== seq.current) {
        return
      }
      setOptions(result.items)
      setLabelById((prev) => {
        const next = { ...prev }
        for (const item of result.items) {
          next[item.id] = productCatalogCustomerLabel(item)
        }
        return next
      })
    } catch {
      if (sequence === seq.current) {
        setOptions([])
        setLoadFailed(true)
      }
    } finally {
      if (sequence === seq.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadSelectedLabels()
  }, [loadSelectedLabels])

  useEffect(() => {
    if (!open) {
      return
    }
    void searchProducts(search)
  }, [open, searchProducts, search])

  useEffect(() => {
    /**
     * Closes the panel on outside click.
     * @param event - Mouse event.
     */
    function onDocClick(event: MouseEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  useEffect(() => {
    return () => {
      if (searchTimer.current != null) {
        window.clearTimeout(searchTimer.current)
      }
    }
  }, [])

  const available = options.filter((item) => !selectedProductIds.includes(item.id))

  return (
    <div ref={rootRef} className="space-y-2">
      {selectedProductIds.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedProductIds.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-xs font-semibold text-brand"
            >
              {labelById[id] ?? id}
              {!disabled ? (
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-brand/20"
                  aria-label={removeAria}
                  onClick={() => onChange(selectedProductIds.filter((x) => x !== id))}
                >
                  <CloseIcon className="size-3" aria-hidden />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}

      {!disabled ? (
        <div className="relative">
          <button
            type="button"
            className="flex h-11 w-full items-center justify-between rounded-2xl border border-ink/10 bg-white/60 px-3 text-left text-sm font-medium text-ink dark:border-white/10 dark:bg-zinc-950/40"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="truncate text-muted">{placeholder}</span>
          </button>
          {open ? (
            <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-xl dark:border-white/10 dark:bg-zinc-950">
              <div className="relative border-b border-ink/10 p-2">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted" />
                <input
                  className="h-9 w-full rounded-xl border border-ink/10 bg-white/80 py-1.5 pr-3 pl-9 text-sm outline-none focus:border-brand dark:bg-zinc-900"
                  value={search}
                  placeholder={searchPlaceholder}
                  onChange={(e) => {
                    const next = e.target.value
                    setSearch(next)
                    if (searchTimer.current != null) {
                      window.clearTimeout(searchTimer.current)
                    }
                    searchTimer.current = window.setTimeout(() => {
                      void searchProducts(next)
                    }, 250)
                  }}
                />
              </div>
              <div className="max-h-48 overflow-auto py-1">
                {loading ? (
                  <p className="px-3 py-2 text-xs text-muted">{t('status.loading')}</p>
                ) : null}
                {loadFailed ? (
                  <p className="px-3 py-2 text-xs text-rose-500">
                    {loadFailedText}
                  </p>
                ) : null}
                {!loading && !loadFailed && available.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted">
                    {empty}
                  </p>
                ) : null}
                {available.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-brand/10"
                    onClick={() => {
                      onChange([...selectedProductIds, item.id])
                      setOpen(false)
                      setSearch('')
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {productCatalogCustomerLabel(item) || item.itemCode}
                      </span>
                      {item.itemCode ? (
                        <span className="block truncate text-xs font-medium text-muted">
                          {item.itemCode}
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {!disabled ? (
        <p className="text-[11px] font-medium text-muted">{hint}</p>
      ) : null}
    </div>
  )
}
