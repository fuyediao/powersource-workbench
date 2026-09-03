import { resolveApiBaseUrl } from '@/config/deployment-urls'
import { supabase } from '@/lib/supabase'
import type { TeStatus } from '@/constants/te-tracking-stages'
import type { TeEmailCategory, TeErpPushStatus } from '@/services/te-submissions-repository'

type TeWorkflowAction = 'review' | 'push' | 'reconcile' | 'tracking' | 'return' | 'aiReview' | 'application'

interface TeWorkflowErrorPayload {
  error?: unknown
  message?: unknown
  erpPushStatus?: unknown
  pendingSince?: unknown
  stale?: unknown
  acceptanceUnknown?: unknown
  reconciliationEligible?: unknown
  recoveryRequired?: unknown
  operatorActionPath?: unknown
}

interface TeWorkflowErrorOptions {
  code: string
  message: string
  status: number
  action: TeWorkflowAction
  erpPushStatus?: TeErpPushStatus | null
  pendingSince?: string | null
  stale?: boolean
  acceptanceUnknown?: boolean
  reconciliationEligible?: boolean
  recoveryRequired?: boolean
  operatorActionPath?: string | null
  safeToRetry?: boolean
}

/** Structured, operator-safe failure returned by the T&E workflow API. */
export class TeWorkflowApiError extends Error {
  readonly code: string
  readonly status: number
  readonly action: TeWorkflowAction
  readonly erpPushStatus: TeErpPushStatus | null
  readonly pendingSince: string | null
  readonly stale: boolean
  readonly acceptanceUnknown: boolean
  readonly reconciliationEligible: boolean
  readonly recoveryRequired: boolean
  readonly operatorActionPath: string | null
  readonly safeToRetry: boolean

  /**
   * Create a normalized workflow API error.
   *
   * @param options - Safe error metadata
   */
  constructor(options: TeWorkflowErrorOptions) {
    super(options.message)
    this.name = 'TeWorkflowApiError'
    this.code = options.code
    this.status = options.status
    this.action = options.action
    this.erpPushStatus = options.erpPushStatus ?? null
    this.pendingSince = options.pendingSince ?? null
    this.stale = options.stale ?? false
    this.acceptanceUnknown = options.acceptanceUnknown ?? false
    this.reconciliationEligible = options.reconciliationEligible ?? false
    this.recoveryRequired = options.recoveryRequired ?? false
    this.operatorActionPath = options.operatorActionPath ?? null
    this.safeToRetry = options.safeToRetry ?? false
  }
}

/** Response from the protected review route. */
export interface TeReviewResponse {
  teSubmissionId: string
  status: 'approved' | 'invalid'
  selectedProductIds?: string[]
}

/** Response from ERP push and reconciliation routes. */
export interface TeErpPushResponse {
  teSubmissionId: string
  erpPushStatus: TeErpPushStatus
  status: TeStatus
  alreadyPushed?: boolean
  reconciliationEligible?: boolean
}

/** Current backend-owned eligibility state for manual ERP reconciliation. */
export interface TeErpReconciliationResponse {
  teSubmissionId: string
  status: TeStatus
  erpPushStatus: TeErpPushStatus | ''
  erpPushError: string
  pendingSince: string
  stale: boolean
  acceptanceUnknown: boolean
  reconciliationEligible: boolean
  operatorActionPath?: string
}

/** Response from the protected tracking registration route. */
export interface TeTrackingResponse {
  teSubmissionId: string
  status: 'pending'
  trackingNumber: string
  carrier: string
  trackerId?: string
  alreadyRegistered?: boolean
}

/** Response from the protected return-confirmation route. */
export interface TeReturnConfirmationResponse {
  teSubmissionId: string
  status: 'completed'
  completionReason?: 'returned'
  alreadyConfirmed?: boolean
}

/**
 * Editable T&E application fields for `POST .../application`, allowed only
 * while a submission is `under_review`. All fields are optional; the caller
 * should send only the fields that changed. A changed `email` always wins
 * over `emailCategory` sent in the same request (the backend recomputes the
 * category automatically).
 */
export interface TeApplicationUpdatePatch {
  email?: string
  emailCategory?: TeEmailCategory
  identityType?: string
  firstName?: string
  lastName?: string
  agency?: string
  deptRole?: string
  mobile?: string
  mobileCountry?: string
  shippingCountry?: string
  shippingState?: string
  shippingCity?: string
  shippingZip?: string
  shippingStreet?: string
  shippingApt?: string
  product?: string[]
  intendedUse?: string
  duration?: string
  consentAfterTest?: string
  consentShareMedia?: boolean
  consentCommunity?: boolean
  consentWall?: boolean
  consentMarketingEmails?: boolean
}

/** Response from the protected application-edit route: the full updated snapshot. */
export interface TeApplicationUpdateResponse {
  teSubmissionId: string
  email: string
  emailDomain: string
  emailCategory: TeEmailCategory
  emailCategorySource: 'auto' | 'manual'
  identityType: string
  firstName: string
  lastName: string
  agency: string
  deptRole: string
  mobile: string
  mobileCountry: string
  shippingCountry: string
  shippingState: string
  shippingCity: string
  shippingZip: string
  shippingStreet: string
  shippingApt: string
  product: string[]
  intendedUse: string
  duration: string
  consentAfterTest: string
  consentShareMedia: boolean | null
  consentCommunity: boolean | null
  consentWall: boolean | null
  consentMarketingEmails: boolean | null
}

