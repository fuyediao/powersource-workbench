/**
 * Social platform + account rows for a lead contact card (web LeadSocialAccountsEditor parity).
 */

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { LeadSocialPlatformChip } from '@/components/admin/lead-social-platform-chip'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import {
  LEAD_SOCIAL_PLATFORM_OTHER_ID,
  LEAD_SOCIAL_PLATFORM_SEARCH_EXTRA,
  LEAD_SOCIAL_PLATFORMS,
} from '@/constants/lead-social-platforms'
import { MinusIcon, PlusIcon } from '@/icons/AllIcons'
import type { LeadSocialAccountEntry } from '@/types/lead'
import { emptyLeadSocialAccountRow } from '@/utils/lead-extended-fields'

const inputClass =
  'w-full rounded-2xl border border-ink/10 bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5'

interface LeadSocialAccountsEditorProps {
  value: LeadSocialAccountEntry[]
  onChange: (next: LeadSocialAccountEntry[]) => void
  disabled?: boolean
}

/**
 * True when a platform is set but the account handle is still empty.
 * @param row - One editor row.
 * @returns Whether to show invalid styling.
 */
function rowMissingAccount(row: LeadSocialAccountEntry): boolean {
  return row.platform.trim() !== '' && row.account.trim() === ''
}

/**
 * Editable list of social platform + account rows.
 * @param props - Rows, change handler, disabled flag.
 * @returns Editor UI.
 */
export function LeadSocialAccountsEditor({
  value,
  onChange,
  disabled = false,
}: LeadSocialAccountsEditorProps) {
  const { t } = useTranslation()
  const rows = value.length > 0 ? value : [emptyLeadSocialAccountRow()]

  const platformOptions = useMemo(
    () => [
      { value: '', label: t('admin.leadsTable.form.socialPlatformClear') },
      ...LEAD_SOCIAL_PLATFORMS.map((platform) => ({
        value: platform.id,
        label: t(`admin.leadsTable.form.socialPlatformOption.${platform.id}`),
      })),
    ],
    [t],
  )

  /**
   * Replaces one row immutably.
   * @param index - Row index.
   * @param patch - Fields to merge.
   */
  function patchRow(index: number, patch: Partial<LeadSocialAccountEntry>): void {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  return (
    <div className="space-y-3">
      {rows.map((row, idx) => (
        <div key={`${row.platform}-${idx}`} className="space-y-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
            <CrmFilterSelect
              className="w-full"
              value={row.platform}
              options={platformOptions}
              searchable
              placeholder={t('admin.leadsTable.form.socialPlatformPlaceholder')}
              searchPlaceholder={t('admin.leadsTable.form.socialPlatformSearchPlaceholder')}
              closeAriaLabel={t('admin.leadsTable.form.socialPlatformClosePicker')}
              emptyLabel={t('admin.leadsTable.form.socialPlatformNoMatch')}
              ariaLabel={t('admin.leadsTable.form.field.socialPlatform')}
              renderLeading={(option, surface) =>
                option.value ? (
                  <LeadSocialPlatformChip
                    platformId={option.value}
                    size={surface === 'trigger' ? 'trigger' : 'list'}
                  />
                ) : null
              }
              filterOption={(option, query) => {
                const needle = query.toLowerCase()
                if (option.label.toLowerCase().includes(needle) || option.value.toLowerCase().includes(needle)) {
                  return true
                }
                const extra = LEAD_SOCIAL_PLATFORM_SEARCH_EXTRA[option.value]
                return extra?.some((token) => token.toLowerCase().includes(needle)) ?? false
              }}
              onChange={(next) => {
                patchRow(idx, {
                  platform: next,
                  custom: next === LEAD_SOCIAL_PLATFORM_OTHER_ID ? (row.custom ?? '') : '',
                })
              }}
            />
            <input
              type="text"
              value={row.account}
              readOnly={disabled}
              placeholder={t('admin.leadsTable.form.socialAccountHandlePlaceholder')}
              aria-invalid={rowMissingAccount(row)}
              className={`${inputClass} ${rowMissingAccount(row) ? 'border-rose-400/60' : ''}`}
              onChange={(e) => patchRow(idx, { account: e.target.value })}
            />
            <div className="flex shrink-0 items-center gap-1.5">
              {rows.length > 1 ? (
                <button
                  type="button"
                  className="rounded-xl p-2 text-muted hover:bg-rose-500/10 hover:text-rose-500"
                  title={t('admin.leadsTable.form.removeSocialAccountRow')}
                  aria-label={t('admin.leadsTable.form.removeSocialAccountRow')}
                  onClick={() => {
                    if (rows.length <= 1) return
                    onChange(rows.filter((_, i) => i !== idx))
                  }}
                >
                  <MinusIcon className="size-4" />
                </button>
              ) : (
                <span className="size-8" aria-hidden />
              )}
              {idx === rows.length - 1 ? (
                <button
                  type="button"
                  disabled={disabled}
                  className="rounded-xl p-2 text-brand hover:bg-brand/10 disabled:opacity-40"
                  title={t('admin.leadsTable.form.addSocialAccountRow')}
                  aria-label={t('admin.leadsTable.form.addSocialAccountRow')}
                  onClick={() => onChange([...rows, emptyLeadSocialAccountRow()])}
                >
                  <PlusIcon className="size-4" />
                </button>
              ) : (
                <span className="size-8" aria-hidden />
              )}
            </div>
          </div>
          {row.platform === LEAD_SOCIAL_PLATFORM_OTHER_ID ? (
            <input
              type="text"
              value={row.custom ?? ''}
              readOnly={disabled}
              placeholder={t('admin.leadsTable.form.socialPlatformCustomPlaceholder')}
              className={inputClass}
              onChange={(e) => patchRow(idx, { custom: e.target.value })}
            />
          ) : null}
        </div>
      ))}
    </div>
  )
}
