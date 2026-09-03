import { resolveApiBaseUrl } from '@/config/deployment-urls'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const MAX_EMAIL_LEN = 254
const MAX_EMPLOYEE_ID_LEN = 64
const MAX_OS_MODEL_LEN = 128
const MAX_MESSAGE_LEN = 2000
/** WeCom robot image limit (bytes before base64). */
export const FEEDBACK_MAX_IMAGE_BYTES = 2 * 1024 * 1024
export const FEEDBACK_MAX_IMAGES = 3

export type FeedbackErrorCode =
  | 'invalid_email'
  | 'invalid_employee_id'
  | 'invalid_os_model'
  | 'invalid_message'
  | 'invalid_images'
  | 'not_configured'
  | 'network'
  | 'server'

export class FeedbackSubmitError extends Error {
  readonly code: FeedbackErrorCode

  /**
   * Creates a typed feedback submission error.
   * @param code - Machine-readable error code.
   * @param message - Debug message.
   */
  constructor(code: FeedbackErrorCode, message: string) {
    super(message)
    this.name = 'FeedbackSubmitError'
    this.code = code
  }
}

export interface FeedbackImagePayload {
  contentType: 'image/jpeg' | 'image/png'
  dataBase64: string
}

export interface FeedbackSubmitPayload {
  email: string
  employeeId: string
  osModel: string
  message: string
  locale: string
  images?: FeedbackImagePayload[]
}

/**
 * Returns true when the unified GeoCRM API origin is configured.
 * @returns Whether feedback submit can run.
 */
export function isFeedbackApiConfigured(): boolean {
  return Boolean(resolveApiBaseUrl())
}

/**
 * Validates and normalizes the feedback email field.
 * @param email - Raw user input.
 * @returns Trimmed email when valid.
 */
export function validateFeedbackEmail(email: string): string {
  const trimmed = email.trim()
  if (
    !trimmed ||
    trimmed.length > MAX_EMAIL_LEN ||
    !EMAIL_PATTERN.test(trimmed)
  ) {
    throw new FeedbackSubmitError('invalid_email', 'Invalid email')
  }
  return trimmed
}

/**
 * Validates and normalizes the employee id field.
 * @param employeeId - Raw user input.
 * @returns Trimmed employee id when valid.
 */
export function validateFeedbackEmployeeId(employeeId: string): string {
  const trimmed = employeeId.trim()
  if (!trimmed || trimmed.length > MAX_EMPLOYEE_ID_LEN) {
    throw new FeedbackSubmitError('invalid_employee_id', 'Invalid employee id')
  }
  return trimmed
}

/**
 * Validates and normalizes the OS / device model field.
 * @param osModel - Raw user input.
 * @returns Trimmed value when valid.
 */
export function validateFeedbackOsModel(osModel: string): string {
  const trimmed = osModel.trim()
  if (!trimmed || trimmed.length > MAX_OS_MODEL_LEN) {
    throw new FeedbackSubmitError('invalid_os_model', 'Invalid OS / model')
  }
  return trimmed
}

/**
 * Validates and normalizes the feedback message field.
 * @param message - Raw user input.
 * @returns Trimmed message when valid.
 */
export function validateFeedbackMessage(message: string): string {
  const trimmed = message.trim()
  if (!trimmed || trimmed.length > MAX_MESSAGE_LEN) {
    throw new FeedbackSubmitError('invalid_message', 'Invalid message')
  }
  return trimmed
}

/**
 * Validates optional image attachments for WeCom (JPEG/PNG, max 3 × 2 MB).
 * @param images - Encoded image payloads.
 * @returns The same list when valid.
 */
export function validateFeedbackImages(
  images: FeedbackImagePayload[] | undefined,
): FeedbackImagePayload[] {
  const list = images ?? []
  if (list.length > FEEDBACK_MAX_IMAGES) {
    throw new FeedbackSubmitError('invalid_images', 'Too many images')
  }
  for (const image of list) {
    if (image.contentType !== 'image/jpeg' && image.contentType !== 'image/png') {
      throw new FeedbackSubmitError('invalid_images', 'Invalid image type')
    }
    if (!image.dataBase64.trim()) {
      throw new FeedbackSubmitError('invalid_images', 'Empty image')
    }
  }
  return list
}

/**
 * Reads a local image file into a WeCom-ready base64 payload.
 * @param file - Browser file (JPEG or PNG, ≤ 2 MB).
 * @returns Encoded payload.
 */
export async function readFeedbackImageFile(file: File): Promise<FeedbackImagePayload> {
  const type = file.type.toLowerCase()
  if (type !== 'image/jpeg' && type !== 'image/png') {
    throw new FeedbackSubmitError('invalid_images', 'Images must be JPEG or PNG')
  }
  if (file.size <= 0 || file.size > FEEDBACK_MAX_IMAGE_BYTES) {
    throw new FeedbackSubmitError('invalid_images', 'Each image must be at most 2 MB')
  }
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0)
  }
  return {
    contentType: type === 'image/png' ? 'image/png' : 'image/jpeg',
    dataBase64: btoa(binary),
  }
}

/**
 * Submits Settings feedback to geocrm-api `POST /feedback/submit`.
 * @param payload - Form fields plus optional images.
 * @returns Nothing when the provider accepts the message.
 */
export async function submitFeedback(payload: FeedbackSubmitPayload): Promise<void> {
  const email = validateFeedbackEmail(payload.email)
  const employeeId = validateFeedbackEmployeeId(payload.employeeId)
  const osModel = validateFeedbackOsModel(payload.osModel)
  const message = validateFeedbackMessage(payload.message)
  const images = validateFeedbackImages(payload.images)

  const base = resolveApiBaseUrl()
  if (!base) {
    throw new FeedbackSubmitError('not_configured', 'API not configured')
  }

  let res: Response
  try {
    res = await fetch(`${base}/feedback/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        employeeId,
        osModel,
        message,
        locale: payload.locale.trim() || undefined,
        source: 'PowerSource Workbench Settings',
        images: images.length > 0 ? images : undefined,
      }),
      mode: 'cors',
    })
  } catch {
    throw new FeedbackSubmitError('network', 'Network error')
  }

  if (res.status === 503) {
    throw new FeedbackSubmitError('not_configured', 'Feedback not configured')
  }

  if (res.status === 400) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null
    const err = (data?.error ?? '').toLowerCase()
    if (err.includes('email')) {
      throw new FeedbackSubmitError('invalid_email', 'Invalid email')
    }
    if (err.includes('employee')) {
      throw new FeedbackSubmitError('invalid_employee_id', 'Invalid employee id')
    }
    if (err.includes('os') || err.includes('model')) {
      throw new FeedbackSubmitError('invalid_os_model', 'Invalid OS / model')
    }
    if (err.includes('image')) {
      throw new FeedbackSubmitError('invalid_images', 'Invalid images')
    }
    if (err.includes('message') || err.includes('feedback')) {
      throw new FeedbackSubmitError('invalid_message', 'Invalid message')
    }
    throw new FeedbackSubmitError('server', 'Bad request')
  }

  if (!res.ok) {
    throw new FeedbackSubmitError('server', 'Server error')
  }

  const data = (await res.json().catch(() => null)) as { ok?: boolean } | null
  if (!data?.ok) {
    throw new FeedbackSubmitError('server', 'Unexpected response')
  }
}