/** Response from the protected AI review generation route. */
export interface TeAiReviewResponse {
  teSubmissionId: string
  enUs: string
  zhCn: string
  zhTw: string
  /** Specific catalog model id the backend resolved and persisted, e.g. `gpt-5.6-luna`. */
  model: string
  generatedAt: string
}

/**
 * Resolve the public workbench-api origin (Electron has no Vite `/__workbench-api` proxy).
 *
 * @param action - Workflow operation requesting the URL
 * @returns Configured API origin
 */
function getBaseUrl(action: TeWorkflowAction): string {
  const baseUrl = resolveApiBaseUrl()
  if (!baseUrl) {
    throw new TeWorkflowApiError({
      code: 'api_not_configured',
      message: 'The Workbench API is not configured.',
      status: 0,
      action,
    })
  }
  return baseUrl
}

/**
 * Read a string field from an unknown JSON object.
 *
 * @param payload - Parsed response object
 * @param key - Field name
 * @returns Non-empty string or null
 */
function payloadString(payload: TeWorkflowErrorPayload, key: keyof TeWorkflowErrorPayload): string | null {
  const value = payload[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/**
 * Read a boolean field from an unknown JSON object.
 *
 * @param payload - Parsed response object
 * @param key - Field name
 * @returns Boolean value, defaulting to false
 */
function payloadBoolean(payload: TeWorkflowErrorPayload, key: keyof TeWorkflowErrorPayload): boolean {
  return payload[key] === true
}

/**
 * Normalize an optional ERP status from an error response.
 *
 * @param value - Unknown response value
 * @returns Supported status or null
 */
function normalizeErpPushStatus(value: unknown): TeErpPushStatus | null {
  return value === 'pending' || value === 'pushed' || value === 'failed' ? value : null
}

/**
 * Determine whether the backend explicitly recorded a push failure that may be retried.
 *
 * @param action - Workflow action
 * @param code - Backend error code
 * @param erpPushStatus - Status returned by the backend
 * @returns True only for an explicitly failed ERP attempt
 */
function isSafeRetry(
  action: TeWorkflowAction,
  code: string,
  erpPushStatus: TeErpPushStatus | null,
): boolean {
  return action === 'push' && (code === 'erp_push_rejected' || erpPushStatus === 'failed')
}

/**
 * Parse an error response without exposing raw provider payloads.
 *
 * @param response - Failed HTTP response
 * @param action - Workflow operation
 * @returns Normalized workflow error
 */
async function responseError(
  response: Response,
  action: TeWorkflowAction,
): Promise<TeWorkflowApiError> {
  const payload = (await response.json().catch(() => ({}))) as TeWorkflowErrorPayload
  const code = payloadString(payload, 'error') ?? `http_${response.status}`
  const erpPushStatus = normalizeErpPushStatus(payload.erpPushStatus)
  return new TeWorkflowApiError({
    code,
    message:
      payloadString(payload, 'message')
      || response.statusText
      || 'The T&E workflow request failed.',
    status: response.status,
    action,
    erpPushStatus,
    pendingSince: payloadString(payload, 'pendingSince'),
    stale: payloadBoolean(payload, 'stale'),
    acceptanceUnknown: payloadBoolean(payload, 'acceptanceUnknown')
      || code === 'erp_acceptance_unknown',
    reconciliationEligible: payloadBoolean(payload, 'reconciliationEligible'),
    recoveryRequired: payloadBoolean(payload, 'recoveryRequired'),
    operatorActionPath: payloadString(payload, 'operatorActionPath'),
    safeToRetry: isSafeRetry(action, code, erpPushStatus),
  })
}

/**
 * Send an authenticated JSON request to workbench-api.
 *
 * @param path - Absolute API path
 * @param action - Workflow operation for error safety semantics
 * @param body - JSON request body
 * @param method - HTTP method
 * @returns Parsed response body
 */
async function teWorkflowRequest<T>(
  path: string,
  action: TeWorkflowAction,
  body: Record<string, unknown> = {},
  method: 'GET' | 'POST' = 'POST',
): Promise<T> {
  const baseUrl = getBaseUrl(action)
  if (!supabase) {
    throw new TeWorkflowApiError({
      code: 'authentication_required',
      message: 'A signed-in Supabase session is required.',
      status: 401,
      action,
    })
  }
  const { data, error } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token
  if (error || !accessToken) {
    throw new TeWorkflowApiError({
      code: 'authentication_required',
      message: 'A signed-in Supabase session is required.',
      status: 401,
      action,
    })
  }

  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      mode: 'cors',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    })
  } catch {
    throw new TeWorkflowApiError({
      code: action === 'push' ? 'erp_response_unknown' : 'network_error',
      message: 'The Workbench API could not be reached.',
      status: 0,
      action,
    })
  }

  if (!response.ok) throw await responseError(response, action)
  return response.json() as Promise<T>
}

