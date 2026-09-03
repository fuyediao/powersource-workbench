/**
 * T&E application operations tab: ERP push/reconcile, tracking, and payments.
 */

import { useTranslation } from 'react-i18next'
import {
  erpStatusClass,
  formatDate,
  formatPaymentAmount,
  TE_FIELD_INPUT_CLASS,
  TE_SECTION_CLASS,
  TE_SECTION_HEADER_CLASS,
  type ErpDisplayStatus,
  type ReconcileResolution,
  type WorkflowAction,
} from '@/components/admin/te-application-shared'
import { teStatusLabelKey } from '@/constants/te-tracking-stages'
import { RefreshIcon } from '@/icons/AllIcons'
import type { TeErpPushAttempt } from '@/services/te-workflow-audit-repository'
import type { TeErpReconciliationResponse } from '@/services/te-workflow-api'
import type { TeSubmission } from '@/services/te-submissions-repository'
import type { TeOrder, TePayment } from '@/types/orders'

interface TeApplicationOperationsTabProps {
  submission: TeSubmission
  order: TeOrder | null
  payments: TePayment[]
  latestErpAttempt: TeErpPushAttempt | null
  erpDisplayStatus: ErpDisplayStatus
  erpReconciliationState: TeErpReconciliationResponse | null
  detailLoading: boolean
  canPushErp: boolean
  canReconcileErp: boolean
  canEditTracking: boolean
  trackingFormValid: boolean
  trackingNumberDraft: string
  trackingCarrierDraft: string
  workflowAction: WorkflowAction
  formatProductIds: (ids: string[] | null | undefined) => string
  onRetryErpPush: () => void
  onOpenReconcile: (resolution: ReconcileResolution) => void
  onTrackingNumberChange: (value: string) => void
  onTrackingCarrierChange: (value: string) => void
  onSaveTracking: () => void
}

/**
 * ERP, shipment, and payment operations for one T&E submission.
 *
 * @param props - Operations state and handlers
 * @returns Operations tab UI
 */
