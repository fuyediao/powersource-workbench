import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { fromLoose } from '@/lib/supabase-loose'
import type { TeErpPushStatus } from '@/services/te-submissions-repository'

/** One audited ERP pre-order push attempt. */
export interface TeErpPushAttempt {
  id: string
  teSubmissionId: string
  attemptNumber: number
  status: TeErpPushStatus
  startedAt: string
  finishedAt: string | null
  errorCode: string | null
  errorSummary: string | null
}

/**
 * Map a raw ERP push audit row.
 *
 * @param row - Supabase record
 * @returns Typed attempt
 */
function mapErpPushAttempt(row: Record<string, unknown>): TeErpPushAttempt {
  const status = row.status
  if (status !== 'pending' && status !== 'pushed' && status !== 'failed') {
    throw new Error(`Unsupported T&E ERP attempt status: ${String(status)}`)
  }
  return {
    id: String(row.id),
    teSubmissionId: String(row.te_submission_id),
    attemptNumber:
      typeof row.attempt_number === 'number'
        ? row.attempt_number
        : Number(row.attempt_number),
    status,
    startedAt: String(row.started_at),
    finishedAt: typeof row.finished_at === 'string' ? row.finished_at : null,
    errorCode: typeof row.error_code === 'string' ? row.error_code : null,
    errorSummary: typeof row.error_summary === 'string' ? row.error_summary : null,
  }
}

/**
 * Load ERP push attempts for one submission, newest first.
 *
 * @param submissionId - T&E submission UUID
 * @returns Read-only audit attempts
 */
export async function fetchTeErpPushAttempts(
  submissionId: string,
): Promise<TeErpPushAttempt[]> {
  if (!isSupabaseConfigured || !supabase || !submissionId.trim()) return []
  const { data, error } = await fromLoose('te_erp_push_attempts')
    .select(
      'id, te_submission_id, attempt_number, status, started_at, finished_at, error_code, error_summary',
    )
    .eq('te_submission_id', submissionId)
    .order('attempt_number', { ascending: false })
  if (error) {
    console.error('fetchTeErpPushAttempts error:', error)
    return []
  }
  return (data ?? []).map((row) => mapErpPushAttempt(row))
}
