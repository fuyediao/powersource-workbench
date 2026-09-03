/**
 * Multi-image picker for competitor shop / product photos
 * (Vue `CompetitorPhotoUrlListField` parity).
 */

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLinkIcon, TrashIcon, UploadIcon } from '@/icons/AllIcons'
import { useLinkOpen } from '@/hooks/link-open-context'
import {
  deleteCompetitorStorageObject,
  uploadCompetitorProductPhoto,
  uploadCompetitorShopPhoto,
} from '@/services/competitor-storage'
import { isImageSizeWithinLimit } from '@/utils/image-upload'
import {
  isHttpsImageSrc,
  MAX_COMPETITOR_PHOTO_URLS,
  normalizeCompetitorPhotoUrlList,
} from '@/utils/competitor-photo-urls'

interface CompetitorPhotoUrlListFieldProps {
  idPrefix: string
  readonly?: boolean
  variant: 'shop' | 'line'
  uploadMode: 'live' | 'deferred'
  groupId: string
  shopId: string
  lineId?: string | null
  urls: string[]
  onUrlsChange: (next: string[]) => void
  pendingFiles: File[]
  onPendingFilesChange: (next: File[]) => void
}

/**
 * Searchable photo list with live Storage upload or deferred queue.
 * @param props - Variant, ids, urls, and pending files.
 * @returns Photo field UI.
 */
