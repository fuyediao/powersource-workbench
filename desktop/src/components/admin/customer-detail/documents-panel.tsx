/**
 * Customer documents tab: upload / list / open / download / delete.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { detailSectionCardClass } from '@/components/admin/customer-detail/detail-shared'
import { PaginationStrip } from '@/components/common/pagination-strip'
import { useCustomerTabCache } from '@/hooks/use-customer-tab-cache'
import { useLinkOpen } from '@/hooks/link-open-context'
import {
  DownloadIcon,
  EyeIcon,
  TrashIcon,
  UploadIcon,
} from '@/icons/AllIcons'
import {
  createCustomerDocumentSignedUrl,
  CUSTOMER_DOCUMENT_MAX_BYTES,
  deleteCustomerDocument,
  fetchCustomerDocumentBlob,
  isAllowedCustomerDocument,
  isCustomerDocumentPdf,
  listCustomerDocuments,
  uploadCustomerDocument,
  type CustomerDocument,
} from '@/services/customer-documents-api'
import { downloadBlob } from '@/office/office-file-io'
import {
  officeKindFromFileName,
  openOfficeDocument,
} from '@/utils/office/office-document-request'



/** Max rows per page (same size as customer Orders tab). */
const DOCUMENTS_PAGE_SIZE = 15

/**
 * Clamps a 1-based page into `[1, totalPages]`.
 * @param page - Requested page.
 * @param totalPages - Available pages (at least 1).
 * @returns Safe page.
 */
function clampPage(page: number, totalPages: number): number {
  return Math.min(Math.max(1, page), Math.max(1, totalPages))
}

interface DocumentsPanelProps {
  customerId: string
  groupId: string | null
  writes: AdminShellWrites | null
}

/**
 * Formats byte size for the list.
 * @param bytes - File size.
 * @returns Display string.
 */
function formatBytes(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) {
    return '—'
  }
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Short type badge from file name / mime.
 * @param doc - Document row.
 * @returns PDF / PPT / XLSX / DOCX / FILE.
 */
function typeBadge(doc: CustomerDocument): string {
  if (isCustomerDocumentPdf(doc)) {
    return 'PDF'
  }
  const name = doc.fileName.toLowerCase()
  const mime = (doc.mimeType ?? '').toLowerCase()
  if (name.endsWith('.pptx')) {
    return 'PPTX'
  }
  if (name.endsWith('.ppt') || mime.includes('powerpoint')) {
    return 'PPT'
  }
  if (name.endsWith('.xlsx')) {
    return 'XLSX'
  }
  if (name.endsWith('.xls') || mime.includes('excel') || mime.includes('spreadsheet')) {
    return 'XLS'
  }
  if (name.endsWith('.docx')) {
    return 'DOCX'
  }
  if (name.endsWith('.doc') || mime.includes('msword') || mime.includes('wordprocessing')) {
    return 'DOC'
  }
  return 'FILE'
}


/**
 * Documents tab with upload, open-in-new-window, download, and delete.
 * @param props - Customer id, group, write gates.
 * @returns Panel UI.
 */
