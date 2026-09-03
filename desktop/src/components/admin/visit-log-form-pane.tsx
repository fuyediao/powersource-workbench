/**
 * Admin visit-log create form (Vue VisitLogAddView parity, practical subset).
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
  type FormEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { VisitLogProductPicker } from '@/components/admin/visit-log-product-picker'
import {
  CrmFilterSelect,
  type CrmFilterOption,
} from '@/components/common/crm-filter-select'
import { SlidingSegmented } from '@/components/ui/sliding-segmented'
import { useAiKeys } from '@/hooks/use-ai-keys'
import { useDesktopDomainWritesContext } from '@/hooks/use-desktop-domain-writes'
import {
  ArrowLeftIcon,
  ClipboardIcon,
  CloseIcon,
  CloudUploadIcon,
  FileTextIcon,
  MicIcon,
  PlusIcon,
} from '@/icons/AllIcons'
import {
  createVisitLog,
  createVisitLogWithNewCustomer,
  MAX_VISIT_LOG_IMAGES,
} from '@/services/customer-visit-logs-api'
import { listCustomerPickerOptions } from '@/services/customers-api'
import { listKolPickerOptions } from '@/services/kols-api'
import {
  cancelMicrophoneRecording,
  isMicrophoneCaptureSupported,
  startMicrophoneRecording,
  stopMicrophoneRecording,
  transcribeAudioWithGemini,
} from '@/services/speech-to-text'
import type {
  CustomerVisitLogInput,
  VisitLogNewCustomerInput,
  VisitMeta,
} from '@/types/customer'
import {
  isAllowedVisitLogDocument,
  MAX_VISIT_LOG_DOCUMENTS,
  VISIT_LOG_DOCUMENT_ACCEPT,
  VISIT_LOG_DOCUMENT_MAX_BYTES,
} from '@/utils/visit-log-documents'
import { visitLogCustomerIdQuery, visitLogKolIdQuery, visitLogReturnTo } from '@/utils/visit-log-routes'

const LIST_PATH = '/admin/visit-log'

/** 1 MB ceiling for plain-text content import (Vue VisitLogAddView parity). */
const CONTENT_IMPORT_MAX_BYTES = 1024 * 1024

const CONTENT_IMPORT_ALLOWED_EXTS = ['.txt', '.md', '.markdown'] as const
const CONTENT_IMPORT_ALLOWED_MIMES = [
  'text/plain',
  'text/markdown',
  'text/x-markdown',
] as const

const fieldClass =
  'h-11 w-full rounded-2xl border border-ink/10 bg-white/60 px-3 text-sm font-medium text-ink outline-none transition focus:border-brand disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/40'

const labelClass = 'mb-1 block text-xs font-semibold text-ink'

/** Create-mode target: existing customer, new customer, or KOL (Vue VisitLogAddView parity). */
type AddMode = 'direct' | 'new-customer' | 'kol'

/** Built-in content templates (Vue VisitLogAddView parity). */
type ContentTemplateId = '' | 'visitSummary' | 'meetingNotes' | 'productDiscussion'

const CONTENT_TEMPLATE_OPTIONS: {
  id: ContentTemplateId
  labelKey: string
}[] = [
  { id: '', labelKey: 'admin.visitLog.modal.contentTemplateNone' },
  { id: 'visitSummary', labelKey: 'admin.visitLog.modal.contentTemplateVisitSummary' },
  { id: 'meetingNotes', labelKey: 'admin.visitLog.modal.contentTemplateMeetingNotes' },
  { id: 'productDiscussion', labelKey: 'admin.visitLog.modal.contentTemplateProductDiscussion' },
]

