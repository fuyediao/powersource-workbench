/**
 * T&E application tab: read-only fields plus inline edit while under review.
 */

import { useMemo, type Dispatch, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import {
  booleanConsentLabel,
  categoryBadgeClass,
  categoryLabel,
  consentLabel,
  countryInputForFlag,
  displayName,
  DURATION_OPTIONS,
  isCustomShippingCountry,
  shippingIsoMatchesSearch,
  TE_CATEGORY_OPTIONS,
  TE_FIELD_INPUT_CLASS,
  TE_SECTION_CLASS,
  TE_SECTION_HEADER_CLASS,
  type ApplicationDraft,
  type ConsentDraft,
  type ShippingAddressCopyLineKey,
} from '@/components/admin/te-application-shared'
import { CountryFlag } from '@/components/common/country-flag'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import { PhoneInput } from '@/components/settings/phone-input'
import { PHONE_COUNTRY_CODES } from '@/constants/phone-country-codes'
import { CheckIcon, CopyIcon } from '@/icons/AllIcons'
import type { TeProductCategory } from '@/services/te-products-api'
import type { TeEmailCategory, TeSubmission } from '@/services/te-submissions-repository'
import { openMailCompose } from '@/utils/mail/mail-compose-request'
import { combinePhoneParts, parsePhoneParts } from '@/utils/settings/phone-number-parts'
import { getCountryDisplayName } from '@/utils/map/country-alpha2'
import { openExternalUrl } from '@/utils/shared/api'
import type { TeShippingAddressCopyLines } from '@/utils/te-shipping-address-copy'

interface TeApplicationTabProps {
  submission: TeSubmission
  canEdit: boolean
  isEditing: boolean
  draft: ApplicationDraft | null
  saving: boolean
  saveError: string | null
  activeCatalogCategories: TeProductCategory[]
  formatProductIds: (ids: string[] | null | undefined) => string
  shippingCopyLines: TeShippingAddressCopyLines
  shippingHasCopyLines: boolean
  justCopiedLine: ShippingAddressCopyLineKey | null
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: () => void
  onDraftChange: Dispatch<SetStateAction<ApplicationDraft | null>>
  onCopyShippingLine: (line: ShippingAddressCopyLineKey) => void
}

/**
 * Build the PhoneInput dial string from draft national mobile + ISO country.
 *
 * @param draft - Application edit draft
 * @returns Combined `+{dial} {local}` string for PhoneInput
 */
function applicationMobileDialValue(draft: ApplicationDraft): string {
  const iso = draft.mobileCountry.trim().toUpperCase()
  const dial = PHONE_COUNTRY_CODES.find((country) => country.code === iso)?.dialCode ?? ''
  return combinePhoneParts(dial, draft.mobile)
}

/**
 * Application identity / shipping / request sections with optional edit mode.
 *
 * @param props - Submission, draft, catalog, and edit handlers
 * @returns Application tab UI
 */
export function TeApplicationTab({
  submission,
  canEdit,
  isEditing,
  draft,
  saving,
  saveError,
  activeCatalogCategories,
  formatProductIds,
  shippingCopyLines,
  shippingHasCopyLines,
  justCopiedLine,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDraftChange,
  onCopyShippingLine,
}: TeApplicationTabProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language

  const shippingCountryOptions = useMemo(() => {
    const options = [
      { value: '', label: t('admin.customers.form.selectPlaceholder') },
      ...PHONE_COUNTRY_CODES.map((country) => ({
        value: country.code,
        label: getCountryDisplayName(country.code, locale) || country.name,
        description: country.code,
      })),
    ]
    const current = draft?.shippingCountry.trim().toUpperCase() ?? ''
    if (current && isCustomShippingCountry(current)) {
      options.splice(1, 0, {
        value: current,
        label: getCountryDisplayName(current, locale) || current,
        description: current,
      })
    }
    return options
  }, [draft?.shippingCountry, locale, t])

  /**
   * Patch one draft field.
   *
   * @param patch - Partial draft fields
   */
  function patchDraft(patch: Partial<ApplicationDraft>): void {
    onDraftChange((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  /**
   * Toggle one product id in the draft's requested-products selection.
   *
   * @param productId - Catalog product id
   */
  function toggleApplicationProduct(productId: string): void {
    onDraftChange((prev) => {
      if (!prev) return prev
      const product = prev.product.includes(productId)
        ? prev.product.filter((id) => id !== productId)
        : [...prev.product, productId]
      return { ...prev, product }
    })
  }

  /**
   * Apply PhoneInput dial + ISO back onto the draft.
   *
   * @param combined - Dial string from PhoneInput
   * @param iso - ISO 3166-1 alpha-2 from PhoneInput
   */
  function onMobileChange(combined: string, iso: string): void {
    const parts = parsePhoneParts(combined)
    patchDraft({
      mobile: parts.localNumber || combined.replace(/\D/g, ''),
      mobileCountry: iso.trim().toUpperCase(),
    })
  }

  const editing = isEditing && draft

  return (
    <div className="space-y-6">
      {canEdit ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">{t('admin.te.application.hint')}</p>
          <div className="flex shrink-0 items-center gap-2">
            {editing ? (
              <>
                <button
                  type="button"
                  className="h-8 rounded-md border border-ink/10 bg-white/70 px-3 text-xs font-medium text-ink hover:bg-white/5 disabled:opacity-50 dark:border-white/10 dark:bg-white/5"
                  disabled={saving}
                  onClick={onCancelEdit}
                >
                  {t('admin.te.application.cancel')}
                </button>
                <button
                  type="button"
                  className="flex h-8 items-center gap-1.5 rounded-md border border-brand/40 bg-brand/15 px-3 text-xs font-medium text-brand hover:bg-brand/25 disabled:opacity-50"
                  disabled={saving}
                  onClick={onSave}
                >
                  {saving ? t('admin.te.application.saving') : t('admin.te.application.save')}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="h-8 rounded-md border border-ink/10 bg-white/70 px-3 text-xs font-medium text-ink hover:bg-white/5 dark:border-white/10 dark:bg-white/5"
                onClick={onStartEdit}
              >
                {t('admin.te.application.edit')}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {saveError ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">
          {saveError}
        </p>
      ) : null}

      {editing ? (
        <ApplicationEditForm
          draft={draft}
          locale={locale}
          activeCatalogCategories={activeCatalogCategories}
          shippingCountryOptions={shippingCountryOptions}
          onPatch={patchDraft}
          onMobileChange={onMobileChange}
          onToggleProduct={toggleApplicationProduct}
        />
      ) : (
        <ApplicationReadOnly
          submission={submission}
          formatProductIds={formatProductIds}
          shippingCopyLines={shippingCopyLines}
          shippingHasCopyLines={shippingHasCopyLines}
          justCopiedLine={justCopiedLine}
          onCopyShippingLine={onCopyShippingLine}
        />
      )}
    </div>
  )
}

interface ApplicationEditFormProps {
  draft: ApplicationDraft
  locale: string
  activeCatalogCategories: TeProductCategory[]
  shippingCountryOptions: Array<{ value: string; label: string; description?: string }>
  onPatch: (patch: Partial<ApplicationDraft>) => void
  onMobileChange: (combined: string, iso: string) => void
  onToggleProduct: (productId: string) => void
}

/**
 * Inline edit form for an under-review application.
 *
 * @param props - Draft and mutation handlers
 * @returns Edit sections
 */
function ApplicationEditForm({
  draft,
  locale,
  activeCatalogCategories,
  shippingCountryOptions,
  onPatch,
  onMobileChange,
  onToggleProduct,
}: ApplicationEditFormProps) {
  const { t } = useTranslation()

  return (
    <>
      <section className={`${TE_SECTION_CLASS} overflow-visible`}>
        <header className={TE_SECTION_HEADER_CLASS}>
          <h3 className="text-sm font-semibold text-ink">{t('admin.te.section.identity')}</h3>
        </header>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 sm:grid-cols-2 md:p-5">
          <label className="text-xs text-muted">
            {t('admin.te.field.workEmail')}
            <input
              type="email"
              className={TE_FIELD_INPUT_CLASS}
              value={draft.email}
              onChange={(event) => onPatch({ email: event.target.value })}
            />
          </label>
          <label className="text-xs text-muted">
            {t('admin.te.field.emailCategory')}
            <select
              className={TE_FIELD_INPUT_CLASS}
              value={draft.emailCategory}
              onChange={(event) =>
                onPatch({ emailCategory: event.target.value as TeEmailCategory })
              }
            >
              {TE_CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-muted">
              {t('admin.te.application.emailCategoryHint')}
            </span>
          </label>
          <label className="text-xs text-muted">
            {t('admin.te.field.identityType')}
            <input
              type="text"
              className={TE_FIELD_INPUT_CLASS}
              value={draft.identityType}
              onChange={(event) => onPatch({ identityType: event.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted">
              {t('admin.te.field.firstName')}
              <input
                type="text"
                className={TE_FIELD_INPUT_CLASS}
                value={draft.firstName}
                onChange={(event) => onPatch({ firstName: event.target.value })}
              />
            </label>
            <label className="text-xs text-muted">
              {t('admin.te.field.lastName')}
              <input
                type="text"
                className={TE_FIELD_INPUT_CLASS}
                value={draft.lastName}
                onChange={(event) => onPatch({ lastName: event.target.value })}
              />
            </label>
          </div>
          <label className="text-xs text-muted">
            {t('admin.te.field.agency')}
            <input
              type="text"
              className={TE_FIELD_INPUT_CLASS}
              value={draft.agency}
              onChange={(event) => onPatch({ agency: event.target.value })}
            />
          </label>
          <label className="text-xs text-muted">
            {t('admin.te.field.deptRole')}
            <input
              type="text"
              className={TE_FIELD_INPUT_CLASS}
              value={draft.deptRole}
              onChange={(event) => onPatch({ deptRole: event.target.value })}
            />
          </label>
          <div className="sm:col-span-2">
            <span className="text-xs text-muted">{t('admin.te.field.mobile')}</span>
            <PhoneInput
              id="te-application-mobile"
              value={applicationMobileDialValue(draft)}
              countryCode={draft.mobileCountry}
              onChange={onMobileChange}
            />
          </div>
        </div>
      </section>

      <section className={`${TE_SECTION_CLASS} overflow-visible`}>
        <header className={TE_SECTION_HEADER_CLASS}>
          <h3 className="text-sm font-semibold text-ink">{t('admin.te.section.shipping')}</h3>
        </header>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 sm:grid-cols-2 md:p-5">
          <div className="text-xs text-muted">
            <span>{t('admin.te.field.shippingCountry')}</span>
            <CrmFilterSelect
              className="mt-1 w-full"
              searchable
              value={draft.shippingCountry.trim().toUpperCase()}
              options={shippingCountryOptions}
              searchPlaceholder={t('admin.customers.form.countrySearchPlaceholder')}
              closeAriaLabel={t('common.inlineSearchComboboxClose')}
              emptyLabel={t('admin.customers.form.noMatchingCountries')}
              filterOption={(option, query) => {
                if (!option.value) return true
                const country = PHONE_COUNTRY_CODES.find((row) => row.code === option.value)
                return shippingIsoMatchesSearch(
                  option.value,
                  country?.name ?? option.value,
                  query,
                  locale,
                )
              }}
              renderLeading={(option) =>
                option.value ? (
                  <CountryFlag countryName={option.value} size={18} />
                ) : null
              }
              ariaLabel={t('admin.te.field.shippingCountry')}
              onChange={(next) => onPatch({ shippingCountry: next })}
            />
          </div>
          <label className="text-xs text-muted">
            {t('admin.te.field.shippingState')}
            <input
              type="text"
              className={TE_FIELD_INPUT_CLASS}
              value={draft.shippingState}
              onChange={(event) => onPatch({ shippingState: event.target.value })}
            />
          </label>
          <label className="text-xs text-muted">
            {t('admin.te.field.shippingCity')}
            <input
              type="text"
              className={TE_FIELD_INPUT_CLASS}
              value={draft.shippingCity}
              onChange={(event) => onPatch({ shippingCity: event.target.value })}
            />
          </label>
          <label className="text-xs text-muted">
            {t('admin.te.field.shippingZip')}
            <input
              type="text"
              className={TE_FIELD_INPUT_CLASS}
              value={draft.shippingZip}
              onChange={(event) => onPatch({ shippingZip: event.target.value })}
            />
          </label>
          <label className="text-xs text-muted sm:col-span-2">
            {t('admin.te.field.shippingStreet')}
            <input
              type="text"
              className={TE_FIELD_INPUT_CLASS}
              value={draft.shippingStreet}
              onChange={(event) => onPatch({ shippingStreet: event.target.value })}
            />
          </label>
          <label className="text-xs text-muted sm:col-span-2">
            {t('admin.te.field.shippingApt')}
            <input
              type="text"
              className={TE_FIELD_INPUT_CLASS}
              value={draft.shippingApt}
              onChange={(event) => onPatch({ shippingApt: event.target.value })}
            />
          </label>
        </div>
      </section>

      <section className={TE_SECTION_CLASS}>
        <header className={TE_SECTION_HEADER_CLASS}>
          <h3 className="text-sm font-semibold text-ink">{t('admin.te.section.request')}</h3>
        </header>
        <div className="space-y-4 p-4 md:p-5">
          <div>
            <p className="text-xs text-muted">{t('admin.te.field.requestedProducts')}</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {activeCatalogCategories.map((category) => (
                <section
                  key={category.id}
                  className="rounded-xl border border-ink/10 bg-zinc-950/5 dark:border-white/10 dark:bg-black/10"
                >
                  <h4 className="border-b border-ink/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-muted uppercase dark:border-white/10">
                    {category.name}
                  </h4>
                  {category.products.map((product) => (
                    <label
                      key={product.id}
                      className="flex cursor-pointer items-start gap-2 px-3 py-1.5 text-sm text-ink hover:bg-white/5"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 rounded border-ink/20"
                        checked={draft.product.includes(product.id)}
                        onChange={() => onToggleProduct(product.id)}
                      />
                      <span className="min-w-0 flex-1">{product.name}</span>
                    </label>
                  ))}
                </section>
              ))}
            </div>
          </div>
          <label className="block text-xs text-muted">
            {t('admin.te.field.intendedUse')}
            <textarea
              rows={3}
              className={TE_FIELD_INPUT_CLASS}
              value={draft.intendedUse}
              onChange={(event) => onPatch({ intendedUse: event.target.value })}
            />
          </label>
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <ConsentSelect
              label={t('admin.te.field.duration')}
              value={draft.duration}
              options={DURATION_OPTIONS.map((option) => ({ value: option, label: option }))}
              onChange={(value) => onPatch({ duration: value })}
            />
            <ConsentSelect
              label={t('admin.te.field.consentAfterTest')}
              value={draft.consentAfterTest}
              includeBlank
              onChange={(value) => onPatch({ consentAfterTest: value as ConsentDraft })}
            />
            <ConsentSelect
              label={t('admin.te.field.consentShareMedia')}
              value={draft.consentShareMedia}
              includeBlank
              onChange={(value) => onPatch({ consentShareMedia: value as ConsentDraft })}
            />
            <ConsentSelect
              label={t('admin.te.field.consentMarketingEmails')}
              value={draft.consentMarketingEmails}
              includeBlank
              onChange={(value) => onPatch({ consentMarketingEmails: value as ConsentDraft })}
            />
            <ConsentSelect
              label={t('admin.te.field.consentCommunity')}
              value={draft.consentCommunity}
              includeBlank
              onChange={(value) => onPatch({ consentCommunity: value as ConsentDraft })}
            />
            <ConsentSelect
              label={t('admin.te.field.consentWall')}
              value={draft.consentWall}
              includeBlank
              onChange={(value) => onPatch({ consentWall: value as ConsentDraft })}
            />
          </div>
        </div>
      </section>
    </>
  )
}

interface ConsentSelectProps {
  label: string
  value: string
  includeBlank?: boolean
  options?: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}

/**
 * Compact select used for duration and consent drafts.
 *
 * @param props - Label, value, and change handler
 * @returns Labeled select
 */
function ConsentSelect({
  label,
  value,
  includeBlank = false,
  options,
  onChange,
}: ConsentSelectProps) {
  const { t } = useTranslation()
  const resolved = options ?? [
    { value: 'yes', label: t('common.yes') },
    { value: 'no', label: t('common.no') },
  ]
  return (
    <label className="text-xs text-muted">
      {label}
      <select
        className={TE_FIELD_INPUT_CLASS}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {includeBlank ? <option value="">—</option> : null}
        {resolved.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

interface ApplicationReadOnlyProps {
  submission: TeSubmission
  formatProductIds: (ids: string[] | null | undefined) => string
  shippingCopyLines: TeShippingAddressCopyLines
  shippingHasCopyLines: boolean
  justCopiedLine: ShippingAddressCopyLineKey | null
  onCopyShippingLine: (line: ShippingAddressCopyLineKey) => void
}

/**
 * Read-only application sections.
 *
 * @param props - Submission and shipping copy state
 * @returns View sections
 */
function ApplicationReadOnly({
  submission,
  formatProductIds,
  shippingCopyLines,
  shippingHasCopyLines,
  justCopiedLine,
  onCopyShippingLine,
}: ApplicationReadOnlyProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const flagCountry = countryInputForFlag(submission.shippingCountry)

  return (
    <>
      <section className={TE_SECTION_CLASS}>
        <header className={TE_SECTION_HEADER_CLASS}>
          <h3 className="text-sm font-semibold text-ink">{t('admin.te.section.identity')}</h3>
        </header>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 sm:grid-cols-2 md:p-5">
          <div>
            <dt className="text-xs text-muted">{t('admin.te.field.workEmail')}</dt>
            <dd className="mt-1 break-all text-ink">
              {submission.email?.trim() ? (
                <button
                  type="button"
                  className="text-left font-medium text-brand hover:underline"
                  onClick={() => {
                    const address = submission.email!.trim()
                    const name = displayName(submission).trim()
                    openMailCompose({
                      to: name && name !== '—' ? `${name} <${address}>` : address,
                    })
                  }}
                >
                  {submission.email.trim()}
                </button>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t('admin.te.field.emailCategory')}</dt>
            <dd className="mt-1">
              <span
                className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${categoryBadgeClass(submission.emailCategory)}`}
              >
                {categoryLabel(t, submission.emailCategory)}
              </span>
            </dd>
          </div>
          <Field label={t('admin.te.field.identityType')} value={submission.identityType ?? '—'} />
          <Field label={t('admin.te.field.name')} value={displayName(submission)} />
          <Field label={t('admin.te.field.agency')} value={submission.agency ?? '—'} />
          <Field label={t('admin.te.field.deptRole')} value={submission.deptRole ?? '—'} />
          <div>
            <dt className="text-xs text-muted">{t('admin.te.field.mobile')}</dt>
            <dd className="mt-1 text-ink">
              {submission.mobile?.trim() ? (
                <>
                  <button
                    type="button"
                    className="font-medium text-brand hover:underline"
                    onClick={() => {
                      const dialable = submission.mobile!.trim().replace(/[\s()-]/g, '')
                      if (dialable) {
                        void openExternalUrl(`tel:${dialable}`)
                      }
                    }}
                  >
                    {submission.mobile.trim()}
                  </button>
                  {submission.mobileCountry ? (
                    <span className="text-muted"> ({submission.mobileCountry})</span>
                  ) : null}
                </>
              ) : (
                '—'
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section className={TE_SECTION_CLASS}>
        <header className={TE_SECTION_HEADER_CLASS}>
          <h3 className="text-sm font-semibold text-ink">{t('admin.te.section.shipping')}</h3>
        </header>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 sm:grid-cols-2 md:p-5">
          <div>
            <dt className="text-xs text-muted">{t('admin.te.field.shippingCountry')}</dt>
            <dd className="mt-1 flex items-center gap-2">
              {flagCountry ? <CountryFlag countryName={flagCountry} size={24} /> : null}
              <span className="text-ink">
                {getCountryDisplayName(submission.shippingCountry, locale) ||
                  submission.shippingCountry ||
                  '—'}
              </span>
            </dd>
          </div>
          <Field label={t('admin.te.field.shippingState')} value={submission.shippingState ?? '—'} />
          <Field label={t('admin.te.field.shippingCity')} value={submission.shippingCity ?? '—'} />
          <Field label={t('admin.te.field.shippingZip')} value={submission.shippingZip ?? '—'} />
          <Field
            className="sm:col-span-2"
            label={t('admin.te.field.shippingStreet')}
            value={submission.shippingStreet ?? '—'}
          />
          <Field
            className="sm:col-span-2"
            label={t('admin.te.field.shippingApt')}
            value={submission.shippingApt ?? '—'}
          />
        </dl>
        {shippingHasCopyLines ? (
          <div className="space-y-2 border-t border-ink/10 px-4 py-3 md:px-5 dark:border-white/10">
            <p className="text-xs text-muted">{t('admin.te.field.shippingAddressCopy')}</p>
            <CopyLine
              value={shippingCopyLines.locationCode}
              copied={justCopiedLine === 'locationCode'}
              ariaLabel={t('admin.te.field.shippingAddressCopyLocationCode')}
              onCopy={() => onCopyShippingLine('locationCode')}
            />
            <CopyLine
              value={shippingCopyLines.fullAddress}
              copied={justCopiedLine === 'fullAddress'}
              ariaLabel={t('admin.te.field.shippingAddressCopyFull')}
              onCopy={() => onCopyShippingLine('fullAddress')}
            />
            <CopyLine
              value={shippingCopyLines.postalLine}
              copied={justCopiedLine === 'postalLine'}
              ariaLabel={t('admin.te.field.shippingAddressCopyPostal')}
              onCopy={() => onCopyShippingLine('postalLine')}
            />
          </div>
        ) : null}
      </section>

      <section className={TE_SECTION_CLASS}>
        <header className={TE_SECTION_HEADER_CLASS}>
          <h3 className="text-sm font-semibold text-ink">{t('admin.te.section.request')}</h3>
        </header>
        <dl className="space-y-4 p-4 md:p-5">
          <Field
            label={t('admin.te.field.requestedProducts')}
            value={formatProductIds(submission.product)}
          />
          <Field
            label={t('admin.te.field.approvedProducts')}
            value={formatProductIds(submission.approvedProductIds)}
          />
          <div>
            <dt className="text-xs text-muted">{t('admin.te.field.intendedUse')}</dt>
            <dd className="mt-1 rounded-lg border border-ink/10 bg-white/70 px-3 py-2 whitespace-pre-wrap text-ink dark:border-white/10 dark:bg-white/5">
              {submission.intendedUse ?? '—'}
            </dd>
          </div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <Field label={t('admin.te.field.duration')} value={submission.duration ?? '—'} />
            <Field
              label={t('admin.te.field.consentAfterTest')}
              value={consentLabel(t, submission.consentAfterTest)}
            />
            <Field
              label={t('admin.te.field.consentShareMedia')}
              value={booleanConsentLabel(t, submission.consentShareMedia)}
            />
            <Field
              label={t('admin.te.field.consentMarketingEmails')}
              value={booleanConsentLabel(t, submission.consentMarketingEmails)}
            />
            <Field
              label={t('admin.te.field.consentCommunity')}
              value={booleanConsentLabel(t, submission.consentCommunity)}
            />
            <Field
              label={t('admin.te.field.consentWall')}
              value={booleanConsentLabel(t, submission.consentWall)}
            />
          </div>
        </dl>
      </section>
    </>
  )
}

interface FieldProps {
  label: string
  value: string
  className?: string
  breakAll?: boolean
}

/**
 * Labeled definition term/description pair.
 *
 * @param props - Label and value
 * @returns Field
 */
function Field({ label, value, className = '', breakAll = false }: FieldProps) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-1 text-ink ${breakAll ? 'break-all' : ''}`}>{value}</dd>
    </div>
  )
}

interface CopyLineProps {
  value: string
  copied: boolean
  ariaLabel: string
  onCopy: () => void
}

/**
 * One shipping address copy row.
 *
 * @param props - Line value and copy handler
 * @returns Copy row or null when empty
 */
function CopyLine({ value, copied, ariaLabel, onCopy }: CopyLineProps) {
  const { t } = useTranslation()
  if (!value) return null
  return (
    <div className="flex items-start justify-between gap-3">
      <p className="min-w-0 flex-1 text-sm leading-relaxed break-words text-ink">{value}</p>
      <button
        type="button"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-ink/10 bg-white/70 px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-brand/40 hover:bg-brand/10 hover:text-ink dark:border-white/10 dark:bg-white/5"
        aria-label={ariaLabel}
        onClick={onCopy}
      >
        {copied ? (
          <CheckIcon className="size-3.5 text-emerald-500" aria-hidden />
        ) : (
          <CopyIcon className="size-3.5" aria-hidden />
        )}
        <span>
          {copied
            ? t('admin.te.field.shippingAddressCopied')
            : t('admin.te.field.shippingAddressCopyAction')}
        </span>
      </button>
    </div>
  )
}
