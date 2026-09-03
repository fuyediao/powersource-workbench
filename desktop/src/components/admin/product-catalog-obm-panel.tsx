/**
 * OBM storefront editor on product catalog detail (web product-catalog-obm-panel parity).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type FormEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  CloseIcon,
  ImagePlusIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '@/icons/AllIcons'
import {
  updateProductCatalogObmFields,
  type ProductCatalogItem,
  type ProductCatalogObmSpec,
} from '@/services/product-catalog-api'
import {
  MAX_PRODUCT_CATALOG_OBM_IMAGES,
  removeProductCatalogObmImage,
  uploadProductCatalogObmImage,
} from '@/services/product-catalog-obm-storage'
import { sanitizeObmRichTextHtml } from '@/utils/obm-rich-text'

/** OBM fields emitted after a successful save. */
export type ProductCatalogObmSavedSlice = Pick<
  ProductCatalogItem,
  | 'obmDisplayName'
  | 'obmImageUrls'
  | 'obmIntro'
  | 'obmDetails'
  | 'obmSpecs'
  | 'obmFeatures'
  | 'obmWarnings'
>

interface ProductCatalogObmPanelProps {
  item: ProductCatalogItem
  canEdit: boolean
  onSaved: (next: ProductCatalogObmSavedSlice) => void
}

/**
 * OBM gallery + rich-text fields for a catalog SKU.
 * @param props - Item, edit grant, save callback.
 * @returns Panel UI.
 */
