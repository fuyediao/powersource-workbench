/**
 * Specific-info long-text fields with optional inline edit.
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  dash,
  detailSectionCardClass,
} from '@/components/admin/customer-detail/detail-shared'
import { PencilIcon } from '@/icons/AllIcons'
import { updateCustomerSpecificInfo } from '@/services/customers-api'
import type {
  CustomerDetail,
  CustomerSpecificInfoFields,
} from '@/types/customer'

interface SpecificInfoPanelProps {
  customer: CustomerDetail
  canEdit: boolean
  onSaved: (customer: CustomerDetail) => void
}

const SPECIFIC_INFO_KEYS: Array<keyof CustomerSpecificInfoFields> = [
  'marketRegionPopulation',
  'businessTypeChannel',
  'salesProductBrand',
  'managementPhilosophy',
  'managementDirection',
  'managementPolicy',
  'managementCharacteristics',
  'salesCapability',
  'developmentPotential',
  'ownerFutureOutlook',
  'companyStrategy',
  'orderDiscount',
  'procurementAmountProductStatus',
  'companyBusinessStatus',
  'transactionStatus',
  'yearlySalesActivityStatusIssues',
  'cooperationStatusStrategy',
]

const fieldClass =
  'min-h-20 w-full resize-y rounded-xl border border-ink/10 bg-canvas px-3 py-2 text-sm font-medium text-ink outline-none focus:border-brand disabled:opacity-50'

/**
 * Builds a form draft from a customer row.
 * @param customer - Detail row.
 * @returns Specific-info draft.
 */
function draftFromCustomer(customer: CustomerDetail): CustomerSpecificInfoFields {
  const draft: CustomerSpecificInfoFields = {}
  for (const key of SPECIFIC_INFO_KEYS) {
    draft[key] = customer[key] ?? ''
  }
  return draft
}

/**
 * Specific-info tab with read-only view and optional edit/save.
 * @param props - Customer, edit gate, save callback.
 * @returns Panel UI.
 */
export function SpecificInfoPanel({
  customer,
  canEdit,
  onSaved,
}: SpecificInfoPanelProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<CustomerSpecificInfoFields>(() =>
    draftFromCustomer(customer),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!editing) {
      setDraft(draftFromCustomer(customer))
    }
  }, [customer, editing])

  /**
   * Enters edit mode.
   * @returns Nothing.
   */
  function startEdit(): void {
    if (!canEdit) {
      return
    }
    setError(null)
    setDraft(draftFromCustomer(customer))
    setEditing(true)
  }

  /**
   * Cancels edit and restores draft from customer.
   * @returns Nothing.
   */
  function cancelEdit(): void {
    setEditing(false)
    setError(null)
    setDraft(draftFromCustomer(customer))
  }

  /**
   * Persists specific-info fields.
   * @returns Nothing.
   */
  async function save(): Promise<void> {
    if (!canEdit || saving) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      const next = await updateCustomerSpecificInfo(customer.id, draft)
      onSaved(next)
      setEditing(false)
    } catch (err) {
      console.error('[SpecificInfoPanel] save:', err)
      setError(t('admin.customers.errorUpdate'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={detailSectionCardClass()}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold text-ink">
          {t('admin.customers.detail.specificInfo.sectionTitle')}
        </h3>
        {canEdit ? (
          editing ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-2xl bg-zinc-950/5 px-3 py-1.5 text-xs font-bold text-brand dark:bg-white/10"
                disabled={saving}
                onClick={cancelEdit}
              >
                {t('admin.customers.modal.cancel')}
              </button>
              <button
                type="button"
                className="rounded-2xl bg-brand px-3 py-1.5 text-xs font-bold text-brand-fg disabled:opacity-50"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving
                  ? t('admin.customers.modal.saving')
                  : t('admin.customers.modal.save')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-2xl bg-brand/10 px-3 py-1.5 text-xs font-bold text-brand"
              onClick={startEdit}
            >
              <PencilIcon className="size-3.5" />
              {t('admin.customers.editButton')}
            </button>
          )
        ) : null}
      </div>

      {error ? (
        <p className="mb-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-600">
          {error}
        </p>
      ) : null}

      <div className="space-y-4">
        {SPECIFIC_INFO_KEYS.map((key) => {
          const label = t(`admin.customers.detail.specificInfo.${key}`)
          const value = draft[key] ?? ''
          return (
            <div key={key}>
              <p className="mb-1 text-xs font-semibold text-muted">{label}</p>
              {editing ? (
                <textarea
                  className={fieldClass}
                  value={value}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  disabled={saving}
                />
              ) : (
                <p className="whitespace-pre-wrap text-sm font-medium text-ink">
                  {dash(customer[key])}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
