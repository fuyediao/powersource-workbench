/** Complete persisted T&E workflow shared with geocrm-api. */
export const TE_SUBMISSION_STATUSES = [
  'under_review',
  'invalid',
  'approved',
  'order_recorded',
  'pending',
  'in_transit',
  'delivered',
  'testing',
  'settlement_pending',
  'return_pending',
  'returned',
  'payment_succeeded',
  'completed',
] as const

export type TeStatus = (typeof TE_SUBMISSION_STATUSES)[number]

/** Status filter order for the admin list. */
export const TE_ADMIN_STATUSES: TeStatus[] = [...TE_SUBMISSION_STATUSES]

/**
 * i18n key under admin.te.status for a submission status value.
 *
 * @param status - Stored te_submissions.status
 * @returns Translation key suffix path
 */
export function teStatusLabelKey(status: string): string {
  return `admin.te.status.${status}`
}

/** Theme-token badge classes for admin list/detail status chips. */
export const TE_STATUS_BADGE_CLASSES: Record<TeStatus, string> = {
  under_review: 'border-badge-blue-line bg-badge-blue-fill text-badge-blue',
  invalid: 'border-badge-rose-line bg-badge-rose-fill text-badge-rose',
  approved: 'border-badge-cyan-line bg-badge-cyan-fill text-badge-cyan',
  order_recorded: 'border-badge-indigo-line bg-badge-indigo-fill text-badge-indigo',
  pending: 'border-badge-amber-line bg-badge-amber-fill text-badge-amber',
  in_transit: 'border-badge-sky-line bg-badge-sky-fill text-badge-sky',
  delivered: 'border-badge-emerald-line bg-badge-emerald-fill text-badge-emerald',
  testing: 'border-badge-violet-line bg-badge-violet-fill text-badge-violet',
  settlement_pending:
    'border-badge-orange-line bg-badge-orange-fill text-badge-orange',
  return_pending: 'border-badge-amber-line bg-badge-amber-fill text-badge-amber',
  returned: 'border-badge-teal-line bg-badge-teal-fill text-badge-teal',
  payment_succeeded: 'border-badge-green-line bg-badge-green-fill text-badge-green',
  completed: 'border-badge-slate-line bg-badge-slate-fill text-badge-slate',
}
