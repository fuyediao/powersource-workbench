/**
 * T&E Admin shared-media set list (Vue SharedMediaView parity).
 */

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { useTableRowReorder } from '@/hooks/use-table-row-reorder'
import {
  GripIcon,
  LucideLayersIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  TrashIcon,
} from '@/icons/AllIcons'
import {
  createSharedMediaGroup,
  deleteSharedMediaGroupWithFiles,
  fetchSharedMediaGroups,
  reorderSharedMediaGroups,
  setSharedMediaGroupActive,
  sharedMediaImages,
  sharedMediaPdf,
  updateSharedMediaGroup,
  type SharedMediaGroup,
} from '@/services/shared-media-repository'
import { teMediaDetailPath } from '@/utils/te-media-routes'

interface TeMediaPaneProps {
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

type ModalMode = 'group-new' | 'group-edit'

/**
 * Shared-media set list with create, rename, activate, delete, and drag reorder.
 *
 * @param props - Shell writes and navigation.
 * @returns List UI.
 */
export function TeMediaPane({ writes, onNavigate }: TeMediaPaneProps) {
  const { t } = useTranslation()
  const canCreate = Boolean(writes?.canCreate)
  const canUpdate = Boolean(writes?.canEdit)
  const canDelete = Boolean(writes?.canDelete)
  const canWriteAny = canCreate || canUpdate || canDelete

  const [groups, setGroups] = useState<SharedMediaGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modalMode, setModalMode] = useState<ModalMode | null>(null)
  const [editingGroup, setEditingGroup] = useState<SharedMediaGroup | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SharedMediaGroup | null>(null)

  /**
   * Reloads all media sets from Supabase.
   *
   * @returns Nothing.
   */
  const loadGroups = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      setGroups(await fetchSharedMediaGroups())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setGroups([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadGroups()
  }, [loadGroups])

