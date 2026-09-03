/**
 * Cross-page handoff to open Mail and start a compose draft (Settings-style events).
 */

export interface MailComposeRequest {
  /** Recipient address (required). */
  to: string
  /** Optional subject. */
  subject?: string
  /** Optional HTML/plain body seed. */
  body?: string
}

const OPEN_MAIL_EVENT = 'geocrm:open-mail'
const COMPOSE_EVENT = 'geocrm:mail-compose'

let pendingCompose: MailComposeRequest | null = null

/**
 * Normalizes a compose request when `to` is non-empty.
 * @param request - Raw request.
 * @returns Normalized request, or null when invalid.
 */
function normalizeComposeRequest(request: MailComposeRequest): MailComposeRequest | null {
  const to = request.to.trim()
  if (!to) {
    return null
  }
  const subject = request.subject?.trim()
  const body = request.body?.trim()
  return {
    to,
    ...(subject ? { subject } : {}),
    ...(body ? { body } : {}),
  }
}

/**
 * Opens the Mail title-bar tab and requests a new compose draft with recipients.
 * Safe to call from any React tree (uses window events + pending payload).
 * @param request - Compose fields (`to` required).
 * @returns Nothing.
 */
export function openMailCompose(request: MailComposeRequest): void {
  const next = normalizeComposeRequest(request)
  if (!next) {
    return
  }
  pendingCompose = next
  window.dispatchEvent(new CustomEvent(COMPOSE_EVENT, { detail: next }))
  window.dispatchEvent(new Event(OPEN_MAIL_EVENT))
}

/**
 * Reads and clears a pending compose request (for MailPage mount).
 * @returns Pending request, or null.
 */
export function consumePendingMailCompose(): MailComposeRequest | null {
  const next = pendingCompose
  pendingCompose = null
  return next
}

/**
 * Subscribe to Mail tab open requests.
 * @param listener - Callback when Mail should open.
 * @returns Unsubscribe function.
 */
export function subscribeOpenMailRequest(listener: () => void): () => void {
  const handler = (): void => {
    listener()
  }
  window.addEventListener(OPEN_MAIL_EVENT, handler)
  return () => window.removeEventListener(OPEN_MAIL_EVENT, handler)
}

/**
 * Subscribe to compose requests while Mail is already mounted.
 * @param listener - Receives the compose payload.
 * @returns Unsubscribe function.
 */
export function subscribeMailComposeRequest(
  listener: (request: MailComposeRequest) => void,
): () => void {
  /**
   * @param event - Custom event with compose detail.
   */
  function handler(event: Event): void {
    const detail = (event as CustomEvent<MailComposeRequest>).detail
    const next = detail ? normalizeComposeRequest(detail) : null
    if (!next) {
      return
    }
    pendingCompose = null
    listener(next)
  }
  window.addEventListener(COMPOSE_EVENT, handler)
  return () => window.removeEventListener(COMPOSE_EVENT, handler)
}
