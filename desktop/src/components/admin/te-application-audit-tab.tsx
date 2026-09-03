/**
 * T&E application audit tab: workflow timestamps, operators, and request metadata.
 */

import { useTranslation } from 'react-i18next'
import {
  formatDate,
  TE_SECTION_CLASS,
  TE_SECTION_HEADER_CLASS,
} from '@/components/admin/te-application-shared'
import type { TeSubmission } from '@/services/te-submissions-repository'

interface TeApplicationAuditTabProps {
  submission: TeSubmission
  formatOperatorLabel: (userId: string | null | undefined) => string
}

/**
 * Workflow audit plus request/source metadata.
 *
 * @param props - Submission and operator label resolver
 * @returns Audit tab UI
 */
export function TeApplicationAuditTab({
  submission,
  formatOperatorLabel,
}: TeApplicationAuditTabProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <section className={TE_SECTION_CLASS}>
        <header className={TE_SECTION_HEADER_CLASS}>
          <h3 className="text-sm font-semibold text-ink">{t('admin.te.section.workflowAudit')}</h3>
        </header>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 sm:grid-cols-2 md:p-5 lg:grid-cols-3">
          <Field
            label={t('admin.te.field.approvedProductsConfirmedAt')}
            value={formatDate(submission.approvedProductsConfirmedAt)}
          />
          <Field
            label={t('admin.te.field.approvedProductsConfirmedBy')}
            value={formatOperatorLabel(submission.approvedProductsConfirmedBy)}
            breakAll
          />
          <Field
            label={t('admin.te.field.testingStartAt')}
            value={formatDate(submission.testingStartAt)}
          />
          <Field
            label={t('admin.te.field.testingCompletedAt')}
            value={formatDate(submission.testingCompletedAt)}
          />
          <Field
            label={t('admin.te.field.evaluationDueAt')}
            value={formatDate(submission.evaluationDueAt)}
          />
          <Field
            label={t('admin.te.field.evaluationFirstSentAt')}
            value={formatDate(submission.evaluationFirstSentAt)}
          />
          <Field
            label={t('admin.te.field.evaluationLastRemindedAt')}
            value={formatDate(submission.evaluationLastRemindedAt)}
          />
          <Field
            label={t('admin.te.field.evaluationSubmittedAt')}
            value={formatDate(submission.evaluationSubmittedAt)}
          />
          <Field
            label={t('admin.te.field.settlementStartedAt')}
            value={formatDate(submission.settlementStartedAt)}
          />
          <Field
            label={t('admin.te.field.settlementLastRemindedAt')}
            value={formatDate(submission.settlementLastRemindedAt)}
          />
          <Field
            label={t('admin.te.field.returnRequestedAt')}
            value={formatDate(submission.returnRequestedAt)}
          />
          <Field
            label={t('admin.te.field.returnConfirmedAt')}
            value={formatDate(submission.returnConfirmedAt)}
          />
          <Field
            label={t('admin.te.field.returnConfirmedBy')}
            value={formatOperatorLabel(submission.returnConfirmedBy)}
            breakAll
          />
          <Field
            label={t('admin.te.field.paymentSucceededAt')}
            value={formatDate(submission.paymentSucceededAt)}
          />
          <Field label={t('admin.te.field.completedAt')} value={formatDate(submission.completedAt)} />
          <Field
            label={t('admin.te.field.completionReason')}
            value={
              submission.completionReason
                ? t(`admin.te.completionReason.${submission.completionReason}`)
                : '—'
            }
          />
        </dl>
      </section>

      <section className={TE_SECTION_CLASS}>
        <header className={TE_SECTION_HEADER_CLASS}>
          <h3 className="text-sm font-semibold text-ink">{t('admin.te.section.audit')}</h3>
        </header>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 sm:grid-cols-2 md:p-5">
          <Field label={t('admin.te.field.submittedAt')} value={formatDate(submission.createdAt)} />
          <Field label={t('admin.te.field.source')} value={submission.source} />
          <Field label={t('admin.te.field.ip')} value={submission.ip ?? '—'} />
          <Field
            label={t('admin.te.field.country')}
            value={
              [submission.country, submission.countryCode].filter(Boolean).join(' ') || '—'
            }
          />
          <Field
            label={t('admin.te.field.browserLanguage')}
            value={submission.browserLanguage ?? '—'}
          />
          <Field
            className="sm:col-span-2"
            label={t('admin.te.field.browserInfo')}
            value={submission.userAgent ?? '—'}
            breakAll
          />
          <Field
            label={t('admin.te.field.handledBy')}
            value={submission.handledBy ?? formatOperatorLabel(submission.handledByUserId)}
            breakAll
          />
          <Field label={t('admin.te.field.handledAt')} value={formatDate(submission.handledAt)} />
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted">{t('admin.te.field.notes')}</dt>
            <dd className="mt-1 min-h-10 rounded-lg border border-ink/10 bg-white/50 px-3 py-2 text-sm whitespace-pre-wrap text-ink dark:border-white/10 dark:bg-white/5">
              {submission.notes?.trim() || '—'}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  )
}

interface FieldProps {
  label: string
  value: string
  className?: string
  breakAll?: boolean
}

/**
 * Labeled audit field.
 *
 * @param props - Label and value
 * @returns Field
 */
function Field({ label, value, className = '', breakAll = false }: FieldProps) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-1 text-xs text-ink ${breakAll ? 'break-all' : ''}`}>{value}</dd>
    </div>
  )
}
