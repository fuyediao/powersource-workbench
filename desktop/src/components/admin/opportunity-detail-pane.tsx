/**
 * Admin opportunity detail / create pane: core fields, live exchange rate,
 * attachments, account link, and optional source lead. Collaborators and
 * product lines stay web-only.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useLinkOpen } from '@/hooks/link-open-context'
import {
  isPdfFileName,
  officeKindFromFileName,
  openOfficeDocument,
} from '@/utils/office/office-document-request'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { dash, detailSectionCardClass } from '@/components/admin/customer-detail/detail-shared'
import { CrmFilterSelect, type CrmFilterOption } from '@/components/common/crm-filter-select'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { useDesktopDomainWritesContext } from '@/hooks/use-desktop-domain-writes'
import { ArrowLeftIcon, CloseIcon, PaperclipIcon, TrashIcon } from '@/icons/AllIcons'
import {
  listCustomerPickerOptions,
  type CustomerPickerOption,
} from '@/services/customers-api'
import {
  createOpportunity,
  deleteOpportunity,
  deleteOpportunityAttachment,
  fetchOpportunityAttachmentBlob,
  getOpportunityAttachmentUrl,
  getOpportunityById,
  listLeadOptionsForCustomer,
  listOpportunityAttachments,
  OPPORTUNITY_ATTACHMENT_MAX_BYTES,
  updateOpportunity,
  uploadOpportunityAttachment,
} from '@/services/opportunities-api'
import {
  CRM_CURRENCY_OPTIONS,
  currencyCodeForFx,
  DEFAULT_SALES_PROCESS,
  pipelineStagesForSalesProcess,
  SALES_PROCESS_VALUES,
  type Opportunity,
  type OpportunityAttachment,
  type OpportunityFormInput,
  type OpportunityLeadOption,
  type OpportunitySalesProcess,
} from '@/types/opportunity'
import {
  opportunitiesListPath,
  opportunityDetailPath,
} from '@/utils/opportunity-list-routes'
import { fetchCurrencyCatalog, fetchCurrencyConvert, type CurrencyCatalogEntry } from '@/utils/shared/api'

/** Default quote currency for the opportunity FX picker (home converter default). */
const OPPORTUNITY_FX_QUOTE = 'USD'

/** Same refresh cadence as the home currency widget. */
const OPPORTUNITY_FX_REFRESH_MS = 10 * 60_000

