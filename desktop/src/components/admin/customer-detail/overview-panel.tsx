/**
 * Read-only customer overview (highlights, description, address, classification).
 */

import { useTranslation } from 'react-i18next'
import {
  dash,
  detailSectionCardClass,
} from '@/components/admin/customer-detail/detail-shared'
import { isCustomerTypeSlug } from '@/constants/customer-types'
import {
  isCustomerAttributeSlug,
  isCustomerChannelSlug,
  isCustomerSourceSlug,
  isMarketSegmentSlug,
  isPriceTypeSlug,
} from '@/constants/customer-options'
import type { CustomerDetail } from '@/types/customer'
import {
  formatDisplayDate,
  formatDisplayDateTime,
} from '@/utils/format-display-date'

interface OverviewPanelProps {
  customer: CustomerDetail
}

interface FieldRowProps {
  label: string
  value: string
}

/**
 * One label/value cell in a grid.
 * @param props - Label and display value.
 * @returns Field cell.
 */
function FieldRow({ label, value }: FieldRowProps) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-semibold text-muted">{label}</p>
      <p className="text-sm font-medium text-ink wrap-break-word whitespace-pre-wrap">
        {value}
      </p>
    </div>
  )
}

/**
 * Whether the customer has company address lines beyond country/postal.
 * @param customer - Detail row.
 * @returns True when state/city/street present.
 */
function hasCompanyAddressDetails(customer: CustomerDetail): boolean {
  return Boolean(
    customer.companyState?.trim() ||
      customer.companyCity?.trim() ||
      customer.companyAddressLine1?.trim() ||
      customer.companyAddressLine2?.trim(),
  )
}

/**
 * Read-only overview tab for a customer.
 * @param props - Customer detail.
 * @returns Overview UI.
 */
