/**
 * KOL overview tab: identity, contact, tier, rating, and free-text fields.
 */

import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { dash, detailSectionCardClass } from '@/components/admin/customer-detail/detail-shared'
import {
  KOL_DETAIL_INPUT_CLASS,
  KOL_DETAIL_LABEL_CLASS,
  KOL_EMAIL_REGEX,
} from '@/components/admin/kol-detail/detail-shared'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import { PhoneInput } from '@/components/settings/phone-input'
import {
  getRatingStarClass,
  getRatingTextClass,
  KOL_TIER_VALUES,
  kolTierBadgeClass,
} from '@/constants/kol-constants'
import { StarIcon } from '@/icons/AllIcons'
import type { KolFormInput, KolTier } from '@/types/kol'
import { openMailCompose } from '@/utils/mail/mail-compose-request'
import { openExternalUrl } from '@/utils/shared/api'

interface OverviewPanelProps {
  form: KolFormInput
  editing: boolean
  onPatch: (patch: Partial<KolFormInput>) => void
  onOpenCriteria: () => void
}

/**
 * Info (i) glyph for the criteria helper button.
 * @param props - Optional className.
 * @returns SVG.
 */
function InfoGlyph({ className }: { className?: string }): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  )
}

/**
 * Overview fields for a KOL (account, contact, tier, rating, notes).
 * @param props - Form state, edit flag, patch, and criteria opener.
 * @returns Panel UI.
 */
