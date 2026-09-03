/**
 * Customer addresses CRUD list + modal.
 */

import { useCallback, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { detailSectionCardClass } from '@/components/admin/customer-detail/detail-shared'
import {
  CrmFilterSelect,
  type CrmFilterOption,
} from '@/components/common/crm-filter-select'
import { useCustomerTabCache } from '@/hooks/use-customer-tab-cache'
import { PencilIcon, PlusIcon, TrashIcon } from '@/icons/AllIcons'
import {
  createCustomerAddress,
  deleteCustomerAddress,
  listCustomerAddresses,
  updateCustomerAddress,
} from '@/services/customer-addresses-api'
import type {
  CustomerAddress,
  CustomerAddressInput,
  CustomerAddressType,
} from '@/types/customer'

interface AddressesPanelProps {
  customerId: string
  groupId: string | null
  writes: AdminShellWrites | null
}

const fieldClass =
  'h-11 w-full rounded-2xl border border-ink/10 bg-white/60 px-3 text-sm font-medium leading-none text-ink outline-none transition focus:border-brand disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/40'

/**
 * Empty address form.
 * @returns Blank address input.
 */
function emptyAddress(): CustomerAddressInput {
  return {
    addressType: 'billing',
    country: '',
    city: '',
    state: '',
    postalCode: '',
    district: '',
    line1: '',
    line2: '',
  }
}

/**
 * Builds a one-line address summary.
 * @param row - Address row.
 * @returns Summary text.
 */
function addressSummary(row: CustomerAddress): string {
  return [row.line1, row.line2, row.district, row.state, row.postalCode]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0)
    .join(', ')
}

/**
 * Addresses tab with create/edit/delete.
 * @param props - Customer id, group, write gates.
 * @returns Panel UI.
 */
