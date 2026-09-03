/**
 * KOL performance tab: orders, amount, promo, engagement, history links.
 */

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { dash, detailSectionCardClass } from '@/components/admin/customer-detail/detail-shared'
import {
  formatCooperationYearsForInput,
  KOL_DETAIL_INPUT_CLASS,
  KOL_DETAIL_LABEL_CLASS,
  parseCooperationYearsFromInput,
} from '@/components/admin/kol-detail/detail-shared'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import { CloseIcon, LinkIcon, PlusIcon } from '@/icons/AllIcons'
import { useLinkOpen } from '@/hooks/link-open-context'
import { CRM_CURRENCY_OPTIONS } from '@/types/opportunity'
import type { KolFormInput } from '@/types/kol'

interface PerformancePanelProps {
  form: KolFormInput
  editing: boolean
  onPatch: (patch: Partial<KolFormInput>) => void
}

/**
 * Performance metrics and collaboration history links.
 * @param props - Form state, edit flag, and patch.
 * @returns Panel UI.
 */
export function PerformancePanel({
  form,
  editing,
  onPatch,
}: PerformancePanelProps) {
  const { t } = useTranslation()
  const { openUrl } = useLinkOpen()
  const [newLink, setNewLink] = useState('')
  const [yearsText, setYearsText] = useState(() =>
    formatCooperationYearsForInput(form.cooperationYears),
  )

  useEffect(() => {
    if (!editing) {
      setYearsText(formatCooperationYearsForInput(form.cooperationYears))
    }
  }, [editing, form.cooperationYears])

  const currencyOptions = useMemo(
    () => CRM_CURRENCY_OPTIONS.map((code) => ({ value: code, label: code })),
    [],
  )

  /**
   * Appends a history URL when the input is non-empty.
   * @returns Nothing.
   */
  function addLink(): void {
    const trimmed = newLink.trim()
    if (!trimmed) {
      return
    }
    onPatch({ historyLinks: [...(form.historyLinks ?? []), trimmed] })
    setNewLink('')
  }

  return (
    <div className={`${detailSectionCardClass()} space-y-6`}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={KOL_DETAIL_LABEL_CLASS} htmlFor="kol-order-count">
            {t('admin.kolDetail.field.orderCount')}
          </label>
          {editing ? (
            <input
              id="kol-order-count"
              type="number"
              min={0}
              value={form.orderCount ?? 0}
              className={KOL_DETAIL_INPUT_CLASS}
              onChange={(event) =>
                onPatch({ orderCount: Number(event.target.value) || 0 })
              }
            />
          ) : (
            <p className="text-sm text-ink">{dash(form.orderCount)}</p>
          )}
        </div>
        <div>
          <label className={KOL_DETAIL_LABEL_CLASS} htmlFor="kol-total-amount">
            {t('admin.kolDetail.field.totalAmount')}
          </label>
          {editing ? (
            <div className="flex gap-2">
              <input
                id="kol-total-amount"
                type="number"
                min={0}
                step="0.01"
                value={form.totalAmount ?? 0}
                className={`${KOL_DETAIL_INPUT_CLASS} flex-1`}
                onChange={(event) =>
                  onPatch({ totalAmount: Number(event.target.value) || 0 })
                }
              />
              <CrmFilterSelect
                className="w-28 shrink-0"
                value={form.totalAmountCurrency ?? ''}
                options={currencyOptions}
                searchable
                ariaLabel={t('admin.kolDetail.field.totalAmount')}
                onChange={(next) => onPatch({ totalAmountCurrency: next })}
              />
            </div>
          ) : (
            <p className="text-sm text-ink">
              {(form.totalAmount ?? 0).toLocaleString()}{' '}
              <span className="text-brand">{form.totalAmountCurrency}</span>
            </p>
          )}
        </div>
        <div>
          <label className={KOL_DETAIL_LABEL_CLASS} htmlFor="kol-promo">
            {t('admin.kolDetail.field.promoCode')}
          </label>
          {editing ? (
            <input
              id="kol-promo"
              type="text"
              value={form.promoCode ?? ''}
              placeholder="KOLCODE2026"
              className={KOL_DETAIL_INPUT_CLASS}
              onChange={(event) =>
                onPatch({ promoCode: event.target.value.trim() || null })
              }
            />
          ) : (
            <p className="text-sm text-ink">{dash(form.promoCode)}</p>
          )}
        </div>
        <div>
          <label className={KOL_DETAIL_LABEL_CLASS} htmlFor="kol-engagement">
            {t('admin.kolDetail.field.engagementRate')} (%)
          </label>
          {editing ? (
            <input
              id="kol-engagement"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={form.engagementRate ?? ''}
              className={KOL_DETAIL_INPUT_CLASS}
              onChange={(event) => {
                const raw = event.target.value.trim()
                onPatch({
                  engagementRate: raw ? Number(raw) : null,
                })
              }}
            />
          ) : (
            <p className="text-sm text-ink">{dash(form.engagementRate)}</p>
          )}
        </div>
        <div>
          <label className={KOL_DETAIL_LABEL_CLASS} htmlFor="kol-view-count">
            {t('admin.kolDetail.field.viewCount')}
          </label>
          {editing ? (
            <input
              id="kol-view-count"
              type="number"
              min={0}
              value={form.viewCount ?? ''}
              className={KOL_DETAIL_INPUT_CLASS}
              onChange={(event) => {
                const raw = event.target.value.trim()
                onPatch({ viewCount: raw ? Number(raw) : null })
              }}
            />
          ) : (
            <p className="text-sm text-ink">{dash(form.viewCount)}</p>
          )}
        </div>
        <div>
          <label className={KOL_DETAIL_LABEL_CLASS} htmlFor="kol-coop-years">
            {t('admin.kolDetail.field.cooperationYears')}
          </label>
          {editing ? (
            <input
              id="kol-coop-years"
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              value={yearsText}
              placeholder={t('admin.kolDetail.field.cooperationYearsPlaceholder')}
              className={KOL_DETAIL_INPUT_CLASS}
              onChange={(event) => {
                setYearsText(event.target.value)
                onPatch({
                  cooperationYears: parseCooperationYearsFromInput(
                    event.target.value,
                  ),
                })
              }}
            />
          ) : (
            <p className="text-sm text-ink">
              {dash(formatCooperationYearsForInput(form.cooperationYears))}
            </p>
          )}
        </div>
      </div>

      <div>
        <label className={`${KOL_DETAIL_LABEL_CLASS} mb-2`}>
          {t('admin.kolDetail.field.historyLinks')}
        </label>
        <div className="space-y-2">
          {(form.historyLinks ?? []).map((link, idx) => (
            <div
              key={`${link}-${idx}`}
              className="flex items-center gap-2 rounded-2xl border border-ink/10 bg-white/70 px-3 py-2"
            >
              <LinkIcon className="size-3 shrink-0 text-muted" />
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-xs text-brand hover:underline"
                onClick={() => openUrl(link)}
              >
                {link}
              </button>
              {editing ? (
                <button
                  type="button"
                  className="text-muted hover:text-rose-500"
                  onClick={() =>
                    onPatch({
                      historyLinks: (form.historyLinks ?? []).filter(
                        (_, i) => i !== idx,
                      ),
                    })
                  }
                >
                  <CloseIcon className="size-3.5" />
                </button>
              ) : null}
            </div>
          ))}
          {editing ? (
            <div className="flex gap-2">
              <input
                type="url"
                value={newLink}
                placeholder="https://..."
                className={`${KOL_DETAIL_INPUT_CLASS} flex-1 text-xs`}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addLink()
                  }
                }}
                onChange={(event) => setNewLink(event.target.value)}
              />
              <button
                type="button"
                disabled={!newLink.trim()}
                className="rounded-xl bg-brand/15 px-3 py-2 text-xs font-semibold text-brand disabled:opacity-40"
                onClick={addLink}
              >
                <PlusIcon className="size-3.5" />
              </button>
            </div>
          ) : null}
          {!editing && (form.historyLinks ?? []).length === 0 ? (
            <p className="text-xs italic text-muted">—</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