export function OverviewPanel({ customer }: OverviewPanelProps) {
  const { t } = useTranslation()

  const typeLabel = (() => {
    const slug = customer.customerType
    if (!slug) {
      return '—'
    }
    if (isCustomerTypeSlug(slug)) {
      return t(`admin.customers.customerType.${slug}`)
    }
    return slug
  })()

  /**
   * Resolves a classification slug to a translated label when known.
   * @param value - Stored value.
   * @param ns - i18n namespace under admin.customers.
   * @param guard - Type guard for known slugs.
   * @returns Display text.
   */
  function classify(
    value: string | null | undefined,
    ns: string,
    guard: (v: string | null | undefined) => boolean,
  ): string {
    if (!value) {
      return '—'
    }
    if (guard(value)) {
      return t(`admin.customers.${ns}.${value}`)
    }
    return value
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className={detailSectionCardClass()}>
          <p className="mb-1 text-[11px] font-semibold text-muted">
            {t('admin.customers.detail.highlights.createdAt')}
          </p>
          <p className="text-xs font-medium text-ink">
            {formatDisplayDate(customer.createdAt)}
          </p>
        </div>
        <div className={detailSectionCardClass()}>
          <p className="mb-1 text-[11px] font-semibold text-muted">
            {t('admin.customers.detail.highlights.type')}
          </p>
          <p className="truncate text-xs font-medium text-ink">{typeLabel}</p>
        </div>
        <div className={detailSectionCardClass()}>
          <p className="mb-1 text-[11px] font-semibold text-muted">
            {t('admin.customers.detail.highlights.updatedAt')}
          </p>
          <p className="text-xs font-medium text-ink">
            {formatDisplayDateTime(customer.updatedAt)}
          </p>
        </div>
      </div>

      <section className={detailSectionCardClass()}>
        <h3 className="mb-3 text-sm font-extrabold text-ink">
          {t('admin.customers.form.description')}
        </h3>
        <p className="whitespace-pre-wrap text-sm font-medium text-ink">
          {dash(customer.description)}
        </p>
      </section>

      <section className={detailSectionCardClass()}>
        <h3 className="mb-3 text-sm font-extrabold text-ink">
          {t('admin.customers.section.companyAddress')}
        </h3>
        {hasCompanyAddressDetails(customer) ? (
          <dl className="divide-y divide-ink/10 overflow-hidden rounded-xl border border-ink/10">
            {[
              {
                label: t('admin.customers.form.companyAddressState'),
                value: customer.companyState,
              },
              {
                label: t('admin.customers.form.companyAddressCity'),
                value: customer.companyCity,
              },
              {
                label: t('admin.customers.form.companyAddressLine1'),
                value: customer.companyAddressLine1,
              },
              {
                label: t('admin.customers.form.companyAddressLine2'),
                value: customer.companyAddressLine2,
              },
            ]
              .filter((row) => Boolean(row.value?.trim()))
              .map((row) => (
                <div
                  key={row.label}
                  className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] sm:items-center sm:gap-4"
                >
                  <dt className="text-xs font-medium text-muted">{row.label}</dt>
                  <dd className="text-sm font-medium text-ink wrap-break-word">
                    {row.value}
                  </dd>
                </div>
              ))}
          </dl>
        ) : customer.companyCountry?.trim() ||
          customer.companyPostalCode?.trim() ? (
          <p className="text-xs font-medium text-muted">
            {t('admin.customers.detail.companyAddressCountryInAbout')}
          </p>
        ) : (
          <p className="text-sm font-medium text-muted">—</p>
        )}
      </section>

      <section className={detailSectionCardClass()}>
        <h3 className="mb-3 text-sm font-extrabold text-ink">
          {t('admin.customers.section.classification')}
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FieldRow
            label={t('admin.customers.form.category')}
            value={dash(customer.category)}
          />
          <FieldRow
            label={t('admin.customers.form.customerType')}
            value={typeLabel}
          />
          <FieldRow
            label={t('admin.customers.form.customerChannel')}
            value={classify(
              customer.customerChannel,
              'customerChannel',
              isCustomerChannelSlug,
            )}
          />
          <FieldRow
            label={t('admin.customers.form.customerAttribute')}
            value={classify(
              customer.customerAttribute,
              'customerAttribute',
              isCustomerAttributeSlug,
            )}
          />
          <FieldRow
            label={t('admin.customers.form.marketSegment')}
            value={classify(
              customer.marketSegment,
              'customerMarketSegment',
              isMarketSegmentSlug,
            )}
          />
          <FieldRow
            label={t('admin.customers.form.marketSubSegment')}
            value={dash(customer.marketSubSegment)}
          />
          <FieldRow
            label={t('admin.customers.form.customerSource')}
            value={classify(
              customer.customerSource,
              'customerSource',
              isCustomerSourceSlug,
            )}
          />
          <FieldRow
            label={t('admin.customers.form.customerLevel')}
            value={dash(customer.customerLevel)}
          />
          <FieldRow
            label={t('admin.customers.form.paymentCycle')}
            value={dash(customer.paymentCycle)}
          />
          <FieldRow
            label={t('admin.customers.form.relationshipStartDate')}
            value={formatDisplayDate(customer.relationshipStartDate)}
          />
          <FieldRow
            label={t('admin.customers.form.creditLimit')}
            value={dash(customer.creditLimit)}
          />
          <FieldRow
            label={t('admin.customers.form.paymentMethod')}
            value={dash(customer.paymentMethod)}
          />
          <FieldRow
            label={t('admin.customers.form.currency')}
            value={dash(customer.currency)}
          />
          <FieldRow
            label={t('admin.customers.form.priceType')}
            value={classify(
              customer.priceType,
              'customerPriceType',
              isPriceTypeSlug,
            )}
          />
          <FieldRow
            label={t('admin.customers.form.jobTitle')}
            value={dash(customer.jobTitle)}
          />
          <FieldRow
            label={t('admin.customers.form.handlerDepartment')}
            value={dash(customer.handlerDepartment)}
          />
          <FieldRow
            label={t('admin.customers.form.handlerDeveloper')}
            value={dash(customer.handlerDeveloper)}
          />
          <FieldRow
            label={t('admin.customers.form.handlerFollower')}
            value={dash(customer.handlerFollower)}
          />
        </div>
      </section>
    </div>
  )
}
