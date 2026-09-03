/**
 * NEXDOT dealer shipping / billing addresses panel.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { CountryFlag } from '@/components/common/country-flag'
import {
  CrmFilterSelect,
  type CrmFilterOption,
} from '@/components/common/crm-filter-select'
import { PhoneInput } from '@/components/settings/phone-input'
import { COUNTRY_OPTIONS } from '@/constants/countries'
import { PlusIcon, TrashIcon } from '@/icons/AllIcons'
import {
  createShopDealerAddress,
  deleteShopDealerAddress,
  listShopDealerAddresses,
  updateShopDealerAddress,
  type ShopDealerAddress,
  type ShopDealerAddressInput,
} from '@/services/shop-dealer-api'
import { countryMatchesSearch } from '@/utils/map/country-alpha2'

interface NexdotDealerAddressesPanelProps {
  workspaceGroupId: string
  dealerId: string
  canEdit: boolean
}

type AddressType = 'shipping' | 'billing'

/**
 * Empty address form draft.
 * @param addressType - Shipping or billing.
 * @returns Form input.
 */
function emptyDraft(addressType: AddressType): ShopDealerAddressInput {
  return {
    addressType,
    firstName: '',
    lastName: '',
    phone: '',
    phoneCountry: 'US',
    email: '',
    country: '',
    city: '',
    state: '',
    postalCode: '',
    line1: '',
    line2: '',
  }
}

/**
 * Dealer B2B addresses (shipping + billing).
 * @param props - Workspace, dealer, edit gate.
 * @returns Addresses UI.
 */