export function TeApplicationOperationsTab({
  submission,
  order,
  payments,
  latestErpAttempt,
  erpDisplayStatus,
  erpReconciliationState,
  detailLoading,
  canPushErp,
  canReconcileErp,
  canEditTracking,
  trackingFormValid,
  trackingNumberDraft,
  trackingCarrierDraft,
  workflowAction,
  formatProductIds,
  onRetryErpPush,
  onOpenReconcile,
  onTrackingNumberChange,
  onTrackingCarrierChange,
  onSaveTracking,
}: TeApplicationOperationsTabProps) {
  const { t } = useTranslation()
  const busy = Boolean(workflowAction)

  return (
    <div className="space-y-6">
      <section className={TE_SECTION_CLASS}>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-brand/20 bg-brand/10 px-4 py-2.5">
          <h3 className="text-sm font-semibold text-ink">{t('admin.te.section.erp')}</h3>
          <span
            className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${erpStatusClass(erpDisplayStatus)}`}
          >
            {t(`admin.te.erpStatus.${erpDisplayStatus}`)}
          </span>
        </header>
        <div className="space-y-4 p-4 md:p-5">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <Field label={t('admin.te.field.erpPushAt')} value={formatDate(submission.erpPushAt)} />
            <Field
              label={t('admin.te.field.erpAttempt')}
              value={latestErpAttempt ? String(latestErpAttempt.attemptNumber) : '—'}
            />
            <Field
              label={t('admin.te.field.erpPendingSince')}
              value={formatDate(erpReconciliationState?.pendingSince || latestErpAttempt?.startedAt)}
            />
            <Field
              label={t('admin.te.field.erpPushError')}
              value={latestErpAttempt?.errorCode ?? submission.erpPushError ?? '—'}
              breakAll
            />
          </dl>
          {canPushErp || canReconcileErp ? (
            <div className="flex flex-wrap gap-2">
              {canPushErp ? (
                <button
                  type="button"
                  className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-fg hover:bg-brand/90 disabled:opacity-50"
                  disabled={busy}
                  onClick={onRetryErpPush}
                >
                  {submission.erpPushStatus === 'failed'
                    ? t('admin.te.erp.retry')
                    : t('admin.te.erp.push')}
                </button>
              ) : null}
              {canReconcileErp ? (
                <>
                  <button
                    type="button"
                    className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-300"
                    disabled={busy}
                    onClick={() => onOpenReconcile('accepted')}
                  >
                    {t('admin.te.erp.reconcileAccepted')}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-500 hover:bg-rose-500/20 disabled:opacity-50"
                    disabled={busy}
                    onClick={() => onOpenReconcile('not_accepted')}
                  >
                    {t('admin.te.erp.reconcileNotAccepted')}
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
          {erpDisplayStatus === 'unknown' ? (
            <p className="text-xs text-orange-600 dark:text-orange-200">
              {t('admin.te.erp.unknownWarning')}
            </p>
          ) : null}
        </div>
      </section>

      <section className={TE_SECTION_CLASS}>
        <header className={TE_SECTION_HEADER_CLASS}>
          <h3 className="text-sm font-semibold text-ink">{t('admin.te.section.shipment')}</h3>
        </header>
        <div className="space-y-5 p-4 md:p-5">
          {detailLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <RefreshIcon className="size-4 animate-spin" />
              {t('common.loading')}
            </p>
          ) : !order ? (
            <p className="text-sm text-muted">{t('admin.te.shipmentEmpty')}</p>
          ) : (
            <>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field
                  label={t('admin.te.field.approvedProducts')}
                  value={formatProductIds(order.approvedProductIds)}
                />
                <div>
                  <dt className="text-xs text-muted">{t('admin.te.field.trackingNumber')}</dt>
                  <dd className="mt-1 font-medium text-brand">{order.trackingNumber ?? '—'}</dd>
                </div>
                <Field label={t('admin.te.field.carrier')} value={order.carrier ?? '—'} />
                <Field
                  label={t('admin.te.field.shipmentStatus')}
                  value={
                    order.trackingStatus ? t(teStatusLabelKey(order.trackingStatus)) : '—'
                  }
                />
                <Field
                  label={t('admin.te.field.trackingLastCheckedAt')}
                  value={formatDate(order.trackingLastCheckedAt)}
                  muted
                />
                <Field label={t('admin.te.field.shippedAt')} value={formatDate(order.shippedAt)} muted />
                <Field
                  label={t('admin.te.field.deliveredAt')}
                  value={formatDate(order.deliveredAt)}
                  muted
                />
                <Field
                  label={t('admin.te.field.trackingStatusUpdatedAt')}
                  value={formatDate(order.trackingStatusUpdatedAt)}
                  muted
                />
                <Field
                  label={t('admin.te.field.trackingLastError')}
                  value={order.trackingLastError ?? '—'}
                  muted
                />
              </dl>
              {canEditTracking ? (
                <form
                  className="grid grid-cols-1 gap-3 rounded-lg border border-ink/10 bg-white/50 p-4 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)_auto] dark:border-white/10 dark:bg-white/5"
                  onSubmit={(event) => {
                    event.preventDefault()
                    onSaveTracking()
                  }}
                >
                  <label className="text-xs text-muted">
                    {t('admin.te.tracking.carrierLabel')}
                    <input
                      type="text"
                      className={TE_FIELD_INPUT_CLASS}
                      value={trackingCarrierDraft}
                      placeholder={t('admin.te.tracking.carrierPlaceholder')}
                      disabled={workflowAction === 'tracking'}
                      onChange={(event) => onTrackingCarrierChange(event.target.value)}
                    />
                  </label>
                  <label className="text-xs text-muted">
                    {t('admin.te.tracking.numberLabel')}
                    <input
                      type="text"
                      className={TE_FIELD_INPUT_CLASS}
                      value={trackingNumberDraft}
                      placeholder={t('admin.te.tracking.numberPlaceholder')}
                      disabled={workflowAction === 'tracking'}
                      onChange={(event) => onTrackingNumberChange(event.target.value)}
                    />
                  </label>
                  <button
                    type="submit"
                    className="self-end rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:bg-brand/90 disabled:opacity-50"
                    disabled={!trackingFormValid || workflowAction === 'tracking'}
                  >
                    {workflowAction === 'tracking'
                      ? t('admin.te.tracking.saving')
                      : t('admin.te.tracking.save')}
                  </button>
                </form>
              ) : null}
            </>
          )}
        </div>
      </section>

      <section className={TE_SECTION_CLASS}>
        <header className={TE_SECTION_HEADER_CLASS}>
          <h3 className="text-sm font-semibold text-ink">{t('admin.te.section.payment')}</h3>
        </header>
        <div className="p-4 md:p-5">
          {payments.length === 0 ? (
            <p className="text-sm text-muted">{t('admin.te.paymentEmpty')}</p>
          ) : (
            <div className="space-y-4">
              {payments.map((payment) => (
                <dl
                  key={payment.id}
                  className="grid grid-cols-1 gap-x-6 gap-y-4 rounded-lg border border-ink/10 bg-white/50 p-4 sm:grid-cols-2 dark:border-white/10 dark:bg-white/5"
                >
                  <div>
                    <dt className="text-xs text-muted">{t('admin.te.field.paymentAmount')}</dt>
                    <dd className="mt-1 font-semibold text-green-600 dark:text-green-400">
                      {formatPaymentAmount(payment.amountCents, payment.currency)}
                    </dd>
                  </div>
                  <Field
                    label={t('admin.te.field.paymentStatus')}
                    value={t(`admin.te.paymentStatus.${payment.status}`)}
                  />
                  <Field
                    label={t('admin.te.field.paymentPaidAt')}
                    value={formatDate(payment.paidAt)}
                    muted
                  />
                  <Field
                    label={t('admin.te.field.paymentEmail')}
                    value={payment.customerEmail ?? '—'}
                  />
                  <Field
                    className="sm:col-span-2"
                    label={t('admin.te.field.checkoutAttemptId')}
                    value={payment.teCheckoutAttemptId || '—'}
                    mono
                  />
                  <Field
                    className="sm:col-span-2"
                    label={t('admin.te.field.stripeSessionId')}
                    value={payment.stripeCheckoutSessionId || '—'}
                    mono
                  />
                </dl>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

interface FieldProps {
  label: string
  value: string
  className?: string
  breakAll?: boolean
  muted?: boolean
  mono?: boolean
}

/**
 * Labeled operations field.
 *
 * @param props - Label and value
 * @returns Field
 */
function Field({
  label,
  value,
  className = '',
  breakAll = false,
  muted = false,
  mono = false,
}: FieldProps) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={`mt-1 ${muted ? 'text-xs text-muted' : 'text-sm text-ink'} ${
          breakAll || mono ? 'break-all' : ''
        } ${mono ? 'font-mono text-xs text-muted' : ''}`}
      >
        {value}
      </dd>
    </div>
  )
}
