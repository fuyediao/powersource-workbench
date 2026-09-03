/**
 * KOL logistics tab: shipping info and contract images / files / links.
 */

import { useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { dash, detailSectionCardClass } from '@/components/admin/customer-detail/detail-shared'
import {
  KOL_DETAIL_INPUT_CLASS,
  KOL_DETAIL_LABEL_CLASS,
} from '@/components/admin/kol-detail/detail-shared'
import { PaginationStrip } from '@/components/common/pagination-strip'
import { PhoneInput } from '@/components/settings/phone-input'
import { useLinkOpen } from '@/hooks/link-open-context'
import {
  isPdfFileName,
  officeKindFromFileName,
  openOfficeDocument,
} from '@/utils/office/office-document-request'
import {
  CloseIcon,
  FileTextIcon,
  ImageIcon,
  PlusIcon,
  UploadIcon,
} from '@/icons/AllIcons'
import {
  deleteKolContractStorageObject,
  uploadKolContractFile,
  uploadKolContractImage,
} from '@/services/kol-contract-storage'
import type { KolDetail, KolFormInput } from '@/types/kol'
import { extractKolContractDisplayName } from '@/utils/kol-contract-display'
import { openExternalUrl } from '@/utils/shared/api'

const CONTRACT_PAGE_SIZE = 10

interface LogisticsPanelProps {
  mode: 'create' | 'detail'
  kol: KolDetail | null
  form: KolFormInput
  editing: boolean
  canDelete: boolean
  onPatch: (patch: Partial<KolFormInput>) => void
}

/**
 * Shipping recipient plus contract uploads and external links.
 * @param props - Mode, KOL row, form, and patch.
 * @returns Panel UI.
 */
export function LogisticsPanel({
  mode,
  kol,
  form,
  editing,
  canDelete,
  onPatch,
}: LogisticsPanelProps) {
  const { t } = useTranslation()
  const { openUrl, openInApp } = useLinkOpen()
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [imagesPage, setImagesPage] = useState(1)
  const [filesPage, setFilesPage] = useState(1)
  const [linksPage, setLinksPage] = useState(1)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)


  /**
   * Opens a contract file URL: PDF in-app, Office via OnlyOffice, otherwise external.
   * @param url - Public Storage or external URL.
   * @returns Nothing.
   */
  async function openContractFile(url: string): Promise<void> {
    const fileName = extractKolContractDisplayName(url)
    try {
      if (isPdfFileName(fileName)) {
        openInApp(url)
        return
      }
      const kind = officeKindFromFileName(fileName)
      if (!kind) {
        openUrl(url)
        return
      }
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`fetch_failed_${response.status}`)
      }
      const bytes = new Uint8Array(await response.arrayBuffer())
      openOfficeDocument({ kind, name: fileName, bytes })
    } catch (err) {
      console.error('[LogisticsPanel] openContractFile:', err)
      openUrl(url)
    }
  }

  const [newLink, setNewLink] = useState('')

  const images = form.contractImages ?? []
  const files = form.contractFiles ?? []
  const links = form.contractLinks ?? []
  const shipping = form.shippingInfo ?? {}

  const imagesPages = Math.max(1, Math.ceil(images.length / CONTRACT_PAGE_SIZE))
  const filesPages = Math.max(1, Math.ceil(files.length / CONTRACT_PAGE_SIZE))
  const linksPages = Math.max(1, Math.ceil(links.length / CONTRACT_PAGE_SIZE))
  const safeImagesPage = Math.min(imagesPage, imagesPages)
  const safeFilesPage = Math.min(filesPage, filesPages)
  const safeLinksPage = Math.min(linksPage, linksPages)

  const pagedImages = images.slice(
    (safeImagesPage - 1) * CONTRACT_PAGE_SIZE,
    safeImagesPage * CONTRACT_PAGE_SIZE,
  )
  const pagedFiles = files.slice(
    (safeFilesPage - 1) * CONTRACT_PAGE_SIZE,
    safeFilesPage * CONTRACT_PAGE_SIZE,
  )
  const pagedLinks = links.slice(
    (safeLinksPage - 1) * CONTRACT_PAGE_SIZE,
    safeLinksPage * CONTRACT_PAGE_SIZE,
  )

  const canUpload = mode !== 'create' && Boolean(kol?.id && kol.groupId)

  /**
   * Uploads a contract image (WebP, 5 MB).
   * @param event - File input change.
   * @returns Nothing.
   */
  async function onImageChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    if (!file || !kol?.id || !kol.groupId) {
      return
    }
    setUploadingImage(true)
    setImageError(null)
    const result = await uploadKolContractImage(kol.groupId, kol.id, file)
    if ('error' in result) {
      setImageError(
        result.error === 'file_too_large'
          ? t('admin.kolDetail.contractTooLargeImage')
          : result.error === 'not_image'
            ? t('admin.kolDetail.contractNotImage')
            : t('admin.kolDetail.contractUploadFailed'),
      )
    } else {
      const next = [...images, result.publicUrl]
      onPatch({ contractImages: next })
      setImagesPage(Math.ceil(next.length / CONTRACT_PAGE_SIZE))
    }
    setUploadingImage(false)
    if (imageInputRef.current) {
      imageInputRef.current.value = ''
    }
  }

  /**
   * Uploads a non-image contract file (10 MB).
   * @param event - File input change.
   * @returns Nothing.
   */
  async function onFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    if (!file || !kol?.id || !kol.groupId) {
      return
    }
    if (file.type.startsWith('image/')) {
      setFileError(t('admin.kolDetail.contractFileIsImage'))
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }
    setUploadingFile(true)
    setFileError(null)
    const result = await uploadKolContractFile(kol.groupId, kol.id, file)
    if ('error' in result) {
      setFileError(
        result.error === 'file_too_large'
          ? t('admin.kolDetail.contractTooLargeFile')
          : t('admin.kolDetail.contractUploadFailed'),
      )
    } else {
      const next = [...files, result.publicUrl]
      onPatch({ contractFiles: next })
      setFilesPage(Math.ceil(next.length / CONTRACT_PAGE_SIZE))
    }
    setUploadingFile(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  /**
   * Deletes a storage object (when permitted) and drops the URL from the list.
   * @param kind - Image or file list.
   * @param absoluteIdx - Index in the full array.
   * @returns Nothing.
   */
  async function removeStorageRow(
    kind: 'image' | 'file',
    absoluteIdx: number,
  ): Promise<void> {
    const list = kind === 'image' ? images : files
    const url = list[absoluteIdx]
    if (!url || !canDelete) {
      return
    }
    const result = await deleteKolContractStorageObject(url)
    if ('error' in result) {
      if (kind === 'image') {
        setImageError(t('admin.kolDetail.contractDeleteFailed'))
      } else {
        setFileError(t('admin.kolDetail.contractDeleteFailed'))
      }
      return
    }
    const next = list.filter((_, i) => i !== absoluteIdx)
    if (kind === 'image') {
      onPatch({ contractImages: next })
    } else {
      onPatch({ contractFiles: next })
    }
  }

  /**
   * Appends a pasted external contract URL.
   * @returns Nothing.
   */
  function addLink(): void {
    const trimmed = newLink.trim()
    if (!trimmed) {
      return
    }
    const next = [...links, trimmed]
    onPatch({ contractLinks: next })
    setNewLink('')
    setLinksPage(Math.ceil(next.length / CONTRACT_PAGE_SIZE))
  }

  return (
    <div className={`${detailSectionCardClass()} space-y-6`}>
      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink">
          {t('admin.kolDetail.field.shippingInfo')}
        </h3>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={KOL_DETAIL_LABEL_CLASS} htmlFor="kol-ship-recipient">
                {t('admin.kolDetail.field.shippingRecipient')}
              </label>
              {editing ? (
                <input
                  id="kol-ship-recipient"
                  type="text"
                  value={shipping.recipient ?? ''}
                  className={KOL_DETAIL_INPUT_CLASS}
                  onChange={(event) =>
                    onPatch({
                      shippingInfo: {
                        ...shipping,
                        recipient: event.target.value,
                      },
                    })
                  }
                />
              ) : (
                <p className="text-sm text-ink">{dash(shipping.recipient)}</p>
              )}
            </div>
            <div>
              <label className={KOL_DETAIL_LABEL_CLASS} htmlFor="kol-shipping-phone">
                {t('admin.kolDetail.field.shippingPhone')}
              </label>
              {editing ? (
                <PhoneInput
                  id="kol-shipping-phone"
                  value={shipping.phone ?? ''}
                  countryCode=""
                  onChange={(nextValue) =>
                    onPatch({
                      shippingInfo: {
                        ...shipping,
                        phone: nextValue,
                      },
                    })
                  }
                />
              ) : shipping.phone?.trim() ? (
                <button
                  type="button"
                  className="text-sm font-medium text-brand hover:underline"
                  onClick={() => {
                    const dialable = shipping.phone!.trim().replace(/[\s()-]/g, '')
                    if (dialable) {
                      void openExternalUrl(`tel:${dialable}`)
                    }
                  }}
                >
                  {shipping.phone.trim()}
                </button>
              ) : (
                <p className="text-sm text-ink">{dash(null)}</p>
              )}
            </div>
          </div>
          <div>
            <label className={KOL_DETAIL_LABEL_CLASS} htmlFor="kol-ship-address">
              {t('admin.kolDetail.field.shippingAddress')}
            </label>
            {editing ? (
              <textarea
                id="kol-ship-address"
                rows={2}
                value={shipping.address ?? ''}
                className={`${KOL_DETAIL_INPUT_CLASS} resize-none`}
                onChange={(event) =>
                  onPatch({
                    shippingInfo: {
                      ...shipping,
                      address: event.target.value,
                    },
                  })
                }
              />
            ) : (
              <p className="whitespace-pre-wrap text-sm text-ink">
                {dash(shipping.address)}
              </p>
            )}
          </div>
        </div>
      </div>

      <ContractListSection
        title={t('admin.kolDetail.field.contractImages')}
        hint={t('admin.kolDetail.contractImagesHint')}
        urls={pagedImages}
        total={images.length}
        page={safeImagesPage}
        totalPages={imagesPages}
        onPage={setImagesPage}
        editing={editing}
        canDelete={canDelete}
        uploading={uploadingImage}
        uploadLabel={
          uploadingImage
            ? t('admin.kolDetail.uploadingContract')
            : t('admin.kolDetail.uploadContractImage')
        }
        uploadTitle={
          mode === 'create'
            ? t('admin.kolDetail.uploadInCreateModeHint')
            : t('admin.kolDetail.uploadContractImage')
        }
        uploadDisabled={!canUpload || uploadingImage}
        error={imageError}
        icon="image"
        onUploadClick={() => imageInputRef.current?.click()}
        onOpen={openUrl}
        onRemove={(idx) =>
          void removeStorageRow(
            'image',
            (safeImagesPage - 1) * CONTRACT_PAGE_SIZE + idx,
          )
        }
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void onImageChange(event)}
      />

      <ContractListSection
        title={t('admin.kolDetail.field.contractFiles')}
        hint={t('admin.kolDetail.contractFilesHint')}
        urls={pagedFiles}
        total={files.length}
        page={safeFilesPage}
        totalPages={filesPages}
        onPage={setFilesPage}
        editing={editing}
        canDelete={canDelete}
        uploading={uploadingFile}
        uploadLabel={
          uploadingFile
            ? t('admin.kolDetail.uploadingContract')
            : t('admin.kolDetail.uploadContractFile')
        }
        uploadTitle={
          mode === 'create'
            ? t('admin.kolDetail.uploadInCreateModeHint')
            : t('admin.kolDetail.uploadContractFile')
        }
        uploadDisabled={!canUpload || uploadingFile}
        error={fileError}
        icon="file"
        onUploadClick={() => fileInputRef.current?.click()}
        onOpen={(url) => void openContractFile(url)}
        onRemove={(idx) =>
          void removeStorageRow(
            'file',
            (safeFilesPage - 1) * CONTRACT_PAGE_SIZE + idx,
          )
        }
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv,application/zip,application/x-rar-compressed,application/x-7z-compressed"
        className="hidden"
        onChange={(event) => void onFileChange(event)}
      />

      <div>
        <label className={KOL_DETAIL_LABEL_CLASS}>
          {t('admin.kolDetail.field.contractLinks')}
        </label>
        <p className="mb-2 text-xs text-muted">
          {t('admin.kolDetail.contractLinksHint')}
        </p>
        <div className="space-y-2">
          {pagedLinks.map((url, idx) => (
            <div
              key={`${url}-${idx}`}
              className="flex items-center gap-2 rounded-2xl border border-ink/10 bg-white/70 px-3 py-2"
            >
              <FileTextIcon className="size-3 shrink-0 text-muted" />
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-xs text-brand hover:underline"
                title={url}
                onClick={() => openUrl(url)}
              >
                {extractKolContractDisplayName(url)}
              </button>
              {editing ? (
                <button
                  type="button"
                  className="text-muted hover:text-rose-500"
                  onClick={() => {
                    const absolute = (safeLinksPage - 1) * CONTRACT_PAGE_SIZE + idx
                    onPatch({
                      contractLinks: links.filter((_, i) => i !== absolute),
                    })
                  }}
                >
                  <CloseIcon className="size-3.5" />
                </button>
              ) : null}
            </div>
          ))}
          {links.length === 0 ? (
            <p className="text-xs italic text-muted">—</p>
          ) : null}
          {links.length > CONTRACT_PAGE_SIZE ? (
            <PaginationStrip
              currentPage={safeLinksPage}
              totalPages={linksPages}
              onGoToPage={setLinksPage}
            />
          ) : null}
          {editing ? (
            <div className="flex gap-2">
              <input
                type="url"
                value={newLink}
                placeholder="https://..."
                className={`${KOL_DETAIL_INPUT_CLASS} flex-1 text-xs`}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addLink()
                  }
                }}
                onChange={(event) => setNewLink(event.target.value)}
              />
              <button
                type="button"
                disabled={!newLink.trim()}
                className="rounded-xl bg-brand/15 px-3 py-2 text-xs font-semibold text-brand disabled:opacity-40"
                onClick={addLink}
              >
                <PlusIcon className="size-3.5" />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

