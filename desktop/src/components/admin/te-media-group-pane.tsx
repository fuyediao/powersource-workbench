/**
 * T&E Admin shared-media group detail (Vue SharedMediaGroupView parity).
 */

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { useTableRowReorder } from '@/hooks/use-table-row-reorder'
import {
  ArrowLeftIcon,
  CopyIcon,
  FileTextIcon,
  GripIcon,
  ImageIcon,
  ImagePlusIcon,
  RefreshIcon,
  TrashIcon,
  UploadIcon,
} from '@/icons/AllIcons'
import {
  createSharedMediaItem,
  deleteSharedMediaItem,
  fetchSharedMediaGroupById,
  reorderSharedMediaItems,
  replaceSharedMediaPdf,
  sharedMediaImages,
  sharedMediaPdf,
  type SharedMediaGroup,
  type SharedMediaItem,
} from '@/services/shared-media-repository'
import {
  uploadSharedMediaImage,
  uploadSharedMediaPdf,
} from '@/services/shared-media-storage'
import { openExternalUrl } from '@/utils/shared/api'
import { teMediaListPath } from '@/utils/te-media-routes'

interface TeMediaGroupPaneProps {
  groupId: string
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

/**
 * Formats a byte size for the files table.
 *
 * @param size - Byte count or null.
 * @returns Human-readable size.
 */
function formatSize(size: number | null): string {
  if (size == null || !Number.isFinite(size)) {
    return '—'
  }
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Group detail: image upload plus JPEG thumbnail, PDF upload/replace, reorder, delete, copy URLs.
 *
 * @param props - Group id, writes, and navigation.
 * @returns Detail UI.
 */
export function TeMediaGroupPane({ groupId, writes, onNavigate }: TeMediaGroupPaneProps) {
  const { t } = useTranslation()
  const canCreate = Boolean(writes?.canCreate)
  const canUpdate = Boolean(writes?.canEdit)
  const canDelete = Boolean(writes?.canDelete)
  const canWriteAny = canCreate || canUpdate || canDelete

  const [group, setGroup] = useState<SharedMediaGroup | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SharedMediaItem | null>(null)

  const imageItems = useMemo(
    () => (group ? sharedMediaImages(group) : []),
    [group],
  )
  const pdfItem = useMemo(() => (group ? sharedMediaPdf(group) : null), [group])

  /**
   * Loads this media set.
   *
   * @returns Nothing.
   */
  const loadGroup = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      setGroup(await fetchSharedMediaGroupById(groupId))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setGroup(null)
    } finally {
      setIsLoading(false)
    }
  }, [groupId])

  useEffect(() => {
    void loadGroup()
  }, [loadGroup])

  /**
   * Persists image order after drag-and-drop. The PDF row is left in place.
   *
   * @param orderedIds - Image item ids in display order.
   */
  const reorder = useCallback(
    async (orderedIds: string[]): Promise<void> => {
      if (!group) {
        return
      }
      setSaving(true)
      setError(null)
      const snapshot = group.items.map((i) => ({ ...i }))
      try {
        const imageMap = new Map(sharedMediaImages(group).map((i) => [i.id, i]))
        const reorderedImages = orderedIds.map((id, index) => {
          const row = imageMap.get(id)
          if (!row) {
            throw new Error('Item not found')
          }
          return { ...row, sortOrder: index + 1 }
        })
        const pdf = sharedMediaPdf(group)
        setGroup({
          ...group,
          items: pdf ? [...reorderedImages, pdf] : reorderedImages,
        })
        await reorderSharedMediaItems(orderedIds)
      } catch (e) {
        setGroup({ ...group, items: snapshot })
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setSaving(false)
      }
    },
    [group],
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
   * Maps storage helper error codes to i18n.
   *
   * @param code - Storage helper error.
   * @returns Localized message.
   */
  function uploadErrorMessage(code: string): string {
    if (code === 'not_image') {
      return t('admin.sharedMedia.errorNotImage')
    }
    if (code === 'not_pdf') {
      return t('admin.sharedMedia.errorNotPdf')
    }
    return code
  }

  /**
   * Uploads one or more images into this set.
   *
   * @param event - File input change.
   */
  async function onPickImages(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.target
    const files = Array.from(input.files ?? [])
    input.value = ''
    if (!group || files.length === 0 || !canCreate) {
      return
    }

    setIsUploading(true)
    setError(null)
    setSuccess(null)
    let uploaded = 0
    let working: SharedMediaGroup = group
    try {
      for (const file of files) {
        const result = await uploadSharedMediaImage(working.id, file)
        if ('error' in result) {
          setError(uploadErrorMessage(result.error))
          break
        }
        const sortOrder = sharedMediaImages(working).length + 1
        const itemId = await createSharedMediaItem({
          groupId: working.id,
          kind: 'image',
          storagePath: result.path,
          thumbnailPath: result.thumbnailPath,
          fileName: result.fileName,
          sortOrder,
          fileSize: result.fileSize,
        })
        const nextItem: SharedMediaItem = {
          id: itemId,
          groupId: working.id,
          kind: 'image',
          storagePath: result.path,
          thumbnailPath: result.thumbnailPath,
          fileName: result.fileName,
          publicUrl: result.publicUrl,
          thumbnailPublicUrl: result.thumbnailPublicUrl,
          sortOrder,
          fileSize: result.fileSize,
        }
        working = { ...working, items: [...working.items, nextItem] }
        setGroup(working)
        uploaded += 1
      }
      if (uploaded > 0) {
        setSuccess(t('admin.sharedMedia.uploadDone', { count: uploaded }))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsUploading(false)
    }
  }

  /**
   * Uploads or replaces the single PDF for this set.
   *
   * @param event - File input change.
   */
  async function onPickPdf(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.target
    const file = input.files?.[0]
    input.value = ''
    if (!group || !file || !canCreate) {
      return
    }

    setIsUploading(true)
    setError(null)
    setSuccess(null)
    try {
      const result = await uploadSharedMediaPdf(group.id, file)
      if ('error' in result) {
        setError(uploadErrorMessage(result.error))
        return
      }
      const pdf = await replaceSharedMediaPdf(group, {
        path: result.path,
        fileName: result.fileName,
        fileSize: result.fileSize,
        publicUrl: result.publicUrl,
      })
      setGroup({
        ...group,
        items: [...sharedMediaImages(group), pdf],
      })
      setSuccess(t('admin.sharedMedia.pdfReplaced'))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsUploading(false)
    }
  }

  /**
   * Copies the original (full-size) public URL.
   *
   * @param item - Media item.
   */
  async function copyUrl(item: SharedMediaItem): Promise<void> {
    try {
      await navigator.clipboard.writeText(item.publicUrl)
      setSuccess(t('admin.sharedMedia.urlCopied'))
      setError(null)
    } catch {
      setError(t('admin.sharedMedia.errorCopyFailed'))
    }
  }

  /**
   * Copies the thumbnail public URL when present.
   *
   * @param item - Media item.
   */
  async function copyThumbUrl(item: SharedMediaItem): Promise<void> {
    if (!item.thumbnailPublicUrl) {
      return
    }
    try {
      await navigator.clipboard.writeText(item.thumbnailPublicUrl)
      setSuccess(t('admin.sharedMedia.thumbUrlCopied'))
      setError(null)
    } catch {
      setError(t('admin.sharedMedia.errorCopyFailed'))
    }
  }

  /**
   * Opens a public media URL in the system browser.
   *
   * @param url - Public storage URL.
   * @param event - Anchor click.
   */
  function openPublicUrl(
    url: string,
    event: { preventDefault: () => void },
  ): void {
    event.preventDefault()
    void openExternalUrl(url)
  }

  /**
   * Opens delete confirmation.
   *
   * @param item - File to remove.
   */
  function openDelete(item: SharedMediaItem): void {
    setDeleteTarget(item)
  }

  /** Closes the delete dialog. */
  function closeDelete(): void {
    setDeleteTarget(null)
  }

  /** Confirms file delete. */
  async function confirmDelete(): Promise<void> {
    if (!deleteTarget || !group) {
      return
    }
    const deletedId = deleteTarget.id
    setSaving(true)
    setError(null)
    try {
      await deleteSharedMediaItem(deleteTarget)
      setGroup({
        ...group,
        items: group.items.filter((i) => i.id !== deletedId),
      })
      setSuccess(t('admin.sharedMedia.deleteDone'))
      closeDelete()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  /** Navigates back to the set list. */
  function goBack(): void {
    onNavigate(teMediaListPath())
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-ink/10 bg-white/80 px-4 py-3 backdrop-blur-md dark:bg-zinc-950/80">
        <button
          type="button"
          className="rounded-xl p-2 text-brand hover:bg-brand/10"
          title={t('admin.sharedMedia.backToGroups')}
          aria-label={t('admin.sharedMedia.backToGroups')}
          onClick={goBack}
        >
          <ArrowLeftIcon className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-extrabold text-brand">
            <span className="truncate">
              {group?.name ?? t('admin.sharedMedia.groupFilesTitle')}
            </span>
          </h1>
          {group ? (
            <p className="mt-0.5 truncate text-sm font-medium text-muted">
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
              {' · '}
              {t('admin.sharedMedia.imageCount', { count: imageItems.length })}
              {' · '}
              {pdfItem
                ? t('admin.sharedMedia.pdfReady')
                : t('admin.sharedMedia.pdfMissing')}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          disabled={isLoading}
          className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10"
          onClick={() => void loadGroup()}
        >
          <RefreshIcon className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{t('admin.sharedMedia.refresh')}</span>
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto p-5 sm:p-6">
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
        {success ? (
          <p className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
            {success}
          </p>
        ) : null}

        {isLoading && !group ? (
          <p className="text-sm text-muted">{t('admin.sharedMedia.loading')}</p>
        ) : !group ? (
          <div className="rounded-3xl border border-ink/10 bg-white/60 px-6 py-10 text-center text-sm text-muted dark:bg-white/5">
            {t('admin.sharedMedia.groupNotFound')}
            <div className="mt-4">
              <button
                type="button"
                className="rounded-2xl border border-ink/10 px-4 py-2 text-sm font-bold text-ink hover:bg-zinc-950/5"
                onClick={goBack}
              >
                {t('admin.sharedMedia.backToGroups')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
                  <ImageIcon className="size-5 text-brand" aria-hidden />
                  {t('admin.sharedMedia.sectionImages')}
                </h2>
                {canCreate ? (
                  <label
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg hover:bg-brand/90 ${
                      isUploading ? 'pointer-events-none opacity-60' : ''
                    }`}
                  >
                    <UploadIcon className="size-4" aria-hidden />
                    {isUploading
                      ? t('admin.sharedMedia.uploading')
                      : t('admin.sharedMedia.uploadImages')}
                    <input
                      type="file"
                      className="sr-only"
                      accept="image/*"
                      multiple
                      disabled={isUploading}
                      onChange={(e) => void onPickImages(e)}
                    />
                  </label>
                ) : null}
              </div>

              {imageItems.length === 0 ? (
                <div className="rounded-3xl border border-ink/10 bg-white/60 px-6 py-12 text-center text-sm text-muted dark:bg-white/5">
                  {t('admin.sharedMedia.emptyImages')}
                </div>
              ) : (
                <div
                  className={`overflow-hidden rounded-3xl border border-ink/10 bg-white/60 dark:bg-white/5 ${
                    isLoading ? 'opacity-60' : ''
                  }`}
                >
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-white/90 text-left text-xs font-bold tracking-wide text-muted uppercase dark:bg-zinc-950/90">
                        <tr>
                          <th className="px-4 py-3">
                            {t('admin.sharedMedia.col.sortOrder')}
                          </th>
                          <th className="px-4 py-3">
                            {t('admin.sharedMedia.col.preview')}
                          </th>
                          <th className="px-4 py-3">{t('admin.sharedMedia.col.name')}</th>
                          <th className="px-4 py-3">{t('admin.sharedMedia.col.size')}</th>
                          <th className="px-4 py-3">
                            {t('admin.sharedMedia.col.actions')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {imageItems.map((item) => (
                          <tr
                            key={item.id}
                            className={`border-t border-ink/5 text-ink ${
                              isDragging(item.id) ? 'opacity-50' : ''
                            } ${isDragOver(item.id) ? 'bg-brand/10' : ''}`}
                            onDragOver={
                              canUpdate ? (e) => onDragOver(e, item.id) : undefined
                            }
                            onDragLeave={canUpdate ? onDragLeave : undefined}
                            onDrop={
                              canUpdate
                                ? (e) =>
                                    void onDrop(e, item.id, () =>
                                      imageItems.map((i) => i.id),
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
                                    aria-label={t('admin.sharedMedia.dragHandle')}
                                    className={`rounded p-1 text-muted hover:bg-brand/10 hover:text-ink disabled:opacity-40 ${
                                      saving || isReordering
                                        ? 'cursor-not-allowed'
                                        : 'cursor-grab active:cursor-grabbing'
                                    }`}
                                    onDragStart={(e) => onDragStart(e, item.id)}
                                    onDragEnd={onDragEnd}
                                  >
                                    <GripIcon className="size-4" />
                                  </button>
                                ) : null}
                                <span>{item.sortOrder}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <a
                                href={item.publicUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block size-14 overflow-hidden rounded-md border border-ink/10 bg-zinc-950/5"
                                onClick={(e) => openPublicUrl(item.publicUrl, e)}
                              >
                                <img
                                  src={item.thumbnailPublicUrl || item.publicUrl}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              </a>
                            </td>
                            <td className="max-w-xs px-4 py-3">
                              <p
                                className="truncate font-medium text-ink"
                                title={item.fileName}
                              >
                                {item.fileName}
                              </p>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted">
                              {formatSize(item.fileSize)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  title={t('admin.sharedMedia.copyUrl')}
                                  aria-label={t('admin.sharedMedia.copyUrl')}
                                  className="rounded p-1.5 text-muted hover:bg-brand/10 hover:text-brand"
                                  onClick={() => void copyUrl(item)}
                                >
                                  <CopyIcon className="size-3.5" />
                                </button>
                                {item.thumbnailPublicUrl ? (
                                  <button
                                    type="button"
                                    title={t('admin.sharedMedia.copyThumbUrl')}
                                    aria-label={t('admin.sharedMedia.copyThumbUrl')}
                                    className="rounded p-1.5 text-muted hover:bg-brand/10 hover:text-brand"
                                    onClick={() => void copyThumbUrl(item)}
                                  >
                                    <ImagePlusIcon className="size-3.5" />
                                  </button>
                                ) : null}
                                {canDelete ? (
                                  <button
                                    type="button"
                                    title={t('admin.sharedMedia.delete')}
                                    aria-label={t('admin.sharedMedia.delete')}
                                    className="rounded p-1.5 text-muted hover:bg-rose-500/10 hover:text-rose-500"
                                    onClick={() => openDelete(item)}
                                  >
                                    <TrashIcon className="size-3.5" />
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-ink">
                  {t('admin.sharedMedia.sectionPdf')}
                </h2>
                {canCreate ? (
                  <label
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10 ${
                      isUploading ? 'pointer-events-none opacity-60' : ''
                    }`}
                  >
                    <UploadIcon className="size-4" aria-hidden />
                    {isUploading
                      ? t('admin.sharedMedia.uploading')
                      : pdfItem
                        ? t('admin.sharedMedia.replacePdf')
                        : t('admin.sharedMedia.uploadPdf')}
                    <input
                      type="file"
                      className="sr-only"
                      accept="application/pdf,.pdf"
                      disabled={isUploading}
                      onChange={(e) => void onPickPdf(e)}
                    />
                  </label>
                ) : null}
              </div>

              {!pdfItem ? (
                <div className="rounded-3xl border border-ink/10 bg-white/60 px-6 py-12 text-center text-sm text-muted dark:bg-white/5">
                  {t('admin.sharedMedia.emptyPdfs')}
                </div>
              ) : (
                <div className="overflow-hidden rounded-3xl border border-ink/10 bg-white/60 dark:bg-white/5">
                  <div className="flex flex-wrap items-center gap-4 px-4 py-4 text-sm text-ink">
                    <a
                      href={pdfItem.publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex size-14 items-center justify-center rounded-md border border-ink/10 bg-zinc-950/5 text-brand"
                      onClick={(e) => openPublicUrl(pdfItem.publicUrl, e)}
                    >
                      <FileTextIcon className="size-6" aria-hidden />
                    </a>
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate font-medium text-ink"
                        title={pdfItem.fileName}
                      >
                        {pdfItem.fileName}
                      </p>
                      <p className="mt-0.5 tabular-nums text-muted">
                        {formatSize(pdfItem.fileSize)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        title={t('admin.sharedMedia.copyUrl')}
                        aria-label={t('admin.sharedMedia.copyUrl')}
                        className="rounded p-1.5 text-muted hover:bg-brand/10 hover:text-brand"
                        onClick={() => void copyUrl(pdfItem)}
                      >
                        <CopyIcon className="size-3.5" />
                      </button>
                      {canDelete ? (
                        <button
                          type="button"
                          title={t('admin.sharedMedia.delete')}
                          aria-label={t('admin.sharedMedia.delete')}
                          className="rounded p-1.5 text-muted hover:bg-rose-500/10 hover:text-rose-500"
                          onClick={() => openDelete(pdfItem)}
                        >
                          <TrashIcon className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>

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
              {t('admin.sharedMedia.deleteTitle')}
            </h3>
            <p className="mt-2 text-sm text-muted">
              {t('admin.sharedMedia.deleteConfirm', { name: deleteTarget.fileName })}
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
