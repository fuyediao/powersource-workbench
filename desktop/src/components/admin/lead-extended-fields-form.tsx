/**
 * OKKI-style optional lead fields (web LeadExtendedFieldsForm parity).
 */

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CountryFlag } from '@/components/common/country-flag'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import { COUNTRY_OPTIONS } from '@/constants/countries'
import {
  LEAD_EXTENDED_OTHER_ENUM_KEYS,
  LEAD_EXTENDED_SECTIONS,
  type LeadExtendedFieldKey,
} from '@/constants/lead-extended-form'
import type { LeadExtendedOtherEnumKey } from '@/constants/lead-extended-select-options'
import {
  LEAD_EXTENDED_ENUM_SEARCH_THRESHOLD,
  leadExtendedEnumOptionMessageKey,
  leadExtendedEnumValuesForField,
} from '@/constants/lead-extended-select-options'
import { getCountryDisplayName } from '@/utils/map/country-alpha2'

const MULTILINE_TEXT_FIELD_KEYS = new Set<LeadExtendedFieldKey>([
  'performanceHistory',
  'performanceCurrentYear',
  'performanceCurrentYearGoal',
  'leadRemarks',
  'contactRemarks',
])

const inputClass =
  'w-full rounded-2xl border border-ink/10 bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5'

const readonlyClass =
  'flex min-h-11 w-full items-center gap-2 rounded-2xl border border-ink/10 bg-ink/5 px-3 py-2 text-sm text-muted'

const labelClass = 'text-xs font-bold tracking-wide text-muted uppercase'

type SectionId = (typeof LEAD_EXTENDED_SECTIONS)[number]['id']

const otherEnumSelectKeySet = new Set<string>(LEAD_EXTENDED_OTHER_ENUM_KEYS)

interface LeadExtendedFieldsFormProps {
  value: Record<LeadExtendedFieldKey, string>
  onChange: (next: Record<LeadExtendedFieldKey, string>) => void
  sections?: readonly SectionId[]
  readonlyKeys?: readonly LeadExtendedFieldKey[]
}

/**
 * Whether a field uses a textarea.
 * @param key - Extended field key.
 * @returns True for multiline keys.
 */
function isMultilineTextField(key: LeadExtendedFieldKey): boolean {
  return MULTILINE_TEXT_FIELD_KEYS.has(key)
}

/**
 * Extended-field form for common / other / contact sections.
 * @param props - Value map, change handler, optional section filter and read-only keys.
 * @returns Form UI.
 */