interface VisitLogFormPaneProps {
  userId: string
  /** Full shell path (used for `kolId` / `returnTo` query). */
  path?: string | null
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

/**
 * Returns today's date as `YYYY-MM-DD` for the visit-date input.
 * @returns Local date string.
 */
function getTodayDateString(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Maps the app i18n language to a BCP-47 tag for Gemini transcription.
 * @param language - i18n language code.
 * @returns Locale tag.
 */
function speechLocale(language: string): string {
  const base = language.toLowerCase()
  if (base.startsWith('zh-tw') || base.startsWith('zh-hant')) {
    return 'zh-TW'
  }
  if (base.startsWith('zh')) {
    return 'zh-CN'
  }
  return 'en-US'
}

/**
 * Whether a filename/MIME pair is an allowed content-import text file.
 * @param file - Picked file.
 * @returns True when allowed.
 */
function isContentImportFile(file: File): boolean {
  const lowerName = file.name.toLowerCase()
  const extOk = CONTENT_IMPORT_ALLOWED_EXTS.some((ext) => lowerName.endsWith(ext))
  const mimeOk =
    !file.type ||
    (CONTENT_IMPORT_ALLOWED_MIMES as readonly string[]).includes(file.type)
  return extOk && mimeOk
}

/**
 * Create form for a new visit log.
 * @param props - Signed-in user, write gates, and navigation.
 * @returns Form UI.
 */
export function VisitLogFormPane({
  userId,
  path,
  writes,
  onNavigate,
}: VisitLogFormPaneProps) {
  const { t, i18n } = useTranslation()
  const domainWrites = useDesktopDomainWritesContext()
  const { keys: aiKeys } = useAiKeys(userId)
  const canCreate = Boolean(writes?.canCreate)

  const [addMode, setAddMode] = useState<AddMode>('direct')
  const [subject, setSubject] = useState('')
  const [visitDate, setVisitDate] = useState(getTodayDateString)
  const [content, setContent] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [kolId, setKolId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [employeeCount, setEmployeeCount] = useState('')
  const [interestedProductIds, setInterestedProductIds] = useState<string[]>([])
  const [bossName, setBossName] = useState('')
  const [staffCount, setStaffCount] = useState('')
  const [shopType, setShopType] = useState('')
  const [competitors, setCompetitors] = useState('')
  const [contentTemplateId, setContentTemplateId] = useState<ContentTemplateId>('')
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [documentFiles, setDocumentFiles] = useState<File[]>([])
  const [isDocDragOver, setIsDocDragOver] = useState(false)
  const [documentPickError, setDocumentPickError] = useState<string | null>(null)
  const [customerOptions, setCustomerOptions] = useState<CrmFilterOption[]>([])
  const [kolOptions, setKolOptions] = useState<CrmFilterOption[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [dictationSupported, setDictationSupported] = useState(false)
  const [dictating, setDictating] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [dictationError, setDictationError] = useState<string | null>(null)
  const [contentImportError, setContentImportError] = useState<string | null>(null)
  const [importingContent, setImportingContent] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const documentInputRef = useRef<HTMLInputElement | null>(null)
  const contentImportInputRef = useRef<HTMLInputElement | null>(null)
  const contentRef = useRef<HTMLTextAreaElement | null>(null)
  const previewUrlsRef = useRef<string[]>([])
  const dragDepthRef = useRef(0)
  const docDragDepthRef = useRef(0)

  const returnTo = visitLogReturnTo(path ?? null)

  /**
   * Preselects KOL or customer add-mode when opened from a detail visit tab.
   * @returns Nothing.
   */
  useEffect(() => {
    const queryKolId = visitLogKolIdQuery(path ?? null)
    if (queryKolId) {
      setAddMode('kol')
      setKolId(queryKolId)
      return
    }
    const queryCustomerId = visitLogCustomerIdQuery(path ?? null)
    if (queryCustomerId) {
      setAddMode('direct')
      setCustomerId(queryCustomerId)
    }
  }, [path])

  /**
   * Navigates to a safe returnTo path, or the fallback.
   * @param fallback - Default path when returnTo is absent.
   * @returns Nothing.
   */
  function navigateAfterLeave(fallback: string): void {
    onNavigate(returnTo ?? fallback)
  }

  /**
   * Revokes object URLs for image previews.
   * @returns Nothing.
   */
  function revokePreviews(): void {
    for (const url of previewUrlsRef.current) {
      URL.revokeObjectURL(url)
    }
    previewUrlsRef.current = []
  }

  useEffect(() => {
    setDictationSupported(isMicrophoneCaptureSupported())
    return () => {
      cancelMicrophoneRecording()
      revokePreviews()
    }
  }, [])

  /**
   * Loads customer and KOL picker options (system admins: all visible customers).
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
      setCustomerOptions([
        { value: '', label: t('admin.visitLog.modal.customerPlaceholder') },
        ...customers.map((c) => ({
          value: c.id,
          label: c.companyName,
          ...(c.customerCode ? { description: c.customerCode } : {}),
        })),
      ])
      setKolOptions([
        { value: '', label: t('admin.visitLog.modal.kolPlaceholder') },
        ...kols.map((k) => ({
          value: k.id,
          label: k.name,
          ...(k.kolCode ? { description: k.kolCode } : {}),
        })),
      ])
    } catch (err) {
      console.error('[VisitLogFormPane] pickers:', err)
    }
  }, [
    domainWrites.groupId,
    domainWrites.isLoading,
    domainWrites.isSystemAdmin,
    t,
  ])

  useEffect(() => {
    void loadPickerOptions()
  }, [loadPickerOptions])

  const modeHint = useMemo(() => {
    if (addMode === 'direct') {
      return t('admin.visitLog.modal.addModeDirectHint')
    }
    if (addMode === 'kol') {
      return t('admin.visitLog.modal.addModeKolHint')
    }
    return t('admin.visitLog.modal.addModeNewCustomerHint')
  }, [addMode, t])

  const canSave = useMemo(() => {
    if (!canCreate || saving) {
      return false
    }
    if (!subject.trim()) {
      return false
    }
    if (addMode === 'direct') {
      return customerId.trim() !== ''
    }
    if (addMode === 'kol') {
      return kolId.trim() !== ''
    }
    return companyName.trim() !== ''
  }, [addMode, canCreate, companyName, customerId, kolId, saving, subject])

  /**
   * Switches add mode and clears mutually exclusive target fields.
   * @param mode - Next add mode.
   * @returns Nothing.
   */
  function changeAddMode(mode: AddMode): void {
    setAddMode(mode)
    setSaveError(null)
    if (mode !== 'direct') {
      setCustomerId('')
    }
    if (mode !== 'kol') {
      setKolId('')
    }
    if (mode !== 'new-customer') {
      setCompanyName('')
      setNewAddress('')
      setEmployeeCount('')
    }
  }

  /**
   * Appends chosen image files (max 5 total).
   * @param files - File list.
   * @returns Nothing.
   */
  function addImageFiles(files: File[]): void {
    const images = files.filter(
      (f) =>
        f.type.startsWith('image/') ||
        /\.(jpe?g|png|gif|webp)$/i.test(f.name),
    )
    if (!images.length) {
      return
    }
    setImageFiles((prev) => {
      const room = MAX_VISIT_LOG_IMAGES - prev.length
      if (room <= 0) {
        return prev
      }
      const nextFiles = [...prev, ...images.slice(0, room)]
      revokePreviews()
      const urls = nextFiles.map((f) => URL.createObjectURL(f))
      previewUrlsRef.current = urls
      setImagePreviews(urls)
      return nextFiles
    })
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  /**
   * Handles the hidden file input change event.
   * @param event - Change event.
   * @returns Nothing.
   */
  function onImagesChange(event: ChangeEvent<HTMLInputElement>): void {
    const files = event.target.files ? Array.from(event.target.files) : []
    addImageFiles(files)
  }

  /**
   * Removes one pending image by index.
   * @param index - Preview index.
   * @returns Nothing.
   */
  function removeImageAt(index: number): void {
    setImageFiles((prev) => {
      const nextFiles = prev.filter((_, i) => i !== index)
      revokePreviews()
      const urls = nextFiles.map((f) => URL.createObjectURL(f))
      previewUrlsRef.current = urls
      setImagePreviews(urls)
      return nextFiles
    })
  }

  /**
   * Resets drag-over highlight after leave or drop.
   * @returns Nothing.
   */
  function clearDragOver(): void {
    dragDepthRef.current = 0
    setIsDragOver(false)
  }

  /**
   * Marks the drop zone active while dragging.
   * @param event - Drag event.
   * @returns Nothing.
   */
  function handleImageDragEnter(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    event.stopPropagation()
    if (imageFiles.length >= MAX_VISIT_LOG_IMAGES || saving) {
      return
    }
    dragDepthRef.current += 1
    setIsDragOver(true)
  }

  /**
   * Keeps the drop allowed while dragging over the zone.
   * @param event - Drag event.
   * @returns Nothing.
   */
  function handleImageDragOver(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    event.stopPropagation()
    if (imageFiles.length >= MAX_VISIT_LOG_IMAGES || saving) {
      event.dataTransfer.dropEffect = 'none'
      return
    }
    event.dataTransfer.dropEffect = 'copy'
  }

  /**
   * Clears highlight when the pointer leaves the drop zone.
   * @param event - Drag event.
   * @returns Nothing.
   */
  function handleImageDragLeave(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) {
      setIsDragOver(false)
    }
  }

  /**
   * Accepts dropped image files into the pending list.
   * @param event - Drop event.
   * @returns Nothing.
   */
  function handleImageDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    event.stopPropagation()
    clearDragOver()
    if (imageFiles.length >= MAX_VISIT_LOG_IMAGES || saving) {
      return
    }
    addImageFiles(Array.from(event.dataTransfer.files ?? []))
  }

  /**
   * Accepts image files pasted with Ctrl/Cmd+V onto the upload zone.
   * @param event - Clipboard event.
   * @returns Nothing.
   */
  function handleImagePaste(event: ClipboardEvent<HTMLDivElement>): void {
    if (imageFiles.length >= MAX_VISIT_LOG_IMAGES || saving) {
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
    addImageFiles(files)
  }

  /**
   * Reads image blobs from the system clipboard and attaches them.
   * @returns Nothing.
   */
  async function handlePasteFromClipboard(): Promise<void> {
    if (imageFiles.length >= MAX_VISIT_LOG_IMAGES || saving) {
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
      addImageFiles(files)
    } catch (err) {
      console.error('[VisitLogFormPane] clipboard:', err)
    }
  }

  const canAddImages =
    !saving && imageFiles.length < MAX_VISIT_LOG_IMAGES

  /**
   * Appends allowed PDF/Office files (max 5 total).
   * @param files - File list.
   * @returns Nothing.
   */
  function addDocumentFiles(files: File[]): void {
    setDocumentPickError(null)
    const allowed = files.filter((file) => isAllowedVisitLogDocument(file))
    const oversized = allowed.filter((file) => file.size > VISIT_LOG_DOCUMENT_MAX_BYTES)
    const valid = allowed.filter(
      (file) => file.size > 0 && file.size <= VISIT_LOG_DOCUMENT_MAX_BYTES,
    )
    if (oversized.length) {
      setDocumentPickError(t('admin.visitLog.modal.documentTooLarge'))
    } else if (!valid.length && files.length) {
      setDocumentPickError(t('admin.visitLog.modal.documentTypeInvalid'))
    }
    if (!valid.length) {
      return
    }
    setDocumentFiles((prev) => {
      const room = MAX_VISIT_LOG_DOCUMENTS - prev.length
      if (room <= 0) {
        return prev
      }
      return [...prev, ...valid.slice(0, room)]
    })
    if (documentInputRef.current) {
      documentInputRef.current.value = ''
    }
  }

  /**
   * Handles the hidden document file input.
   * @param event - Change event.
   * @returns Nothing.
   */
  function onDocumentsChange(event: ChangeEvent<HTMLInputElement>): void {
    const files = event.target.files ? Array.from(event.target.files) : []
    addDocumentFiles(files)
  }

  /**
   * Removes one pending document by index.
   * @param index - File index.
   * @returns Nothing.
   */
  function removeDocumentAt(index: number): void {
    setDocumentFiles((prev) => prev.filter((_, i) => i !== index))
  }

  /**
   * Marks the document drop zone active while dragging.
   * @param event - Drag event.
   * @returns Nothing.
   */
  function handleDocumentDragEnter(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    event.stopPropagation()
    if (documentFiles.length >= MAX_VISIT_LOG_DOCUMENTS || saving) {
      return
    }
    docDragDepthRef.current += 1
    setIsDocDragOver(true)
  }

  /**
   * Keeps document drop allowed while dragging over the zone.
   * @param event - Drag event.
   * @returns Nothing.
   */
  function handleDocumentDragOver(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    event.stopPropagation()
    if (documentFiles.length >= MAX_VISIT_LOG_DOCUMENTS || saving) {
      event.dataTransfer.dropEffect = 'none'
      return
    }
    event.dataTransfer.dropEffect = 'copy'
  }

  /**
   * Clears document drop highlight when the pointer leaves.
   * @param event - Drag event.
   * @returns Nothing.
   */
  function handleDocumentDragLeave(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    event.stopPropagation()
    docDragDepthRef.current = Math.max(0, docDragDepthRef.current - 1)
    if (docDragDepthRef.current === 0) {
      setIsDocDragOver(false)
    }
  }

  /**
   * Accepts dropped documents into the pending list.
   * @param event - Drop event.
   * @returns Nothing.
   */
  function handleDocumentDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    event.stopPropagation()
    docDragDepthRef.current = 0
    setIsDocDragOver(false)
    if (documentFiles.length >= MAX_VISIT_LOG_DOCUMENTS || saving) {
      return
    }
    addDocumentFiles(Array.from(event.dataTransfer.files ?? []))
  }

  const canAddDocuments =
    !saving && documentFiles.length < MAX_VISIT_LOG_DOCUMENTS

  /**
   * Builds visit_meta from site-context fields.
   * @returns Visit meta or undefined when empty.
   */
  function buildVisitMeta(): VisitMeta | undefined {
    const staffParsed = staffCount.trim() ? Number.parseInt(staffCount, 10) : null
    const staffValue =
      staffParsed != null && !Number.isNaN(staffParsed) ? staffParsed : null
    const meta: VisitMeta = {
      bossName: bossName.trim() || null,
      staffCount: staffValue,
      shopType: shopType.trim() || null,
      competitors: competitors.trim() || null,
    }
    const hasMeta = Boolean(
      meta.bossName || meta.staffCount != null || meta.shopType || meta.competitors,
    )
    return hasMeta ? meta : undefined
  }

  /**
   * Maps capture / Gemini transcription errors to a localized string.
   * @param err - Thrown value from mic capture or Gemini.
   * @returns Localized message.
   */
  function dictationErrorMessage(err: unknown): string {
    const code = err instanceof Error ? err.message : ''
    if (code === 'gemini_key_missing') {
      return t('admin.visitLog.modal.dictationErrNeedsGemini')
    }
    if (code === 'audio_too_short') {
      return t('admin.visitLog.modal.dictationErrTooShort')
    }
    if (code === 'empty_transcript') {
      return t('admin.visitLog.modal.dictationErrNoSpeech')
    }
    if (code === 'microphone_unsupported') {
      return t('admin.visitLog.modal.dictationErrNotSupported')
    }
    if (
      err instanceof DOMException &&
      (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
    ) {
      return t('admin.visitLog.modal.dictationErrNotAllowed')
    }
    if (err instanceof Error && err.message.trim()) {
      return err.message
    }
    return t('admin.visitLog.modal.dictationErrFailed')
  }

  /**
   * Toggles desktop voice input: first click records, second click transcribes via Gemini.
   * Electron Chromium does not ship Chrome's Web Speech cloud service.
   * @returns Nothing.
   */
  function toggleDictation(): void {
    if (!dictationSupported) {
      setDictationError(t('admin.visitLog.modal.dictationErrNotSupported'))
      return
    }

    void (async () => {
      if (transcribing) {
        return
      }

      if (dictating) {
        setDictating(false)
        setTranscribing(true)
        setDictationError(null)
        try {
          const blob = await stopMicrophoneRecording()
          if (!blob) {
            setDictationError(t('admin.visitLog.modal.dictationErrTooShort'))
            return
          }
          const geminiKey = (aiKeys.gemini ?? '').trim()
          if (!geminiKey) {
            setDictationError(t('admin.visitLog.modal.dictationErrNeedsGemini'))
            return
          }
          const transcript = await transcribeAudioWithGemini(
            blob,
            geminiKey,
            speechLocale(i18n.language),
          )
          const insert = transcript.trim()
          if (!insert) {
            setDictationError(t('admin.visitLog.modal.dictationErrNoSpeech'))
            return
          }
          setContent((prev) => {
            const el = contentRef.current
            const start = el?.selectionStart ?? prev.length
            const end = el?.selectionEnd ?? prev.length
            const spacer =
              start > 0 && !/\s$/.test(prev.slice(0, start)) ? ' ' : ''
            return `${prev.slice(0, start)}${spacer}${insert}${prev.slice(end)}`
          })
        } catch (err) {
          setDictationError(dictationErrorMessage(err))
        } finally {
          setTranscribing(false)
        }
        return
      }

      setDictationError(null)
      try {
        await startMicrophoneRecording()
        setDictating(true)
      } catch (err) {
        cancelMicrophoneRecording()
        setDictating(false)
        setDictationError(dictationErrorMessage(err))
      }
    })()
  }

  /**
   * Fills the content textarea from the selected built-in template.
   * In new-customer mode, appends the current site-context lines (Vue parity).
   * @param id - Template id (must be non-empty).
   * @returns Nothing.
   */
  function applyContentTemplate(id: Exclude<ContentTemplateId, ''>): void {
    const base = t(`admin.visitLog.modal.contentTemplateBodies.${id}`)
    if (addMode !== 'new-customer') {
      setContent(base)
      return
    }
    const structuredBlock = [
      `${t('admin.visitLog.modal.bossName')}：${bossName.trim()}`,
      `${t('admin.visitLog.modal.staffCount')}：${staffCount.trim()}`,
      `${t('admin.visitLog.modal.shopType')}：${shopType.trim()}`,
      `${t('admin.visitLog.modal.competitors')}：${competitors.trim()}`,
    ].join('\n')
    setContent(`${base}\n\n${structuredBlock}`)
  }

  /**
   * Selects a content template and applies its body when not "None".
   * @param value - Template option value.
   * @returns Nothing.
   */
  function selectContentTemplate(value: string): void {
    const id = (
      value === 'visitSummary' ||
      value === 'meetingNotes' ||
      value === 'productDiscussion'
        ? value
        : ''
    ) as ContentTemplateId
    setContentTemplateId(id)
    if (id) {
      applyContentTemplate(id)
    }
  }

  /**
   * Opens the hidden plain-text content import picker.
   * @returns Nothing.
   */
  function triggerContentImport(): void {
    setContentImportError(null)
    contentImportInputRef.current?.click()
  }

  /**
   * Reads a `.txt` / `.md` file and inserts it into the content textarea.
   * @param event - File input change event.
   * @returns Nothing.
   */
  async function onContentFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const input = event.target
    const file = input.files?.[0]
    if (!file) {
      return
    }
    setContentImportError(null)
    if (!isContentImportFile(file)) {
      setContentImportError(t('admin.visitLog.modal.contentImportNotText'))
      input.value = ''
      return
    }
    if (file.size > CONTENT_IMPORT_MAX_BYTES) {
      setContentImportError(t('admin.visitLog.modal.contentImportTooLarge'))
      input.value = ''
      return
    }
    setImportingContent(true)
    try {
      const raw = await file.text()
      const text = raw.replace(/\r\n?/g, '\n')
      setContent((prev) => {
        const el = contentRef.current
        const start = el?.selectionStart ?? prev.length
        const end = el?.selectionEnd ?? prev.length
        const before = prev.slice(0, start)
        const after = prev.slice(end)
        const prefix =
          before && !before.endsWith('\n\n')
            ? before.endsWith('\n')
              ? '\n'
              : '\n\n'
            : ''
        const suffix =
          after && !after.startsWith('\n\n')
            ? after.startsWith('\n')
              ? '\n'
              : '\n\n'
            : ''
        const next = `${before}${prefix}${text}${suffix}${after}`
        const caret = start + prefix.length + text.length
        queueMicrotask(() => {
          const ta = contentRef.current
          ta?.focus()
          ta?.setSelectionRange(caret, caret)
        })
        return next
      })
    } catch {
      setContentImportError(t('admin.visitLog.modal.contentImportFailed'))
    } finally {
      setImportingContent(false)
      input.value = ''
    }
  }

  /**
   * Submits the create form.
   * @param event - Form submit event.
   * @returns Nothing.
   */
  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!canSave) {
      return
    }
    setSaving(true)
    setSaveError(null)
    const visitMeta = buildVisitMeta()
    const common: Omit<CustomerVisitLogInput, 'customerId' | 'kolId' | 'customerNameText'> =
      {
        subject: subject.trim(),
        visitDate: visitDate || null,
        content: content || null,
        contactPerson: contactPerson.trim() || null,
        interestedProductIds: interestedProductIds.length
          ? [...interestedProductIds]
          : null,
        ...(visitMeta ? { visitMeta } : {}),
      }
    const files = imageFiles.length ? [...imageFiles] : undefined
    const docs = documentFiles.length ? [...documentFiles] : undefined

    try {
      let created
      if (addMode === 'new-customer') {
        const customerInput: VisitLogNewCustomerInput = {
          companyName: companyName.trim(),
          contactName: contactPerson.trim() || null,
          address: newAddress.trim() || null,
          employeeCount: employeeCount.trim()
            ? Number.parseInt(employeeCount, 10)
            : null,
        }
        created = await createVisitLogWithNewCustomer(customerInput, common, files, docs)
      } else if (addMode === 'kol') {
        created = await createVisitLog(
          { ...common, kolId: kolId.trim() || null },
          files,
          docs,
        )
      } else {
        created = await createVisitLog(
          { ...common, customerId: customerId.trim() || null },
          files,
          docs,
        )
      }
      revokePreviews()
      setImageFiles([])
      setImagePreviews([])
      onNavigate(returnTo ?? `${LIST_PATH}/${created.id}`)
    } catch (err) {
      console.error('[VisitLogFormPane] save:', err)
      setSaveError(
        addMode === 'new-customer'
          ? t('admin.visitLog.error.addWithNewCustomer')
          : t('admin.visitLog.error.add'),
      )
    } finally {
      setSaving(false)
    }
  }

  /**
   * Cancels create and returns to the list.
   * @returns Nothing.
   */
  function onCancel(): void {
    cancelMicrophoneRecording()
    navigateAfterLeave(LIST_PATH)
  }

  const modeTabs: { mode: AddMode; labelKey: string }[] = [
    { mode: 'direct', labelKey: 'admin.visitLog.modal.addModeDirect' },
    { mode: 'new-customer', labelKey: 'admin.visitLog.modal.addModeNewCustomer' },
    { mode: 'kol', labelKey: 'admin.visitLog.modal.addModeKol' },
  ]

  const modeOptions = modeTabs.map(({ mode, labelKey }) => ({
    value: mode,
    label: t(labelKey),
  }))

  if (!canCreate) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-5 sm:p-6">
        <button
          type="button"
          className="inline-flex w-fit items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold text-muted hover:bg-brand/10 hover:text-brand"
          onClick={onCancel}
        >
          <ArrowLeftIcon className="size-4" aria-hidden />
          {t('admin.visitLog.detail.backToList')}
        </button>
        <div className="rounded-3xl border border-ink/10 bg-white/60 p-8 text-center dark:bg-white/5">
          <p className="text-muted">{t('admin.visitLog.error.add')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4 p-5 sm:p-6">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold text-muted hover:bg-brand/10 hover:text-brand"
          onClick={onCancel}
        >
          <ArrowLeftIcon className="size-4" aria-hidden />
          {t('admin.visitLog.detail.backToList')}
        </button>
        <h1 className="text-xl font-extrabold tracking-tight text-brand">
          {t('admin.visitLog.modal.addTitle')}
        </h1>
      </div>

      <form
        className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[1fr_2fr]"
        onSubmit={(e) => void onSubmit(e)}
      >
        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto rounded-3xl border border-ink/10 bg-white/70 p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
        <div>
          <p className={labelClass}>{t('admin.visitLog.modal.addModeLabel')}</p>
          <SlidingSegmented
            value={addMode}
            options={modeOptions}
            onChange={changeAddMode}
            ariaLabel={t('admin.visitLog.modal.addModeLabel')}
            className="h-auto min-h-9 w-full [&_button]:py-2"
          />
          <p className="mt-2 text-[11px] font-medium text-muted">{modeHint}</p>
        </div>

        {addMode === 'direct' ? (
          <div>
            <label className={labelClass}>
              {t('admin.visitLog.modal.customer')}{' '}
              <span className="text-rose-500">*</span>
            </label>
            <CrmFilterSelect
              value={customerId}
              options={customerOptions}
              onChange={setCustomerId}
              searchable
              searchPlaceholder={t('admin.visitLog.modal.searchCustomerPlaceholder')}
              closeAriaLabel={t('common.inlineSearchComboboxClose')}
              emptyLabel={t('admin.visitLog.modal.noCustomerMatch')}
              ariaLabel={t('admin.visitLog.modal.customer')}
              className="w-full"
            />
          </div>
        ) : null}

        {addMode === 'kol' ? (
          <div>
            <label className={labelClass}>
              {t('admin.visitLog.modal.kol')}{' '}
              <span className="text-rose-500">*</span>
            </label>
            <CrmFilterSelect
              value={kolId}
              options={kolOptions}
              onChange={setKolId}
              searchable
              searchPlaceholder={t('admin.visitLog.modal.searchKolPlaceholder')}
              closeAriaLabel={t('common.inlineSearchComboboxClose')}
              emptyLabel={t('admin.visitLog.modal.noKolMatch')}
              ariaLabel={t('admin.visitLog.modal.kol')}
              className="w-full"
            />
          </div>
        ) : null}

        {addMode === 'new-customer' ? (
          <div className="space-y-3 rounded-2xl border border-ink/10 bg-white/40 px-4 py-3 dark:border-white/10 dark:bg-zinc-950/30">
            <p className="text-xs font-semibold tracking-wider text-muted uppercase">
              {t('admin.visitLog.modal.newCustomerSection')}
            </p>
            <div>
              <label className={labelClass}>
                {t('admin.visitLog.modal.companyName')}{' '}
                <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                className={fieldClass}
                value={companyName}
                placeholder={t('admin.visitLog.modal.companyNamePlaceholder')}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>{t('admin.visitLog.modal.address')}</label>
              <input
                type="text"
                className={fieldClass}
                value={newAddress}
                placeholder={t('admin.visitLog.modal.addressPlaceholder')}
                onChange={(e) => setNewAddress(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>
                {t('admin.visitLog.modal.staffCount')}
              </label>
              <input
                type="number"
                min={0}
                className={fieldClass}
                value={employeeCount}
                placeholder={t('admin.visitLog.modal.staffCountPlaceholder')}
                onChange={(e) => setEmployeeCount(e.target.value)}
              />
            </div>
          </div>
        ) : null}

        <div className="space-y-3 rounded-2xl border border-ink/10 bg-white/40 px-4 py-3 dark:border-white/10 dark:bg-zinc-950/30">
          <p className="text-xs font-semibold tracking-wider text-muted uppercase">
            {t('admin.visitLog.modal.siteContextSection')}
          </p>
          <div className="space-y-3">
            <div>
              <label className={labelClass}>{t('admin.visitLog.modal.bossName')}</label>
              <input
                type="text"
                className={fieldClass}
                value={bossName}
                placeholder={t('admin.visitLog.modal.bossNamePlaceholder')}
                onChange={(e) => setBossName(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>
                {t('admin.visitLog.modal.staffCount')}
              </label>
              <input
                type="number"
                min={0}
                className={fieldClass}
                value={staffCount}
                placeholder={t('admin.visitLog.modal.staffCountPlaceholder')}
                onChange={(e) => setStaffCount(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>{t('admin.visitLog.modal.shopType')}</label>
              <input
                type="text"
                className={fieldClass}
                value={shopType}
                placeholder={t('admin.visitLog.modal.shopTypePlaceholder')}
                onChange={(e) => setShopType(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>
                {t('admin.visitLog.modal.competitors')}
              </label>
              <input
                type="text"
                className={fieldClass}
                value={competitors}
                placeholder={t('admin.visitLog.modal.competitorsPlaceholder')}
                onChange={(e) => setCompetitors(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div>
          <label className={labelClass}>
            {t('admin.visitLog.modal.subject')}{' '}
            <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            className={fieldClass}
            value={subject}
            placeholder={t('admin.visitLog.modal.subjectPlaceholder')}
            onChange={(e) => setSubject(e.target.value)}
            required
          />
        </div>

        <div>
          <label className={labelClass}>{t('admin.visitLog.modal.visitDate')}</label>
          <input
            type="date"
            className={fieldClass}
            value={visitDate}
            onChange={(e) => setVisitDate(e.target.value)}
          />
        </div>

        <div>
          <label className={labelClass}>
            {t('admin.visitLog.modal.contactPerson')}
          </label>
          <input
            type="text"
            className={fieldClass}
            value={contactPerson}
            placeholder={t('admin.visitLog.modal.contactPersonPlaceholder')}
            onChange={(e) => setContactPerson(e.target.value)}
          />
        </div>

        <div>
          <label className={labelClass}>
            {t('admin.visitLog.modal.interestedProducts')}
          </label>
          <VisitLogProductPicker
            selectedProductIds={interestedProductIds}
            onChange={setInterestedProductIds}
          />
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={labelClass}>{t('admin.visitLog.modal.images')}</span>
            <span className="text-[11px] text-muted">
              {t('admin.visitLog.modal.imagesCount', {
                count: imageFiles.length,
                max: MAX_VISIT_LOG_IMAGES,
              })}
            </span>
          </div>
          {imagePreviews.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {imagePreviews.map((url, index) => (
                <li
                  key={url}
                  className="relative size-20 overflow-hidden rounded-xl border border-ink/10 bg-white/60 dark:border-white/10 dark:bg-zinc-950/40"
                >
                  <img
                    src={url}
                    alt=""
                    className="size-full object-cover"
                  />
                  <button
                    type="button"
                    className="absolute top-1 right-1 rounded-full bg-black/70 px-1.5 text-[10px] font-bold text-white"
                    disabled={saving}
                    aria-label={t('admin.visitLog.modal.removeImage')}
                    onClick={() => removeImageAt(index)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div
            tabIndex={canAddImages ? 0 : -1}
            className={[
              'overflow-hidden rounded-2xl border outline-none transition-colors',
              isDragOver
                ? 'border-brand/50 bg-brand/5 ring-2 ring-brand/20'
                : 'border-ink/10 bg-white/60 dark:border-white/10 dark:bg-zinc-950/40',
              !canAddImages ? 'opacity-60' : '',
            ].join(' ')}
            onDragEnter={handleImageDragEnter}
            onDragOver={handleImageDragOver}
            onDragLeave={handleImageDragLeave}
            onDrop={handleImageDrop}
            onPaste={handleImagePaste}
          >
            <div className="flex flex-col items-stretch gap-4 px-4 py-5">
              <div className="flex flex-col items-center gap-2 text-center">
                <span
                  className={[
                    'flex size-12 items-center justify-center rounded-full',
                    isDragOver
                      ? 'bg-brand/15 text-brand'
                      : 'bg-brand/10 text-brand',
                  ].join(' ')}
                  aria-hidden
                >
                  <CloudUploadIcon className="size-6" />
                </span>
                <p className="text-sm font-bold text-brand">
                  {t('admin.visitLog.modal.dropImagesHere')}
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
                disabled={!canAddImages}
                onChange={onImagesChange}
              />
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg disabled:opacity-50"
                  disabled={!canAddImages}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {t('admin.visitLog.modal.browseImages')}
                </button>
                <button
                  type="button"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-ink/10 bg-white/80 px-4 py-2.5 text-sm font-semibold text-brand disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/50"
                  disabled={!canAddImages}
                  onClick={() => {
                    void handlePasteFromClipboard()
                  }}
                >
                  <ClipboardIcon className="size-4" aria-hidden />
                  {t('admin.visitLog.modal.pasteFromClipboard')}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={labelClass}>{t('admin.visitLog.modal.documents')}</span>
            <span className="text-[11px] text-muted">
              {t('admin.visitLog.modal.documentsCount', {
                count: documentFiles.length,
                max: MAX_VISIT_LOG_DOCUMENTS,
              })}
            </span>
          </div>
          {documentPickError ? (
            <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-500">
              {documentPickError}
            </p>
          ) : null}
          {documentFiles.length > 0 ? (
            <ul className="space-y-2">
              {documentFiles.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-2 rounded-xl border border-ink/10 bg-white/60 px-3 py-2 dark:border-white/10 dark:bg-zinc-950/40"
                >
                  <FileTextIcon className="size-4 shrink-0 text-brand" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                    {file.name}
                  </span>
                  <button
                    type="button"
                    className="rounded-full bg-black/70 px-1.5 text-[10px] font-bold text-white"
                    disabled={saving}
                    aria-label={t('admin.visitLog.modal.removeDocument')}
                    onClick={() => removeDocumentAt(index)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div
            tabIndex={canAddDocuments ? 0 : -1}
            className={[
              'overflow-hidden rounded-2xl border outline-none transition-colors',
              isDocDragOver
                ? 'border-brand/50 bg-brand/5 ring-2 ring-brand/20'
                : 'border-ink/10 bg-white/60 dark:border-white/10 dark:bg-zinc-950/40',
              !canAddDocuments ? 'opacity-60' : '',
            ].join(' ')}
            onDragEnter={handleDocumentDragEnter}
            onDragOver={handleDocumentDragOver}
            onDragLeave={handleDocumentDragLeave}
            onDrop={handleDocumentDrop}
          >
            <div className="flex flex-col items-stretch gap-4 px-4 py-5">
              <div className="flex flex-col items-center gap-2 text-center">
                <span
                  className={[
                    'flex size-12 items-center justify-center rounded-full',
                    isDocDragOver
                      ? 'bg-brand/15 text-brand'
                      : 'bg-brand/10 text-brand',
                  ].join(' ')}
                  aria-hidden
                >
                  <CloudUploadIcon className="size-6" />
                </span>
                <p className="text-sm font-bold text-brand">
                  {t('admin.visitLog.modal.dropDocumentsHere')}
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
                disabled={!canAddDocuments}
                onChange={onDocumentsChange}
              />
              <button
                type="button"
                className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg disabled:opacity-50"
                disabled={!canAddDocuments}
                onClick={() => documentInputRef.current?.click()}
              >
                {t('admin.visitLog.modal.browseDocuments')}
              </button>
            </div>
          </div>
        </div>

        <div>
          <label className={labelClass}>
            {t('admin.visitLog.modal.contentTemplate')}
          </label>
          <CrmFilterSelect
            className="w-full"
            value={contentTemplateId}
            options={CONTENT_TEMPLATE_OPTIONS.map((opt) => ({
              value: opt.id,
              label: t(opt.labelKey),
            }))}
            onChange={selectContentTemplate}
          />
          <p className="mt-1 text-[11px] font-medium text-muted">
            {t('admin.visitLog.modal.contentTemplateHint')}
          </p>
        </div>

        {saveError ? (
          <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
            {saveError}
          </p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-ink/10 pt-4 dark:border-white/10">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-2xl border border-ink/10 px-4 py-2 text-sm font-bold text-muted hover:bg-ink/5 disabled:opacity-50 dark:border-white/10"
            disabled={saving}
            onClick={onCancel}
          >
            <CloseIcon className="size-4" aria-hidden />
            {t('admin.visitLog.modal.cancel')}
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-brand-fg hover:bg-brand/90 disabled:opacity-50"
            disabled={!canSave}
          >
            <PlusIcon className="size-4" aria-hidden />
            {saving ? t('admin.visitLog.modal.saving') : t('admin.visitLog.modal.save')}
          </button>
        </div>
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-ink/10 bg-white/70 shadow-sm dark:border-white/10 dark:bg-white/5">
          <div className="flex shrink-0 items-center justify-between gap-2 px-5 pt-5 pb-2">
            <label className="text-xs font-semibold text-ink">
              {t('admin.visitLog.modal.content')}
            </label>
            <div className="flex items-center gap-1.5">
              <input
                ref={contentImportInputRef}
                type="file"
                accept=".txt,.md,.markdown,text/plain,text/markdown"
                className="hidden"
                onChange={(e) => {
                  void onContentFileChange(e)
                }}
              />
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-bold text-muted transition hover:bg-brand/10 hover:text-brand disabled:opacity-50"
                title={t('admin.visitLog.modal.contentImportTitle')}
                aria-label={t('admin.visitLog.modal.contentImportTitle')}
                disabled={importingContent || saving}
                onClick={triggerContentImport}
              >
                <FileTextIcon className="size-3.5" aria-hidden />
                {t('admin.visitLog.modal.contentImport')}
              </button>
              {dictationSupported ? (
                <button
                  type="button"
                  className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-bold transition disabled:opacity-50 ${
                    dictating
                      ? 'bg-rose-500/15 text-rose-500'
                      : 'text-muted hover:bg-brand/10 hover:text-brand'
                  }`}
                  title={
                    transcribing
                      ? t('admin.visitLog.modal.dictationTranscribing')
                      : dictating
                        ? t('admin.visitLog.modal.dictationStop')
                        : t('admin.visitLog.modal.dictationStart')
                  }
                  aria-label={
                    transcribing
                      ? t('admin.visitLog.modal.dictationTranscribing')
                      : dictating
                        ? t('admin.visitLog.modal.dictationStop')
                        : t('admin.visitLog.modal.dictationStart')
                  }
                  disabled={transcribing || saving}
                  onClick={toggleDictation}
                >
                  <MicIcon className="size-3.5" aria-hidden />
                  {transcribing
                    ? t('admin.visitLog.modal.dictationTranscribing')
                    : dictating
                      ? t('admin.visitLog.modal.dictationListening')
                      : t('admin.visitLog.modal.dictation')}
                </button>
              ) : null}
            </div>
          </div>
          {contentImportError || dictationError ? (
            <p className="shrink-0 px-5 pb-1 text-xs text-rose-500">
              {contentImportError || dictationError}
            </p>
          ) : null}
          <textarea
            ref={contentRef}
            className="min-h-0 w-full flex-1 resize-none border-0 bg-transparent px-5 pb-5 text-sm font-medium text-ink outline-none focus:ring-0 dark:text-white"
            value={content}
            placeholder={t('admin.visitLog.modal.contentPlaceholder')}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>
      </form>
    </div>
  )
}
