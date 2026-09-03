/**
 * Admin visit-log detail / edit pane (Vue VisitLogDetailView parity).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useLinkOpen } from '@/hooks/link-open-context'
import {
  isPdfFileName,
  officeKindFromFileName,
  openOfficeDocument,
} from '@/utils/office/office-document-request'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { VisitLogProductPicker } from '@/components/admin/visit-log-product-picker'
import {
  CrmFilterSelect,
  type CrmFilterOption,
} from '@/components/common/crm-filter-select'
import { useDesktopDomainWritesContext } from '@/hooks/use-desktop-domain-writes'
import {
  ArrowLeftIcon,
  ClipboardIcon,
  CloseIcon,
  CloudUploadIcon,
  FileTextIcon,
  PencilIcon,
} from '@/icons/AllIcons'
import {
  appendVisitLogDocuments,
  appendVisitLogImages,
  createVisitLogDocumentSignedUrl,
  fetchVisitLogDocumentBlob,
  getVisitLogById,
  MAX_VISIT_LOG_IMAGES,
  removeVisitLogDocument,
  removeVisitLogImage,
  updateVisitLog,
} from '@/services/customer-visit-logs-api'
import { listCustomerPickerOptions } from '@/services/customers-api'
import { listKolPickerOptions } from '@/services/kols-api'
import type { CustomerVisitLog, VisitLogDocumentFile, VisitMeta } from '@/types/customer'
import { sanitizeObmRichTextHtml } from '@/utils/obm-rich-text'
import { visitLogCreatorLabel } from '@/utils/profile-display-label'
import {
  isAllowedVisitLogDocument,
  MAX_VISIT_LOG_DOCUMENTS,
  VISIT_LOG_DOCUMENT_ACCEPT,
  VISIT_LOG_DOCUMENT_MAX_BYTES,
} from '@/utils/visit-log-documents'
import { visitLogReturnTo } from '@/utils/visit-log-routes'

const LIST_PATH = '/admin/visit-log'

const fieldClass =
  'h-11 w-full rounded-2xl border border-ink/10 bg-white/60 px-3 text-sm font-medium text-ink outline-none transition focus:border-brand disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/40'

const textareaClass =
  'min-h-[120px] w-full resize-y rounded-2xl border border-ink/10 bg-white/60 px-3 py-2.5 text-sm font-medium text-ink outline-none transition focus:border-brand disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/40'

const labelClass = 'mb-1 block text-xs font-semibold text-ink'

interface VisitLogDetailPaneProps {
  visitLogId: string
  /** Full shell path (used for `returnTo` query). */
  path?: string | null
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

interface EditFormState {
  subject: string
  visitDate: string
  content: string
  contactPerson: string
  customerNameText: string
  customerId: string
  kolId: string
  interestedProductIds: string[]
  visitMeta: VisitMeta
}

/**
 * Formats an ISO date for read-only display.
 * @param dateStr - ISO string or null.
 * @returns Locale date or em dash.
 */
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) {
    return '—'
  }
  try {
    return new Date(dateStr).toLocaleDateString()
  } catch {
    return dateStr
  }
}

/**
 * Normalizes a stored date to `YYYY-MM-DD` for `<input type="date">`.
 * @param dateStr - Raw date string.
 * @returns Date input value or empty string.
 */