  /**
   * Persists a new set order after drag-and-drop.
   *
   * @param orderedIds - Group ids in display order.
   */
  const reorder = useCallback(
    async (orderedIds: string[]): Promise<void> => {
      setSaving(true)
      setError(null)
      const snapshot = groups.map((g) => ({ ...g, items: [...g.items] }))
      try {
        const map = new Map(groups.map((g) => [g.id, g]))
        setGroups(
          orderedIds.map((id, index) => {
            const row = map.get(id)
            if (!row) {
              throw new Error('Group not found')
            }
            return { ...row, sortOrder: index + 1 }
          }),
        )
        await reorderSharedMediaGroups(orderedIds)
      } catch (e) {
        setGroups(snapshot)
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setSaving(false)
      }
    },
    [groups],
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

  /** Opens the create-set modal. */
  function openNewGroup(): void {
    setEditingGroup(null)
    setNameDraft('')
    setFormError(null)
    setModalMode('group-new')
  }

  /**
   * Opens the rename-set modal.
   *
   * @param group - Set to edit.
   */
  function openEditGroup(group: SharedMediaGroup): void {
    setEditingGroup(group)
    setNameDraft(group.name)
    setFormError(null)
    setModalMode('group-edit')
  }

  /** Closes the create/rename modal. */
  function closeModal(): void {
    setModalMode(null)
    setFormError(null)
  }

  /**
   * Persists create or rename. New sets start inactive.
   *
   * @param event - Form submit.
   */
  async function submitGroupForm(event: FormEvent): Promise<void> {
    event.preventDefault()
    setFormError(null)
    if (!nameDraft.trim()) {
      setFormError(t('admin.sharedMedia.errorNameRequired'))
      return
    }
    setSaving(true)
    try {
      if (modalMode === 'group-new') {
        await createSharedMediaGroup({
          name: nameDraft,
          sortOrder: groups.length + 1,
          isActive: false,
        })
      } else if (editingGroup) {
        await updateSharedMediaGroup(editingGroup.id, {
          name: nameDraft,
          sortOrder: editingGroup.sortOrder,
          isActive: editingGroup.isActive,
        })
      }
      closeModal()
      await loadGroups()
    } catch {
      setFormError(t('admin.sharedMedia.errorSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Enables this set (disables any other) or disables it.
   *
   * @param group - Set row.
   */
  async function toggleActive(group: SharedMediaGroup): Promise<void> {
    setSaving(true)
    setError(null)
    const next = !group.isActive
    try {
      await setSharedMediaGroupActive(group.id, next)
      setGroups((rows) =>
        rows.map((g) => ({
          ...g,
          isActive: next && g.id === group.id,
        })),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Opens delete confirmation.
   *
   * @param group - Set to delete.
   */
  function openDelete(group: SharedMediaGroup): void {
    setDeleteTarget(group)
  }

  /** Closes the delete dialog. */
  function closeDelete(): void {
    setDeleteTarget(null)
  }

  /** Deletes the confirmed set and all of its files. */
  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      await deleteSharedMediaGroupWithFiles(deleteTarget)
      closeDelete()
      await loadGroups()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const colCount = canWriteAny ? 6 : 5

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-5 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold text-brand">
          {t('admin.sharedMedia.title')}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10"
            onClick={() => void loadGroups()}
          >
            <RefreshIcon className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
            {t('admin.sharedMedia.refresh')}
          </button>
          {canCreate ? (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg"
              onClick={openNewGroup}
            >
              <PlusIcon className="size-4" />
              {t('admin.sharedMedia.addGroup')}
            </button>
          ) : null}
        </div>
      </header>

      {!canWriteAny ? (
        <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          {t('admin.sharedMedia.readOnlyHint')}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-300">
          {error}
        </p>
      ) : null}

      <div
        className={`overflow-hidden rounded-3xl border border-ink/10 bg-white/60 dark:bg-white/5 ${
          isLoading && groups.length > 0 ? 'opacity-60' : ''
        }`}
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white/90 text-left text-xs font-bold tracking-wide text-muted uppercase dark:bg-zinc-950/90">
              <tr>
                <th className="px-4 py-3">{t('admin.sharedMedia.col.sortOrder')}</th>
                <th className="px-4 py-3">{t('admin.sharedMedia.col.groupTitle')}</th>
                <th className="px-4 py-3">{t('admin.sharedMedia.col.status')}</th>
                <th className="px-4 py-3">{t('admin.sharedMedia.col.imageCount')}</th>
                <th className="px-4 py-3">{t('admin.sharedMedia.col.pdf')}</th>
                {canWriteAny ? (
                  <th className="px-4 py-3">{t('admin.sharedMedia.col.actions')}</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {isLoading && groups.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-10 text-center text-muted">
                    {t('admin.sharedMedia.loading')}
                  </td>
                </tr>
              ) : groups.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-10 text-center text-muted">
                    {t('admin.sharedMedia.emptyGroups')}
                  </td>
                </tr>
              ) : (
                groups.map((group) => (
                  <tr
                    key={group.id}
                    className={`border-t border-ink/5 text-ink ${
                      isDragging(group.id) ? 'opacity-50' : ''
                    } ${isDragOver(group.id) ? 'bg-brand/10' : ''}`}
                    onDragOver={
                      canUpdate ? (e) => onDragOver(e, group.id) : undefined
                    }
                    onDragLeave={canUpdate ? onDragLeave : undefined}
                    onDrop={
                      canUpdate
                        ? (e) =>
                            void onDrop(e, group.id, () => groups.map((g) => g.id))
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
                            aria-label={t('admin.sharedMedia.dragHandle')}
                            className={`rounded p-1 text-muted hover:bg-brand/10 hover:text-ink disabled:opacity-40 ${
                              saving || isReordering
                                ? 'cursor-not-allowed'
                                : 'cursor-grab active:cursor-grabbing'
                            }`}
                            onDragStart={(e) => onDragStart(e, group.id)}
                            onDragEnd={onDragEnd}
                          >
                            <GripIcon className="size-4" />
                          </button>
                        ) : null}
                        <span>{group.sortOrder}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 text-left font-semibold text-ink hover:text-brand hover:underline"
                        onClick={() => onNavigate(teMediaDetailPath(group.id))}
                      >
                        <LucideLayersIcon className="size-4 shrink-0 text-brand/80" aria-hidden />
                        {group.name}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      {canUpdate ? (
                        <button
                          type="button"
                          disabled={saving}
                          title={t('admin.sharedMedia.oneActiveHint')}
                          className={`rounded-md px-2 py-0.5 text-xs font-semibold disabled:opacity-50 ${
                            group.isActive
                              ? 'text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400'
                              : 'text-muted hover:bg-zinc-950/5'
                          }`}
                          onClick={() => void toggleActive(group)}
                        >
                          {group.isActive
                            ? t('admin.sharedMedia.active')
                            : t('admin.sharedMedia.inactive')}
                        </button>
                      ) : (
                        <span
                          className={
                            group.isActive
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-muted'
                          }
                        >
                          {group.isActive
                            ? t('admin.sharedMedia.active')
                            : t('admin.sharedMedia.inactive')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {sharedMediaImages(group).length}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          sharedMediaPdf(group)
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-muted'
                        }
                      >
                        {sharedMediaPdf(group)
                          ? t('admin.sharedMedia.pdfReady')
                          : t('admin.sharedMedia.pdfMissing')}
                      </span>
                    </td>
                    {canWriteAny ? (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {canUpdate ? (
                            <button
                              type="button"
                              title={t('admin.sharedMedia.editGroup')}
                              aria-label={t('admin.sharedMedia.editGroup')}
                              className="rounded p-1.5 text-muted hover:bg-brand/10 hover:text-brand"
                              onClick={() => openEditGroup(group)}
                            >
                              <PencilIcon className="size-3.5" />
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button
                              type="button"
                              disabled={saving}
                              title={t('admin.sharedMedia.deleteGroup')}
                              aria-label={t('admin.sharedMedia.deleteGroup')}
                              className="rounded p-1.5 text-muted hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-50"
                              onClick={() => openDelete(group)}
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
              closeModal()
            }
          }}
        >
          <div className="w-full max-w-md rounded-3xl border border-ink/10 bg-white p-5 shadow-2xl dark:bg-zinc-950">
            <h3 className="text-lg font-bold text-ink">
              {modalMode === 'group-new'
                ? t('admin.sharedMedia.addGroup')
                : t('admin.sharedMedia.editGroup')}
            </h3>
            <form className="mt-4 space-y-4" onSubmit={(e) => void submitGroupForm(e)}>
              <label className="block text-sm">
                <span className="font-medium text-ink">
                  {t('admin.sharedMedia.field.groupTitle')}
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
                  onClick={closeModal}
                >
                  {t('admin.sharedMedia.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-brand-fg disabled:opacity-60"
                >
                  {t('admin.sharedMedia.save')}
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
              closeDelete()
            }
          }}
        >
          <div className="w-full max-w-sm rounded-3xl border border-ink/10 bg-white p-5 shadow-2xl dark:bg-zinc-950">
            <h3 className="text-lg font-bold text-ink">
              {t('admin.sharedMedia.deleteGroupTitle')}
            </h3>
            <p className="mt-2 text-sm text-muted">
              {t('admin.sharedMedia.deleteGroupConfirm', {
                name: deleteTarget.name,
                count: deleteTarget.items.length,
              })}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-2xl border border-ink/10 px-4 py-2 text-sm font-bold text-ink"
                onClick={closeDelete}
              >
                {t('admin.sharedMedia.cancel')}
              </button>
              <button
                type="button"
                disabled={saving}
                className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-500 disabled:opacity-60"
                onClick={() => void confirmDelete()}
              >
                {t('admin.sharedMedia.delete')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