export function LeadExtendedFieldsForm({
  value,
  onChange,
  sections,
  readonlyKeys,
}: LeadExtendedFieldsFormProps) {
  const { t, i18n } = useTranslation()
  const currentYear = new Date().getFullYear()
  const localeTag = i18n.language || 'en-US'
  const readonlyKeySet = useMemo(() => new Set(readonlyKeys ?? []), [readonlyKeys])

  const visibleSections = useMemo(() => {
    if (!sections?.length) {
      return [...LEAD_EXTENDED_SECTIONS]
    }
    return LEAD_EXTENDED_SECTIONS.filter((section) => sections.includes(section.id))
  }, [sections])

  const showCommonInfoCustomerHint = visibleSections.some(
    (section) => section.id === 'commonInfo' && section.keys.some((key) => readonlyKeySet.has(key)),
  )

  const countryOptions = useMemo(
    () => [
      { value: '', label: t('admin.leadsTable.form.leadExtendedEnumClear') },
      ...COUNTRY_OPTIONS.map((name) => ({
        value: name,
        label: getCountryDisplayName(name, localeTag) || name,
      })),
    ],
    [localeTag, t],
  )

  /**
   * Updates one extended field.
   * @param key - Field key.
   * @param nextValue - Raw string.
   */
  function onInput(key: LeadExtendedFieldKey, nextValue: string): void {
    if (readonlyKeySet.has(key)) {
      return
    }
    onChange({ ...value, [key]: nextValue })
  }

  return (
    <div className="space-y-5">
      {visibleSections.map((section) => (
        <div key={section.id} className="space-y-3">
          <h3 className={labelClass}>
            {t(`admin.leadsTable.form.section.${section.id}`)}
          </h3>
          {section.id === 'commonInfo' && showCommonInfoCustomerHint ? (
            <p className="-mt-1 text-xs leading-relaxed text-muted">
              {t('admin.leadsTable.form.customerBackedFieldsHint')}
            </p>
          ) : null}
          <div className="space-y-3">
            {section.keys.map((key) => {
              const readonly = readonlyKeySet.has(key)
              const fieldLabel = t(`admin.leadsTable.form.field.${key}`, {
                year: currentYear,
              })
              return (
                <div key={key} className="space-y-1.5">
                  <label className="flex items-baseline gap-1 text-xs font-medium text-muted">
                    <span>{fieldLabel}</span>
                    {key === 'leadName' ? (
                      <span className="text-rose-500" aria-hidden>
                        *
                      </span>
                    ) : null}
                  </label>
                  {key === 'countryRegion' && readonly ? (
                    <div
                      className={readonlyClass}
                      title={
                        value[key]?.trim()
                          ? getCountryDisplayName(value[key], localeTag)
                          : undefined
                      }
                    >
                      {value[key]?.trim() ? (
                        <>
                          <CountryFlag countryName={value[key]} size={18} />
                          <span className="min-w-0 truncate">
                            {getCountryDisplayName(value[key], localeTag)}
                          </span>
                        </>
                      ) : (
                        <span>
                          {t('admin.leadsTable.form.customerBackedEmptyPlaceholder')}
                        </span>
                      )}
                    </div>
                  ) : null}
                  {key === 'visitorIpLocation' ? (
                    <CrmFilterSelect
                      className="w-full"
                      value={value[key]}
                      options={countryOptions}
                      searchable
                      placeholder={t('admin.leadsTable.form.leadExtendedEnumPlaceholder')}
                      searchPlaceholder={t(
                        'admin.leadsTable.form.leadVisitorIpSearchPlaceholder',
                      )}
                      emptyLabel={t('admin.leadsTable.form.leadVisitorIpNoMatch')}
                      closeAriaLabel={t('common.inlineSearchComboboxClose')}
                      ariaLabel={fieldLabel}
                      onChange={(next) => onInput(key, next)}
                    />
                  ) : null}
                  {otherEnumSelectKeySet.has(key) ? (
                    <LeadExtendedEnumField
                      fieldKey={key as LeadExtendedOtherEnumKey}
                      value={value[key]}
                      disabled={readonly}
                      onChange={(next) => onInput(key, next)}
                    />
                  ) : null}
                  {key !== 'countryRegion' &&
                  key !== 'visitorIpLocation' &&
                  !otherEnumSelectKeySet.has(key) &&
                  isMultilineTextField(key) ? (
                    <textarea
                      value={value[key]}
                      readOnly={readonly}
                      rows={5}
                      placeholder={
                        readonly
                          ? t('admin.leadsTable.form.customerBackedEmptyPlaceholder')
                          : undefined
                      }
                      className={`${inputClass} min-h-36 resize-y ${readonly ? 'cursor-not-allowed bg-ink/5 text-muted' : ''}`}
                      onChange={(e) => onInput(key, e.target.value)}
                    />
                  ) : null}
                  {key !== 'countryRegion' &&
                  key !== 'visitorIpLocation' &&
                  !otherEnumSelectKeySet.has(key) &&
                  !isMultilineTextField(key) ? (
                    <input
                      type="text"
                      value={value[key]}
                      readOnly={readonly}
                      placeholder={
                        readonly
                          ? t('admin.leadsTable.form.customerBackedEmptyPlaceholder')
                          : undefined
                      }
                      className={`${inputClass} ${readonly ? 'cursor-not-allowed bg-ink/5 text-muted' : ''}`}
                      onChange={(e) => onInput(key, e.target.value)}
                    />
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

interface LeadExtendedEnumFieldProps {
  fieldKey: LeadExtendedOtherEnumKey
  value: string
  disabled?: boolean
  onChange: (next: string) => void
}

/**
 * Searchable enum / IANA dropdown for one extended field.
 * @param props - Field key, stored value, change handler.
 * @returns Select UI.
 */
function LeadExtendedEnumField({
  fieldKey,
  value,
  disabled = false,
  onChange,
}: LeadExtendedEnumFieldProps) {
  const { t } = useTranslation()
  const slugs = leadExtendedEnumValuesForField(fieldKey)
  const searchable = slugs.length >= LEAD_EXTENDED_ENUM_SEARCH_THRESHOLD
  const options = useMemo(
    () => [
      { value: '', label: t('admin.leadsTable.form.leadExtendedEnumClear') },
      ...slugs.map((slug) => ({
        value: slug,
        label: t(leadExtendedEnumOptionMessageKey(fieldKey, slug)),
      })),
    ],
    [fieldKey, slugs, t],
  )

  return (
    <CrmFilterSelect
      className="w-full"
      value={value}
      options={options}
      disabled={disabled}
      searchable={searchable}
      placeholder={t('admin.leadsTable.form.leadExtendedEnumPlaceholder')}
      searchPlaceholder={t('admin.leadsTable.form.leadExtendedEnumSearchPlaceholder')}
      emptyLabel={t('admin.leadsTable.form.leadExtendedEnumNoMatch')}
      closeAriaLabel={t('common.inlineSearchComboboxClose')}
      ariaLabel={t(`admin.leadsTable.form.field.${fieldKey}`)}
      onChange={onChange}
    />
  )
}