export function ProductCatalogObmPanel({
  item,
  canEdit,
  onSaved,
}: ProductCatalogObmPanelProps) {
  const { t } = useTranslation()
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [activeImage, setActiveImage] = useState(0)
  const [displayNameDraft, setDisplayNameDraft] = useState('')
  const [imageUrlsDraft, setImageUrlsDraft] = useState<string[]>([])
  const [introDraft, setIntroDraft] = useState('')
  const [detailsDraft, setDetailsDraft] = useState('')
  const [specsDraft, setSpecsDraft] = useState<ProductCatalogObmSpec[]>([
    { label: '', value: '' },
  ])
  const [featuresDraft, setFeaturesDraft] = useState('')
  const [warningsDraft, setWarningsDraft] = useState('')
  const [dragImageIndex, setDragImageIndex] = useState<number | null>(null)
  const [dragOverImageIndex, setDragOverImageIndex] = useState<number | null>(null)

  const syncDraftFromItem = useCallback((): void => {
    setDisplayNameDraft(item.obmDisplayName ?? '')
    setImageUrlsDraft([...item.obmImageUrls])
    setIntroDraft(item.obmIntro ?? '')
    setDetailsDraft(item.obmDetails ?? '')
    setSpecsDraft(
      item.obmSpecs.length > 0
        ? item.obmSpecs.map((s) => ({ ...s }))
        : [{ label: '', value: '' }],
    )
    setFeaturesDraft(item.obmFeatures ?? '')
    setWarningsDraft(item.obmWarnings ?? '')
    setActiveImage(0)
    setSaveError(null)
    setSaveSuccess(false)
  }, [item])

  useEffect(() => {
    setIsEditing(false)
    syncDraftFromItem()
  }, [item.id, syncDraftFromItem])

  const galleryUrls = isEditing ? imageUrlsDraft : item.obmImageUrls
  const activeUrl = useMemo(() => {
    if (galleryUrls.length === 0) {
      return null
    }
    const idx = Math.min(Math.max(0, activeImage), galleryUrls.length - 1)
    return galleryUrls[idx] ?? null
  }, [activeImage, galleryUrls])

  const introHtml = useMemo(() => sanitizeObmRichTextHtml(item.obmIntro ?? ''), [item.obmIntro])
  const detailsHtml = useMemo(
    () => sanitizeObmRichTextHtml(item.obmDetails ?? ''),
    [item.obmDetails],
  )
  const featuresHtml = useMemo(
    () => sanitizeObmRichTextHtml(item.obmFeatures ?? ''),
    [item.obmFeatures],
  )
  const warningsHtml = useMemo(
    () => sanitizeObmRichTextHtml(item.obmWarnings ?? ''),
    [item.obmWarnings],
  )

  /**
   * Persists OBM fields.
   * @param event - Form submit.
   */
  async function save(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!canEdit || !isEditing) {
      return
    }
    setIsSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      await updateProductCatalogObmFields(item.id, {
        displayName: displayNameDraft,
        imageUrls: imageUrlsDraft,
        intro: introDraft,
        details: detailsDraft,
        specs: specsDraft,
        features: featuresDraft,
        warnings: warningsDraft,
      })
      const nextDisplay = displayNameDraft.trim()
      const next: ProductCatalogObmSavedSlice = {
        obmDisplayName: nextDisplay.length > 0 ? nextDisplay : null,
        obmImageUrls: imageUrlsDraft.map((u) => u.trim()).filter((u) => u.length > 0),
        obmIntro: introDraft.trim() || null,
        obmDetails: detailsDraft.trim() || null,
        obmSpecs: specsDraft
          .map((row) => ({ label: row.label.trim(), value: row.value.trim() }))
          .filter((row) => row.label.length > 0 || row.value.length > 0),
        obmFeatures: featuresDraft.trim() || null,
        obmWarnings: warningsDraft.trim() || null,
      }
      onSaved(next)
      setIsEditing(false)
      setSaveSuccess(true)
    } catch (e) {
      setSaveError(
        e instanceof Error ? e.message : t('admin.productCatalog.errorSaveObmFields'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  /**
   * Uploads selected image files into the OBM gallery.
   * @param files - File list from the input.
   */
  async function onPickImages(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) {
      return
    }
    const remaining = MAX_PRODUCT_CATALOG_OBM_IMAGES - imageUrlsDraft.length
    if (remaining <= 0) {
      setSaveError(
        t('admin.productCatalog.obmImagesMax', { max: MAX_PRODUCT_CATALOG_OBM_IMAGES }),
      )
      return
    }
    setIsUploading(true)
    setSaveError(null)
    try {
      let next = [...imageUrlsDraft]
      for (const file of Array.from(files).slice(0, remaining)) {
        const result = await uploadProductCatalogObmImage(item.id, file)
        if ('error' in result) {
          setSaveError(
            result.error === 'not_image'
              ? t('admin.productCatalog.obmImageNotImage')
              : result.error === 'file_too_large'
                ? t('admin.productCatalog.obmImageTooLarge')
                : result.error,
          )
          break
        }
        next = [...next, result.publicUrl]
        setActiveImage(next.length - 1)
      }
      setImageUrlsDraft(next)
    } finally {
      setIsUploading(false)
    }
  }

  /**
   * Removes one gallery image (Storage + draft).
   * @param index - Index in the draft list.
   */
  async function removeImageAt(index: number): Promise<void> {
    const url = imageUrlsDraft[index]
    if (!url) {
      return
    }
    const err = await removeProductCatalogObmImage(url)
    if (err) {
      setSaveError(err)
      return
    }
    const next = imageUrlsDraft.filter((_, i) => i !== index)
    setImageUrlsDraft(next)
    setActiveImage((cur) => (cur >= next.length ? Math.max(0, next.length - 1) : cur))
  }

  /**
   * Begins dragging a gallery thumbnail to reorder.
   * @param event - Drag start event.
   * @param index - Source index.
   */
  function onImageDragStart(event: DragEvent, index: number): void {
    if (isSaving || isUploading) {
      event.preventDefault()
      return
    }
    setDragImageIndex(index)
    event.dataTransfer.setData('text/plain', String(index))
    event.dataTransfer.effectAllowed = 'move'
  }

  /**
   * Reorders draft images after a successful drop.
   * @param event - Drop event.
   * @param toIndex - Destination index.
   */
  function onImageDrop(event: DragEvent, toIndex: number): void {
    event.preventDefault()
    const fromIndex = dragImageIndex
    setDragOverImageIndex(null)
    setDragImageIndex(null)
    if (fromIndex == null || fromIndex === toIndex) {
      return
    }
    const next = [...imageUrlsDraft]
    const [moved] = next.splice(fromIndex, 1)
    if (!moved) {
      return
    }
    next.splice(toIndex, 0, moved)
    setImageUrlsDraft(next)
    setActiveImage(toIndex)
  }

  const fieldClass =
    'mt-1 w-full rounded-2xl border border-ink/10 bg-white/80 px-3 py-2 text-ink outline-none focus:border-brand/40 disabled:opacity-60 dark:bg-white/5'

  return (
    <section className="rounded-3xl border border-ink/10 bg-white/60 p-6 dark:bg-white/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-ink">
            {t('admin.productCatalog.obmSectionTitle')}
          </h2>
          <p className="mt-1 text-sm text-muted">{t('admin.productCatalog.obmSectionHint')}</p>
        </div>
        {canEdit && !isEditing ? (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-2xl border border-ink/10 bg-white/70 px-3 py-2 text-sm font-bold text-ink dark:bg-white/5"
            onClick={() => {
              syncDraftFromItem()
              setIsEditing(true)
            }}
          >
            <PencilIcon className="size-4" aria-hidden />
            {t('admin.productCatalog.edit')}
          </button>
        ) : null}
      </div>

      {isEditing ? (
        <form className="mt-5 space-y-6" onSubmit={(e) => void save(e)}>
          <label className="block text-sm">
            <span className="font-medium text-ink">{t('admin.productCatalog.obmDisplayName')}</span>
            <input
              type="text"
              value={displayNameDraft}
              disabled={isSaving}
              placeholder={t('admin.productCatalog.obmDisplayNamePlaceholder')}
              className={fieldClass}
              onChange={(e) => setDisplayNameDraft(e.target.value)}
            />
            <span className="mt-1 block text-xs text-muted">
              {t('admin.productCatalog.obmDisplayNameHint')}
            </span>
          </label>

          <div>
            <p className="text-sm font-medium text-ink">{t('admin.productCatalog.obmImages')}</p>
            <p className="mt-1 text-xs text-muted">
              {t('admin.productCatalog.obmImagesHint', { max: MAX_PRODUCT_CATALOG_OBM_IMAGES })}
            </p>
            <div className="@container mt-3">
              <div className="flex flex-col items-start gap-3 @[34rem]:flex-row">
                <div className="aspect-square w-full max-w-[22rem] overflow-hidden rounded-2xl border border-ink/10 bg-zinc-950/5 @[34rem]:w-[22rem] @[34rem]:shrink-0 dark:bg-white/5">
                  {activeUrl ? (
                    <img src={activeUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full min-h-48 items-center justify-center text-sm text-muted">
                      {t('admin.productCatalog.obmNoImage')}
                    </div>
                  )}
                </div>
                <div className="grid shrink-0 grid-cols-2 content-start gap-2">
                  {imageUrlsDraft.map((url, index) => (
                    <div
                      key={url}
                      className={`relative size-16 shrink-0 ${
                        dragImageIndex === index ? 'opacity-50' : ''
                      } ${
                        dragOverImageIndex === index && dragImageIndex !== index
                          ? 'rounded-md ring-2 ring-brand ring-offset-1'
                          : ''
                      }`}
                      draggable
                      onDragStart={(e) => onImageDragStart(e, index)}
                      onDragOver={(e) => {
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                        setDragOverImageIndex(index)
                      }}
                      onDragLeave={() => setDragOverImageIndex(null)}
                      onDrop={(e) => onImageDrop(e, index)}
                      onDragEnd={() => {
                        setDragImageIndex(null)
                        setDragOverImageIndex(null)
                      }}
                    >
                      <button
                        type="button"
                        title={t('admin.productCatalog.obmImagesReorderHint')}
                        disabled={isUploading || isSaving}
                        className={`size-16 cursor-grab overflow-hidden rounded-md border-2 active:cursor-grabbing ${
                          index === activeImage ? 'border-brand' : 'border-transparent'
                        }`}
                        onClick={() => setActiveImage(index)}
                      >
                        <img
                          src={url}
                          alt=""
                          draggable={false}
                          className="pointer-events-none h-full w-full object-cover"
                        />
                      </button>
                      <button
                        type="button"
                        aria-label={t('admin.productCatalog.obmRemoveImage')}
                        disabled={isUploading || isSaving}
                        className="absolute -top-1.5 -right-1.5 z-10 rounded-full bg-rose-600 p-0.5 text-white hover:bg-rose-500"
                        onClick={() => void removeImageAt(index)}
                      >
                        <CloseIcon className="size-3.5" aria-hidden />
                      </button>
                    </div>
                  ))}
                  {imageUrlsDraft.length < MAX_PRODUCT_CATALOG_OBM_IMAGES ? (
                    <label className="inline-flex size-16 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-ink/20 text-muted hover:border-brand hover:text-brand">
                      <ImagePlusIcon className="size-5" aria-hidden />
                      <span className="text-[10px]">{t('admin.productCatalog.obmAddImage')}</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="sr-only"
                        disabled={isUploading || isSaving}
                        onChange={(e) => {
                          void onPickImages(e.target.files)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  ) : null}
                </div>
              </div>
            </div>
            {isUploading ? (
              <p className="mt-2 text-xs text-muted">{t('admin.productCatalog.obmUploading')}</p>
            ) : null}
          </div>

          <label className="block text-sm">
            <span className="font-medium text-ink">{t('admin.productCatalog.obmIntro')}</span>
            <textarea
              rows={4}
              value={introDraft}
              disabled={isSaving}
              placeholder={t('admin.productCatalog.obmIntroPlaceholder')}
              className={fieldClass}
              onChange={(e) => setIntroDraft(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">{t('admin.productCatalog.obmDetails')}</span>
            <textarea
              rows={6}
              value={detailsDraft}
              disabled={isSaving}
              placeholder={t('admin.productCatalog.obmDetailsPlaceholder')}
              className={fieldClass}
              onChange={(e) => setDetailsDraft(e.target.value)}
            />
            <span className="mt-1 block text-xs text-muted">
              {t('admin.productCatalog.obmDetailsHint')}
            </span>
          </label>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-ink">
                {t('admin.productCatalog.obmSpecs')}
              </span>
              <button
                type="button"
                disabled={isSaving}
                className="inline-flex items-center gap-1 rounded-xl border border-ink/10 px-2 py-1 text-xs font-bold text-ink"
                onClick={() =>
                  setSpecsDraft((rows) => [...rows, { label: '', value: '' }])
                }
              >
                <PlusIcon className="size-3.5" aria-hidden />
                {t('admin.productCatalog.obmAddRow')}
              </button>
            </div>
            <div className="space-y-2">
              {specsDraft.map((row, index) => (
                <div key={`spec-${index}`} className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={row.label}
                    disabled={isSaving}
                    placeholder={t('admin.productCatalog.obmSpecLabel')}
                    className="min-w-[8rem] flex-1 rounded-2xl border border-ink/10 bg-white/80 px-3 py-2 text-sm text-ink dark:bg-white/5"
                    onChange={(e) => {
                      const value = e.target.value
                      setSpecsDraft((rows) =>
                        rows.map((r, i) => (i === index ? { ...r, label: value } : r)),
                      )
                    }}
                  />
                  <input
                    type="text"
                    value={row.value}
                    disabled={isSaving}
                    placeholder={t('admin.productCatalog.obmSpecValue')}
                    className="min-w-[8rem] flex-1 rounded-2xl border border-ink/10 bg-white/80 px-3 py-2 text-sm text-ink dark:bg-white/5"
                    onChange={(e) => {
                      const value = e.target.value
                      setSpecsDraft((rows) =>
                        rows.map((r, i) => (i === index ? { ...r, value } : r)),
                      )
                    }}
                  />
                  <button
                    type="button"
                    aria-label={t('admin.productCatalog.obmRemoveRow')}
                    disabled={isSaving}
                    className="rounded-xl border border-ink/10 px-2 text-muted hover:text-rose-500"
                    onClick={() =>
                      setSpecsDraft((rows) => {
                        const next = rows.filter((_, i) => i !== index)
                        return next.length > 0 ? next : [{ label: '', value: '' }]
                      })
                    }
                  >
                    <TrashIcon className="size-4" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <label className="block text-sm">
            <span className="font-medium text-ink">{t('admin.productCatalog.obmFeatures')}</span>
            <textarea
              rows={5}
              value={featuresDraft}
              disabled={isSaving}
              placeholder={t('admin.productCatalog.obmFeaturesPlaceholder')}
              className={fieldClass}
              onChange={(e) => setFeaturesDraft(e.target.value)}
            />
            <span className="mt-1 block text-xs text-muted">
              {t('admin.productCatalog.obmFeaturesHint')}
            </span>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">{t('admin.productCatalog.obmWarnings')}</span>
            <textarea
              rows={4}
              value={warningsDraft}
              disabled={isSaving}
              placeholder={t('admin.productCatalog.obmWarningsPlaceholder')}
              className={fieldClass}
              onChange={(e) => setWarningsDraft(e.target.value)}
            />
            <span className="mt-1 block text-xs text-muted">
              {t('admin.productCatalog.obmWarningsHint')}
            </span>
          </label>

          {saveError ? <p className="text-sm text-rose-500">{saveError}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={isSaving || isUploading}
              className="rounded-2xl border border-ink/10 px-4 py-2 text-sm font-bold text-ink disabled:opacity-60"
              onClick={() => {
                syncDraftFromItem()
                setIsEditing(false)
              }}
            >
              {t('admin.productCatalog.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSaving || isUploading}
              className="rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-brand-fg disabled:opacity-60"
            >
              {isSaving ? t('admin.productCatalog.saving') : t('admin.productCatalog.save')}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-5 space-y-6">
          <div>
            <h3 className="text-xs font-bold tracking-wide text-muted uppercase">
              {t('admin.productCatalog.obmDisplayName')}
            </h3>
            <p className="mt-1 text-sm text-ink">{item.obmDisplayName || '—'}</p>
            <p className="mt-1 text-xs text-muted">{t('admin.productCatalog.obmDisplayNameHint')}</p>
          </div>

          {item.obmImageUrls.length > 0 ? (
            <div className="@container">
              <div className="flex flex-col items-start gap-3 @[34rem]:flex-row">
                <div className="aspect-square w-full max-w-[22rem] overflow-hidden rounded-2xl border border-ink/10 bg-zinc-950/5 @[34rem]:w-[22rem] @[34rem]:shrink-0 dark:bg-white/5">
                  {activeUrl ? (
                    <img src={activeUrl} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                {item.obmImageUrls.length > 1 ? (
                  <div className="grid shrink-0 grid-cols-2 content-start gap-2">
                    {item.obmImageUrls.map((url, index) => (
                      <button
                        key={url}
                        type="button"
                        className={`size-16 shrink-0 overflow-hidden rounded-md border-2 ${
                          index === activeImage ? 'border-brand' : 'border-transparent'
                        }`}
                        onClick={() => setActiveImage(index)}
                      >
                        <img src={url} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {(
            [
              ['obmIntro', introHtml],
              ['obmDetails', detailsHtml],
              ['obmFeatures', featuresHtml],
            ] as const
          ).map(([key, html]) => (
            <div key={key}>
              <h3 className="text-xs font-bold tracking-wide text-muted uppercase">
                {t(`admin.productCatalog.${key}`)}
              </h3>
              {html ? (
                <div
                  className="obm-md mt-1 text-sm text-ink"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              ) : (
                <p className="mt-1 text-sm text-muted">—</p>
              )}
            </div>
          ))}

          <div>
            <h3 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
              {t('admin.productCatalog.obmSpecs')}
            </h3>
            {item.obmSpecs.length > 0 ? (
              <table className="w-full text-sm">
                <tbody>
                  {item.obmSpecs.map((row, index) => (
                    <tr key={`${row.label}-${index}`} className="border-b border-ink/10">
                      <th className="py-2 pr-4 text-left font-medium text-muted">
                        {row.label || '—'}
                      </th>
                      <td className="py-2 text-ink">{row.value || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted">—</p>
            )}
          </div>

          <div>
            <h3 className="text-xs font-bold tracking-wide text-muted uppercase">
              {t('admin.productCatalog.obmWarnings')}
            </h3>
            {warningsHtml ? (
              <div
                className="obm-md mt-1 text-sm text-amber-700 dark:text-amber-200/90"
                dangerouslySetInnerHTML={{ __html: warningsHtml }}
              />
            ) : (
              <p className="mt-1 text-sm text-muted">—</p>
            )}
          </div>

          {!canEdit ? (
            <p className="text-sm text-amber-700 dark:text-amber-200/90">
              {t('admin.productCatalog.crmFieldsReadOnly')}
            </p>
          ) : null}
          {saveSuccess ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              {t('admin.productCatalog.obmFieldsSaved')}
            </p>
          ) : null}
        </div>
      )}
    </section>
  )
}
