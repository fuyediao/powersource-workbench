/**
 * T&E application detail pane: load by submission id, four tabs, and workflow dialogs.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { TeApplicationAiReviewTab } from '@/components/admin/te-application-ai-review-tab'
import { TeApplicationAuditTab } from '@/components/admin/te-application-audit-tab'
import { TeApplicationDetailTabs } from '@/components/admin/te-application-detail-tabs'
import { TeApplicationOperationsTab } from '@/components/admin/te-application-operations-tab'
import { TeApplicationTab } from '@/components/admin/te-application-tab'
import {
  buildApplicationDraft,
  buildApplicationPatch,
  displayName,
  formatDate,
  formatTeRetailUsd,
  halfRetailTotalUsd,
  statusClass,
  sumTeRetailUsd,
  toAppLanguage,
  workflowErrorMessage,
  type ApplicationDraft,
  type CatalogProductMeta,
  type ErpDisplayStatus,
  type ReconcileResolution,
  type RequestedApprovalProduct,
  type ReviewDecision,
  type ShippingAddressCopyLineKey,
  type TeApplicationDetailTab,
  type WorkflowAction,
} from '@/components/admin/te-application-shared'
import { teStatusLabelKey } from '@/constants/te-tracking-stages'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { useTeAiReview } from '@/hooks/use-te-ai-review'
import { ArrowLeftIcon, RefreshIcon } from '@/icons/AllIcons'
import { fetchTeOrderBySubmissionId } from '@/services/te-orders-repository'
import { fetchTePaymentsBySubmissionId } from '@/services/te-payments-repository'
import {
  buildTeProductIdLabelMap,
  fetchTeProductCategories,
  formatTeProductIds,
  type TeProductCategory,
} from '@/services/te-products-api'
import {
  fetchProfileDisplayLabelsByIds,
  fetchTeSubmissionById,
  type TeSubmission,
} from '@/services/te-submissions-repository'
import {
  confirmTeReturn,
  getTeErpReconciliation,
  pushTeOrder,
  reconcileTeErpPending,
  reviewTeSubmission,
  TeWorkflowApiError,
  updateTeApplication,
  updateTeOrderTracking,
  type TeErpPushResponse,
  type TeErpReconciliationResponse,
} from '@/services/te-workflow-api'
import { fetchTeErpPushAttempts, type TeErpPushAttempt } from '@/services/te-workflow-audit-repository'
import type { TeOrder, TePayment } from '@/types/orders'
import { pickTeAiReviewForLocale, teSubmissionHasAnySavedAiReview } from '@/utils/ai-summary-locale'
import { sanitizeCustomerAiSummaryHtml } from '@/utils/ai-summary-markdown'
import { teApplicationsListPath } from '@/utils/te-application-routes'
import { formatTeShippingAddressCopyLines } from '@/utils/te-shipping-address-copy'

interface TeApplicationDetailPaneProps {
  submissionId: string
  writes: AdminShellWrites | null
  onRefreshList: () => Promise<void>
  onNavigate: (path: string) => void
}

/**
 * Detail host for one T&E submission: application, AI review, operations, audit.
 *
 * @param props - Submission id, writes, and navigation
 * @returns Detail UI
 */