export function AddressesPanel({
  customerId,
  groupId,
  writes,
}: AddressesPanelProps) {
  const { t } = useTranslation()
  const canCreate = Boolean(writes?.canCreate)
  const canEdit = Boolean(writes?.canEdit)
  const canDelete = Boolean(writes?.canDelete)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<CustomerAddress | null>(null)
  const [form, setForm] = useState<CustomerAddressInput>(emptyAddress)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const addressTypeOptions = useMemo<CrmFilterOption[]>(
    () => [
      {
        value: 'billing',
        label: t('admin.customers.addresses.form.addressTypeBilling'),
      },
      {
        value: 'shipping',
        label: t('admin.customers.addresses.form.addressTypeShipping'),
      },
    ],
    [t],
  )

  const fetchAddresses = useCallback(
    () => listCustomerAddresses(customerId),
    [customerId],
  )

  const {
    data: rowsData,
    loading,
    error: loadError,
    reload,
  } = useCustomerTabCache(
    customerId,
    'addresses',
    fetchAddresses,
    t('admin.customers.errorLoad'),
  )
  const rows = rowsData ?? []
  const error = formError ?? loadError

  /**
   * Opens create dialog.
   * @returns Nothing.
   */
  function openCreate(): void {
    if (!canCreate) {
      return
    }
    setEditing(null)
    setForm(emptyAddress())
    setOpen(true)
  }

  /**
   * Opens edit dialog.
   * @param row - Address.
   * @returns Nothing.
   */
  function openEdit(row: CustomerAddress): void {
    if (!canEdit) {
      return
    }
    setEditing(row)
    setForm({
      addressType: row.addressType,
      country: row.country ?? '',
      city: row.city ?? '',
      state: row.state ?? '',
      postalCode: row.postalCode ?? '',
      district: row.district ?? '',
      line1: row.line1 ?? '',
      line2: row.line2 ?? '',
    })
    setOpen(true)
  }

  /**
   * Saves create/edit.
   * @returns Nothing.
   */
  async function save(): Promise<void> {
    if (saving) {
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      if (editing) {
        await updateCustomerAddress(editing.id, form)
      } else {
        await createCustomerAddress(customerId, groupId, form)
      }
      setOpen(false)
      await reload()
    } catch (err) {
      console.error('[AddressesPanel] save:', err)
      setFormError(t('admin.customers.errorUpdate'))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Deletes an address after confirm.
   * @param row - Address.
   * @returns Nothing.
   */
  async function remove(row: CustomerAddress): Promise<void> {
    if (!canDelete) {
      return
    }
    if (!window.confirm(t('admin.customers.addresses.deleteConfirm'))) {
      return
    }
    try {
      await deleteCustomerAddress(row.id)
      await reload()
    } catch (err) {
      console.error('[AddressesPanel] delete:', err)
      setFormError(t('admin.customers.errorDeleteFailed'))
    }
  }

  /**
   * Label for address type.
   * @param type - billing | shipping.
   * @returns Localized label.
   */
  function typeLabel(type: CustomerAddressType): string {
    return type === 'billing'
      ? t('admin.customers.addresses.form.addressTypeBilling')
      : t('admin.customers.addresses.form.addressTypeShipping')
  }

  return (
    <section className={detailSectionCardClass()}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold text-ink">
          {t('admin.customers.detail.tabAddresses')}
        </h3>
        {canCreate ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-xl bg-brand px-2 py-1 text-xs font-bold text-brand-fg"
            onClick={openCreate}
          >
            <PlusIcon className="size-3.5" />
            {t('admin.customers.addresses.addButton')}
          </button>
        ) : null}
      </div>

      {error ? <p className="mb-2 text-sm font-medium text-rose-500">{error}</p> : null}
      {loading ? (
        <p className="text-sm font-medium text-muted">{t('status.loading')}</p>
      ) : null}

      {!loading && rows.length === 0 ? (
        <p className="text-xs font-medium text-muted">
          {t('admin.customers.addresses.empty')}
        </p>
      ) : null}

      {!loading && rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-xl border border-ink/10 bg-canvas/60 px-2.5 py-2 text-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-ink">{typeLabel(row.addressType)}</p>
                  {row.country ? (
                    <p className="text-muted">{row.country}</p>
                  ) : null}
                  {row.city ? <p className="text-muted">{row.city}</p> : null}
                  <p className="truncate text-muted">
                    {addressSummary(row) || '—'}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {canEdit ? (
                    <button
                      type="button"
                      className="rounded p-1 text-brand hover:bg-brand/10"
                      aria-label={t('admin.customers.editButton')}
                      onClick={() => openEdit(row)}
                    >
                      <PencilIcon className="size-3.5" />
                    </button>
                  ) : null}
                  {canDelete ? (
                    <button
                      type="button"
                      className="rounded p-1 text-rose-500 hover:bg-rose-500/10"
                      aria-label={t('admin.customers.deleteButton')}
                      onClick={() => void remove(row)}
                    >
                      <TrashIcon className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {open
        ? createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/40 p-4">
          <div className="w-full max-w-md rounded-3xl border border-zinc-950/10 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-zinc-950">
            <h4 className="text-base font-extrabold text-ink">
              {editing
                ? t('admin.customers.addresses.editTitle')
                : t('admin.customers.addresses.createTitle')}
            </h4>
            <div className="mt-3 space-y-2">
              <div className="flex flex-col gap-1">
                <p className="text-xs font-semibold text-muted">
                  {t('admin.customers.addresses.form.addressType')}
                </p>
                <CrmFilterSelect
                  value={form.addressType}
                  options={addressTypeOptions}
                  ariaLabel={t('admin.customers.addresses.form.addressType')}
                  onChange={(next) =>
                    setForm((f) => ({
                      ...f,
                      addressType: next as CustomerAddressType,
                    }))
                  }
                />
              </div>
              <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                {t('admin.customers.addresses.form.countryRegion')}
                <input
                  className={fieldClass}
                  value={form.country ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, country: e.target.value }))
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                {t('admin.customers.addresses.form.state')}
                <input
                  className={fieldClass}
                  value={form.state ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, state: e.target.value }))
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                {t('admin.customers.addresses.form.city')}
                <input
                  className={fieldClass}
                  value={form.city ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, city: e.target.value }))
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                {t('admin.customers.addresses.form.postalCode')}
                <input
                  className={fieldClass}
                  value={form.postalCode ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, postalCode: e.target.value }))
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                {t('admin.customers.addresses.form.addressLine1')}
                <input
                  className={fieldClass}
                  value={form.line1 ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, line1: e.target.value }))
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                {t('admin.customers.addresses.form.addressLine2')}
                <input
                  className={fieldClass}
                  value={form.line2 ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, line2: e.target.value }))
                  }
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10"
                onClick={() => setOpen(false)}
              >
                {t('admin.customers.addresses.cancel')}
              </button>
              <button
                type="button"
                disabled={saving}
                className="rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg disabled:opacity-50"
                onClick={() => void save()}
              >
                {saving
                  ? t('admin.customers.addresses.saving')
                  : t('admin.customers.addresses.save')}
              </button>
            </div>
          </div>
        </div>,
            document.body,
          )
        : null}
    </section>
  )
}