export function DocumentsPanel({
  customerId,
  groupId,
  writes,
}: DocumentsPanelProps) {
  const { t, i18n } = useTranslation()
  const { openInApp } = useLinkOpen()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragDepthRef = useRef(0)
  const canCreate = Boolean(writes?.canCreate)
  const canDelete = Boolean(writes?.canDelete)
  const [isUploading, setIsUploading] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const fetcher = useCallback(
    () => listCustomerDocuments(customerId),
    [customerId],
  )

  const { data, loading, error, setData } = useCustomerTabCache(
    customerId,
    'documents',
    fetcher,
    t('admin.customers.detail.documents.loadError'),
  )

  const documents = data ?? []
  const total = documents.length
  const totalPages = Math.max(1, Math.ceil(total / DOCUMENTS_PAGE_SIZE))
  const safePage = clampPage(page, totalPages)

  useEffect(() => {
    setPage(1)
  }, [customerId, data])

  useEffect(() => {
    if (page !== safePage) {
      setPage(safePage)
    }
  }, [page, safePage])

  const pageDocuments = useMemo(() => {
    const start = (safePage - 1) * DOCUMENTS_PAGE_SIZE
    return documents.slice(start, start + DOCUMENTS_PAGE_SIZE)
  }, [documents, safePage])

  const rangeStart = total === 0 ? 0 : (safePage - 1) * DOCUMENTS_PAGE_SIZE + 1
  const rangeEnd = Math.min(safePage * DOCUMENTS_PAGE_SIZE, total)

  /**
   * Uploads one or more allowed files.
   * @param files - File list.
   * @returns Nothing.
   */
  async function handleFiles(files: File[]): Promise<void> {
    if (!canCreate || !groupId || files.length === 0) {
      return
    }
    setActionError(null)
    setIsUploading(true)
    try {
      const accepted = files.filter(isAllowedCustomerDocument)
      if (accepted.length === 0) {
        setActionError(t('admin.customers.detail.documents.invalidType'))
        return
      }
      let next = documents
      for (const file of accepted) {
        if (file.size > CUSTOMER_DOCUMENT_MAX_BYTES) {
          setActionError(t('admin.customers.detail.documents.tooLarge'))
          continue
        }
        const created = await uploadCustomerDocument(customerId, groupId, file)
        next = [created, ...next]
        setData(next)
      }
    } catch (err) {
      console.error('[DocumentsPanel] upload:', err)
      setActionError(t('admin.customers.detail.documents.uploadError'))
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  /**
   * Opens PDFs in the in-app viewer and editable Office files via the shared
   * OnlyOffice open pipeline (uploaded as a personal `office_files` row).
   * @param doc - Document row.
   * @returns Nothing.
   */
  async function handleOpenInNewWindow(doc: CustomerDocument): Promise<void> {
    setActionError(null)
    setBusyId(doc.id)
    try {
      if (isCustomerDocumentPdf(doc)) {
        const url = await createCustomerDocumentSignedUrl(doc.storagePath)
        openInApp(url)
        return
      }
      const kind = officeKindFromFileName(doc.fileName)
      if (!kind) {
        throw new Error('No built-in editor is available for this file type.')
      }
      const blob = await fetchCustomerDocumentBlob(doc.storagePath)
      const bytes = new Uint8Array(await blob.arrayBuffer())
      openOfficeDocument({ kind, name: doc.fileName, bytes })
    } catch (err) {
      console.error('[DocumentsPanel] open:', err)
      setActionError(t('admin.customers.detail.documents.previewError'))
    } finally {
      setBusyId(null)
    }
  }

  /**
   * Downloads via Storage blob (same-origin object URL) so Electron does not
   * open the signed HTTPS URL in the system browser.
   * @param doc - Document row.
   * @returns Nothing.
   */
  async function handleDownload(doc: CustomerDocument): Promise<void> {
    setActionError(null)
    setBusyId(doc.id)
    try {
      const blob = await fetchCustomerDocumentBlob(doc.storagePath)
      downloadBlob(doc.fileName, blob)
    } catch (err) {
      console.error('[DocumentsPanel] download:', err)
      setActionError(t('admin.customers.detail.documents.downloadError'))
    } finally {
      setBusyId(null)
    }
  }

  /**
   * Deletes after confirm.
   * @param doc - Document row.
   * @returns Nothing.
   */
  async function handleDelete(doc: CustomerDocument): Promise<void> {
    if (!canDelete) {
      return
    }
    const ok = window.confirm(
      t('admin.customers.detail.documents.deleteConfirm', {
        name: doc.fileName,
      }),
    )
    if (!ok) {
      return
    }
    setActionError(null)
    setBusyId(doc.id)
    try {
      await deleteCustomerDocument(doc)
      setData(documents.filter((item) => item.id !== doc.id))
    } catch (err) {
      console.error('[DocumentsPanel] delete:', err)
      setActionError(t('admin.customers.detail.documents.deleteError'))
    } finally {
      setBusyId(null)
    }
  }

  /**
   * @param event - Drag enter.
   * @returns Nothing.
   */
  function onDragEnter(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    event.stopPropagation()
    if (!canCreate || isUploading) {
      return
    }
    dragDepthRef.current += 1
    setIsDragOver(true)
  }

  /**
   * @param event - Drag over.
   * @returns Nothing.
   */
  function onDragOver(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = canCreate && !isUploading ? 'copy' : 'none'
  }

  /**
   * @param event - Drag leave.
   * @returns Nothing.
   */
  function onDragLeave(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) {
      setIsDragOver(false)
    }
  }

  /**
   * @param event - Drop.
   * @returns Nothing.
   */
  function onDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current = 0
    setIsDragOver(false)
    if (!canCreate || isUploading) {
      return
    }
    void handleFiles(Array.from(event.dataTransfer.files ?? []))
  }

  return (
    <div className="space-y-3">
      <div className={detailSectionCardClass()}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-ink">
              {t('admin.customers.detail.documents.title')}
            </h3>
            <p className="mt-0.5 text-[11px] text-muted">
              {t('admin.customers.detail.documents.hint')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {total > 0 ? (
              <p className="text-xs font-medium text-muted">
                {t('admin.customers.countText', {
                  from: rangeStart,
                  to: rangeEnd,
                  total,
                })}
              </p>
            ) : null}
            {canCreate ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.ppt,.pptx,.xls,.xlsx,.doc,.docx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  multiple
                  className="hidden"
                  disabled={isUploading || !groupId}
                  onChange={(event) => {
                    void handleFiles(Array.from(event.target.files ?? []))
                  }}
                />
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-2xl bg-brand px-3 py-2 text-xs font-bold text-brand-fg disabled:opacity-50"
                  disabled={isUploading || !groupId}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadIcon className="size-3.5" aria-hidden />
                  {isUploading
                    ? t('admin.customers.detail.documents.uploading')
                    : t('admin.customers.detail.documents.upload')}
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div
          className={[
            'rounded-2xl border border-dashed px-3 py-4 transition-colors',
            isDragOver
              ? 'border-brand/50 bg-brand/5'
              : 'border-ink/10 dark:border-white/10',
          ].join(' ')}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {loading && documents.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              {t('admin.customers.detail.documents.loading')}
            </p>
          ) : null}
          {!loading && documents.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              {canCreate
                ? t('admin.customers.detail.documents.emptyUpload')
                : t('admin.customers.detail.documents.empty')}
            </p>
          ) : null}
          {total > 0 ? (
            <>
              <ul className="divide-y divide-ink/10 dark:divide-white/10">
                {pageDocuments.map((doc) => {
                  const busy = busyId === doc.id
                  const dateLabel = doc.createdAt
                    ? new Date(doc.createdAt).toLocaleString(i18n.language)
                    : '—'
                  return (
                    <li
                      key={doc.id}
                      className="flex flex-wrap items-center gap-2 py-2.5 first:pt-0 last:pb-0"
                    >
                      <span className="inline-flex w-11 shrink-0 items-center justify-center rounded-lg bg-brand/10 px-1 py-0.5 text-[10px] font-bold text-brand">
                        {typeBadge(doc)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">
                          {doc.fileName}
                        </p>
                        <p className="text-[11px] text-muted">
                          {formatBytes(doc.byteSize)} · {dateLabel}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-muted hover:bg-brand/10 hover:text-brand disabled:opacity-40"
                          disabled={busy}
                          title={t('admin.customers.detail.documents.openWindow')}
                          aria-label={t(
                            'admin.customers.detail.documents.openWindow',
                          )}
                          onClick={() => {
                            void handleOpenInNewWindow(doc)
                          }}
                        >
                          <EyeIcon className="size-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-muted hover:bg-brand/10 hover:text-brand disabled:opacity-40"
                          disabled={busy}
                          title={t('admin.customers.detail.documents.download')}
                          aria-label={t(
                            'admin.customers.detail.documents.download',
                          )}
                          onClick={() => {
                            void handleDownload(doc)
                          }}
                        >
                          <DownloadIcon className="size-4" aria-hidden />
                        </button>
                        {canDelete ? (
                          <button
                            type="button"
                            className="rounded-lg p-1.5 text-muted hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-40"
                            disabled={busy}
                            title={t('admin.customers.detail.documents.delete')}
                            aria-label={t(
                              'admin.customers.detail.documents.delete',
                            )}
                            onClick={() => {
                              void handleDelete(doc)
                            }}
                          >
                            <TrashIcon className="size-4" aria-hidden />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
              <div className="mt-3">
                <PaginationStrip
                  currentPage={safePage}
                  totalPages={totalPages}
                  disabled={loading}
                  onGoToPage={setPage}
                />
              </div>
            </>
          ) : null}
        </div>

        {error ? (
          <p className="mt-2 text-sm font-semibold text-rose-500">{error}</p>
        ) : null}
        {actionError ? (
          <p className="mt-2 text-sm font-semibold text-rose-500">{actionError}</p>
        ) : null}
      </div>
    </div>
  )
}