/**
 * Load backend-calculated eligibility for a pending ERP attempt.
 *
 * @param submissionId - T&E submission UUID
 * @returns Current reconciliation state
 */
export async function getTeErpReconciliation(
  submissionId: string,
): Promise<TeErpReconciliationResponse> {
  return teWorkflowRequest<TeErpReconciliationResponse>(
    `/te/admin/submissions/${encodeURIComponent(submissionId)}/erp/reconciliation`,
    'reconcile',
    {},
    'GET',
  )
}

/**
 * Review an under-review submission through the protected backend workflow.
 *
 * @param submissionId - T&E submission UUID
 * @param decision - Approved or invalid review decision
 * @param selectedProductIds - Final active catalog products for approval
 * @returns Persisted review result
 */
export async function reviewTeSubmission(
  submissionId: string,
  decision: 'approved' | 'invalid',
  selectedProductIds: string[] = [],
): Promise<TeReviewResponse> {
  return teWorkflowRequest<TeReviewResponse>(
    `/te/admin/submissions/${encodeURIComponent(submissionId)}/review`,
    'review',
    {
      decision,
      ...(decision === 'approved' ? { selectedProductIds } : {}),
    },
  )
}

/**
 * Push an approved submission to ERP and create its local order.
 *
 * @param submissionId - T&E submission UUID
 * @param selectedProductIds - Final approved product ids
 * @returns ERP push state
 */
export async function pushTeOrder(
  submissionId: string,
  selectedProductIds: string[],
): Promise<TeErpPushResponse> {
  return teWorkflowRequest<TeErpPushResponse>('/te/erp/push-order', 'push', {
    teSubmissionId: submissionId,
    selectedProductIds,
  })
}

/**
 * Resolve a pending or acceptance-unknown ERP attempt after operator verification.
 *
 * @param submissionId - T&E submission UUID
 * @param resolution - Whether ERP accepted the pre-order
 * @returns Reconciled ERP state
 */
export async function reconcileTeErpPending(
  submissionId: string,
  resolution: 'accepted' | 'not_accepted',
): Promise<TeErpPushResponse> {
  return teWorkflowRequest<TeErpPushResponse>(
    `/te/admin/submissions/${encodeURIComponent(submissionId)}/erp/reconcile`,
    'reconcile',
    {
      resolution,
      confirmation: 'I verified the ERP by teSubmissionId',
    },
  )
}

/**
 * Register or confirm tracking for a backend-owned local order.
 *
 * @param submissionId - T&E submission UUID
 * @param trackingNumber - Carrier tracking number
 * @param carrier - Carrier name or code
 * @returns Registered tracking facts
 */
export async function updateTeOrderTracking(
  submissionId: string,
  trackingNumber: string,
  carrier: string,
): Promise<TeTrackingResponse> {
  return teWorkflowRequest<TeTrackingResponse>(
    `/te/orders/${encodeURIComponent(submissionId)}/tracking`,
    'tracking',
    { trackingNumber, carrier },
  )
}

/**
 * Confirm warehouse receipt for a return-pending submission.
 *
 * @param submissionId - T&E submission UUID
 * @returns Completed return workflow state
 */
export async function confirmTeReturn(
  submissionId: string,
): Promise<TeReturnConfirmationResponse> {
  return teWorkflowRequest<TeReturnConfirmationResponse>(
    `/te/admin/submissions/${encodeURIComponent(submissionId)}/return/confirm`,
    'return',
  )
}

/**
 * Correct application fields on a submission while it is still under review
 * (e.g. after emailing the applicant about a data entry error). Send only
 * the fields that changed; a changed `email` always recomputes
 * `emailDomain` / `emailCategory` on the backend.
 *
 * @param submissionId - T&E submission UUID
 * @param patch - Changed application fields
 * @returns Full updated application snapshot
 */
export async function updateTeApplication(
  submissionId: string,
  patch: TeApplicationUpdatePatch,
): Promise<TeApplicationUpdateResponse> {
  return teWorkflowRequest<TeApplicationUpdateResponse>(
    `/te/admin/submissions/${encodeURIComponent(submissionId)}/application`,
    'application',
    patch as Record<string, unknown>,
  )
}

/**
 * Generate (or regenerate) the trilingual AI review suggestion for a T&E
 * application, using the signed-in admin's own AI provider API key.
 *
 * @param submissionId - T&E submission UUID
 * @param model - Vendor slug to use (gemini | chatgpt | claude | grok); defaults to `gemini` on the backend when omitted
 * @param modelId - Specific catalog model within the vendor; the backend's per-vendor default when omitted
 * @returns Trilingual review suggestion, persisted on the submission
 */
export async function generateTeAiReview(
  submissionId: string,
  model?: string,
  modelId?: string,
): Promise<TeAiReviewResponse> {
  return teWorkflowRequest<TeAiReviewResponse>(
    `/te/admin/submissions/${encodeURIComponent(submissionId)}/ai-review`,
    'aiReview',
    {
      ...(model ? { model } : {}),
      ...(modelId ? { modelId } : {}),
    },
  )
}