interface ContractListSectionProps {
  title: string
  hint: string
  urls: string[]
  total: number
  page: number
  totalPages: number
  onPage: (page: number) => void
  editing: boolean
  canDelete: boolean
  uploading: boolean
  uploadLabel: string
  uploadTitle: string
  uploadDisabled: boolean
  error: string | null
  icon: 'image' | 'file'
  onUploadClick: () => void
  onOpen: (url: string) => void
  onRemove: (pageIndex: number) => void
}

/**
 * Paginated contract URL list with optional upload and delete.
 * @param props - List state and actions.
 * @returns Section UI.
 */
function ContractListSection({
  title,
  hint,
  urls,
  total,
  page,
  totalPages,
  onPage,
  editing,
  canDelete,
  uploading,
  uploadLabel,
  uploadTitle,
  uploadDisabled,
  error,
  icon,
  onUploadClick,
  onOpen,
  onRemove,
}: ContractListSectionProps) {
  const { t } = useTranslation()
  const Icon = icon === 'image' ? ImageIcon : FileTextIcon
  const UploadGlyph = icon === 'image' ? ImageIcon : UploadIcon

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <label className={KOL_DETAIL_LABEL_CLASS}>{title}</label>
          <p className="mt-0.5 text-xs text-muted">{hint}</p>
        </div>
        {editing ? (
          <button
            type="button"
            disabled={uploadDisabled}
            title={uploadTitle}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-ink/10 bg-white/70 px-3 py-1.5 text-xs text-ink hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
            onClick={onUploadClick}
          >
            {uploading ? (
              <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
            ) : (
              <UploadGlyph className="size-3.5" />
            )}
            <span>{uploadLabel}</span>
          </button>
        ) : null}
      </div>
      <div className="space-y-2">
        {urls.map((url, idx) => (
          <div
            key={`${url}-${idx}`}
            className="flex items-center gap-2 rounded-2xl border border-ink/10 bg-white/70 px-3 py-2"
          >
            <Icon className="size-3 shrink-0 text-muted" />
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left text-xs text-brand hover:underline"
              title={url}
              onClick={() => onOpen(url)}
            >
              {extractKolContractDisplayName(url)}
            </button>
            {editing && canDelete ? (
              <button
                type="button"
                title={t('admin.kolDetail.contractDeleteAdminOnly')}
                className="text-muted hover:text-rose-500"
                onClick={() => onRemove(idx)}
              >
                <CloseIcon className="size-3.5" />
              </button>
            ) : null}
          </div>
        ))}
        {total === 0 ? <p className="text-xs italic text-muted">—</p> : null}
        {total > CONTRACT_PAGE_SIZE ? (
          <PaginationStrip
            currentPage={page}
            totalPages={totalPages}
            onGoToPage={onPage}
          />
        ) : null}
        {error ? <p className="mt-1 text-xs text-rose-500">{error}</p> : null}
      </div>
    </div>
  )
}