interface OpportunityDetailPaneProps {
  /** `create` renders an empty form; `detail` loads and edits in place. */
  mode: 'create' | 'detail'
  opportunityId: string | null
  userId: string
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

/**
 * Builds a blank opportunity form model.
 * @returns Empty form input.
 */
function emptyForm(): OpportunityFormInput {
  const stages = pipelineStagesForSalesProcess(DEFAULT_SALES_PROCESS)
  return {
    name: '',
    customerId: null,
    amount: null,
    stage: stages[0]?.stage ?? '',
    expectedCloseDate: null,
    salesProcess: DEFAULT_SALES_PROCESS,
    currencyCode: 'USD',
    exchangeRate: 1,
    leadId: null,
    notes: null,
  }
}

/**
 * Maps a loaded opportunity to the editable form model.
 * @param opportunity - Detail row.
 * @returns Form input.
 */
function formFromDetail(opportunity: Opportunity): OpportunityFormInput {
  return {
    name: opportunity.name,
    customerId: opportunity.customerId,
    amount: opportunity.amount,
    stage: opportunity.stage,
    expectedCloseDate: opportunity.expectedCloseDate,
    salesProcess: opportunity.salesProcess ?? DEFAULT_SALES_PROCESS,
    currencyCode: opportunity.currencyCode,
    exchangeRate: opportunity.exchangeRate ?? 1,
    leadId: opportunity.leadId,
    notes: opportunity.notes,
  }
}

/**
 * Normalizes a text input into a nullable stored value.
 * @param value - Raw input.
 * @returns Trimmed string, or null.
 */
function textValue(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/**
 * Normalizes a numeric input into a nullable stored value.
 * @param value - Raw input.
 * @returns Finite number, or null.
 */
function numberValue(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

const inputClass =
  'w-full rounded-2xl border border-ink/10 bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5'

const labelClass = 'text-xs font-bold tracking-wide text-muted uppercase'

/**
 * Formats a byte size for the attachment list (web `formatBytes` parity).
 * @param n - Size in bytes, or null.
 * @returns Human-readable size, or empty string.
 */
function formatBytes(n: number | null): string {
  if (n == null) {
    return ''
  }
  if (n < 1024) {
    return `${n} B`
  }
  if (n < 1024 * 1024) {
    return `${(n / 1024).toFixed(1)} KB`
  }
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Formats an attachment created-at timestamp for the read-only list.
 * @param iso - ISO timestamp.
 * @param locale - Active i18n locale.
 * @returns Localized date, or empty string.
 */
function formatAttachmentDate(iso: string, locale: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }
  return parsed.toLocaleDateString(locale)
}

/**
 * Formats a 1-from = rate-to quote (home converter display).
 * @param from - Opportunity currency code.
 * @param rate - Unit rate into the selected quote currency.
 * @param to - User-selected quote currency.
 * @param locale - Active i18n locale.
 * @returns Pair string such as `1 USD = 31.89 TWD`.
 */
function formatFxPair(from: string, rate: number, to: string, locale: string): string {
  const rateText = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 6,
  }).format(rate)
  return `1 ${from} = ${rateText} ${to}`
}

/**
 * Maps the Settings / home FX catalog into filter options.
 * @param catalog - Live currency catalog.
 * @returns Code + name options.
 */
function catalogToCurrencyOptions(
  catalog: readonly { code: string; name: string }[],
): CrmFilterOption[] {
  return catalog.map((entry) => ({
    value: entry.code,
    label: entry.code,
    description: entry.name !== entry.code ? entry.name : undefined,
  }))
}

/**
 * Fallback list when the live catalog has not loaded.
 * @returns Hardcoded CRM currency options.
 */
function fallbackCurrencyOptions(): CrmFilterOption[] {
  return CRM_CURRENCY_OPTIONS.map((code) => ({ value: code, label: code }))
}

/**
 * Keeps a selected code visible when it is missing from the catalog.
 * @param options - Catalog options.
 * @param selected - Current form value.
 * @returns Options including `selected` when needed.
 */
function withSelectedCurrencyOption(
  options: CrmFilterOption[],
  selected: string,
): CrmFilterOption[] {
  if (!selected || options.some((option) => option.value === selected)) {
    return options
  }
  return [{ value: selected, label: selected }, ...options]
}

/**
 * Opportunity detail pane with in-place editing plus create.
 * @param props - Mode, id, current user, writes, and navigation.
 * @returns Detail UI.
 */
export function OpportunityDetailPane({
  mode,
  opportunityId,
  userId,
  writes,
  onNavigate,
}: OpportunityDetailPaneProps) {
  const { t, i18n } = useTranslation()
  const { openInApp } = useLinkOpen()
  const domainWrites = useDesktopDomainWritesContext()
  const canCreate = Boolean(writes?.canCreate)
  const canEdit = Boolean(writes?.canEdit)
  const canDelete = Boolean(writes?.canDelete)
  const uiLocale = i18n.resolvedLanguage || i18n.language || 'en-US'

  const [opportunity, setOpportunity] = useState<Opportunity | null>(null)
  const [form, setForm] = useState<OpportunityFormInput>(emptyForm)
  const [customers, setCustomers] = useState<CustomerPickerOption[]>([])
  const [leadOptions, setLeadOptions] = useState<OpportunityLeadOption[]>([])
  const [attachments, setAttachments] = useState<OpportunityAttachment[]>([])
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [attachmentDragOver, setAttachmentDragOver] = useState(false)
  const [attachmentErrorId, setAttachmentErrorId] = useState<string | null>(null)
  const [exchangeRateLoading, setExchangeRateLoading] = useState(false)
  const [exchangeRateError, setExchangeRateError] = useState(false)
  const [fxQuoteCode, setFxQuoteCode] = useState(OPPORTUNITY_FX_QUOTE)
  /** Live convert preview while viewing (does not dirty the edit form). */
  const [viewConvertRate, setViewConvertRate] = useState<number | null>(null)
  const [currencyCatalog, setCurrencyCatalog] = useState<CurrencyCatalogEntry[]>(
    [],
  )
  const [loading, setLoading] = useState(mode === 'detail')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(mode === 'create')
  const [error, setError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const deletePresence = useDialogPresence(deleteOpen)
  const [deleting, setDeleting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const exchangeRateFetchSeq = useRef(0)

  const customerOptions = useMemo(
    () => [
      { value: '', label: t('admin.opportunities.form.accountPlaceholder') },
      ...customers.map((customer) => ({
        value: customer.id,
        label: customer.companyName || customer.id,
        description: customer.customerCode ?? undefined,
      })),
    ],
    [customers, t],
  )

  const salesProcessOptions = useMemo(
    () =>
      SALES_PROCESS_VALUES.map((process) => ({
        value: process,
        label: t(`admin.opportunities.salesProcess.${process}`),
      })),
    [t],
  )

  const stageOptions = useMemo(
    () =>
      pipelineStagesForSalesProcess(form.salesProcess).map((row) => ({
        value: row.stage,
        label: t(`admin.opportunities.stage.${row.stage}`),
      })),
    [form.salesProcess, t],
  )

  const currencyOptions = useMemo(() => {
    const base =
      currencyCatalog.length > 0
        ? catalogToCurrencyOptions(currencyCatalog)
        : fallbackCurrencyOptions()
    return withSelectedCurrencyOption(
      withSelectedCurrencyOption(base, form.currencyCode),
      fxQuoteCode,
    )
  }, [currencyCatalog, form.currencyCode, fxQuoteCode])

  const leadOptionList = useMemo(
    () => [
      { value: '', label: t('admin.opportunities.form.leadPlaceholder') },
      ...leadOptions.map((lead) => ({ value: lead.id, label: lead.displayLabel })),
    ],
    [leadOptions, t],
  )

  const linkedCustomer = useMemo(
    () => customers.find((customer) => customer.id === form.customerId) ?? null,
    [customers, form.customerId],
  )

  const fxFromCode = currencyCodeForFx(
    (editing ? form.currencyCode : opportunity?.currencyCode) ||
      OPPORTUNITY_FX_QUOTE,
  )
  const fxToCode = currencyCodeForFx(fxQuoteCode || OPPORTUNITY_FX_QUOTE)
  const activeExchangeRate = editing
    ? Number(form.exchangeRate ?? 1)
    : Number(viewConvertRate ?? opportunity?.exchangeRate ?? 1)

  const exchangeRateDisplayValue = useMemo(
    () => formatFxPair(fxFromCode, activeExchangeRate, fxToCode, uiLocale),
    [activeExchangeRate, fxFromCode, fxToCode, uiLocale],
  )

  const exchangeRateHint = useMemo(() => {
    if (exchangeRateLoading) {
      return t('admin.opportunities.form.exchangeRateLoading', {
        from: fxFromCode,
        to: fxToCode,
      })
    }
    if (exchangeRateError) {
      return t('admin.opportunities.form.exchangeRateError', { to: fxToCode })
    }
    const rateText = new Intl.NumberFormat(uiLocale, {
      maximumFractionDigits: 6,
    }).format(activeExchangeRate)
    return t('admin.opportunities.form.exchangeRateHint', {
      from: fxFromCode,
      to: fxToCode,
      rate: rateText,
    })
  }, [
    activeExchangeRate,
    exchangeRateError,
    exchangeRateLoading,
    fxFromCode,
    fxToCode,
    t,
    uiLocale,
  ])

  /**
   * Loads the customer picker options once (account link field).
   * @returns Nothing.
   */
  useEffect(() => {
    let cancelled = false
    void listCustomerPickerOptions({
      isSystemAdmin: domainWrites.isSystemAdmin,
      groupId: domainWrites.groupId,
    })
      .then((rows) => {
        if (!cancelled) {
          setCustomers(rows)
        }
      })
      .catch((err) => {
        console.error('[OpportunityDetailPane] listCustomerPickerOptions:', err)
      })
    return () => {
      cancelled = true
    }
  }, [domainWrites.groupId, domainWrites.isSystemAdmin])

  /**
   * Loads the Settings / home FX catalog for currency pickers.
   * @returns Nothing.
   */
  useEffect(() => {
    let cancelled = false
    void fetchCurrencyCatalog()
      .then((catalog) => {
        if (!cancelled) {
          setCurrencyCatalog(catalog)
        }
      })
      .catch((err) => {
        console.warn('[OpportunityDetailPane] fetchCurrencyCatalog:', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * Loads source-lead options for the selected account.
   * @returns Nothing.
   */
  useEffect(() => {
    if (!form.customerId) {
      setLeadOptions([])
      return
    }
    let cancelled = false
    void listLeadOptionsForCustomer(form.customerId).then((rows) => {
      if (!cancelled) {
        setLeadOptions(rows)
      }
    })
    return () => {
      cancelled = true
    }
  }, [form.customerId])

  /**
   * Fetches live FX via the home currency feed (deal currency → selected quote).
   * @param forEdit - When true, writes into the edit form; otherwise view preview only.
   * @returns Nothing.
   */
  const refreshExchangeRate = useCallback(
    async (forEdit: boolean): Promise<void> => {
      const from = currencyCodeForFx(
        (forEdit ? form.currencyCode : opportunity?.currencyCode) ||
          OPPORTUNITY_FX_QUOTE,
      )
      const to = currencyCodeForFx(fxQuoteCode || OPPORTUNITY_FX_QUOTE)
      const seq = ++exchangeRateFetchSeq.current
      setExchangeRateError(false)

      if (from === to) {
        if (forEdit) {
          setForm((prev) => ({ ...prev, exchangeRate: 1 }))
        } else {
          setViewConvertRate(1)
        }
        setExchangeRateLoading(false)
        return
      }

      setExchangeRateLoading(true)
      try {
        const converted = await fetchCurrencyConvert(1, from, to)
        if (seq !== exchangeRateFetchSeq.current) {
          return
        }
        if (forEdit) {
          setForm((prev) => ({ ...prev, exchangeRate: converted.rate }))
        } else {
          setViewConvertRate(converted.rate)
        }
      } catch (err) {
        if (seq !== exchangeRateFetchSeq.current) {
          return
        }
        console.warn('[OpportunityDetailPane] refreshExchangeRate failed:', err)
        setExchangeRateError(true)
        if (forEdit) {
          setForm((prev) => {
            const current = Number(prev.exchangeRate)
            if (!Number.isFinite(current) || current <= 0) {
              return { ...prev, exchangeRate: 1 }
            }
            return prev
          })
        } else {
          setViewConvertRate((prev) => {
            if (prev != null && Number.isFinite(prev) && prev > 0) {
              return prev
            }
            const stored = Number(opportunity?.exchangeRate ?? 1)
            return Number.isFinite(stored) && stored > 0 ? stored : 1
          })
        }
      } finally {
        if (seq === exchangeRateFetchSeq.current) {
          setExchangeRateLoading(false)
        }
      }
    },
    [form.currencyCode, fxQuoteCode, opportunity?.currencyCode, opportunity?.exchangeRate],
  )

  /**
   * Refreshes FX while the form is editable, on the home widget cadence.
   * @returns Nothing.
   */
  useEffect(() => {
    if (!editing) {
      return
    }
    void refreshExchangeRate(true)
    const intervalId = window.setInterval(() => {
      void refreshExchangeRate(true)
    }, OPPORTUNITY_FX_REFRESH_MS)
    return () => {
      window.clearInterval(intervalId)
    }
  }, [editing, refreshExchangeRate])

  /**
   * Live convert preview when viewing (quote currency can change without Edit).
   * @returns Nothing.
   */
  useEffect(() => {
    if (editing || mode !== 'detail' || !opportunity) {
      return
    }
    void refreshExchangeRate(false)
  }, [editing, mode, opportunity, refreshExchangeRate])

  /**
   * Loads the opportunity.
   * @returns Nothing.
   */
  const reload = useCallback(async (): Promise<void> => {
    if (mode !== 'detail' || !opportunityId) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [detail, rows] = await Promise.all([
        getOpportunityById(opportunityId),
        listOpportunityAttachments(opportunityId),
      ])
      if (!detail) {
        setError(t('admin.opportunities.errorLoad'))
        return
      }
      setOpportunity(detail)
      setForm(formFromDetail(detail))
      setAttachments(rows)
      setPendingFiles([])
    } catch (err) {
      console.error('[OpportunityDetailPane] load:', err)
      setError(t('admin.opportunities.errorLoad'))
    } finally {
      setLoading(false)
    }
  }, [mode, opportunityId, t])

  useEffect(() => {
    void reload()
  }, [reload])

  /**
   * Updates one form field.
   * @param patch - Partial form values.
   * @returns Nothing.
   */
  function patchForm(patch: Partial<OpportunityFormInput>): void {
    setForm((prev) => ({ ...prev, ...patch }))
  }

  /**
   * Switches sales process and resets the stage to that process's first stage.
   * @param next - New sales process.
   * @returns Nothing.
   */
  function changeSalesProcess(next: OpportunitySalesProcess): void {
    const stages = pipelineStagesForSalesProcess(next)
    setForm((prev) => ({ ...prev, salesProcess: next, stage: stages[0]?.stage ?? '' }))
  }

  /**
   * Queues files under the 20 MB cap for upload on save (web pendingFiles parity).
   * @param files - Files from the picker or drop zone.
   * @returns Nothing.
   */
  function addPendingFiles(files: File[]): void {
    setPendingFiles((prev) => [
      ...prev,
      ...files.filter((file) => file.size <= OPPORTUNITY_ATTACHMENT_MAX_BYTES),
    ])
  }

  /**
   * Handles the hidden file input for attachments.
   * @param event - Change event from the file input.
   * @returns Nothing.
   */
  function onAttachmentFileInput(event: ChangeEvent<HTMLInputElement>): void {
    if (event.target.files) {
      addPendingFiles(Array.from(event.target.files))
    }
    event.target.value = ''
  }

  /**
   * Handles dropping files onto the attachment zone.
   * @param event - Drag event.
   * @returns Nothing.
   */
  function onAttachmentDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    setAttachmentDragOver(false)
    if (event.dataTransfer.files) {
      addPendingFiles(Array.from(event.dataTransfer.files))
    }
  }

  /**
   * Uploads queued files after the opportunity row exists.
   * @param targetId - Saved opportunity uuid.
   * @param files - Pending files from the current save.
   * @returns Nothing.
   */
  async function uploadPendingFiles(targetId: string, files: File[]): Promise<void> {
    if (files.length === 0) {
      return
    }
    const uploaded: OpportunityAttachment[] = []
    for (const file of files) {
      try {
        uploaded.push(await uploadOpportunityAttachment(targetId, file, userId))
      } catch (err) {
        console.error('[OpportunityDetailPane] uploadPendingFiles:', err)
      }
    }
    if (uploaded.length > 0) {
      setAttachments((prev) => [...prev, ...uploaded])
    }
    setPendingFiles([])
  }

  /**
   * Deletes a stored attachment immediately (web form parity).
   * @param attachment - Row to remove.
   * @returns Nothing.
   */
  async function handleDeleteAttachment(attachment: OpportunityAttachment): Promise<void> {
    try {
      await deleteOpportunityAttachment(attachment)
      setAttachments((prev) => prev.filter((row) => row.id !== attachment.id))
    } catch (err) {
      console.error('[OpportunityDetailPane] handleDeleteAttachment:', err)
      setError(t('admin.opportunities.errorCreate'))
    }
  }

  /**
   * Opens an attachment: PDF in the in-app viewer, Office via OnlyOffice.
   * @param attachment - Row to open.
   * @returns Nothing.
   */
  async function handleDownloadAttachment(attachment: OpportunityAttachment): Promise<void> {
    setAttachmentErrorId(null)
    try {
      if (isPdfFileName(attachment.fileName, attachment.mimeType)) {
        const url = await getOpportunityAttachmentUrl(attachment.storagePath)
        openInApp(url)
        return
      }
      const kind = officeKindFromFileName(attachment.fileName)
      if (!kind) {
        const url = await getOpportunityAttachmentUrl(attachment.storagePath)
        openInApp(url)
        return
      }
      const blob = await fetchOpportunityAttachmentBlob(attachment.storagePath)
      const bytes = new Uint8Array(await blob.arrayBuffer())
      openOfficeDocument({ kind, name: attachment.fileName, bytes })
    } catch (err) {
      console.error('[OpportunityDetailPane] handleDownloadAttachment:', err)
      setAttachmentErrorId(attachment.id)
    }
  }

  /**
   * Saves the create or update form.
   * @returns Nothing.
   */
  async function submit(): Promise<void> {
    if (saving) {
      return
    }
    if (!form.name.trim()) {
      setError(t('admin.opportunities.form.nameRequired'))
      return
    }
    if (!form.customerId) {
      setError(t('admin.opportunities.form.accountRequired'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (mode === 'create') {
        if (!canCreate) {
          return
        }
        const created = await createOpportunity(userId, form)
        await uploadPendingFiles(created.id, pendingFiles)
        onNavigate(opportunityDetailPath(created.id))
        return
      }
      if (!canEdit || !opportunityId) {
        return
      }
      const updated = await updateOpportunity(opportunityId, form)
      await uploadPendingFiles(opportunityId, pendingFiles)
      setOpportunity(updated)
      setForm(formFromDetail(updated))
      setEditing(false)
    } catch (err) {
      console.error('[OpportunityDetailPane] save:', err)
      setError(t('admin.opportunities.errorCreate'))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Deletes the current opportunity and returns to the list.
   * @returns Nothing.
   */
  async function confirmDelete(): Promise<void> {
    if (!opportunityId || !canDelete || deleting) {
      return
    }
    setDeleting(true)
    try {
      await deleteOpportunity(opportunityId)
      setDeleteOpen(false)
      onNavigate(opportunitiesListPath())
    } catch (err) {
      console.error('[OpportunityDetailPane] delete:', err)
      setError(t('admin.opportunities.errorDelete'))
    } finally {
      setDeleting(false)
    }
  }

  const title =
    mode === 'create' ? t('admin.opportunities.addOpportunity') : opportunity?.name || t('admin.opportunities.title')

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-ink/10 bg-white/80 px-4 py-3 backdrop-blur-md dark:bg-zinc-950/80">
        <button
          type="button"
          className="rounded-xl p-2 text-brand hover:bg-brand/10"
          title={t('admin.customers.backToList')}
          aria-label={t('admin.customers.backToList')}
          onClick={() => onNavigate(opportunitiesListPath())}
        >
          <ArrowLeftIcon className="size-5" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-extrabold text-brand">
          {title}
        </h1>
        {editing ? (
          <div className="flex shrink-0 items-center gap-2">
            {mode === 'detail' ? (
              <button
                type="button"
                disabled={saving}
                className="rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
                onClick={() => {
                  if (opportunity) {
                    setForm(formFromDetail(opportunity))
                  }
                  setPendingFiles([])
                  setAttachmentDragOver(false)
                  setFxQuoteCode(OPPORTUNITY_FX_QUOTE)
                  setEditing(false)
                  setError(null)
                  if (opportunityId) {
                    void listOpportunityAttachments(opportunityId)
                      .then(setAttachments)
                      .catch((err) => {
                        console.error('[OpportunityDetailPane] reload attachments:', err)
                      })
                  }
                }}
              >
                {t('actions.cancel')}
              </button>
            ) : null}
            <button
              type="button"
              disabled={saving}
              className="rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg disabled:opacity-50"
              onClick={() => void submit()}
            >
              {saving ? t('admin.kolDetail.saving') : t('admin.kolDetail.save')}
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            {canEdit ? (
              <button
                type="button"
                className="rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10"
                onClick={() => setEditing(true)}
              >
                {t('admin.kolDetail.edit')}
              </button>
            ) : null}
            {canDelete ? (
              <button
                type="button"
                className="rounded-2xl border border-rose-400/40 px-3 py-2 text-sm font-bold text-rose-500"
                onClick={() => setDeleteOpen(true)}
              >
                {t('admin.kolDetail.delete')}
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-4 sm:px-6">
        {error ? (
          <p className="text-sm font-medium text-rose-500">{error}</p>
        ) : null}
        {loading ? (
          <p className="text-sm font-medium text-muted">{t('admin.leadsTable.loading')}</p>
        ) : null}

        {!loading ? (
          <section className={detailSectionCardClass()}>
            <h2 className="mb-3 text-sm font-extrabold text-ink">
              {t('admin.opportunities.detail.sectionOverview')}
            </h2>
            {editing ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5 sm:col-span-2">
                  <span className={labelClass}>
                    {t('admin.opportunities.form.name')}{' '}
                    <span className="text-rose-500" aria-hidden>
                      *
                    </span>
                  </span>
                  <input
                    type="text"
                    value={form.name}
                    placeholder={t('admin.opportunities.form.namePlaceholder')}
                    onChange={(e) => patchForm({ name: e.target.value })}
                    className={inputClass}
                    required
                  />
                </label>
                <div className="space-y-1.5 sm:col-span-2">
                  <span className={labelClass}>
                    {t('admin.opportunities.form.account')}{' '}
                    <span className="text-rose-500" aria-hidden>
                      *
                    </span>
                  </span>
                  <CrmFilterSelect
                    className="w-full"
                    value={form.customerId ?? ''}
                    options={customerOptions}
                    searchable
                    searchPlaceholder={t('admin.opportunities.form.searchCustomerPlaceholder')}
                    closeAriaLabel={t('common.inlineSearchComboboxClose')}
                    emptyLabel={t('admin.opportunities.form.noCustomerMatch')}
                    ariaLabel={t('admin.opportunities.form.account')}
                    onChange={(next) =>
                      patchForm({ customerId: next || null, leadId: null })
                    }
                    filterOption={(option, query) => {
                      const q = query.toLowerCase()
                      return (
                        option.label.toLowerCase().includes(q) ||
                        (option.description?.toLowerCase().includes(q) ?? false)
                      )
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <span className={labelClass}>
                    {t('admin.opportunities.form.salesProcess')}
                  </span>
                  <CrmFilterSelect
                    className="w-full"
                    value={form.salesProcess}
                    options={salesProcessOptions}
                    ariaLabel={t('admin.opportunities.form.salesProcess')}
                    onChange={(next) => changeSalesProcess(next as OpportunitySalesProcess)}
                  />
                </div>
                <div className="space-y-1.5">
                  <span className={labelClass}>{t('admin.opportunities.form.stage')}</span>
                  <CrmFilterSelect
                    className="w-full"
                    value={form.stage}
                    options={stageOptions}
                    ariaLabel={t('admin.opportunities.form.stage')}
                    onChange={(next) => patchForm({ stage: next })}
                  />
                </div>
                <label className="block space-y-1.5">
                  <span className={labelClass}>{t('admin.opportunities.form.amount')}</span>
                  <input
                    type="number"
                    step="any"
                    value={form.amount ?? ''}
                    placeholder={t('admin.opportunities.form.amountPlaceholder')}
                    onChange={(e) => patchForm({ amount: numberValue(e.target.value) })}
                    className={inputClass}
                  />
                </label>
                <div className="space-y-1.5">
                  <span className={labelClass}>{t('admin.opportunities.form.currency')}</span>
                  <CrmFilterSelect
                    className="w-full"
                    value={form.currencyCode}
                    options={currencyOptions}
                    searchable
                    searchPlaceholder={t('admin.opportunities.form.searchCurrencyPlaceholder')}
                    closeAriaLabel={t('common.inlineSearchComboboxClose')}
                    emptyLabel={t('admin.opportunities.form.noCurrencyMatch')}
                    ariaLabel={t('admin.opportunities.form.currency')}
                    onChange={(next) => {
                      const sameAsQuote =
                        currencyCodeForFx(next) === currencyCodeForFx(fxQuoteCode)
                      patchForm({
                        currencyCode: next,
                        ...(sameAsQuote ? { exchangeRate: 1 } : {}),
                      })
                    }}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <span className={labelClass}>
                    {t('admin.opportunities.form.exchangeRate')}{' '}
                    <span className="text-rose-500" aria-hidden>
                      *
                    </span>
                  </span>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <input
                      type="text"
                      readOnly
                      value={exchangeRateDisplayValue}
                      className={`${inputClass} cursor-not-allowed opacity-70 sm:flex-1`}
                    />
                    <div className="sm:w-52">
                      <CrmFilterSelect
                        className="w-full"
                        value={fxQuoteCode}
                        options={currencyOptions}
                        searchable
                        searchPlaceholder={t(
                          'admin.opportunities.form.searchCurrencyPlaceholder',
                        )}
                        closeAriaLabel={t('common.inlineSearchComboboxClose')}
                        emptyLabel={t('admin.opportunities.form.noCurrencyMatch')}
                        ariaLabel={t('admin.opportunities.form.exchangeRateQuote')}
                        onChange={(next) => {
                          const quote = next || OPPORTUNITY_FX_QUOTE
                          const sameAsFrom =
                            currencyCodeForFx(quote) ===
                            currencyCodeForFx(form.currencyCode || OPPORTUNITY_FX_QUOTE)
                          setFxQuoteCode(quote)
                          if (sameAsFrom) {
                            patchForm({ exchangeRate: 1 })
                          }
                        }}
                      />
                    </div>
                  </div>
                  <p className="text-xs font-medium text-muted">{exchangeRateHint}</p>
                </div>
                <label className="block space-y-1.5">
                  <span className={labelClass}>{t('admin.opportunities.form.closeDate')}</span>
                  <input
                    type="date"
                    value={form.expectedCloseDate ?? ''}
                    onChange={(e) =>
                      patchForm({ expectedCloseDate: textValue(e.target.value) })
                    }
                    className={inputClass}
                  />
                </label>
                <div className="space-y-1.5">
                  <span className={labelClass}>
                    {t('admin.opportunities.form.sourceLead')}
                  </span>
                  <CrmFilterSelect
                    className="w-full"
                    value={form.leadId ?? ''}
                    options={leadOptionList}
                    ariaLabel={t('admin.opportunities.form.sourceLead')}
                    disabled={!form.customerId || leadOptions.length === 0}
                    emptyLabel={t('admin.opportunities.form.noLeadForCustomer')}
                    onChange={(next) => patchForm({ leadId: next || null })}
                  />
                </div>
                <label className="block space-y-1.5 sm:col-span-2">
                  <span className={labelClass}>{t('admin.opportunities.form.notes')}</span>
                  <textarea
                    value={form.notes ?? ''}
                    rows={3}
                    placeholder={t('admin.opportunities.form.notesPlaceholder')}
                    onChange={(e) => patchForm({ notes: textValue(e.target.value) })}
                    className={inputClass}
                  />
                </label>
              </div>
            ) : (
              <dl className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <dt className={labelClass}>{t('admin.opportunities.form.name')}</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-ink">
                    {dash(opportunity?.name)}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className={labelClass}>{t('admin.opportunities.detail.customer')}</dt>
                  <dd className="mt-0.5 text-sm text-ink/80">
                    {dash(linkedCustomer?.companyName ?? null)}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>{t('admin.opportunities.col.stage')}</dt>
                  <dd className="mt-0.5">
                    <span className="inline-flex items-center rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand">
                      {opportunity
                        ? t(`admin.opportunities.stage.${opportunity.stage}`, {
                            defaultValue: opportunity.stage,
                          })
                        : '—'}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>{t('admin.opportunities.col.amount')}</dt>
                  <dd className="mt-0.5 text-sm tabular-nums text-ink/80">
                    {opportunity?.amount != null
                      ? `${opportunity.currencyCode} ${opportunity.amount}`
                      : '—'}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className={labelClass}>
                    {t('admin.opportunities.form.exchangeRate')}
                  </dt>
                  <dd className="mt-0.5 space-y-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                      <input
                        type="text"
                        readOnly
                        value={
                          opportunity ? exchangeRateDisplayValue : '—'
                        }
                        className={`${inputClass} cursor-not-allowed opacity-70 sm:flex-1`}
                      />
                      <div className="sm:w-52">
                        <CrmFilterSelect
                          className="w-full"
                          value={fxQuoteCode}
                          options={currencyOptions}
                          searchable
                          searchPlaceholder={t(
                            'admin.opportunities.form.searchCurrencyPlaceholder',
                          )}
                          closeAriaLabel={t('common.inlineSearchComboboxClose')}
                          emptyLabel={t('admin.opportunities.form.noCurrencyMatch')}
                          ariaLabel={t('admin.opportunities.form.exchangeRateQuote')}
                          onChange={(next) => {
                            setFxQuoteCode(next || OPPORTUNITY_FX_QUOTE)
                          }}
                        />
                      </div>
                    </div>
                    <p className="text-xs font-medium text-muted">{exchangeRateHint}</p>
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>{t('admin.opportunities.col.closeDate')}</dt>
                  <dd className="mt-0.5 text-sm text-ink/80">
                    {dash(opportunity?.expectedCloseDate)}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>
                    {t('admin.opportunities.form.sourceLead')}
                  </dt>
                  <dd className="mt-0.5 text-sm text-ink/80">
                    {leadOptions.find((lead) => lead.id === opportunity?.leadId)
                      ?.displayLabel ?? '—'}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className={labelClass}>{t('admin.opportunities.form.notes')}</dt>
                  <dd className="mt-0.5 text-sm whitespace-pre-wrap text-ink/80">
                    {dash(opportunity?.notes)}
                  </dd>
                </div>
              </dl>
            )}
          </section>
        ) : null}

        {!loading ? (
          <section className={detailSectionCardClass()}>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-ink">
              <PaperclipIcon className="size-4 shrink-0 text-muted" aria-hidden />
              {t('admin.opportunities.section.attachments')}
              {mode === 'detail' ? (
                <span className="ml-auto text-xs font-medium text-muted">
                  {attachments.length}
                </span>
              ) : null}
            </h2>

            {attachments.length > 0 ? (
              <ul className="mb-3 space-y-1.5">
                {attachments.map((att) => (
                  <li
                    key={att.id}
                    className="flex items-center gap-2 rounded-xl border border-ink/10 bg-white/60 px-3 py-2 dark:bg-white/5"
                  >
                    <PaperclipIcon className="size-3.5 shrink-0 text-muted" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{att.fileName}</p>
                      <p className="text-xs text-muted">
                        {formatBytes(att.byteSize)}
                        {att.createdAt && !editing ? (
                          <span className="ml-2">
                            {formatAttachmentDate(att.createdAt, uiLocale)}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    {attachmentErrorId === att.id ? (
                      <span className="shrink-0 text-xs text-rose-500">
                        {t('admin.opportunities.detail.downloadError')}
                      </span>
                    ) : null}
                    {!editing ? (
                      <button
                        type="button"
                        className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-brand hover:bg-brand/10"
                        onClick={() => void handleDownloadAttachment(att)}
                      >
                        {t('admin.opportunities.detail.download')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="rounded-lg p-1 text-muted hover:text-rose-500"
                        aria-label={t('admin.opportunities.form.removeAttachment')}
                        onClick={() => void handleDeleteAttachment(att)}
                      >
                        <TrashIcon className="size-3.5" aria-hidden />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : !editing ? (
              <p className="py-4 text-center text-sm text-muted">
                {t('admin.opportunities.detail.emptyAttachments')}
              </p>
            ) : null}

            {editing && pendingFiles.length > 0 ? (
              <ul className="mb-3 space-y-1.5">
                {pendingFiles.map((file, index) => (
                  <li
                    key={`${file.name}-${file.size}-${index}`}
                    className="flex items-center gap-2 rounded-xl border border-brand/30 bg-brand/5 px-3 py-2"
                  >
                    <PaperclipIcon className="size-3.5 shrink-0 text-brand" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                      {file.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {formatBytes(file.size)}
                    </span>
                    <button
                      type="button"
                      className="rounded-lg p-1 text-muted hover:text-rose-500"
                      aria-label={t('admin.opportunities.form.removePendingFile')}
                      onClick={() =>
                        setPendingFiles((prev) => prev.filter((_, i) => i !== index))
                      }
                    >
                      <CloseIcon className="size-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {editing ? (
              <div
                className={[
                  'relative flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors',
                  attachmentDragOver
                    ? 'border-brand/60 bg-brand/5'
                    : 'border-ink/15 bg-white/40 dark:border-white/15 dark:bg-white/5',
                ].join(' ')}
                onDragEnter={(event) => {
                  event.preventDefault()
                  setAttachmentDragOver(true)
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  setAttachmentDragOver(true)
                }}
                onDragLeave={(event) => {
                  event.preventDefault()
                  setAttachmentDragOver(false)
                }}
                onDrop={onAttachmentDrop}
              >
                <PaperclipIcon className="size-5 text-muted" aria-hidden />
                <p className="text-sm text-muted">
                  {t('admin.opportunities.form.attachmentDrop')}{' '}
                  <button
                    type="button"
                    className="cursor-pointer font-semibold text-brand hover:underline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {t('admin.opportunities.form.attachmentBrowse')}
                  </button>
                </p>
                <p className="text-xs text-muted">
                  {t('admin.opportunities.form.attachmentHint')}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="sr-only"
                  onChange={onAttachmentFileInput}
                />
              </div>
            ) : null}
          </section>
        ) : null}
      </div>

      {deletePresence.mounted
        ? createPortal(
            <div
              className={`fixed inset-0 z-[130] flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px] ${
                deletePresence.leaving
                  ? 'animate-dropdown-out'
                  : 'animate-dropdown-in'
              }`}
              onClick={() => {
                if (!deleting) {
                  setDeleteOpen(false)
                }
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                className="w-full max-w-sm rounded-2xl border border-zinc-950/10 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-base font-extrabold text-brand">
                  {t('admin.opportunities.deleteConfirm.title')}
                </h2>
                <p className="mt-2 text-sm font-medium text-muted">
                  {t('admin.opportunities.deleteConfirm.message')}
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={deleting}
                    className="rounded-2xl bg-zinc-950/5 px-4 py-2 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
                    onClick={() => setDeleteOpen(false)}
                  >
                    {t('admin.leadsTable.deleteConfirm.cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                    onClick={() => void confirmDelete()}
                  >
                    {t('admin.leadsTable.deleteConfirm.confirm')}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