export function CompetitorPhotoUrlListField({
  idPrefix,
  readonly = false,
  variant,
  uploadMode,
  groupId,
  shopId,
  lineId = null,
  urls,
  onUrlsChange,
  pendingFiles,
  onPendingFilesChange,
}: CompetitorPhotoUrlListFieldProps) {
  const { t } = useTranslation()
  const { openUrl } = useLinkOpen()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [blobUrls, setBlobUrls] = useState<string[]>([])

  useEffect(() => {
    const next = pendingFiles.map((file) => URL.createObjectURL(file))
    setBlobUrls(next)
    return () => {
      for (const url of next) {
        URL.revokeObjectURL(url)
      }
    }
  }, [pendingFiles])

  const totalCount = urls.length + pendingFiles.length
  const canAddMore = totalCount < MAX_COMPETITOR_PHOTO_URLS
  const liveReady =
    uploadMode === 'live' &&
    Boolean(groupId.trim() && shopId.trim()) &&
    (variant === 'shop' || Boolean(lineId?.trim()))

  /**
   * Maps storage / validation error codes to i18n messages.
   * @param code - Raw error string.
   * @returns Localized message.
   */
  function mapUploadError(code: string): string {
    if (code === 'not_image') {
      return t('admin.competitor.photoUrls.errorNotImage')
    }
    if (code === 'file_too_large') {
      return t('admin.competitor.photoUrls.errorFileTooLarge')
    }
    if (code === 'Storage is not configured') {
      return t('admin.competitor.photoUrls.errorStorage')
    }
    return code
  }

  /**
   * Handles file input changes for live uploads and deferred queuing.
   * @param event - File input change.
   * @returns Nothing.
   */
  async function onFileInputChange(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const picked = [...(event.target.files ?? [])]
    event.target.value = ''
    setUploadError(null)
    if (readonly || picked.length === 0) {
      return
    }
    if (uploadMode === 'deferred') {
      const next = [...pendingFiles]
      for (const file of picked) {
        if (!file.type.startsWith('image/')) {
          setUploadError(t('admin.competitor.photoUrls.errorNotImage'))
          break
        }
        if (!isImageSizeWithinLimit(file)) {
          setUploadError(t('admin.competitor.photoUrls.errorFileTooLarge'))
          break
        }
        if (next.length + urls.length >= MAX_COMPETITOR_PHOTO_URLS) {
          break
        }
        next.push(file)
      }
      onPendingFilesChange(next)
      return
    }
    if (!liveReady) {
      setUploadError(t('admin.competitor.photoUrls.errorStorage'))
      return
    }
    setUploading(true)
    try {
      let current = urls
      for (const file of picked) {
        if (current.length + pendingFiles.length >= MAX_COMPETITOR_PHOTO_URLS) {
          break
        }
        if (!file.type.startsWith('image/')) {
          setUploadError(t('admin.competitor.photoUrls.errorNotImage'))
          break
        }
        if (!isImageSizeWithinLimit(file)) {
          setUploadError(t('admin.competitor.photoUrls.errorFileTooLarge'))
          break
        }
        if (variant === 'shop') {
          const result = await uploadCompetitorShopPhoto(groupId, shopId, file)
          if ('error' in result) {
            setUploadError(mapUploadError(result.error))
            break
          }
          current = normalizeCompetitorPhotoUrlList([...current, result.publicUrl])
          onUrlsChange(current)
        } else {
          const lid = lineId?.trim()
          if (!lid) {
            setUploadError(t('admin.competitor.photoUrls.errorLineId'))
            break
          }
          const result = await uploadCompetitorProductPhoto(groupId, shopId, lid, file)
          if ('error' in result) {
            setUploadError(mapUploadError(result.error))
            break
          }
          current = normalizeCompetitorPhotoUrlList([...current, result.publicUrl])
          onUrlsChange(current)
        }
      }
    } finally {
      setUploading(false)
    }
  }

  /**
   * Opens the hidden file picker.
   * @returns Nothing.
   */
  function openFilePicker(): void {
    if (readonly || !canAddMore) {
      return
    }
    if (uploadMode === 'live' && !liveReady) {
      setUploadError(t('admin.competitor.photoUrls.errorStorage'))
      return
    }
    setUploadError(null)
    fileInputRef.current?.click()
  }

  /**
   * Removes a persisted URL and best-effort deletes Storage.
   * @param index - Index in `urls`.
   * @returns Nothing.
   */
  async function removeUrlAt(index: number): Promise<void> {
    if (readonly) {
      return
    }
    const url = urls[index]?.trim()
    if (!url) {
      return
    }
    onUrlsChange(urls.filter((_, i) => i !== index))
    const del = await deleteCompetitorStorageObject(url)
    if ('error' in del) {
      console.warn('[CompetitorPhotoUrlListField] storage delete:', del.error)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        id={`${idPrefix}-file`}
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        disabled={readonly || uploading}
        onChange={(event) => void onFileInputChange(event)}
      />
      {uploadError ? (
        <p className="text-xs font-medium text-rose-500" role="alert">
          {uploadError}
        </p>
      ) : null}
      {totalCount === 0 && readonly ? (
        <p className="text-sm text-muted">{t('admin.competitor.photoUrls.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {urls.map((row, index) => {
            const preview = isHttpsImageSrc(row) ? row.trim() : null
            return (
              <li
                key={`${idPrefix}-u-${index}-${row.slice(0, 32)}`}
                className="flex flex-col gap-2 rounded-xl border border-ink/10 bg-white/70 p-2 sm:flex-row sm:items-center sm:gap-3 dark:bg-white/5"
              >
                {readonly ? (
                  <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                    {row.trim() ? (
                      <button
                        type="button"
                        className="inline-flex min-w-0 items-center gap-1.5 truncate text-sm text-brand hover:underline"
                        aria-label={t('admin.competitor.photoUrls.openLink')}
                        onClick={() => openUrl(row.trim())}
                      >
                        <ExternalLinkIcon className="size-3.5 shrink-0" aria-hidden />
                        <span className="truncate">{row.trim()}</span>
                      </button>
                    ) : (
                      <span className="text-sm text-muted">—</span>
                    )}
                    {preview ? (
                      <img
                        src={preview}
                        alt=""
                        className="h-20 w-28 max-w-full rounded-md border border-ink/10 object-contain"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : null}
                  </div>
                ) : (
                  <>
                    <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                      {preview ? (
                        <img
                          src={preview}
                          alt=""
                          className="h-16 w-24 shrink-0 rounded-md border border-ink/10 object-contain"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : null}
                      <span className="min-w-0 flex-1 truncate text-xs text-muted">
                        {row.trim()}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="inline-flex shrink-0 items-center justify-center rounded-lg p-2 text-rose-500 hover:bg-rose-500/10"
                      aria-label={t('admin.competitor.photoUrls.remove')}
                      onClick={() => void removeUrlAt(index)}
                    >
                      <TrashIcon className="size-4" aria-hidden />
                    </button>
                  </>
                )}
              </li>
            )
          })}
          {pendingFiles.map((file, index) => (
            <li
              key={`${idPrefix}-p-${index}-${file.name}-${file.size}`}
              className="flex flex-col gap-2 rounded-xl border border-dashed border-brand/30 bg-white/70 p-2 sm:flex-row sm:items-center sm:gap-3 dark:bg-white/5"
            >
              <span className="text-xs text-muted">
                {t('admin.competitor.photoUrls.pendingLabel')}
              </span>
              {blobUrls[index] ? (
                <img
                  src={blobUrls[index]}
                  alt=""
                  className="h-16 w-24 shrink-0 rounded-md border border-ink/10 object-contain"
                />
              ) : null}
              <span className="min-w-0 flex-1 truncate text-xs text-ink">{file.name}</span>
              {!readonly ? (
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center justify-center rounded-lg p-2 text-rose-500 hover:bg-rose-500/10"
                  aria-label={t('admin.competitor.photoUrls.remove')}
                  onClick={() =>
                    onPendingFilesChange(pendingFiles.filter((_, i) => i !== index))
                  }
                >
                  <TrashIcon className="size-4" aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {!readonly && canAddMore ? (
        <button
          type="button"
          disabled={uploading || (uploadMode === 'live' && !liveReady)}
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-ink/10 px-3 py-1.5 text-xs font-semibold text-ink hover:border-brand/40 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={openFilePicker}
        >
          {uploading ? (
            <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
          ) : (
            <UploadIcon className="size-3.5" aria-hidden />
          )}
          {uploading
            ? t('admin.competitor.photoUrls.uploading')
            : t('admin.competitor.photoUrls.addUpload')}
        </button>
      ) : null}
    </div>
  )
}