function toDateInputValue(dateStr: string | null | undefined): string {
  if (!dateStr) {
    return ''
  }
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(dateStr)
  if (match?.[1]) {
    return match[1]
  }
  try {
    const parsed = new Date(dateStr)
    if (Number.isNaN(parsed.getTime())) {
      return ''
    }
    return parsed.toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

/**
 * Builds edit form state from a loaded visit log.
 * @param log - Visit log row.
 * @returns Edit form snapshot.
 */
function editStateFromLog(log: CustomerVisitLog): EditFormState {
  return {
    subject: log.subject ?? '',
    visitDate: toDateInputValue(log.visitDate),
    content: log.content ?? '',
    contactPerson: log.contactPerson ?? '',
    customerNameText: log.customerNameText ?? '',
    customerId: log.customerId ?? '',
    kolId: log.kolId ?? '',
    interestedProductIds: log.interestedProductIds ? [...log.interestedProductIds] : [],
    visitMeta: log.visitMeta ? { ...log.visitMeta } : {},
  }
}

/**
 * Whether visit meta has any displayable value.
 * @param meta - Visit meta or null.
 * @returns True when any field is set.
 */
function hasVisitMetaDisplay(meta: VisitMeta | null | undefined): boolean {
  if (!meta) {
    return false
  }
  return Boolean(
    meta.bossName ||
      meta.staffCount != null ||
      meta.shopType ||
      meta.competitors,
  )
}

/**
 * Detail + edit UI for one visit log.
 * @param props - Visit log id, write gates, navigation.
 * @returns Detail pane.
 */
export function VisitLogDetailPane({
  visitLogId,
  path,
  writes,
  onNavigate,
}: VisitLogDetailPaneProps) {
  const { t } = useTranslation()
  const { openInApp } = useLinkOpen()
  const domainWrites = useDesktopDomainWritesContext()
  const canEdit = Boolean(writes?.canEdit)

  const [log, setLog] = useState<CustomerVisitLog | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [edit, setEdit] = useState<EditFormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [customerOptions, setCustomerOptions] = useState<CrmFilterOption[]>([])
  const [kolOptions, setKolOptions] = useState<CrmFilterOption[]>([])
  const [uploadingImages, setUploadingImages] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const dragDepth = useRef(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploadingDocuments, setUploadingDocuments] = useState(false)
  const [documentError, setDocumentError] = useState<string | null>(null)
  const [docDragActive, setDocDragActive] = useState(false)
  const docDragDepth = useRef(0)
  const documentInputRef = useRef<HTMLInputElement | null>(null)
  const [openingDocumentPath, setOpeningDocumentPath] = useState<string | null>(null)
  const loadSerial = useRef(0)

  const contentHtml = useMemo(
    () => sanitizeObmRichTextHtml(log?.content ?? ''),
    [log?.content],
  )

  const imageUrls = log?.imageUrls ?? []
  const canAddMoreImages = imageUrls.length < MAX_VISIT_LOG_IMAGES
  const documentFiles = log?.documentFiles ?? []
  const canAddMoreDocuments = documentFiles.length < MAX_VISIT_LOG_DOCUMENTS

  /**
   * Loads the visit log by id.
   * @returns Nothing.
   */
  const reload = useCallback(async (): Promise<void> => {
    const serial = ++loadSerial.current
    setLoading(true)
    setLoadError(null)
    try {
      const row = await getVisitLogById(visitLogId)
      if (serial !== loadSerial.current) {
        return
      }
      setLog(row)
    } catch (err) {
      if (serial !== loadSerial.current) {
        return
      }
      console.error('[VisitLogDetailPane] load:', err)
      setLog(null)
      setLoadError(t('admin.visitLog.error.load'))
    } finally {
      if (serial === loadSerial.current) {
        setLoading(false)
      }
    }
  }, [t, visitLogId])

  useEffect(() => {
    void reload()
  }, [reload])

  /**
   * Loads customer and KOL picker options for edit mode.
   * @returns Nothing.
   */
  const loadPickerOptions = useCallback(async (): Promise<void> => {
    if (domainWrites.isLoading) {
      return
    }
    try {
      const [customers, kols] = await Promise.all([
        listCustomerPickerOptions({
          groupId: domainWrites.groupId,
          isSystemAdmin: domainWrites.isSystemAdmin,
        }),
        listKolPickerOptions(),
      ])
      const customerOpts: CrmFilterOption[] = [
        { value: '', label: t('admin.visitLog.modal.customerPlaceholder') },
        ...customers.map((c) => ({
          value: c.id,
          label: c.companyName,
          ...(c.customerCode ? { description: c.customerCode } : {}),
        })),
      ]
      if (
        log?.customerId &&
        log.companyName &&
        !customerOpts.some((o) => o.value === log.customerId)
      ) {
        customerOpts.push({
          value: log.customerId,
          label: log.companyName,
        })
      }
      setCustomerOptions(customerOpts)

      const kolOpts: CrmFilterOption[] = [
        { value: '', label: t('admin.visitLog.modal.kolPlaceholder') },
        ...kols.map((k) => ({
          value: k.id,
          label: k.name,
          ...(k.kolCode ? { description: k.kolCode } : {}),
        })),
      ]
      if (
        log?.kolId &&
        log.kolName &&
        !kolOpts.some((o) => o.value === log.kolId)
      ) {
        kolOpts.push({ value: log.kolId, label: log.kolName })
      }
      setKolOptions(kolOpts)
    } catch (err) {
      console.error('[VisitLogDetailPane] pickers:', err)
    }
  }, [
    domainWrites.groupId,
    domainWrites.isLoading,
    domainWrites.isSystemAdmin,
    log?.companyName,
    log?.customerId,
    log?.kolId,
    log?.kolName,
    t,
  ])

  /**
   * Enters edit mode and seeds the form from the current log.
   * @returns Nothing.
   */
  function startEditing(): void {
    if (!log || !canEdit) {
      return
    }
    setEdit(editStateFromLog(log))
    setSaveError(null)
    setIsEditing(true)
    void loadPickerOptions()
  }

  /**
   * Cancels edit and restores read mode.
   * @returns Nothing.
   */
  function cancelEditing(): void {
    setIsEditing(false)
    setEdit(null)
    setSaveError(null)
  }

  /**
   * Patches one edit field.
   * @param patch - Partial edit state.
   * @returns Nothing.
   */
  function patchEdit(patch: Partial<EditFormState>): void {
    setEdit((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  /**
   * Patches visit meta inside the edit form.
   * @param patch - Partial visit meta.
   * @returns Nothing.
   */
  function patchVisitMeta(patch: Partial<VisitMeta>): void {
    setEdit((prev) =>
      prev ? { ...prev, visitMeta: { ...prev.visitMeta, ...patch } } : prev,
    )
  }

  /**
   * Links a customer and clears any KOL selection.
   * @param customerId - Selected customer id (or empty).
   * @returns Nothing.
   */
  function selectCustomer(customerId: string): void {
    patchEdit({
      customerId,
      kolId: customerId ? '' : (edit?.kolId ?? ''),
    })
  }

  /**
   * Links a KOL and clears any customer selection.
   * @param kolId - Selected KOL id (or empty).
   * @returns Nothing.
   */
  function selectKol(kolId: string): void {
    patchEdit({
      kolId,
      customerId: kolId ? '' : (edit?.customerId ?? ''),
    })
  }

  /**
   * Persists edit form via updateVisitLog.
   * @returns Nothing.
   */
  async function saveEdit(): Promise<void> {
    if (!edit || !edit.subject.trim() || !canEdit) {
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const staffCount =
        edit.visitMeta.staffCount != null &&
        !Number.isNaN(Number(edit.visitMeta.staffCount))
          ? Number(edit.visitMeta.staffCount)
          : null
      const updated = await updateVisitLog(visitLogId, {
        customerId: edit.customerId.trim() || null,
        kolId: edit.kolId.trim() || null,
        customerNameText: edit.customerNameText.trim() || null,
        subject: edit.subject.trim(),
        visitDate: edit.visitDate || null,
        content: edit.content || null,
        contactPerson: edit.contactPerson.trim() || null,
        interestedProductIds: edit.interestedProductIds.length
          ? [...edit.interestedProductIds]
          : null,
        visitMeta: {
          bossName: edit.visitMeta.bossName?.trim() || null,
          staffCount,
          shopType: edit.visitMeta.shopType?.trim() || null,
          competitors: edit.visitMeta.competitors?.trim() || null,
        },
      })
      setLog(updated)
      setIsEditing(false)
      setEdit(null)
    } catch (err) {
      console.error('[VisitLogDetailPane] save:', err)
      setSaveError(t('admin.visitLog.error.load'))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Uploads image files and refreshes the visit log.
   * @param files - Candidate image files.
   * @returns Nothing.
   */
  async function uploadImages(files: File[]): Promise<void> {
    if (!files.length || !canEdit) {
      return
    }
    const remaining = MAX_VISIT_LOG_IMAGES - imageUrls.length
    if (remaining <= 0) {
      setImageError(t('admin.visitLog.modal.maxImages'))
      return
    }
    const imageFiles = files
      .filter((f) => f.type.startsWith('image/'))
      .slice(0, remaining)
    if (!imageFiles.length) {
      return
    }
    setUploadingImages(true)
    setImageError(null)
    try {
      await appendVisitLogImages(visitLogId, imageFiles)
      const updated = await getVisitLogById(visitLogId)
      if (updated) {
        setLog(updated)
      }
    } catch (err) {
      console.error('[VisitLogDetailPane] upload:', err)
      setImageError(t('admin.visitLog.detail.imageUploadFailed'))
    } finally {
      setUploadingImages(false)
    }
  }

  /**
   * Handles native file input change.
   * @param event - Change event.
   * @returns Nothing.
   */
  async function onFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = event.target.files ? Array.from(event.target.files) : []
    event.target.value = ''
    await uploadImages(files)
  }

  /**
   * Marks the drop zone active while dragging.
   * @returns Nothing.
   */
  function onDragEnter(): void {
    dragDepth.current += 1
    setDragActive(true)
  }

  /**
   * Clears drop-zone highlight when the drag leaves.
   * @returns Nothing.
   */
  function onDragLeave(): void {
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) {
      setDragActive(false)
    }
  }

  /**
   * Uploads images dropped onto the gallery.
   * @param event - Drop event.
   * @returns Nothing.
   */
  function onDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    dragDepth.current = 0
    setDragActive(false)
    void uploadImages(Array.from(event.dataTransfer?.files ?? []))
  }

  /**
   * Accepts image files pasted onto the upload zone.
   * @param event - Clipboard event.
   * @returns Nothing.
   */
  function onPasteImages(event: ClipboardEvent<HTMLDivElement>): void {
    if (!canAddMoreImages || uploadingImages) {
      return
    }
    const files = Array.from(event.clipboardData?.files ?? []).filter(
      (file) =>
        file.type.startsWith('image/') ||
        /\.(jpe?g|png|gif|webp)$/i.test(file.name),
    )
    if (files.length === 0) {
      return
    }
    event.preventDefault()
    void uploadImages(files)
  }

  /**
   * Reads image blobs from the system clipboard and uploads them.
   * @returns Nothing.
   */
  async function pasteFromClipboard(): Promise<void> {
    if (!canAddMoreImages || uploadingImages) {
      return
    }
    try {
      if (!navigator.clipboard?.read) {
        return
      }
      const items = await navigator.clipboard.read()
      const files: File[] = []
      for (const item of items) {
        const mime = item.types.find((type) => type.startsWith('image/'))
        if (!mime) {
          continue
        }
        const blob = await item.getType(mime)
        const extension = mime.split('/')[1] ?? 'png'
        files.push(
          new File([blob], `clipboard-${Date.now()}.${extension}`, {
            type: mime,
          }),
        )
      }
      if (files.length === 0) {
        return
      }
      await uploadImages(files)
    } catch (err) {
      console.error('[VisitLogDetailPane] clipboard:', err)
    }
  }

  /**
   * Removes one image from the visit log.
   * @param imageUrl - Public URL to remove.
   * @returns Nothing.
   */
  async function onRemoveImage(imageUrl: string): Promise<void> {
    if (!canEdit) {
      return
    }
    setImageError(null)
    try {
      const next = await removeVisitLogImage(visitLogId, imageUrl)
      setLog((prev) => (prev ? { ...prev, imageUrls: next.length ? next : null } : prev))
    } catch (err) {
      console.error('[VisitLogDetailPane] remove image:', err)
      setImageError(t('admin.visitLog.detail.imageUploadFailed'))
    }
  }

  /**
   * Uploads document files and refreshes the visit log.
   * @param files - Candidate document files.
   * @returns Nothing.
   */
  async function uploadDocuments(files: File[]): Promise<void> {
    if (!files.length || !canEdit) {
      return
    }
    const remaining = MAX_VISIT_LOG_DOCUMENTS - documentFiles.length
    if (remaining <= 0) {
      setDocumentError(t('admin.visitLog.modal.maxDocuments'))
      return
    }
    const valid = files
      .filter(
        (file) =>
          isAllowedVisitLogDocument(file)
          && file.size > 0
          && file.size <= VISIT_LOG_DOCUMENT_MAX_BYTES,
      )
      .slice(0, remaining)
    if (!valid.length) {
      setDocumentError(t('admin.visitLog.modal.documentTypeInvalid'))
      return
    }
    setUploadingDocuments(true)
    setDocumentError(null)
    try {
      const next = await appendVisitLogDocuments(visitLogId, valid)
      setLog((prev) => (prev ? { ...prev, documentFiles: next } : prev))
    } catch (err) {
      console.error('[VisitLogDetailPane] upload document:', err)
      setDocumentError(t('admin.visitLog.detail.documentUploadFailed'))
    } finally {
      setUploadingDocuments(false)
    }
  }

  /**
   * Handles native document file input change.
   * @param event - Change event.
   * @returns Nothing.
   */
  async function onDocumentFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = event.target.files ? Array.from(event.target.files) : []
    event.target.value = ''
    await uploadDocuments(files)
  }

  /**
   * Opens a stored document: PDF in the in-app viewer, Office via OnlyOffice.
   * @param file - Attachment metadata.
   * @returns Nothing.
   */
  async function openStoredDocument(file: VisitLogDocumentFile): Promise<void> {
    setOpeningDocumentPath(file.storagePath)
    setDocumentError(null)
    try {
      if (isPdfFileName(file.fileName, file.mimeType)) {
        const url = await createVisitLogDocumentSignedUrl(file.storagePath)
        openInApp(url)
        return
      }
      const kind = officeKindFromFileName(file.fileName)
      if (!kind) {
        const url = await createVisitLogDocumentSignedUrl(file.storagePath)
        openInApp(url)
        return
      }
      const blob = await fetchVisitLogDocumentBlob(file.storagePath)
      const bytes = new Uint8Array(await blob.arrayBuffer())
      openOfficeDocument({ kind, name: file.fileName, bytes })
    } catch (err) {
      console.error('[VisitLogDetailPane] open document:', err)
      setDocumentError(t('admin.visitLog.detail.documentOpenFailed'))
    } finally {
      setOpeningDocumentPath(null)
    }
  }

  /**
   * Removes one document from the visit log.
   * @param file - Attachment metadata.
   * @returns Nothing.
   */
  async function onRemoveDocument(file: VisitLogDocumentFile): Promise<void> {
    if (!canEdit) {
      return
    }
    setDocumentError(null)
    try {
      const next = await removeVisitLogDocument(visitLogId, file.storagePath)
      setLog((prev) => (prev ? { ...prev, documentFiles: next } : prev))
    } catch (err) {
      console.error('[VisitLogDetailPane] remove document:', err)
      setDocumentError(t('admin.visitLog.detail.documentRemoveFailed'))
    }
  }

  /**
   * Navigates back to the visit-log list.
   * @returns Nothing.
   */
  function goBack(): void {
    onNavigate(visitLogReturnTo(path ?? null) ?? LIST_PATH)
  }

  const targetLabel =
    log?.kolName || log?.companyName || log?.customerNameText || t('admin.visitLog.noCustomer')

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold text-muted hover:bg-brand/10 hover:text-brand"
          onClick={goBack}
        >
          <ArrowLeftIcon className="size-4" aria-hidden />
          {t('admin.visitLog.detail.backToList')}
        </button>
      </div>

      {loading ? (
        <div className="animate-pulse rounded-3xl border border-ink/10 bg-white/60 p-8 dark:bg-white/5">
          <div className="mb-4 h-6 w-1/3 rounded bg-ink/10" />
          <div className="mb-2 h-4 w-full rounded bg-ink/5" />
          <div className="h-4 w-2/3 rounded bg-ink/5" />
        </div>
      ) : null}

      {!loading && loadError ? (
        <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
          {loadError}
        </p>
      ) : null}

      {!loading && !log ? (
        <div className="rounded-3xl border border-ink/10 bg-white/60 p-8 text-center dark:bg-white/5">
          <p className="mb-4 text-muted">{t('admin.visitLog.detail.notFound')}</p>
          <button
            type="button"
            className="rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-brand-fg"
            onClick={goBack}
          >
            {t('admin.visitLog.detail.backToList')}
          </button>
        </div>
      ) : null}

      {!loading && log ? (
        <div className="space-y-5 rounded-3xl border border-ink/10 bg-white/70 p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-extrabold tracking-tight text-brand">
              {isEditing
                ? t('admin.visitLog.detail.editTitle')
                : log.subject || t('admin.visitLog.detail.untitled')}
            </h1>
            {canEdit ? (
              <div className="flex items-center gap-2">
                {!isEditing ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-2xl border border-ink/10 px-3 py-2 text-sm font-bold text-ink hover:border-brand/40 hover:text-brand dark:border-white/10"
                    onClick={startEditing}
                  >
                    <PencilIcon className="size-4" aria-hidden />
                    {t('admin.visitLog.detail.edit')}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-2xl border border-ink/10 px-3 py-2 text-sm font-bold text-muted hover:bg-ink/5 disabled:opacity-50 dark:border-white/10"
                      disabled={saving}
                      onClick={cancelEditing}
                    >
                      <CloseIcon className="size-4" aria-hidden />
                      {t('admin.visitLog.detail.cancel')}
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg hover:bg-brand/90 disabled:opacity-50"
                      disabled={saving || !edit?.subject.trim()}
                      onClick={() => void saveEdit()}
                    >
                      {saving
                        ? t('admin.visitLog.detail.saving')
                        : t('admin.visitLog.detail.save')}
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </div>

          {saveError ? (
            <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
              {saveError}
            </p>
          ) : null}

          {isEditing && edit ? (
            <div className="space-y-4">
              <div>
                <label className={labelClass}>{t('admin.visitLog.modal.customer')}</label>
                <CrmFilterSelect
                  value={edit.customerId}
                  options={customerOptions}
                  onChange={selectCustomer}
                  searchable
                  searchPlaceholder={t('admin.visitLog.modal.searchCustomerPlaceholder')}
                  closeAriaLabel={t('common.inlineSearchComboboxClose')}
                  emptyLabel={t('admin.visitLog.modal.noCustomerMatch')}
                  ariaLabel={t('admin.visitLog.modal.customer')}
                  className="w-full"
                />
              </div>
              <div>
                <label className={labelClass}>{t('admin.visitLog.modal.kol')}</label>
                <CrmFilterSelect
                  value={edit.kolId}
                  options={kolOptions}
                  onChange={selectKol}
                  searchable
                  searchPlaceholder={t('admin.visitLog.modal.searchKolPlaceholder')}
                  closeAriaLabel={t('common.inlineSearchComboboxClose')}
                  emptyLabel={t('admin.visitLog.modal.noKolMatch')}
                  ariaLabel={t('admin.visitLog.modal.kol')}
                  className="w-full"
                />
              </div>
              <div>
                <label className={labelClass}>
                  {t('admin.visitLog.modal.customerNameText')}
                </label>
                <input
                  type="text"
                  className={fieldClass}
                  value={edit.customerNameText}
                  placeholder={t('admin.visitLog.modal.customerNameTextPlaceholder')}
                  onChange={(e) => patchEdit({ customerNameText: e.target.value })}
                />
                <p className="mt-1 text-[11px] font-medium text-muted">
                  {t('admin.visitLog.modal.customerNameTextHint')}
                </p>
              </div>
              <div>
                <label className={labelClass}>
                  {t('admin.visitLog.modal.subject')}{' '}
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  className={fieldClass}
                  value={edit.subject}
                  placeholder={t('admin.visitLog.modal.subjectPlaceholder')}
                  onChange={(e) => patchEdit({ subject: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>{t('admin.visitLog.modal.visitDate')}</label>
                <input
                  type="date"
                  className={fieldClass}
                  value={edit.visitDate}
                  onChange={(e) => patchEdit({ visitDate: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>{t('admin.visitLog.col.content')}</label>
                <textarea
                  className={textareaClass}
                  value={edit.content}
                  placeholder={t('admin.visitLog.modal.contentPlaceholder')}
                  onChange={(e) => patchEdit({ content: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>
                  {t('admin.visitLog.detail.contactPerson')}
                </label>
                <input
                  type="text"
                  className={fieldClass}
                  value={edit.contactPerson}
                  placeholder={t('admin.visitLog.modal.contactPersonPlaceholder')}
                  onChange={(e) => patchEdit({ contactPerson: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>
                  {t('admin.visitLog.detail.interestedProducts')}
                </label>
                <VisitLogProductPicker
                  selectedProductIds={edit.interestedProductIds}
                  onChange={(next) => patchEdit({ interestedProductIds: next })}
                />
              </div>
              <div className="space-y-3 rounded-2xl border border-ink/10 bg-white/40 px-4 py-3 dark:border-white/10 dark:bg-zinc-950/30">
                <p className="text-xs font-semibold tracking-wider text-muted uppercase">
                  {t('admin.visitLog.detail.customerBackground')}
                </p>
                <div className="space-y-3">
                  <div>
                    <label className={labelClass}>
                      {t('admin.visitLog.detail.bossName')}
                    </label>
                    <input
                      type="text"
                      className={fieldClass}
                      value={edit.visitMeta.bossName ?? ''}
                      placeholder={t('admin.visitLog.modal.bossNamePlaceholder')}
                      onChange={(e) => patchVisitMeta({ bossName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      {t('admin.visitLog.detail.staffCount')}
                    </label>
                    <input
                      type="number"
                      min={0}
                      className={fieldClass}
                      value={
                        edit.visitMeta.staffCount != null
                          ? String(edit.visitMeta.staffCount)
                          : ''
                      }
                      placeholder={t('admin.visitLog.modal.staffCountPlaceholder')}
                      onChange={(e) => {
                        const raw = e.target.value
                        patchVisitMeta({
                          staffCount: raw === '' ? null : Number(raw),
                        })
                      }}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      {t('admin.visitLog.detail.shopType')}
                    </label>
                    <input
                      type="text"
                      className={fieldClass}
                      value={edit.visitMeta.shopType ?? ''}
                      placeholder={t('admin.visitLog.modal.shopTypePlaceholder')}
                      onChange={(e) => patchVisitMeta({ shopType: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      {t('admin.visitLog.detail.competitors')}
                    </label>
                    <input
                      type="text"
                      className={fieldClass}
                      value={edit.visitMeta.competitors ?? ''}
                      placeholder={t('admin.visitLog.modal.competitorsPlaceholder')}
                      onChange={(e) => patchVisitMeta({ competitors: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-semibold tracking-wider text-muted uppercase">
                    {log.kolId
                      ? t('admin.visitLog.modal.kol')
                      : t('admin.visitLog.col.customer')}
                  </p>
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                    {log.kolId ? (
                      <span className="inline-flex items-center rounded-full bg-brand/15 px-2 py-0.5 text-xs font-semibold text-brand">
                        {t('admin.visitLog.kolBadge')}
                      </span>
                    ) : null}
                    <span>{targetLabel}</span>
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold tracking-wider text-muted uppercase">
                    {t('admin.visitLog.col.visitDate')}
                  </p>
                  <p className="text-sm font-medium text-ink">{formatDate(log.visitDate)}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold tracking-wider text-muted uppercase">
                    {t('admin.visitLog.createdBy')}
                  </p>
                  <p className="text-sm font-medium text-ink">
                    {visitLogCreatorLabel(log)}
                  </p>
                </div>
                {log.contactPerson ? (
                  <div>
                    <p className="mb-1 text-xs font-semibold tracking-wider text-muted uppercase">
                      {t('admin.visitLog.detail.contactPerson')}
                    </p>
                    <p className="text-sm font-medium text-ink">{log.contactPerson}</p>
                  </div>
                ) : null}
              </div>

              {log.interestedProducts?.length ? (
                <div>
                  <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">
                    {t('admin.visitLog.detail.interestedProducts')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {log.interestedProducts.map((product) => (
                      <span
                        key={product}
                        className="inline-block rounded-full bg-brand/15 px-2.5 py-1 text-sm font-semibold text-brand"
                      >
                        {product}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {hasVisitMetaDisplay(log.visitMeta) ? (
                <div className="rounded-2xl border border-ink/10 bg-white/40 px-4 py-3 dark:border-white/10 dark:bg-zinc-950/30">
                  <p className="mb-3 text-xs font-semibold tracking-wider text-muted uppercase">
                    {t('admin.visitLog.detail.customerBackground')}
                  </p>
                  <div className="space-y-3">
                    {log.visitMeta?.bossName ? (
                      <div>
                        <p className="mb-0.5 text-xs font-medium text-muted">
                          {t('admin.visitLog.detail.bossName')}
                        </p>
                        <p className="text-sm font-medium text-ink">
                          {log.visitMeta.bossName}
                        </p>
                      </div>
                    ) : null}
                    {log.visitMeta?.staffCount != null ? (
                      <div>
                        <p className="mb-0.5 text-xs font-medium text-muted">
                          {t('admin.visitLog.detail.staffCount')}
                        </p>
                        <p className="text-sm font-medium text-ink">
                          {log.visitMeta.staffCount}
                        </p>
                      </div>
                    ) : null}
                    {log.visitMeta?.shopType ? (
                      <div>
                        <p className="mb-0.5 text-xs font-medium text-muted">
                          {t('admin.visitLog.detail.shopType')}
                        </p>
                        <p className="text-sm font-medium text-ink">
                          {log.visitMeta.shopType}
                        </p>
                      </div>
                    ) : null}
                    {log.visitMeta?.competitors ? (
                      <div>
                        <p className="mb-0.5 text-xs font-medium text-muted">
                          {t('admin.visitLog.detail.competitors')}
                        </p>
                        <p className="text-sm font-medium text-ink">
                          {log.visitMeta.competitors}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div>
                <p className="mb-1 text-xs font-semibold tracking-wider text-muted uppercase">
                  {t('admin.visitLog.col.content')}
                </p>
                {contentHtml ? (
                  <div
                    className="prose prose-sm dark:prose-invert min-h-[80px] max-w-none rounded-2xl border border-ink/10 bg-white/40 p-4 dark:border-white/10 dark:bg-zinc-950/30"
                    dangerouslySetInnerHTML={{ __html: contentHtml }}
                  />
                ) : (
                  <p className="min-h-[80px] rounded-2xl border border-ink/10 bg-white/40 p-4 text-sm text-muted dark:border-white/10 dark:bg-zinc-950/30">
                    —
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold tracking-wider text-muted uppercase">
                {t('admin.visitLog.col.images')}
              </p>
              <span className="text-[11px] text-muted">
                {t('admin.visitLog.modal.imagesCount', {
                  count: imageUrls.length,
                  max: MAX_VISIT_LOG_IMAGES,
                })}
              </span>
            </div>
            {imageError ? (
              <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-500">
                {imageError}
              </p>
            ) : null}
            {imageUrls.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {imageUrls.map((url) => (
                  <li
                    key={url}
                    className="relative size-20 overflow-hidden rounded-xl border border-ink/10 bg-white/60 dark:border-white/10 dark:bg-zinc-950/40"
                  >
                    <img
                      src={url}
                      alt=""
                      className="size-full object-cover"
                    />
                    {canEdit ? (
                      <button
                        type="button"
                        className="absolute top-1 right-1 rounded-full bg-black/70 px-1.5 text-[10px] font-bold text-white"
                        aria-label={t('admin.visitLog.modal.removeImage')}
                        onClick={() => void onRemoveImage(url)}
                      >
                        ×
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            {canEdit && canAddMoreImages ? (
              <div
                tabIndex={uploadingImages ? -1 : 0}
                className={[
                  'overflow-hidden rounded-2xl border outline-none transition-colors',
                  dragActive
                    ? 'border-brand/50 bg-brand/5 ring-2 ring-brand/20'
                    : 'border-ink/10 bg-white/60 dark:border-white/10 dark:bg-zinc-950/40',
                  uploadingImages ? 'opacity-60' : '',
                ].join(' ')}
                onDragEnter={(e) => {
                  e.preventDefault()
                  onDragEnter()
                }}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={(e) => {
                  e.preventDefault()
                  onDragLeave()
                }}
                onDrop={onDrop}
                onPaste={onPasteImages}
              >
                <div className="flex flex-col items-stretch gap-4 px-4 py-5">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <span
                      className={[
                        'flex size-12 items-center justify-center rounded-full',
                        dragActive
                          ? 'bg-brand/15 text-brand'
                          : 'bg-brand/10 text-brand',
                      ].join(' ')}
                      aria-hidden
                    >
                      <CloudUploadIcon className="size-6" />
                    </span>
                    <p className="text-sm font-bold text-brand">
                      {uploadingImages
                        ? t('admin.visitLog.detail.uploading')
                        : t('admin.visitLog.modal.dropImagesHere')}
                    </p>
                    <p className="text-xs font-medium text-muted">
                      {t('admin.visitLog.modal.orChooseImages')}
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp"
                    multiple
                    className="hidden"
                    disabled={uploadingImages}
                    onChange={(e) => void onFileChange(e)}
                  />
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg disabled:opacity-50"
                      disabled={uploadingImages}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {t('admin.visitLog.detail.addImages')}
                    </button>
                    <button
                      type="button"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-ink/10 bg-white/80 px-4 py-2.5 text-sm font-semibold text-brand disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/50"
                      disabled={uploadingImages}
                      onClick={() => {
                        void pasteFromClipboard()
                      }}
                    >
                      <ClipboardIcon className="size-4" aria-hidden />
                      {t('admin.visitLog.modal.pasteFromClipboard')}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold tracking-wider text-muted uppercase">
                {t('admin.visitLog.col.documents')}
              </p>
              <span className="text-[11px] text-muted">
                {t('admin.visitLog.modal.documentsCount', {
                  count: documentFiles.length,
                  max: MAX_VISIT_LOG_DOCUMENTS,
                })}
              </span>
            </div>
            {documentError ? (
              <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-500">
                {documentError}
              </p>
            ) : null}
            {documentFiles.length > 0 ? (
              <ul className="space-y-2">
                {documentFiles.map((file) => (
                  <li
                    key={file.storagePath}
                    className="flex items-center gap-2 rounded-xl border border-ink/10 bg-white/60 px-3 py-2 dark:border-white/10 dark:bg-zinc-950/40"
                  >
                    <FileTextIcon className="size-4 shrink-0 text-brand" />
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left text-sm font-medium text-ink hover:text-brand disabled:opacity-50"
                      disabled={openingDocumentPath === file.storagePath}
                      onClick={() => void openStoredDocument(file)}
                    >
                      {file.fileName}
                    </button>
                    {canEdit ? (
                      <button
                        type="button"
                        className="rounded-full bg-black/70 px-1.5 text-[10px] font-bold text-white"
                        aria-label={t('admin.visitLog.modal.removeDocument')}
                        onClick={() => void onRemoveDocument(file)}
                      >
                        ×
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {canEdit && canAddMoreDocuments ? (
              <div
                tabIndex={uploadingDocuments ? -1 : 0}
                className={[
                  'overflow-hidden rounded-2xl border outline-none transition-colors',
                  docDragActive
                    ? 'border-brand/50 bg-brand/5 ring-2 ring-brand/20'
                    : 'border-ink/10 bg-white/60 dark:border-white/10 dark:bg-zinc-950/40',
                  uploadingDocuments ? 'opacity-60' : '',
                ].join(' ')}
                onDragEnter={(e) => {
                  e.preventDefault()
                  if (uploadingDocuments) {
                    return
                  }
                  docDragDepth.current += 1
                  setDocDragActive(true)
                }}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={(e) => {
                  e.preventDefault()
                  docDragDepth.current = Math.max(0, docDragDepth.current - 1)
                  if (docDragDepth.current === 0) {
                    setDocDragActive(false)
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  docDragDepth.current = 0
                  setDocDragActive(false)
                  void uploadDocuments(Array.from(e.dataTransfer.files ?? []))
                }}
              >
                <div className="flex flex-col items-stretch gap-4 px-4 py-5">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <span
                      className={[
                        'flex size-12 items-center justify-center rounded-full',
                        docDragActive
                          ? 'bg-brand/15 text-brand'
                          : 'bg-brand/10 text-brand',
                      ].join(' ')}
                      aria-hidden
                    >
                      <CloudUploadIcon className="size-6" />
                    </span>
                    <p className="text-sm font-bold text-brand">
                      {uploadingDocuments
                        ? t('admin.visitLog.detail.uploading')
                        : t('admin.visitLog.modal.dropDocumentsHere')}
                    </p>
                    <p className="text-xs font-medium text-muted">
                      {t('admin.visitLog.modal.orChooseDocuments')}
                    </p>
                  </div>
                  <input
                    ref={documentInputRef}
                    type="file"
                    accept={VISIT_LOG_DOCUMENT_ACCEPT}
                    multiple
                    className="hidden"
                    disabled={uploadingDocuments}
                    onChange={(e) => void onDocumentFileChange(e)}
                  />
                  <button
                    type="button"
                    className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg disabled:opacity-50"
                    disabled={uploadingDocuments}
                    onClick={() => documentInputRef.current?.click()}
                  >
                    {t('admin.visitLog.detail.addDocuments')}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
