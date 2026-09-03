import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { fromLoose } from '@/lib/supabase-loose'
import type { TePayment } from '@/types/orders'

/** Columns selected for te_payments. */
export const TE_PAYMENT_SELECT = '*'

/**
 * Map a raw Supabase `te_payments` row to {@link TePayment}.
 *
 * @param row - Supabase row
 * @returns Typed T&E payment record
 */
export function mapTePaymentFromRow(row: Record<string, unknown>): TePayment {
  const rawLineItems = row.line_items
  let lineItems: TePayment['lineItems'] = []
  if (Array.isArray(rawLineItems)) {
    lineItems = rawLineItems.map((item) => {
      const rowItem = item as Record<string, unknown>
      return {
        productId: typeof rowItem.productId === 'string' ? rowItem.productId : undefined,
        name: typeof rowItem.name === 'string' ? rowItem.name : '',
        amountCents: typeof rowItem.amountCents === 'number' ? rowItem.amountCents : 0,
        amountUsd: typeof rowItem.amountUsd === 'number' ? rowItem.amountUsd : 0,
      }
    })
  }

  return {
    id: row.id as string,
    teSubmissionId: row.te_submission_id as string,
    teCheckoutAttemptId: row.te_checkout_attempt_id as string,
    stripeCheckoutSessionId: row.stripe_checkout_session_id as string,
    stripePaymentIntentId: (row.stripe_payment_intent_id as string) ?? null,
    amountCents: row.amount_cents as number,
    currency: (row.currency as string) ?? 'usd',
    status: (row.status as string) === 'refunded' ? 'refunded' : 'paid',
    lineItems,
    customerEmail: (row.customer_email as string) ?? null,
    paidAt: row.paid_at as string,
    createdAt: row.created_at as string,
  }
}

/**
 * Load Stripe payments linked to one T&E submission.
 *
 * @param submissionId - `te_submissions.id`
 * @returns Payment rows newest first, or empty when none exist
 */
export async function fetchTePaymentsBySubmissionId(
  submissionId: string,
): Promise<TePayment[]> {
  if (!isSupabaseConfigured || !supabase || !submissionId.trim()) return []
  const { data, error } = await fromLoose('te_payments')
    .select(TE_PAYMENT_SELECT)
    .eq('te_submission_id', submissionId)
    .order('paid_at', { ascending: false })
  if (error) {
    console.error('fetchTePaymentsBySubmissionId error:', error)
    return []
  }
  return (data ?? []).map((row) => mapTePaymentFromRow(row))
}

/**
 * Load the latest paid payment for a submission, if any.
 *
 * @param submissionId - `te_submissions.id`
 * @returns Latest paid row or null
 */
export async function fetchLatestTePaymentBySubmissionId(
  submissionId: string,
): Promise<TePayment | null> {
  const rows = await fetchTePaymentsBySubmissionId(submissionId)
  return rows.find((row) => row.status === 'paid') ?? rows[0] ?? null
}