export function NexdotDealerAddressesPanel({
  workspaceGroupId,
  dealerId,
  canEdit,
}: NexdotDealerAddressesPanelProps): ReactNode {
  const { t } = useTranslation()
  const [addresses, setAddresses] = useState<ShopDealerAddress[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editor, setEditor] = useState<{
    mode: 'create' | 'edit'
    addressType: AddressType
    addressId?: string
    draft: ShopDealerAddressInput
  } | null>(null)
  const [saving, setSaving] = useState(false)

  const countryOptions = useMemo<CrmFilterOption[]>(
    () => [
      { value: '', label: t('admin.customers.form.selectPlaceholder') },
      ...COUNTRY_OPTIONS.map((name) => ({ value: name, label: name })),
    ],
    [t],
  )

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setAddresses(await listShopDealerAddresses(workspaceGroupId, dealerId))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.obmUsers.loading'))
      setAddresses([])
    } finally {
      setLoading(false)
    }
  }, [dealerId, t, workspaceGroupId])

  useEffect(() => {
    void load()
  }, [load])

  const shipping = addresses.filter((a) => a.addressType === 'shipping')
  const billing = addresses.filter((a) => a.addressType === 'billing')

  /**
   * Opens create form for a section.
   * @param addressType - Target type.
   */
  function openCreate(addressType: AddressType): void {
    setEditor({ mode: 'create', addressType, draft: emptyDraft(addressType) })
  }

  /**
   * Opens edit form for an existing address.
   * @param row - Address row.
   */
  function openEdit(row: ShopDealerAddress): void {
    setEditor({
      mode: 'edit',
      addressType: row.addressType,
      addressId: row.id,
      draft: {
        addressType: row.addressType,
        firstName: row.firstName,
        lastName: row.lastName,
        phone: row.phone,
        phoneCountry: row.phoneCountry || 'US',
        email: row.email,
        country: row.country,
        city: row.city,
        state: row.state,
        postalCode: row.postalCode,
        line1: row.line1,
        line2: row.line2,
      },
    })
  }

  /**
   * Saves create/edit draft.
   * @returns void
   */
  async function onSave(): Promise<void> {
    if (!editor || saving) return
    const d = editor.draft
    if (
      !d.firstName.trim() ||
      !d.lastName.trim() ||
      !d.phone.trim() ||
      !d.country.trim() ||
      !d.city.trim() ||
      !d.state.trim() ||
      !d.postalCode.trim() ||
      !d.line1.trim()
    ) {
      setError(t('admin.obmUsers.addressFieldsRequired'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload: ShopDealerAddressInput = {
        ...d,
        firstName: d.firstName.trim(),
        lastName: d.lastName.trim(),
        phone: d.phone.trim(),
        email: d.email?.trim() || undefined,
        line2: d.line2?.trim() || undefined,
      }
      if (editor.mode === 'create') {
        await createShopDealerAddress(workspaceGroupId, dealerId, payload)
      } else if (editor.addressId) {
        await updateShopDealerAddress(
          workspaceGroupId,
          dealerId,
          editor.addressId,
          payload,
        )
      }
      setEditor(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.obmUsers.loading'))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Deletes an address after confirm.
   * @param row - Target address.
   */
  async function onDelete(row: ShopDealerAddress): Promise<void> {
    if (!canEdit) return
    if (!window.confirm(t('admin.obmUsers.addressDeleteConfirm'))) return
    setSaving(true)
    try {
      await deleteShopDealerAddress(workspaceGroupId, dealerId, row.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.obmUsers.loading'))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Renders one address section list.
   * @param addressType - Section type.
   * @param rows - Rows for the section.
   * @returns Section UI.
   */
  function renderSection(
    addressType: AddressType,
    rows: ShopDealerAddress[],
  ): ReactNode {
    const title =
      addressType === 'shipping'
        ? t('admin.obmUsers.addressSectionShipping')
        : t('admin.obmUsers.addressSectionBilling')
    const addLabel =
      addressType === 'shipping'
        ? t('admin.obmUsers.addressAddShipping')
        : t('admin.obmUsers.addressAddBilling')
    const empty =
      addressType === 'shipping'
        ? t('admin.obmUsers.addressEmptyShipping')
        : t('admin.obmUsers.addressEmptyBilling')

    return (
      <section className="overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm dark:bg-zinc-950">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 px-4 py-3">
          <h3 className="text-sm font-bold text-ink">{title}</h3>
          {canEdit ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-brand-fg"
              onClick={() => openCreate(addressType)}
            >
              <PlusIcon className="size-3.5" />
              {addLabel}
            </button>
          ) : null}
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">{empty}</p>
        ) : (
          <ul className="divide-y divide-ink/10">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0 text-sm text-ink">
                  <p className="font-semibold">
                    {row.firstName} {row.lastName}
                  </p>
                  <p className="text-muted">
                    {row.line1}
                    {row.line2 ? `, ${row.line2}` : ''}
                  </p>
                  <p className="text-muted">
                    {row.city}, {row.state} {row.postalCode}
                  </p>
                  <p className="flex items-center gap-1.5 text-muted">
                    <CountryFlag countryName={row.country} size={14} />
                    {row.country}
                  </p>
                  <p className="text-muted">{row.phone}</p>
                </div>
                {canEdit ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-ink/15 px-2 py-1 text-xs font-semibold"
                      onClick={() => openEdit(row)}
                    >
                      {t('admin.obm.footerEdit')}
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 text-rose-500 hover:bg-rose-500/10"
                      disabled={saving}
                      onClick={() => void onDelete(row)}
                    >
                      <TrashIcon className="size-4" />
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    )
  }

  if (loading) {
    return <p className="text-sm font-medium text-ink">{t('admin.obmUsers.loading')}</p>
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-rose-500">{error}</p> : null}
      {renderSection('shipping', shipping)}
      {renderSection('billing', billing)}

      {editor
        ? createPortal(
            <div className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/40 p-4">
              <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-xl dark:bg-zinc-950">
                <div className="border-b border-ink/10 px-4 py-3">
                  <h3 className="text-sm font-bold text-ink">
                    {editor.mode === 'create'
                      ? editor.addressType === 'shipping'
                        ? t('admin.obmUsers.addressCreateShippingTitle')
                        : t('admin.obmUsers.addressCreateBillingTitle')
                      : editor.addressType === 'shipping'
                        ? t('admin.obmUsers.addressEditShippingTitle')
                        : t('admin.obmUsers.addressEditBillingTitle')}
                  </h3>
                </div>
                <div className="grid gap-3 overflow-auto p-4 sm:grid-cols-2">
                  <Field
                    label={t('admin.obmUsers.addressFirstName')}
                    value={editor.draft.firstName}
                    onChange={(v) =>
                      setEditor({
                        ...editor,
                        draft: { ...editor.draft, firstName: v },
                      })
                    }
                  />
                  <Field
                    label={t('admin.obmUsers.addressLastName')}
                    value={editor.draft.lastName}
                    onChange={(v) =>
                      setEditor({
                        ...editor,
                        draft: { ...editor.draft, lastName: v },
                      })
                    }
                  />
                  <div className="sm:col-span-2">
                    <p className="mb-1 text-xs font-semibold text-muted">
                      {t('admin.obmUsers.addressPhone')}
                    </p>
                    <PhoneInput
                      value={editor.draft.phone}
                      countryCode={editor.draft.phoneCountry}
                      onChange={(nextValue, nextIso) =>
                        setEditor({
                          ...editor,
                          draft: {
                            ...editor.draft,
                            phone: nextValue,
                            phoneCountry: nextIso,
                          },
                        })
                      }
                    />
                  </div>
                  <Field
                    label={`${t('admin.obmUsers.addressEmail')} (${t('admin.obmUsers.addressOptional')})`}
                    value={editor.draft.email ?? ''}
                    onChange={(v) =>
                      setEditor({
                        ...editor,
                        draft: { ...editor.draft, email: v },
                      })
                    }
                  />
                  <div className="min-w-0">
                    <p className="mb-1 text-xs font-semibold text-muted">
                      {t('admin.obmUsers.addressColCountry')}
                    </p>
                    <CrmFilterSelect
                      className="w-full"
                      value={editor.draft.country}
                      options={countryOptions}
                      searchable
                      searchPlaceholder={t(
                        'admin.customers.form.countrySearchPlaceholder',
                      )}
                      closeAriaLabel={t('common.inlineSearchComboboxClose')}
                      emptyLabel={t('admin.customers.form.noMatchingCountries')}
                      ariaLabel={t('admin.obmUsers.addressColCountry')}
                      renderLeading={(option) =>
                        option.value ? (
                          <CountryFlag countryName={option.value} size={16} />
                        ) : null
                      }
                      filterOption={(option, query) =>
                        countryMatchesSearch(option.value, query) ||
                        option.label.toLowerCase().includes(query.toLowerCase())
                      }
                      onChange={(next) =>
                        setEditor({
                          ...editor,
                          draft: { ...editor.draft, country: next },
                        })
                      }
                    />
                  </div>
                  <Field
                    label={t('admin.obmUsers.addressCity')}
                    value={editor.draft.city}
                    onChange={(v) =>
                      setEditor({ ...editor, draft: { ...editor.draft, city: v } })
                    }
                  />
                  <Field
                    label={t('admin.obmUsers.addressState')}
                    value={editor.draft.state}
                    onChange={(v) =>
                      setEditor({ ...editor, draft: { ...editor.draft, state: v } })
                    }
                  />
                  <Field
                    label={t('admin.obmUsers.addressPostal')}
                    value={editor.draft.postalCode}
                    onChange={(v) =>
                      setEditor({
                        ...editor,
                        draft: { ...editor.draft, postalCode: v },
                      })
                    }
                  />
                  <Field
                    label={t('admin.obmUsers.addressLine1')}
                    value={editor.draft.line1}
                    onChange={(v) =>
                      setEditor({ ...editor, draft: { ...editor.draft, line1: v } })
                    }
                    className="sm:col-span-2"
                  />
                  <Field
                    label={`${t('admin.obmUsers.addressLine2')} (${t('admin.obmUsers.addressOptional')})`}
                    value={editor.draft.line2 ?? ''}
                    onChange={(v) =>
                      setEditor({ ...editor, draft: { ...editor.draft, line2: v } })
                    }
                    className="sm:col-span-2"
                  />
                </div>
                <div className="flex justify-end gap-2 border-t border-ink/10 px-4 py-3">
                  <button
                    type="button"
                    className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-bold"
                    onClick={() => setEditor(null)}
                  >
                    {t('admin.obmUsers.addressCancel')}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-brand-fg disabled:opacity-50"
                    disabled={saving}
                    onClick={() => void onSave()}
                  >
                    {t('admin.obmUsers.addressSave')}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

interface FieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  className?: string
}

/**
 * Simple labeled text field.
 * @param props - Label and value.
 * @returns Field UI.
 */
function Field({ label, value, onChange, className = '' }: FieldProps): ReactNode {
  return (
    <label className={`block text-xs font-semibold text-muted ${className}`.trim()}>
      {label}
      <input
        className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-sm font-medium text-ink dark:bg-zinc-900"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}
