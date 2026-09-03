/**
 * Product Electronic Catalog detail pane (web ProductCatalogDetailView parity).
 */

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { ProductCatalogObmPanel } from '@/components/admin/product-catalog-obm-panel'
import { ArrowLeftIcon, PencilIcon } from '@/icons/AllIcons'
import {
  getProductCatalogById,
  productCatalogCustomerLabel,
  updateProductCatalogCrmFields,
  type ProductCatalogItem,
} from '@/services/product-catalog-api'

interface ProductCatalogDetailPaneProps {
  productId: string
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

/**
 * Formats qty for display.
 * @param qty - Numeric quantity.
 * @returns Display string.
 */
function formatQty(qty: number): string {
  if (!Number.isFinite(qty)) {
    return '—'
  }
  return Number.isInteger(qty) ? String(qty) : String(qty)
}

/**
 * Formats a nullable USD price for display.
 * @param value - Price in U.S. dollars.
 * @returns Formatted price or em dash.
 */
function formatUsd(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '—'
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/**
 * Formats an ISO timestamp for detail display.
 * @param value - ISO string or null.
 * @returns Locale datetime or em dash.
 */
function formatSyncedAt(value: string | null): string {
  if (!value) {
    return '—'
  }
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

/**
 * Read-only ERP fields + editable T&E section + OBM panel.
 * @param props - Product id, write flags, navigation.
 * @returns Detail UI.
 */
export function ProductCatalogDetailPane({
  productId,
  writes,
  onNavigate,
}: ProductCatalogDetailPaneProps) {
  const { t } = useTranslation()
  const canUpdate = Boolean(writes?.canEdit)
  const [item, setItem] = useState<ProductCatalogItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [displayNameDraft, setDisplayNameDraft] = useState('')
  const [notesDraft, setNotesDraft] = useState('')
  const [isEditingCrm, setIsEditingCrm] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  /**
   * Syncs editable drafts from the loaded row.
   * @param row - Catalog item.
   */
  const syncDraftFromItem = useCallback((row: ProductCatalogItem | null): void => {
    setDisplayNameDraft(row?.displayName ?? '')
    setNotesDraft(row?.notes ?? '')
    setSaveError(null)
    setSaveSuccess(false)
  }, [])

  /**
   * Loads the product for the current id.
   */
  const loadItem = useCallback(async (): Promise<void> => {
    const id = productId.trim()
    setLoading(true)
    setError(null)
    setNotFound(false)
    setItem(null)
    setIsEditingCrm(false)
    if (!id) {
      setNotFound(true)
      setLoading(false)
      return
    }
    try {
      const row = await getProductCatalogById(id)
      if (!row) {
        setNotFound(true)
        return
      }
      setItem(row)
      syncDraftFromItem(row)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('admin.productCatalog.errorLoadDetail'))
    } finally {
      setLoading(false)
    }
  }, [productId, syncDraftFromItem, t])

  useEffect(() => {
    void loadItem()
  }, [loadItem])

  /**
   * Persists CRM-owned fields (display name + notes).
   * @param event - Form submit event.
   */
  async function saveCrmFields(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!item || !canUpdate || !isEditingCrm) {
      return
    }
    setIsSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      await updateProductCatalogCrmFields(item.id, {
        displayName: displayNameDraft,
        notes: notesDraft,
      })
      const nextDisplay = displayNameDraft.trim()
      const nextNotes = notesDraft.trim()
      const next: ProductCatalogItem = {
        ...item,
        displayName: nextDisplay.length > 0 ? nextDisplay : null,
        notes: nextNotes.length > 0 ? nextNotes : null,
      }
      setItem(next)
      syncDraftFromItem(next)
      setIsEditingCrm(false)
      setSaveSuccess(true)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t('admin.productCatalog.errorSaveCrmFields'))
    } finally {
      setIsSaving(false)
    }
  }

  const pageTitle = item
    ? productCatalogCustomerLabel(item)
    : t('admin.productCatalog.detailTitle')

  /**
   * Returns to the product catalog list.
   */
  function goBack(): void {
    onNavigate('/products/catalog')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-ink/10 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-brand transition hover:bg-brand/10"
            aria-label={t('admin.productCatalog.backToList')}
            onClick={goBack}
          >
            <ArrowLeftIcon className="size-5" aria-hidden />
          </button>
          <span className="truncate text-xl font-extrabold text-brand" title={pageTitle}>
            {pageTitle}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-5 sm:p-6">
      {loading ? (
        <p className="text-sm font-medium text-muted">{t('admin.productCatalog.loadingDetail')}</p>
      ) : error ? (
        <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-300">
          {error}
        </p>
      ) : notFound ? (
        <div className="rounded-3xl border border-dashed border-ink/15 px-6 py-12 text-center text-sm text-muted">
          {t('admin.productCatalog.notFound')}
        </div>
      ) : item ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
          <div className="flex min-w-0 flex-col gap-6">
            <dl className="grid gap-4 rounded-3xl border border-ink/10 bg-white/60 p-6 sm:grid-cols-2 dark:bg-white/5">
              <div>
                <dt className="text-xs font-bold tracking-wide text-muted uppercase">
                  {t('admin.productCatalog.col.code')}
                </dt>
                <dd className="mt-1 font-mono text-sm text-brand">{item.itemCode}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold tracking-wide text-muted uppercase">
                  {t('admin.productCatalog.col.status')}
                </dt>
                <dd className="mt-1">
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                      item.isActive
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : 'bg-zinc-500/15 text-muted'
                    }`}
                  >
                    {item.isActive
                      ? t('admin.productCatalog.statusActive')
                      : t('admin.productCatalog.statusInactive')}
                  </span>
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-bold tracking-wide text-muted uppercase">
                  {t('admin.productCatalog.col.name')}
                </dt>
                <dd className="mt-1 text-sm text-ink">{item.itemName}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-bold tracking-wide text-muted uppercase">
                  {t('admin.productCatalog.col.spec')}
                </dt>
                <dd className="mt-1 text-sm text-ink">{item.itemSpec || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold tracking-wide text-muted uppercase">
                  {t('admin.productCatalog.col.unit')}
                </dt>
                <dd className="mt-1 text-sm text-ink">{item.unit || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold tracking-wide text-muted uppercase">
                  {t('admin.productCatalog.col.qty')}
                </dt>
                <dd className="mt-1 text-sm tabular-nums text-ink">{formatQty(item.qty)}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold tracking-wide text-muted uppercase">
                  {t('admin.productCatalog.col.customerPriceUsd')}
                </dt>
                <dd className="mt-1 text-sm tabular-nums text-ink">
                  {formatUsd(item.customerPriceUsd)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold tracking-wide text-muted uppercase">
                  {t('admin.productCatalog.col.tePriceUsd')}
                </dt>
                <dd className="mt-1 text-sm tabular-nums text-ink">
                  {formatUsd(item.tePriceUsd)}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-bold tracking-wide text-muted uppercase">
                  {t('admin.productCatalog.col.syncedAt')}
                </dt>
                <dd className="mt-1 text-sm text-muted">{formatSyncedAt(item.syncedAt)}</dd>
              </div>
            </dl>

            <section className="rounded-3xl border border-ink/10 bg-white/60 p-6 dark:bg-white/5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-ink">
                    {t('admin.productCatalog.crmFieldsSectionTitle')}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {t('admin.productCatalog.crmFieldsHint')}
                  </p>
                </div>
                {canUpdate && !isEditingCrm ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-2xl border border-ink/10 bg-white/70 px-3 py-2 text-sm font-bold text-ink dark:bg-white/5"
                    onClick={() => {
                      syncDraftFromItem(item)
                      setIsEditingCrm(true)
                    }}
                  >
                    <PencilIcon className="size-4" aria-hidden />
                    {t('admin.productCatalog.edit')}
                  </button>
                ) : null}
              </div>

              {isEditingCrm ? (
                <form className="mt-4 space-y-4" onSubmit={(e) => void saveCrmFields(e)}>
                  <label className="block text-sm">
                    <span className="font-medium text-ink">
                      {t('admin.productCatalog.col.displayName')}
                    </span>
                    <input
                      type="text"
                      value={displayNameDraft}
                      disabled={isSaving}
                      placeholder={t('admin.productCatalog.displayNamePlaceholder')}
                      className="mt-1 w-full rounded-2xl border border-ink/10 bg-white/80 px-3 py-2 text-ink outline-none focus:border-brand/40 disabled:opacity-60 dark:bg-white/5"
                      onChange={(e) => setDisplayNameDraft(e.target.value)}
                    />
                    <span className="mt-1 block text-xs text-muted">
                      {t('admin.productCatalog.displayNameHint')}
                    </span>
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium text-ink">
                      {t('admin.productCatalog.col.notes')}
                    </span>
                    <textarea
                      rows={4}
                      value={notesDraft}
                      disabled={isSaving}
                      placeholder={t('admin.productCatalog.notesPlaceholder')}
                      className="mt-1 w-full rounded-2xl border border-ink/10 bg-white/80 px-3 py-2 text-ink outline-none focus:border-brand/40 disabled:opacity-60 dark:bg-white/5"
                      onChange={(e) => setNotesDraft(e.target.value)}
                    />
                    <span className="mt-1 block text-xs text-muted">
                      {t('admin.productCatalog.notesHint')}
                    </span>
                  </label>
                  {saveError ? <p className="text-sm text-rose-500">{saveError}</p> : null}
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isSaving}
                      className="rounded-2xl border border-ink/10 px-4 py-2 text-sm font-bold text-ink disabled:opacity-60"
                      onClick={() => {
                        syncDraftFromItem(item)
                        setIsEditingCrm(false)
                      }}
                    >
                      {t('admin.productCatalog.cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-brand-fg disabled:opacity-60"
                    >
                      {isSaving
                        ? t('admin.productCatalog.saving')
                        : t('admin.productCatalog.save')}
                    </button>
                  </div>
                </form>
              ) : (
                <dl className="mt-4 grid gap-4">
                  <div>
                    <dt className="text-xs font-bold tracking-wide text-muted uppercase">
                      {t('admin.productCatalog.col.displayName')}
                    </dt>
                    <dd className="mt-1 text-sm text-ink">{item.displayName || '—'}</dd>
                    <p className="mt-1 text-xs text-muted">
                      {t('admin.productCatalog.displayNameHint')}
                    </p>
                  </div>
                  <div>
                    <dt className="text-xs font-bold tracking-wide text-muted uppercase">
                      {t('admin.productCatalog.col.notes')}
                    </dt>
                    <dd className="mt-1 whitespace-pre-wrap text-sm text-ink">
                      {item.notes || '—'}
                    </dd>
                    <p className="mt-1 text-xs text-muted">{t('admin.productCatalog.notesHint')}</p>
                  </div>
                </dl>
              )}

              {!canUpdate ? (
                <p className="mt-3 text-sm text-amber-700 dark:text-amber-200/90">
                  {t('admin.productCatalog.crmFieldsReadOnly')}
                </p>
              ) : null}
              {saveSuccess && !isEditingCrm ? (
                <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">
                  {t('admin.productCatalog.crmFieldsSaved')}
                </p>
              ) : null}
            </section>
          </div>

          <ProductCatalogObmPanel
            item={item}
            canEdit={canUpdate}
            onSaved={(next) => setItem((prev) => (prev ? { ...prev, ...next } : prev))}
          />
        </div>
      ) : null}
      </div>
    </div>
  )
}