export function OverviewPanel({
  form,
  editing,
  onPatch,
  onOpenCriteria,
}: OverviewPanelProps) {
  const { t } = useTranslation()
  const [hoveredRating, setHoveredRating] = useState<number | null>(null)

  const email = form.email ?? ''
  const emailValid = !email.trim() || KOL_EMAIL_REGEX.test(email.trim())
  const displayRating = hoveredRating ?? form.rating ?? 0

  const tierOptions = [
    { value: '', label: t('admin.kol.form.unset') },
    ...KOL_TIER_VALUES.map((tier) => ({
      value: tier,
      label: t(`admin.kol.tier.${tier}`),
    })),
  ]

  return (
    <div className={`${detailSectionCardClass()} space-y-6`}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={KOL_DETAIL_LABEL_CLASS} htmlFor="kol-account-name">
            {t('admin.kolDetail.field.accountName')}
          </label>
          {editing ? (
            <input
              id="kol-account-name"
              type="text"
              value={form.accountName ?? ''}
              placeholder={t('admin.kolDetail.field.accountNamePlaceholder')}
              className={KOL_DETAIL_INPUT_CLASS}
              onChange={(event) =>
                onPatch({ accountName: event.target.value.trim() || null })
              }
            />
          ) : (
            <p className="text-sm text-ink">{dash(form.accountName)}</p>
          )}
        </div>
        <div>
          <label className={KOL_DETAIL_LABEL_CLASS} htmlFor="kol-vertical">
            {t('admin.kolDetail.field.vertical')}
          </label>
          {editing ? (
            <input
              id="kol-vertical"
              type="text"
              value={form.vertical ?? ''}
              placeholder={t('admin.kolDetail.field.verticalPlaceholder')}
              className={KOL_DETAIL_INPUT_CLASS}
              onChange={(event) =>
                onPatch({ vertical: event.target.value.trim() || null })
              }
            />
          ) : (
            <p className="text-sm text-ink">{dash(form.vertical)}</p>
          )}
        </div>
        <div>
          <label className={KOL_DETAIL_LABEL_CLASS} htmlFor="kol-email">
            {t('admin.kolDetail.field.email')}
          </label>
          {editing ? (
            <>
              <input
                id="kol-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                spellCheck={false}
                placeholder="kol@example.com"
                aria-invalid={!emailValid}
                value={email}
                className={`${KOL_DETAIL_INPUT_CLASS} ${
                  emailValid ? '' : 'border-rose-400 focus:border-rose-400'
                }`}
                onChange={(event) =>
                  onPatch({ email: event.target.value.trim() || null })
                }
              />
              {!emailValid ? (
                <p className="mt-1 text-xs text-rose-500">
                  {t('admin.kolDetail.field.emailInvalid')}
                </p>
              ) : null}
            </>
          ) : form.email?.trim() ? (
            <button
              type="button"
              className="text-sm font-medium text-brand hover:underline"
              onClick={() => {
                const address = form.email!.trim()
                const name = (form.accountName ?? form.name ?? '').trim()
                openMailCompose({
                  to: name ? `${name} <${address}>` : address,
                })
              }}
            >
              {form.email.trim()}
            </button>
          ) : (
            <p className="text-sm text-ink">{dash(null)}</p>
          )}
        </div>
        <div>
          <label className={KOL_DETAIL_LABEL_CLASS} htmlFor="kol-phone">
            {t('admin.kolDetail.field.phone')}
          </label>
          {editing ? (
            <PhoneInput
              id="kol-phone"
              value={form.phone ?? ''}
              countryCode={form.phoneCountry ?? ''}
              onChange={(nextValue, nextIso) =>
                onPatch({
                  phone: nextValue.trim() || null,
                  phoneCountry: nextIso.trim() || null,
                })
              }
            />
          ) : form.phone?.trim() ? (
            <button
              type="button"
              className="text-sm font-medium text-brand hover:underline"
              onClick={() => {
                const dialable = form.phone!.trim().replace(/[\s()-]/g, '')
                if (dialable) {
                  void openExternalUrl(`tel:${dialable}`)
                }
              }}
            >
              {form.phone.trim()}
            </button>
          ) : (
            <p className="text-sm text-ink">{dash(null)}</p>
          )}
        </div>

        {editing ? (
          <div>
            <div className="mb-1 flex items-center gap-1.5">
              <span className={KOL_DETAIL_LABEL_CLASS}>{t('admin.kol.col.tier')}</span>
              <button
                type="button"
                className="text-muted hover:text-brand"
                title={t('admin.kolDetail.criteria.openButton')}
                aria-label={t('admin.kolDetail.criteria.openButton')}
                onClick={onOpenCriteria}
              >
                <InfoGlyph className="size-3.5" />
              </button>
            </div>
            <CrmFilterSelect
              className="w-full"
              value={form.tier ?? ''}
              options={tierOptions}
              ariaLabel={t('admin.kol.col.tier')}
              onChange={(next) =>
                onPatch({ tier: (next || null) as KolTier | null })
              }
            />
          </div>
        ) : null}

        {editing ? (
          <div>
            <div className="mb-1 flex items-center gap-1.5">
              <span className={KOL_DETAIL_LABEL_CLASS}>
                {t('admin.kolDetail.field.rating')}
              </span>
              <button
                type="button"
                className="text-muted hover:text-brand"
                title={t('admin.kolDetail.criteria.openButton')}
                aria-label={t('admin.kolDetail.criteria.openButton')}
                onClick={onOpenCriteria}
              >
                <InfoGlyph className="size-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div
                className="flex items-center gap-0.5"
                onMouseLeave={() => setHoveredRating(null)}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="transition-colors"
                    onMouseEnter={() => setHoveredRating(n)}
                    onClick={() =>
                      onPatch({ rating: form.rating === n ? null : n })
                    }
                  >
                    <StarIcon
                      className={`size-5 ${
                        n <= displayRating
                          ? getRatingStarClass(hoveredRating ?? form.rating)
                          : 'text-ink/20'
                      }`}
                      filled={n <= displayRating}
                    />
                  </button>
                ))}
              </div>
              {displayRating > 0 ? (
                <span
                  className={`text-xs font-medium ${getRatingTextClass(
                    hoveredRating ?? form.rating,
                  )}`}
                >
                  {t(`admin.kol.rating.${hoveredRating ?? form.rating}`)}
                </span>
              ) : null}
            </div>
          </div>
        ) : form.tier ? (
          <div>
            <span className={KOL_DETAIL_LABEL_CLASS}>{t('admin.kol.col.tier')}</span>
            <span
              className={`inline-flex rounded-md px-2.5 py-1 text-sm font-bold ${kolTierBadgeClass(
                form.tier,
              )}`}
            >
              {form.tier}
            </span>
          </div>
        ) : null}
      </div>

      <div>
        <label className={KOL_DETAIL_LABEL_CLASS} htmlFor="kol-info">
          {t('admin.kolDetail.field.info')}
        </label>
        {editing ? (
          <textarea
            id="kol-info"
            rows={3}
            value={form.info ?? ''}
            placeholder={t('admin.kolDetail.field.infoPlaceholder')}
            className={`${KOL_DETAIL_INPUT_CLASS} resize-none`}
            onChange={(event) => onPatch({ info: event.target.value || null })}
          />
        ) : (
          <p className="whitespace-pre-wrap text-sm text-ink">{dash(form.info)}</p>
        )}
      </div>
      <div>
        <label className={KOL_DETAIL_LABEL_CLASS} htmlFor="kol-background">
          {t('admin.kolDetail.field.background')}
        </label>
        {editing ? (
          <textarea
            id="kol-background"
            rows={4}
            value={form.background ?? ''}
            placeholder={t('admin.kolDetail.field.backgroundPlaceholder')}
            className={`${KOL_DETAIL_INPUT_CLASS} resize-none`}
            onChange={(event) =>
              onPatch({ background: event.target.value || null })
            }
          />
        ) : (
          <p className="whitespace-pre-wrap text-sm text-ink">
            {dash(form.background)}
          </p>
        )}
      </div>
      <div>
        <label className={KOL_DETAIL_LABEL_CLASS} htmlFor="kol-remarks">
          {t('admin.kolDetail.field.remarks')}
        </label>
        {editing ? (
          <textarea
            id="kol-remarks"
            rows={3}
            value={form.remarks ?? ''}
            placeholder={t('admin.kolDetail.field.remarksPlaceholder')}
            className={`${KOL_DETAIL_INPUT_CLASS} resize-none`}
            onChange={(event) => onPatch({ remarks: event.target.value || null })}
          />
        ) : (
          <p className="whitespace-pre-wrap text-sm text-ink">
            {dash(form.remarks)}
          </p>
        )}
      </div>
    </div>
  )
}