export function TeApplicationDetailPane({
  submissionId,
  writes,
  onRefreshList,
  onNavigate,
}: TeApplicationDetailPaneProps) {
  const { t, i18n } = useTranslation()
  const {
    models: aiReviewModels,
    selection: aiReviewSelection,
    isLoading: aiReviewLoading,
    error: aiReviewError,
    isConfigured: aiReviewIsConfigured,
    hasAnyApiKey: aiReviewHasAnyApiKey,
    selectModel: selectAiReviewModel,
    generate: generateAiReviewResult,
  } = useTeAiReview()

  const canManageWorkflow = Boolean(writes?.canEdit)
  const [selectedSubmission, setSelectedSubmission] = useState<TeSubmission | null>(null)
  const [operatorLabelById, setOperatorLabelById] = useState<Record<string, string>>({})
  const [submissionOrder, setSubmissionOrder] = useState<TeOrder | null>(null)
  const [submissionPayments, setSubmissionPayments] = useState<TePayment[]>([])
  const [erpPushAttempts, setErpPushAttempts] = useState<TeErpPushAttempt[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [activeDetailTab, setActiveDetailTab] = useState<TeApplicationDetailTab>('application')
  const [productCategories, setProductCategories] = useState<TeProductCategory[]>([])
  const [productLabelMap, setProductLabelMap] = useState<Record<string, string>>({})

  const [isEditingApplication, setIsEditingApplication] = useState(false)
  const [applicationDraft, setApplicationDraft] = useState<ApplicationDraft | null>(null)
  const [applicationSaving, setApplicationSaving] = useState(false)
  const [applicationSaveError, setApplicationSaveError] = useState<string | null>(null)

  const [reviewDialog, setReviewDialog] = useState<ReviewDecision | null>(null)
  const [approvalProductIds, setApprovalProductIds] = useState<string[]>([])
  const [reconcileDialog, setReconcileDialog] = useState<ReconcileResolution | null>(null)
  const [reconcileVerified, setReconcileVerified] = useState(false)
  const [returnDialogOpen, setReturnDialogOpen] = useState(false)
  const [workflowAction, setWorkflowAction] = useState<WorkflowAction>(null)
  const [workflowError, setWorkflowError] = useState<string | null>(null)
  const [workflowNotice, setWorkflowNotice] = useState<string | null>(null)
  const [reconciliationEligibleFromApi, setReconciliationEligibleFromApi] = useState(false)
  const [erpReconciliationState, setErpReconciliationState] =
    useState<TeErpReconciliationResponse | null>(null)
  const [trackingNumberDraft, setTrackingNumberDraft] = useState('')
  const [trackingCarrierDraft, setTrackingCarrierDraft] = useState('')
  const [shippingAddressJustCopiedLine, setShippingAddressJustCopiedLine] =
    useState<ShippingAddressCopyLineKey | null>(null)

  const loadSerial = useRef(0)
  const loadedSubmissionIdRef = useRef<string | null>(null)
  const shippingCopyTimers = useRef<Partial<Record<ShippingAddressCopyLineKey, number>>>({})
  const reviewPresence = useDialogPresence(Boolean(reviewDialog))
  const reconcilePresence = useDialogPresence(Boolean(reconcileDialog))
  const returnPresence = useDialogPresence(returnDialogOpen)

  const activeCatalogCategories = useMemo(
    () =>
      productCategories
        .filter((category) => category.isActive)
        .map((category) => ({
          ...category,
          products: category.products.filter((product) => product.isActive),
        }))
        .filter((category) => category.products.length > 0),
    [productCategories],
  )

  const activeProductIdSet = useMemo(
    () =>
      new Set(
        activeCatalogCategories.flatMap((category) =>
          category.products.map((product) => product.id),
        ),
      ),
    [activeCatalogCategories],
  )

  const catalogProductById = useMemo(() => {
    const map = new Map<string, CatalogProductMeta>()
    for (const category of productCategories) {
      for (const product of category.products) {
        map.set(product.id, {
          name: product.name,
          itemName: product.itemName,
          tePriceUsd: product.tePriceUsd,
        })
      }
    }
    return map
  }, [productCategories])

  const unavailableRequestedProductCount = useMemo(() => {
    const requested = selectedSubmission?.product ?? []
    return requested.filter((id) => !activeProductIdSet.has(id)).length
  }, [activeProductIdSet, selectedSubmission?.product])

  const requestedApprovalProducts = useMemo((): RequestedApprovalProduct[] => {
    const requested = selectedSubmission?.product ?? []
    const selected = new Set(approvalProductIds)
    return requested.map((id) => {
      const meta = catalogProductById.get(id)
      const available = activeProductIdSet.has(id)
      const name = meta?.name || formatTeProductIds([id], productLabelMap)
      const itemName = meta?.itemName ?? ''
      return {
        id,
        name,
        itemName,
        showErpName: Boolean(itemName) && itemName !== name,
        available,
        selected: selected.has(id),
      }
    })
  }, [
    activeProductIdSet,
    approvalProductIds,
    catalogProductById,
    productLabelMap,
    selectedSubmission?.product,
  ])

  const requestedProductsTotalUsd = useMemo(
    () => sumTeRetailUsd(selectedSubmission?.product ?? [], catalogProductById),
    [catalogProductById, selectedSubmission?.product],
  )
  const requestedProductsHalfTotalUsd = useMemo(
    () => halfRetailTotalUsd(requestedProductsTotalUsd),
    [requestedProductsTotalUsd],
  )
  const finalSelectedProductsTotalUsd = useMemo(
    () => sumTeRetailUsd(approvalProductIds, catalogProductById),
    [approvalProductIds, catalogProductById],
  )
  const finalSelectedProductsHalfTotalUsd = useMemo(
    () => halfRetailTotalUsd(finalSelectedProductsTotalUsd),
    [finalSelectedProductsTotalUsd],
  )

  const latestErpAttempt = erpPushAttempts[0] ?? null

  const erpDisplayStatus = useMemo((): ErpDisplayStatus => {
    const errorCode = latestErpAttempt?.errorCode ?? selectedSubmission?.erpPushError
    if (
      selectedSubmission?.erpPushStatus === 'pending' &&
      (erpReconciliationState?.acceptanceUnknown ||
        erpReconciliationState?.stale ||
        errorCode === 'acceptance_unknown' ||
        errorCode === 'orphaned_pending_reconciliation_required' ||
        errorCode === 'stale_pending_reconciliation_required')
    ) {
      return 'unknown'
    }
    return selectedSubmission?.erpPushStatus ?? 'not_started'
  }, [
    erpReconciliationState?.acceptanceUnknown,
    erpReconciliationState?.stale,
    latestErpAttempt?.errorCode,
    selectedSubmission?.erpPushError,
    selectedSubmission?.erpPushStatus,
  ])

  const canPushErp = Boolean(
    canManageWorkflow &&
      selectedSubmission?.status === 'approved' &&
      (selectedSubmission.erpPushStatus === null || selectedSubmission.erpPushStatus === 'failed') &&
      Boolean(selectedSubmission.approvedProductIds?.length),
  )

  const canReconcileErp = useMemo(() => {
    const errorCode = latestErpAttempt?.errorCode ?? selectedSubmission?.erpPushError
    const hasExplicitRecoveryEvidence =
      errorCode === 'acceptance_unknown' ||
      errorCode === 'stale_pending_reconciliation_required' ||
      errorCode === 'orphaned_pending_reconciliation_required'
    return (
      canManageWorkflow &&
      selectedSubmission?.status === 'approved' &&
      selectedSubmission.erpPushStatus === 'pending' &&
      (erpReconciliationState?.reconciliationEligible ||
        reconciliationEligibleFromApi ||
        hasExplicitRecoveryEvidence)
    )
  }, [
    canManageWorkflow,
    erpReconciliationState?.reconciliationEligible,
    latestErpAttempt?.errorCode,
    reconciliationEligibleFromApi,
    selectedSubmission?.erpPushError,
    selectedSubmission?.erpPushStatus,
    selectedSubmission?.status,
  ])

  const canEditTracking = Boolean(
    canManageWorkflow &&
      submissionOrder &&
      (selectedSubmission?.status === 'order_recorded' || selectedSubmission?.status === 'pending'),
  )

  const trackingFormValid =
    trackingNumberDraft.trim().length >= 5 && trackingCarrierDraft.trim().length > 0

  const detailPageTitle = selectedSubmission
    ? displayName(selectedSubmission) !== '—'
      ? displayName(selectedSubmission)
      : (selectedSubmission.email ?? '...')
    : '...'

  const appLanguage = toAppLanguage(i18n.language)
  const aiReviewDisplayText = pickTeAiReviewForLocale(selectedSubmission, appLanguage) ?? ''
  const aiReviewHtml = sanitizeCustomerAiSummaryHtml(aiReviewDisplayText)
  const hasAiReviewContent = teSubmissionHasAnySavedAiReview(selectedSubmission)

  const shippingAddressCopyLines = useMemo(() => {
    if (!selectedSubmission) {
      return { locationCode: '', fullAddress: '', postalLine: '' }
    }
    return formatTeShippingAddressCopyLines({
      street: selectedSubmission.shippingStreet,
      apt: selectedSubmission.shippingApt,
      city: selectedSubmission.shippingCity,
      state: selectedSubmission.shippingState,
      zip: selectedSubmission.shippingZip,
      country: selectedSubmission.shippingCountry,
      agency: selectedSubmission.agency,
    })
  }, [selectedSubmission])

  const shippingAddressHasCopyLines = Boolean(
    shippingAddressCopyLines.locationCode ||
      shippingAddressCopyLines.fullAddress ||
      shippingAddressCopyLines.postalLine,
  )

  /**
   * Format stored product ids using the loaded catalog map.
   *
   * @param ids - Product ids
   * @returns Comma-separated labels
   */
  function formatProductIds(ids: string[] | null | undefined): string {
    return formatTeProductIds(ids, productLabelMap)
  }

  /**
   * Resolve a stored operator profile id to a display name.
   *
   * @param userId - profiles.id UUID or null
   * @returns Display label, raw id fallback, or em dash
   */
  function formatOperatorLabel(userId: string | null | undefined): string {
    if (!userId) return '—'
    return operatorLabelById[userId] ?? userId
  }

  /**
   * Load backend-calculated reconciliation eligibility without blocking detail.
   *
   * @param submission - Current submission row
   * @returns Reconciliation state for pending ERP attempts
   */
  async function loadReconciliationState(
    submission: TeSubmission | null,
  ): Promise<TeErpReconciliationResponse | null> {
    if (!submission || submission.erpPushStatus !== 'pending') return null
    try {
      return await getTeErpReconciliation(submission.id)
    } catch {
      return null
    }
  }

  /**
   * Load one submission plus local order, payment, ERP attempts, and reconciliation.
   *
   * @param id - T&E submission UUID
   */
  const loadDetail = useCallback(
    async (id: string): Promise<void> => {
      const serial = ++loadSerial.current
      const isNewSubmission = loadedSubmissionIdRef.current !== id
      setDetailLoading(true)
      setDetailError(null)
      if (isNewSubmission) setActiveDetailTab('application')
      try {
        const [submission, order, payments] = await Promise.all([
          fetchTeSubmissionById(id),
          fetchTeOrderBySubmissionId(id),
          fetchTePaymentsBySubmissionId(id),
        ])
        if (serial !== loadSerial.current) return
        const attempts = submission?.erpPushStatus ? await fetchTeErpPushAttempts(id) : []
        if (serial !== loadSerial.current) return
        const reconciliationState = await loadReconciliationState(submission)
        if (serial !== loadSerial.current) return
        loadedSubmissionIdRef.current = id
        setSelectedSubmission(submission)
        setSubmissionOrder(order)
        setSubmissionPayments(payments)
        setErpPushAttempts(attempts)
        setErpReconciliationState(reconciliationState)
        if (submission) {
          const labels = await fetchProfileDisplayLabelsByIds([
            submission.approvedProductsConfirmedBy,
            submission.returnConfirmedBy,
            submission.handledByUserId,
          ])
          if (serial !== loadSerial.current) return
          setOperatorLabelById((prev) => {
            const next = { ...prev }
            labels.forEach((label, profileId) => {
              next[profileId] = label
            })
            return next
          })
        }
        if (isNewSubmission || submission?.erpPushStatus !== 'pending') {
          setReconciliationEligibleFromApi(false)
        }
      } catch (loadError) {
        if (serial !== loadSerial.current) return
        console.error('Load T&E detail error:', loadError)
        setDetailError(t('admin.te.errorLoad'))
      } finally {
        if (serial === loadSerial.current) setDetailLoading(false)
      }
    },
    [t],
  )

  /**
   * Reload both the list and the open detail record.
   */
  const refreshCurrentDetail = useCallback(async (): Promise<void> => {
    await Promise.all([onRefreshList(), loadDetail(submissionId)])
  }, [loadDetail, onRefreshList, submissionId])

  useEffect(() => {
    void loadDetail(submissionId)
  }, [loadDetail, submissionId])

  useEffect(() => {
    let cancelled = false
    void fetchTeProductCategories()
      .then((categories) => {
        if (cancelled) return
        setProductCategories(categories)
        setProductLabelMap(buildTeProductIdLabelMap(categories))
      })
      .catch((err: unknown) => {
        console.error('[TeApplicationDetailPane] load catalog:', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setTrackingNumberDraft(submissionOrder?.trackingNumber ?? '')
    setTrackingCarrierDraft(submissionOrder?.carrier ?? '')
  }, [submissionOrder])

  useEffect(() => {
    const id = selectedSubmission?.id
    const pending = selectedSubmission?.erpPushStatus === 'pending'
    if (!id || !pending) {
      return
    }
    const pendingSubmissionId = id
    /**
     * Poll backend reconciliation eligibility while an ERP attempt is pending.
     */
    async function pollReconciliation(): Promise<void> {
      try {
        const state = await getTeErpReconciliation(pendingSubmissionId)
        setErpReconciliationState(state)
        if (state.reconciliationEligible || state.acceptanceUnknown || state.stale) {
          setReconciliationEligibleFromApi(true)
        }
      } catch {
        // Keep the last known state; the operator can refresh manually.
      }
    }
    const timer = window.setInterval(() => {
      void pollReconciliation()
    }, 10_000)
    return () => window.clearInterval(timer)
  }, [selectedSubmission?.erpPushStatus, selectedSubmission?.id])

  useEffect(() => {
    const timers = shippingCopyTimers.current
    return () => {
      for (const timer of Object.values(timers)) {
        if (timer != null) window.clearTimeout(timer)
      }
    }
  }, [])

  useEffect(() => {
    setShippingAddressJustCopiedLine(null)
    for (const key of Object.keys(shippingCopyTimers.current) as ShippingAddressCopyLineKey[]) {
      const timer = shippingCopyTimers.current[key]
      if (timer != null) window.clearTimeout(timer)
      delete shippingCopyTimers.current[key]
    }
  }, [selectedSubmission?.id])

  /**
   * Persist safe backend reconciliation eligibility and display a localized error.
   *
   * @param value - Unknown workflow failure
   */
  function recordWorkflowError(value: unknown): void {
    if (value instanceof TeWorkflowApiError) {
      if (value.reconciliationEligible || value.acceptanceUnknown || value.stale) {
        setReconciliationEligibleFromApi(true)
      } else if (
        value.code === 'erp_push_pending' ||
        value.code === 'reconciliation_not_ready' ||
        value.code === 'reconciliation_not_available'
      ) {
        setReconciliationEligibleFromApi(false)
      }
    }
    setWorkflowError(workflowErrorMessage(t, (key) => i18n.exists(key), value))
  }

  /**
   * Apply a successful ERP route response without assuming every 2xx is pushed.
   *
   * @param response - Backend ERP state
   * @param pushedNoticeKey - Notice shown after confirmed ERP acceptance
   */
  function recordErpPushResponse(response: TeErpPushResponse, pushedNoticeKey: string): void {
    setReconciliationEligibleFromApi(response.reconciliationEligible === true)
    setWorkflowNotice(
      response.erpPushStatus === 'pushed'
        ? t(pushedNoticeKey)
        : t('admin.te.workflowNotice.approvedPushNeedsAttention'),
    )
  }

  /**
   * Enter Application tab edit mode.
   */
  function startEditApplication(): void {
    if (!selectedSubmission) return
    setApplicationDraft(buildApplicationDraft(selectedSubmission))
    setApplicationSaveError(null)
    setIsEditingApplication(true)
  }

  /**
   * Discard the draft and leave edit mode without saving.
   */
  function cancelEditApplication(): void {
    setIsEditingApplication(false)
    setApplicationDraft(null)
    setApplicationSaveError(null)
  }

  /**
   * Save the Application tab draft via geocrm-api.
   */
  async function saveApplication(): Promise<void> {
    const submission = selectedSubmission
    const draft = applicationDraft
    if (!submission || !draft) return
    const patch = buildApplicationPatch(draft, submission)
    if (Object.keys(patch).length === 0) {
      setIsEditingApplication(false)
      setApplicationDraft(null)
      return
    }
    setApplicationSaving(true)
    setApplicationSaveError(null)
    try {
      const result = await updateTeApplication(submission.id, patch)
      if (selectedSubmission?.id === submission.id) {
        setSelectedSubmission({
          ...selectedSubmission,
          email: result.email,
          emailDomain: result.emailDomain || null,
          emailCategory: result.emailCategory,
          emailCategorySource: result.emailCategorySource,
          identityType: result.identityType || null,
          firstName: result.firstName || null,
          lastName: result.lastName || null,
          agency: result.agency || null,
          deptRole: result.deptRole || null,
          mobile: result.mobile || null,
          mobileCountry: result.mobileCountry || null,
          shippingCountry: result.shippingCountry || null,
          shippingState: result.shippingState || null,
          shippingCity: result.shippingCity || null,
          shippingZip: result.shippingZip || null,
          shippingStreet: result.shippingStreet || null,
          shippingApt: result.shippingApt || null,
          product: result.product,
          intendedUse: result.intendedUse || null,
          duration: result.duration || null,
          consentAfterTest: result.consentAfterTest || null,
          consentShareMedia: result.consentShareMedia,
          consentCommunity: result.consentCommunity,
          consentWall: result.consentWall,
          consentMarketingEmails: result.consentMarketingEmails,
        })
      }
      setIsEditingApplication(false)
      setApplicationDraft(null)
    } catch (err: unknown) {
      setApplicationSaveError(
        err instanceof TeWorkflowApiError ? err.message : t('admin.te.application.saveFailed'),
      )
    } finally {
      setApplicationSaving(false)
    }
  }

  /**
   * Generate (and persist) a trilingual AI review, then merge into the open detail.
   */
  async function triggerAiReview(): Promise<void> {
    const submission = selectedSubmission
    if (!submission) return
    const result = await generateAiReviewResult(submission.id)
    if (result && selectedSubmission?.id === submission.id) {
      setSelectedSubmission({
        ...selectedSubmission,
        aiReviewEnUs: result.enUs,
        aiReviewZhCn: result.zhCn,
        aiReviewZhTw: result.zhTw,
        aiReviewModel: result.model,
        aiReviewGeneratedAt: result.generatedAt,
      })
    }
  }

  /**
   * Open the approval dialog with active requested products selected by default.
   */
  function openApprovalDialog(): void {
    if (!selectedSubmission || !canManageWorkflow) return
    setApprovalProductIds(
      (selectedSubmission.product ?? []).filter((id) => activeProductIdSet.has(id)),
    )
    setWorkflowError(null)
    setWorkflowNotice(null)
    setReviewDialog('approved')
  }

  /**
   * Open the invalid-review confirmation dialog.
   */
  function openInvalidDialog(): void {
    if (!selectedSubmission || !canManageWorkflow) return
    setWorkflowError(null)
    setWorkflowNotice(null)
    setReviewDialog('invalid')
  }

  /**
   * Close the review dialog while no request is running.
   */
  function closeReviewDialog(): void {
    if (workflowAction) return
    setReviewDialog(null)
  }

  /**
   * Toggle a final approved product.
   *
   * @param productId - Active product_catalog UUID
   */
  function toggleApprovalProduct(productId: string): void {
    if (!activeProductIdSet.has(productId)) return
    setApprovalProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    )
  }

  /**
   * Persist an approved or invalid review, then push approved products to ERP.
   */
  async function applyReview(): Promise<void> {
    const submission = selectedSubmission
    const decision = reviewDialog
    if (!submission || !decision || !canManageWorkflow) return
    const selected = [...new Set(approvalProductIds)]
    if (decision === 'approved' && selected.length === 0) return
    setWorkflowAction('review')
    setWorkflowError(null)
    setWorkflowNotice(null)
    try {
      await reviewTeSubmission(submission.id, decision, selected)
      setReviewDialog(null)
      if (decision === 'approved') {
        setWorkflowAction('push')
        try {
          const response = await pushTeOrder(submission.id, selected)
          recordErpPushResponse(response, 'admin.te.workflowNotice.approvedAndPushed')
        } catch (pushError) {
          recordWorkflowError(pushError)
          setWorkflowNotice(t('admin.te.workflowNotice.approvedPushNeedsAttention'))
        }
      } else {
        setWorkflowNotice(t('admin.te.workflowNotice.markedInvalid'))
      }
    } catch (reviewError) {
      recordWorkflowError(reviewError)
    } finally {
      setWorkflowAction(null)
      await refreshCurrentDetail()
      if (selectedSubmission?.status !== 'under_review') {
        setReviewDialog(null)
      }
    }
  }

  /**
   * Retry a backend-recorded failed ERP push using the approved product snapshot.
   */
  async function retryErpPush(): Promise<void> {
    const submission = selectedSubmission
    const selected = submission?.approvedProductIds ?? []
    if (!submission || selected.length === 0 || !canPushErp) return
    setWorkflowAction('push')
    setWorkflowError(null)
    setWorkflowNotice(null)
    try {
      const response = await pushTeOrder(submission.id, selected)
      recordErpPushResponse(response, 'admin.te.workflowNotice.erpPushed')
    } catch (pushError) {
      recordWorkflowError(pushError)
    } finally {
      setWorkflowAction(null)
      await refreshCurrentDetail()
    }
  }

  /**
   * Open ERP reconciliation confirmation.
   *
   * @param resolution - Verified ERP outcome
   */
  function openReconcileDialog(resolution: ReconcileResolution): void {
    if (!canReconcileErp) return
    setReconcileVerified(false)
    setReconcileDialog(resolution)
  }

  /**
   * Close ERP reconciliation confirmation.
   */
  function closeReconcileDialog(): void {
    if (workflowAction) return
    setReconcileDialog(null)
    setReconcileVerified(false)
  }

  /**
   * Submit a verified ERP reconciliation outcome.
   */
  async function applyReconciliation(): Promise<void> {
    const submission = selectedSubmission
    const resolution = reconcileDialog
    if (!submission || !resolution || !reconcileVerified || !canReconcileErp) return
    setWorkflowAction('reconcile')
    setWorkflowError(null)
    setWorkflowNotice(null)
    try {
      await reconcileTeErpPending(submission.id, resolution)
      setReconcileDialog(null)
      setWorkflowNotice(
        resolution === 'accepted'
          ? t('admin.te.workflowNotice.erpAccepted')
          : t('admin.te.workflowNotice.erpNotAccepted'),
      )
    } catch (reconcileError) {
      recordWorkflowError(reconcileError)
    } finally {
      setWorkflowAction(null)
      await refreshCurrentDetail()
    }
  }

  /**
   * Register the local order tracking number through geocrm-api.
   */
  async function saveTracking(): Promise<void> {
    const submission = selectedSubmission
    if (!submission || !canEditTracking || !trackingFormValid) return
    setWorkflowAction('tracking')
    setWorkflowError(null)
    setWorkflowNotice(null)
    try {
      await updateTeOrderTracking(
        submission.id,
        trackingNumberDraft.trim(),
        trackingCarrierDraft.trim(),
      )
      setWorkflowNotice(t('admin.te.workflowNotice.trackingSaved'))
    } catch (trackingError) {
      recordWorkflowError(trackingError)
    } finally {
      setWorkflowAction(null)
      await refreshCurrentDetail()
    }
  }

  /**
   * Open return receipt confirmation for an authorized administrator.
   */
  function openReturnDialog(): void {
    if (!canManageWorkflow || selectedSubmission?.status !== 'return_pending') return
    setWorkflowError(null)
    setWorkflowNotice(null)
    setReturnDialogOpen(true)
  }

  /**
   * Close return receipt confirmation.
   */
  function closeReturnDialog(): void {
    if (workflowAction) return
    setReturnDialogOpen(false)
  }

  /**
   * Confirm warehouse receipt and complete the return workflow.
   */
  async function applyReturnConfirmation(): Promise<void> {
    const submission = selectedSubmission
    if (!submission || submission.status !== 'return_pending' || !canManageWorkflow) return
    setWorkflowAction('return')
    setWorkflowError(null)
    setWorkflowNotice(null)
    try {
      await confirmTeReturn(submission.id)
      setReturnDialogOpen(false)
      setWorkflowNotice(t('admin.te.workflowNotice.returnConfirmed'))
    } catch (returnError) {
      recordWorkflowError(returnError)
    } finally {
      setWorkflowAction(null)
      await refreshCurrentDetail()
    }
  }

  /**
   * Copy one shipping address line to the clipboard.
   *
   * @param line - Location code, full address, or postal shorthand line
   */
  async function copyShippingAddressLine(line: ShippingAddressCopyLineKey): Promise<void> {
    const value = shippingAddressCopyLines[line]
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      return
    }
    for (const key of Object.keys(shippingCopyTimers.current) as ShippingAddressCopyLineKey[]) {
      const timer = shippingCopyTimers.current[key]
      if (timer != null) window.clearTimeout(timer)
      delete shippingCopyTimers.current[key]
    }
    setShippingAddressJustCopiedLine(line)
    shippingCopyTimers.current[line] = window.setTimeout(() => {
      setShippingAddressJustCopiedLine((current) => (current === line ? null : current))
      delete shippingCopyTimers.current[line]
    }, 1500)
  }

  const canEditApplication =
    canManageWorkflow && selectedSubmission?.status === 'under_review'

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold text-muted hover:bg-brand/10 hover:text-brand"
          onClick={() => onNavigate(teApplicationsListPath())}
        >
          <ArrowLeftIcon className="size-4" />
          {t('admin.te.backToList')}
        </button>
        <span className="text-muted">/</span>
        <span className="max-w-md truncate text-sm font-semibold text-ink">{detailPageTitle}</span>
        {selectedSubmission ? (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-medium ${statusClass(selectedSubmission.status)}`}
            >
              {t(teStatusLabelKey(selectedSubmission.status))}
            </span>
            {canManageWorkflow && selectedSubmission.status === 'under_review' ? (
              <>
                <button
                  type="button"
                  className="h-8 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 text-xs font-medium text-rose-500 hover:bg-rose-500/20 disabled:opacity-50"
                  disabled={Boolean(workflowAction)}
                  onClick={openInvalidDialog}
                >
                  {t('admin.te.review.markInvalid')}
                </button>
                <button
                  type="button"
                  className="h-8 rounded-md border border-brand/40 bg-brand/15 px-3 text-xs font-medium text-brand hover:bg-brand/25 disabled:opacity-50"
                  disabled={Boolean(workflowAction)}
                  onClick={openApprovalDialog}
                >
                  {t('admin.te.review.approve')}
                </button>
              </>
            ) : null}
            {canManageWorkflow && selectedSubmission.status === 'return_pending' ? (
              <button
                type="button"
                className="h-8 rounded-md border border-teal-500/40 bg-teal-500/15 px-3 text-xs font-medium text-teal-700 hover:bg-teal-500/25 disabled:opacity-50 dark:text-teal-200"
                disabled={Boolean(workflowAction)}
                onClick={openReturnDialog}
              >
                {t('admin.te.return.confirmButton')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {workflowError ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">
          {workflowError}
        </p>
      ) : null}
      {workflowNotice ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-300">
          {workflowNotice}
        </p>
      ) : null}
      {detailError ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">
          {detailError}
        </p>
      ) : null}

      {detailLoading && !selectedSubmission ? (
        <div className="py-12 text-center text-muted">
          <RefreshIcon className="mb-2 inline-block size-6 animate-spin" />
          <p>{t('common.loading')}</p>
        </div>
      ) : selectedSubmission ? (
        <div className="space-y-6">
          <TeApplicationDetailTabs
            activeTab={activeDetailTab}
            onChange={setActiveDetailTab}
          />
          {activeDetailTab === 'application' ? (
            <TeApplicationTab
              submission={selectedSubmission}
              canEdit={Boolean(canEditApplication)}
              isEditing={isEditingApplication}
              draft={applicationDraft}
              saving={applicationSaving}
              saveError={applicationSaveError}
              activeCatalogCategories={activeCatalogCategories}
              formatProductIds={formatProductIds}
              shippingCopyLines={shippingAddressCopyLines}
              shippingHasCopyLines={shippingAddressHasCopyLines}
              justCopiedLine={shippingAddressJustCopiedLine}
              onStartEdit={startEditApplication}
              onCancelEdit={cancelEditApplication}
              onSave={() => void saveApplication()}
              onDraftChange={setApplicationDraft}
              onCopyShippingLine={(line) => void copyShippingAddressLine(line)}
            />
          ) : null}
          {activeDetailTab === 'aiReview' ? (
            <TeApplicationAiReviewTab
              submission={selectedSubmission}
              displayHtml={aiReviewHtml}
              displayText={aiReviewDisplayText}
              hasContent={hasAiReviewContent}
              models={aiReviewModels}
              selection={aiReviewSelection}
              loading={aiReviewLoading}
              error={aiReviewError}
              isConfigured={aiReviewIsConfigured}
              hasAnyApiKey={aiReviewHasAnyApiKey}
              formatSavedAt={formatDate}
              onSelectModel={selectAiReviewModel}
              onGenerate={() => void triggerAiReview()}
            />
          ) : null}
          {activeDetailTab === 'operations' ? (
            <TeApplicationOperationsTab
              submission={selectedSubmission}
              order={submissionOrder}
              payments={submissionPayments}
              latestErpAttempt={latestErpAttempt}
              erpDisplayStatus={erpDisplayStatus}
              erpReconciliationState={erpReconciliationState}
              detailLoading={detailLoading}
              canPushErp={canPushErp}
              canReconcileErp={canReconcileErp}
              canEditTracking={canEditTracking}
              trackingFormValid={trackingFormValid}
              trackingNumberDraft={trackingNumberDraft}
              trackingCarrierDraft={trackingCarrierDraft}
              workflowAction={workflowAction}
              formatProductIds={formatProductIds}
              onRetryErpPush={() => void retryErpPush()}
              onOpenReconcile={openReconcileDialog}
              onTrackingNumberChange={setTrackingNumberDraft}
              onTrackingCarrierChange={setTrackingCarrierDraft}
              onSaveTracking={() => void saveTracking()}
            />
          ) : null}
          {activeDetailTab === 'audit' ? (
            <TeApplicationAuditTab
              submission={selectedSubmission}
              formatOperatorLabel={formatOperatorLabel}
            />
          ) : null}
        </div>
      ) : !detailLoading ? (
        <p className="py-12 text-center text-muted">{t('admin.te.noResults')}</p>
      ) : null}

      {reviewPresence.mounted && reviewDialog
        ? createPortal(
            <div
              className={`fixed inset-0 z-[130] flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px] ${
                reviewPresence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
              }`}
              onClick={() => closeReviewDialog()}
            >
              <div
                role="dialog"
                aria-modal="true"
                className={`max-h-[85dvh] w-full overflow-y-auto rounded-2xl border border-ink/10 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-900 ${
                  reviewDialog === 'approved' ? 'max-w-5xl' : 'max-w-2xl'
                }`}
                onClick={(event) => event.stopPropagation()}
              >
                {reviewDialog === 'approved' ? (
                  <ApproveDialogBody
                    approvalProductIds={approvalProductIds}
                    unavailableRequestedProductCount={unavailableRequestedProductCount}
                    activeCatalogCategories={activeCatalogCategories}
                    requestedApprovalProducts={requestedApprovalProducts}
                    requestedProductsTotalUsd={requestedProductsTotalUsd}
                    requestedProductsHalfTotalUsd={requestedProductsHalfTotalUsd}
                    finalSelectedProductsTotalUsd={finalSelectedProductsTotalUsd}
                    finalSelectedProductsHalfTotalUsd={finalSelectedProductsHalfTotalUsd}
                    workflowAction={workflowAction}
                    onToggle={toggleApprovalProduct}
                    onClose={closeReviewDialog}
                    onConfirm={() => void applyReview()}
                  />
                ) : (
                  <>
                    <h3 className="text-base font-bold text-ink">
                      {t('admin.te.review.invalidTitle')}
                    </h3>
                    <p className="mt-2 text-sm text-muted">{t('admin.te.review.invalidBody')}</p>
                    <div className="mt-6 flex justify-end gap-3">
                      <button
                        type="button"
                        className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-white/5 hover:text-ink disabled:opacity-50"
                        disabled={Boolean(workflowAction)}
                        onClick={closeReviewDialog}
                      >
                        {t('actions.cancel')}
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:bg-brand/90 disabled:opacity-50"
                        disabled={Boolean(workflowAction)}
                        onClick={() => void applyReview()}
                      >
                        {workflowAction
                          ? t('admin.te.review.saving')
                          : t('admin.te.review.confirmInvalid')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}

      {reconcilePresence.mounted && reconcileDialog
        ? createPortal(
            <div
              className={`fixed inset-0 z-[130] flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px] ${
                reconcilePresence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
              }`}
              onClick={() => closeReconcileDialog()}
            >
              <div
                role="dialog"
                aria-modal="true"
                className="w-full max-w-md rounded-2xl border border-ink/10 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
                onClick={(event) => event.stopPropagation()}
              >
                <h3 className="text-base font-bold text-ink">{t('admin.te.erp.reconcileTitle')}</h3>
                <p className="mt-2 text-sm text-muted">
                  {reconcileDialog === 'accepted'
                    ? t('admin.te.erp.reconcileAcceptedBody')
                    : t('admin.te.erp.reconcileNotAcceptedBody')}
                </p>
                <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-orange-500/30 bg-orange-500/10 p-3 text-sm text-orange-800 dark:text-orange-100">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 rounded"
                    checked={reconcileVerified}
                    onChange={(event) => setReconcileVerified(event.target.checked)}
                  />
                  <span>{t('admin.te.erp.verificationConfirmation')}</span>
                </label>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-white/5 hover:text-ink"
                    onClick={closeReconcileDialog}
                  >
                    {t('actions.cancel')}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:bg-brand/90 disabled:opacity-50"
                    disabled={!reconcileVerified || workflowAction === 'reconcile'}
                    onClick={() => void applyReconciliation()}
                  >
                    {t('common.confirm')}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {returnPresence.mounted && returnDialogOpen
        ? createPortal(
            <div
              className={`fixed inset-0 z-[130] flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px] ${
                returnPresence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
              }`}
              onClick={() => closeReturnDialog()}
            >
              <div
                role="dialog"
                aria-modal="true"
                className="w-full max-w-md rounded-2xl border border-ink/10 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
                onClick={(event) => event.stopPropagation()}
              >
                <h3 className="text-base font-bold text-ink">{t('admin.te.return.confirmTitle')}</h3>
                <p className="mt-2 text-sm text-muted">{t('admin.te.return.confirmBody')}</p>
                {workflowError ? (
                  <p className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">
                    {workflowError}
                  </p>
                ) : null}
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-white/5 hover:text-ink"
                    onClick={closeReturnDialog}
                  >
                    {t('actions.cancel')}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:bg-brand/90 disabled:opacity-50"
                    disabled={workflowAction === 'return'}
                    onClick={() => void applyReturnConfirmation()}
                  >
                    {t('common.confirm')}
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

interface ApproveDialogBodyProps {
  approvalProductIds: string[]
  unavailableRequestedProductCount: number
  activeCatalogCategories: TeProductCategory[]
  requestedApprovalProducts: RequestedApprovalProduct[]
  requestedProductsTotalUsd: number
  requestedProductsHalfTotalUsd: number
  finalSelectedProductsTotalUsd: number
  finalSelectedProductsHalfTotalUsd: number
  workflowAction: WorkflowAction
  onToggle: (productId: string) => void
  onClose: () => void
  onConfirm: () => void
}

/**
 * Approval dialog: catalog checkboxes, requested panel, and price totals.
 *
 * @param props - Approval selection state
 * @returns Dialog body
 */
function ApproveDialogBody({
  approvalProductIds,
  unavailableRequestedProductCount,
  activeCatalogCategories,
  requestedApprovalProducts,
  requestedProductsTotalUsd,
  requestedProductsHalfTotalUsd,
  finalSelectedProductsTotalUsd,
  finalSelectedProductsHalfTotalUsd,
  workflowAction,
  onToggle,
  onClose,
  onConfirm,
}: ApproveDialogBodyProps) {
  const { t } = useTranslation()
  const busy = Boolean(workflowAction)

  return (
    <>
      <h3 className="text-base font-bold text-ink">{t('admin.te.review.approveTitle')}</h3>
      <p className="mt-2 text-sm text-muted">{t('admin.te.review.approveBody')}</p>
      {unavailableRequestedProductCount ? (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-200">
          {t('admin.te.review.unavailableRequestedProducts', {
            count: unavailableRequestedProductCount,
          })}
        </p>
      ) : null}
      <p className="mt-3 text-sm font-medium text-ink">
        {t('admin.te.review.finalSelectedCountPrefix')}
        <span className="font-semibold text-green-600 dark:text-green-500">
          {approvalProductIds.length}
        </span>
        {t('admin.te.review.finalSelectedCountSuffix')}
      </p>
      <div className="mt-5 grid gap-4 md:grid-cols-[2fr_1fr] md:items-start">
        <div className="order-2 space-y-4 md:order-1">
          {activeCatalogCategories.map((category) => (
            <section
              key={category.id}
              className="rounded-xl border border-ink/10 bg-zinc-950/5 dark:border-white/10 dark:bg-black/10"
            >
              <h4 className="border-b border-ink/10 px-4 py-2 text-xs font-semibold tracking-wide text-muted uppercase dark:border-white/10">
                {category.name}
              </h4>
              {category.products.map((product) => (
                <label
                  key={product.id}
                  className="flex cursor-pointer items-start gap-3 px-4 py-2.5 text-sm text-ink hover:bg-white/5"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 rounded border-ink/20"
                    checked={approvalProductIds.includes(product.id)}
                    disabled={busy}
                    onChange={() => onToggle(product.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block">{product.name}</span>
                    {product.itemName && product.itemName !== product.name ? (
                      <span className="block truncate text-xs text-muted" title={product.itemName}>
                        {product.itemName}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className="shrink-0 text-xs text-muted tabular-nums"
                    title={t('admin.productCatalog.col.tePriceUsd')}
                  >
                    {formatTeRetailUsd(product.tePriceUsd)}
                  </span>
                </label>
              ))}
            </section>
          ))}
          {activeCatalogCategories.length === 0 ? (
            <p className="text-sm text-rose-400">{t('admin.te.review.catalogEmpty')}</p>
          ) : null}
        </div>
        <div className="order-1 flex flex-col gap-4 md:sticky md:top-0 md:order-2">
          <aside className="rounded-xl border border-ink/10 bg-zinc-950/5 dark:border-white/10 dark:bg-black/20">
            <h4 className="border-b border-ink/10 px-4 py-2 text-xs font-semibold tracking-wide text-muted uppercase dark:border-white/10">
              {t('admin.te.review.requestedPanelTitle')}
            </h4>
            {requestedApprovalProducts.length ? (
              <ul className="divide-y divide-ink/10 dark:divide-white/10">
                {requestedApprovalProducts.map((product) => (
                  <li key={product.id}>
                    {product.available ? (
                      <button
                        type="button"
                        className="flex w-full items-start gap-2 px-4 py-2.5 text-left text-sm transition-colors hover:bg-white/5 disabled:opacity-50"
                        disabled={busy}
                        onClick={() => onToggle(product.id)}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-ink">{product.name}</span>
                          {product.showErpName ? (
                            <span
                              className="block truncate text-xs text-muted"
                              title={product.itemName}
                            >
                              {product.itemName}
                            </span>
                          ) : null}
                        </span>
                        {product.selected ? (
                          <span className="shrink-0 rounded-full bg-brand/20 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-brand uppercase">
                            {t('admin.te.review.requestedSelected')}
                          </span>
                        ) : null}
                      </button>
                    ) : (
                      <div className="flex items-start gap-2 px-4 py-2.5 text-sm">
                        <span className="min-w-0 flex-1">
                          <span className="block text-ink">{product.name}</span>
                          {product.showErpName ? (
                            <span
                              className="block truncate text-xs text-muted"
                              title={product.itemName}
                            >
                              {product.itemName}
                            </span>
                          ) : null}
                          <span className="mt-1 block text-xs text-amber-600 dark:text-amber-300">
                            {t('admin.te.review.requestedUnavailable')}
                          </span>
                        </span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-3 text-sm text-muted">{t('admin.te.review.requestedEmpty')}</p>
            )}
          </aside>
          <div className="rounded-xl border border-ink/10 bg-zinc-950/5 p-3 dark:border-white/10 dark:bg-black/20">
            <div className="mb-3 space-y-1.5">
              <PriceRow
                label={t('admin.te.review.requestedTotalPrice')}
                value={formatTeRetailUsd(requestedProductsTotalUsd)}
              />
              <PriceRow
                label={t('admin.te.review.requestedHalfPrice')}
                value={formatTeRetailUsd(requestedProductsHalfTotalUsd)}
              />
              <PriceRow
                label={t('admin.te.review.finalSelectedTotalPrice')}
                value={formatTeRetailUsd(finalSelectedProductsTotalUsd)}
              />
              <PriceRow
                label={t('admin.te.review.finalSelectedHalfPrice')}
                value={formatTeRetailUsd(finalSelectedProductsHalfTotalUsd)}
                emphasize
              />
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="rounded-lg border border-brand px-4 py-2 text-sm text-brand hover:bg-brand/10 disabled:opacity-50"
                disabled={busy}
                onClick={onClose}
              >
                {t('actions.cancel')}
              </button>
              <button
                type="button"
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:bg-brand/90 disabled:opacity-50"
                disabled={busy || approvalProductIds.length === 0}
                onClick={onConfirm}
              >
                {workflowAction
                  ? t('admin.te.review.saving')
                  : t('admin.te.review.approveAndPush')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

interface PriceRowProps {
  label: string
  value: string
  emphasize?: boolean
}

/**
 * Price summary row in the approve dialog.
 *
 * @param props - Label and formatted amount
 * @returns Row
 */
function PriceRow({ label, value, emphasize = false }: PriceRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="min-w-0 text-muted">{label}</span>
      <span
        className={`shrink-0 tabular-nums ${
          emphasize ? 'font-semibold text-green-600 dark:text-green-500' : 'text-ink'
        }`}
      >
        {value}
      </span>
    </div>
  )
}
