/**
 * Shared category list UI for NEXDOT (OBM) and T&E Evaluation Products.
 */

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { useTableRowReorder } from '@/hooks/use-table-row-reorder'
import {
  GripIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  TrashIcon,
} from '@/icons/AllIcons'

/** Minimal category shape shared by OBM / T&E admin lists. */
export interface ProductCategoryRow {
  id: string
  name: string
  sortOrder: number
  isActive: boolean
  productCount: number
}

interface ProductCategoriesPaneProps {
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
  /** i18n namespace prefix, e.g. `admin.obmProducts`. */
  i18nPrefix: 'admin.obmProducts' | 'admin.teProducts'
  categoryPath: (categoryId: string) => string
  loadCategories: () => Promise<ProductCategoryRow[]>
  createCategory: (input: {
    name: string
    sortOrder: number
    isActive: boolean
  }) => Promise<void>
  updateCategory: (
    id: string,
    input: { name: string; sortOrder: number; isActive: boolean },
  ) => Promise<void>
  deleteCategory: (id: string) => Promise<void>
  reorderCategories: (orderedIds: string[]) => Promise<void>
}

/**
 * Category headings list with create / edit / delete / reorder / toggle.
 * @param props - Data adapters and chrome.
 * @returns List UI.
 */
export function ProductCategoriesPane({
  writes,
  onNavigate,
  i18nPrefix,
  categoryPath,
  loadCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
}: ProductCategoriesPaneProps) {
  const { t } = useTranslation()
  const canCreate = Boolean(writes?.canCreate)
  const canUpdate = Boolean(writes?.canEdit)
  const canDelete = Boolean(writes?.canDelete)
  const canWriteAny = canCreate || canUpdate || canDelete

  const [categories, setCategories] = useState<ProductCategoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalMode, setModalMode] = useState<'new' | 'edit' | null>(null)
  const [editing, setEditing] = useState<ProductCategoryRow | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProductCategoryRow | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setCategories(await loadCategories())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setCategories([])
    } finally {
      setLoading(false)
    }
  }, [loadCategories])

  useEffect(() => {
    void reload()
  }, [reload])

  const reorder = useCallback(
    async (orderedIds: string[]): Promise<void> => {
      setSaving(true)
      setError(null)
      const snapshot = categories
      try {
        const map = new Map(categories.map((c) => [c.id, c]))
        setCategories(
          orderedIds.map((id, index) => {
            const row = map.get(id)
            if (!row) {
              throw new Error('Category not found')
            }
            return { ...row, sortOrder: index + 1 }
          }),
        )
        await reorderCategories(orderedIds)
      } catch (e) {
        setCategories(snapshot)
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setSaving(false)
      }
    },
    [categories, reorderCategories],
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
   * Submits the category create/edit modal.
   * @param event - Form submit.
   */
  async function submitCategory(event: FormEvent): Promise<void> {
    event.preventDefault()
    setFormError(null)
    if (!nameDraft.trim()) {
      setFormError(t(`${i18nPrefix}.errorNameRequired`))
      return
    }
    const isActive =
      modalMode === 'edit' && editing ? editing.isActive : true
    const sortOrder =
      modalMode === 'edit' && editing ? editing.sortOrder : categories.length + 1
    const payload = { name: nameDraft, sortOrder, isActive }
    setSaving(true)
    try {
      if (modalMode === 'new') {
        await createCategory(payload)
      } else if (editing) {
        await updateCategory(editing.id, payload)
      }
      setModalMode(null)
      setEditing(null)
      await reload()
    } catch {
      setFormError(t(`${i18nPrefix}.errorSaveFailed`))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Toggles category active status inline.
   * @param category - Category row.
   */
  async function toggleActive(category: ProductCategoryRow): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      await updateCategory(category.id, {
        name: category.name,
        sortOrder: category.sortOrder,
        isActive: !category.isActive,
      })
      setCategories((rows) =>
        rows.map((r) =>
          r.id === category.id ? { ...r, isActive: !r.isActive } : r,
        ),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Confirms category deletion.
   */
  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) {
      return
    }
    setSaving(true)
    try {
      await deleteCategory(deleteTarget.id)
      setDeleteTarget(null)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-5 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold tracking-tight text-ink">
            {t(`${i18nPrefix}.title`)}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10"
            onClick={() => void reload()}
          >
            <RefreshIcon className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            {t(`${i18nPrefix}.refresh`)}
          </button>
          {canCreate ? (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg"
              onClick={() => {
                setEditing(null)
                setNameDraft('')
                setFormError(null)
                setModalMode('new')
              }}
            >
              <PlusIcon className="size-4" />
              {t(`${i18nPrefix}.addCategory`)}
            </button>
          ) : null}
        </div>
      </header>

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

      <div
        className={`overflow-hidden rounded-3xl border border-ink/10 bg-white/60 dark:bg-white/5 ${
          loading && categories.length > 0 ? 'opacity-60' : ''
        }`}
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white/90 text-left text-xs font-bold tracking-wide text-muted uppercase dark:bg-zinc-950/90">
              <tr>
                <th className="px-4 py-3">{t(`${i18nPrefix}.col.sortOrder`)}</th>
                <th className="px-4 py-3">{t(`${i18nPrefix}.field.categoryName`)}</th>
                <th className="px-4 py-3">{t(`${i18nPrefix}.col.status`)}</th>
                <th className="px-4 py-3">{t(`${i18nPrefix}.col.productCount`)}</th>
                {canWriteAny ? (
                  <th className="px-4 py-3">{t(`${i18nPrefix}.col.actions`)}</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {loading && categories.length === 0 ? (
                <tr>
                  <td
                    colSpan={canWriteAny ? 5 : 4}
                    className="px-4 py-10 text-center text-muted"
                  >
                    {t(`${i18nPrefix}.loading`)}
                  </td>
                </tr>
              ) : categories.length === 0 ? (
                <tr>
                  <td
                    colSpan={canWriteAny ? 5 : 4}
                    className="px-4 py-10 text-center text-muted"
                  >
                    {t(`${i18nPrefix}.empty`)}
                  </td>
                </tr>
              ) : (
                categories.map((category) => (
                  <tr
                    key={category.id}
                    className={`border-t border-ink/5 text-ink ${
                      isDragging(category.id) ? 'opacity-50' : ''
                    } ${isDragOver(category.id) ? 'bg-brand/10' : ''}`}
                    onDragOver={
                      canUpdate
                        ? (e) => onDragOver(e, category.id)
                        : undefined
                    }
                    onDragLeave={canUpdate ? onDragLeave : undefined}
                    onDrop={
                      canUpdate
                        ? (e) =>
                            void onDrop(e, category.id, () =>
                              categories.map((c) => c.id),
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
                            onDragStart={(e) => onDragStart(e, category.id)}
                            onDragEnd={onDragEnd}
                          >
                            <GripIcon className="size-4" />
                          </button>
                        ) : null}
                        <span>{category.sortOrder}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        className="text-left font-semibold text-ink hover:text-brand hover:underline"
                        onClick={() => onNavigate(categoryPath(category.id))}
                      >
                        {category.name}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      {canUpdate ? (
                        <button
                          type="button"
                          disabled={saving}
                          aria-label={t(`${i18nPrefix}.toggleStatus`)}
                          className={`rounded-md px-2 py-0.5 text-xs font-semibold disabled:opacity-50 ${
                            category.isActive
                              ? 'text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400'
                              : 'text-muted hover:bg-zinc-950/5'
                          }`}
                          onClick={() => void toggleActive(category)}
                        >
                          {category.isActive
                            ? t(`${i18nPrefix}.active`)
                            : t(`${i18nPrefix}.inactive`)}
                        </button>
                      ) : (
                        <span
                          className={
                            category.isActive
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-muted'
                          }
                        >
                          {category.isActive
                            ? t(`${i18nPrefix}.active`)
                            : t(`${i18nPrefix}.inactive`)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{category.productCount}</td>
                    {canWriteAny ? (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {canUpdate ? (
                            <button
                              type="button"
                              title={t(`${i18nPrefix}.editCategory`)}
                              aria-label={t(`${i18nPrefix}.editCategory`)}
                              className="rounded p-1.5 text-muted hover:bg-brand/10 hover:text-brand"
                              onClick={() => {
                                setEditing(category)
                                setNameDraft(category.name)
                                setFormError(null)
                                setModalMode('edit')
                              }}
                            >
                              <PencilIcon className="size-3.5" />
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button
                              type="button"
                              disabled={saving}
                              title={t(`${i18nPrefix}.deleteCategory`)}
                              aria-label={t(`${i18nPrefix}.deleteCategory`)}
                              className="rounded p-1.5 text-muted hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-50"
                              onClick={() => setDeleteTarget(category)}
                            >
                              <TrashIcon className="size-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalMode ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setModalMode(null)
            }
          }}
        >
          <div className="w-full max-w-md rounded-3xl border border-ink/10 bg-white p-5 shadow-2xl dark:bg-zinc-950">
            <h3 className="text-lg font-bold text-ink">
              {modalMode === 'new'
                ? t(`${i18nPrefix}.addCategory`)
                : t(`${i18nPrefix}.editCategory`)}
            </h3>
            <form className="mt-4 space-y-4" onSubmit={(e) => void submitCategory(e)}>
              <label className="block text-sm">
                <span className="font-medium text-ink">
                  {t(`${i18nPrefix}.field.categoryName`)}
                </span>
                <input
                  type="text"
                  required
                  value={nameDraft}
                  className="mt-1 w-full rounded-2xl border border-ink/10 bg-white/80 px-3 py-2 text-ink outline-none focus:border-brand/40 dark:bg-white/5"
                  onChange={(e) => setNameDraft(e.target.value)}
                />
              </label>
              {formError ? <p className="text-sm text-rose-500">{formError}</p> : null}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="rounded-2xl border border-ink/10 px-4 py-2 text-sm font-bold text-ink"
                  onClick={() => setModalMode(null)}
                >
                  {t(`${i18nPrefix}.cancel`)}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-brand-fg disabled:opacity-60"
                >
                  {t(`${i18nPrefix}.save`)}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setDeleteTarget(null)
            }
          }}
        >
          <div className="w-full max-w-sm rounded-3xl border border-ink/10 bg-white p-5 shadow-2xl dark:bg-zinc-950">
            <h3 className="text-lg font-bold text-ink">
              {t(`${i18nPrefix}.deleteCategoryTitle`)}
            </h3>
            <p className="mt-2 text-sm text-muted">
              {t(`${i18nPrefix}.deleteCategoryConfirm`, {
                name: deleteTarget.name,
                count: deleteTarget.productCount,
              })}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-2xl border border-ink/10 px-4 py-2 text-sm font-bold text-ink"
                onClick={() => setDeleteTarget(null)}
              >
                {t(`${i18nPrefix}.cancel`)}
              </button>
              <button
                type="button"
                disabled={saving}
                className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-500 disabled:opacity-60"
                onClick={() => void confirmDelete()}
              >
                {t(`${i18nPrefix}.delete`)}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
