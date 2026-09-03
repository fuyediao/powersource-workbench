/**
 * Customer contacts CRUD list + modal (web CustomerDetail contacts tab parity).
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import {
  dash,
  detailSectionCardClass,
} from '@/components/admin/customer-detail/detail-shared'
import { PhoneInput } from '@/components/settings/phone-input'
import { useCustomerTabCache } from '@/hooks/use-customer-tab-cache'
import { CloseIcon, PencilIcon, PlusIcon, TrashIcon } from '@/icons/AllIcons'
import {
  createCustomerContact,
  deleteCustomerContact,
  listCustomerContacts,
  updateCustomerContact,
} from '@/services/customer-contacts-api'
import type { CustomerContact, CustomerContactInput } from '@/types/customer'
import { openMailCompose } from '@/utils/mail/mail-compose-request'
import { openExternalUrl } from '@/utils/shared/api'
import { resolvePhoneCountryIso } from '@/utils/settings/phone-number-parts'
import { isEmailOptionalOrValid } from '@/utils/validation'

interface ContactsPanelProps {
  customerId: string
  groupId: string | null
  writes: AdminShellWrites | null
}

const fieldClass =
  'h-11 w-full rounded-2xl border border-ink/10 bg-white/60 px-3 text-sm font-medium leading-none text-ink outline-none transition focus:border-brand disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/40'

const areaClass =
  'min-h-16 w-full resize-y rounded-2xl border border-ink/10 bg-white/60 px-3 py-2.5 text-sm font-medium text-ink outline-none transition focus:border-brand disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/40'

/**
 * Builds a `tel:` URI for OS dialers (Windows Phone Link, macOS Phone).
 * @param raw - Display phone string.
 * @returns `tel:+…` or null when empty.
 */
function toTelHref(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) {
    return null
  }
  const dialable = trimmed.replace(/[\s()-]/g, '')
  if (!dialable) {
    return null
  }
  return `tel:${dialable}`
}

/**
 * Clickable phone that opens the OS telephony handler.
 * @param props - Display value.
 * @returns Button or dash.
 */
function TelLink({ value }: { value: string | null }): ReactNode {
  const href = toTelHref(value)
  if (!href || !value?.trim()) {
    return dash(null)
  }
  return (
    <button
      type="button"
      className="font-medium text-brand hover:underline"
      onClick={() => {
        void openExternalUrl(href)
      }}
    >
      {value.trim()}
    </button>
  )
}

/**
 * Empty contact form.
 * @returns Blank contact input.
 */
function emptyContact(): CustomerContactInput {
  return {
    name: '',
    title: '',
    email: '',
    phone: '',
    phoneCountry: '',
    mobile: '',
    mobileCountry: '',
    remarks: '',
  }
}

/**
 * Save enabled when name is set and at least one contact channel is filled.
 * @param form - Draft contact.
 * @returns Whether Save may proceed.
 */
function canSaveContact(form: CustomerContactInput): boolean {
  const hasName = form.name.trim() !== ''
  const hasChannel =
    (form.email ?? '').trim() !== '' ||
    (form.phone ?? '').trim() !== '' ||
    (form.mobile ?? '').trim() !== ''
  return hasName && hasChannel
}

/**
 * Contacts tab with table list, modal form, and delete confirm (web parity).
 * @param props - Customer id, group, write gates.
 * @returns Panel UI.
 */
export function ContactsPanel({
  customerId,
  groupId,
  writes,
}: ContactsPanelProps) {
  const { t } = useTranslation()
  const canCreate = Boolean(writes?.canCreate)
  const canEdit = Boolean(writes?.canEdit)
  const canDelete = Boolean(writes?.canDelete)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<CustomerContact | null>(null)
  const [form, setForm] = useState<CustomerContactInput>(emptyContact)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CustomerContact | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchContacts = useCallback(
    () => listCustomerContacts(customerId),
    [customerId],
  )

  const {
    data: rowsData,
    loading,
    error: loadError,
    reload,
  } = useCustomerTabCache(
    customerId,
    'contacts',
    fetchContacts,
    t('admin.customers.detail.errorLoadContacts'),
  )
  const rows = rowsData ?? []
  const error = formError ?? loadError
  const saveEnabled = canSaveContact(form)

  /**
   * Opens create dialog.
   * @returns Nothing.
   */
  function openCreate(): void {
    if (!canCreate) {
      return
    }
    setEditing(null)
    setForm(emptyContact())
    setFormError(null)
    setOpen(true)
  }

  /**
   * Opens edit dialog with ISO country hydration.
   * @param row - Contact.
   * @returns Nothing.
   */
  function openEdit(row: CustomerContact): void {
    if (!canEdit) {
      return
    }
    setEditing(row)
    setForm({
      name: row.name,
      title: row.title ?? '',
      email: row.email ?? '',
      phone: row.phone ?? '',
      phoneCountry: resolvePhoneCountryIso(row.phoneCountry, row.phone ?? ''),
      mobile: row.mobile ?? '',
      mobileCountry: resolvePhoneCountryIso(row.mobileCountry, row.mobile ?? ''),
      remarks: row.remarks ?? '',
    })
    setFormError(null)
    setOpen(true)
  }

  /**
   * Closes the create/edit modal.
   * @returns Nothing.
   */
  function closeModal(): void {
    setOpen(false)
    setFormError(null)
  }

  /**
   * Saves create/edit after validation.
   * @returns Nothing.
   */
  async function save(): Promise<void> {
    if (!saveEnabled || saving) {
      return
    }
    if (!isEmailOptionalOrValid(form.email)) {
      setFormError(t('admin.validation.emailInvalid'))
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      if (editing) {
        await updateCustomerContact(editing.id, form)
      } else {
        await createCustomerContact(customerId, groupId, form)
      }
      closeModal()
      await reload()
    } catch (err) {
      console.error('[ContactsPanel] save:', err)
      setFormError(
        editing
          ? t('admin.customers.detail.errorUpdateContact')
          : t('admin.customers.detail.errorAddContact'),
      )
    } finally {
      setSaving(false)
    }
  }

  /**
   * Confirms and deletes a contact.
   * @returns Nothing.
   */
  async function confirmDelete(): Promise<void> {
    if (!deleteTarget || deleting) {
      return
    }
    setDeleting(true)
    try {
      await deleteCustomerContact(deleteTarget.id)
      setDeleteTarget(null)
      await reload()
    } catch (err) {
      console.error('[ContactsPanel] delete:', err)
      setFormError(t('admin.customers.detail.errorDeleteContact'))
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  const title = useMemo(
    () =>
      editing
        ? t('admin.customers.contacts.editTitle')
        : t('admin.customers.contacts.createTitle'),
    [editing, t],
  )

  return (
    <section className={`${detailSectionCardClass()} overflow-hidden p-0`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 px-4 py-3">
        <h3 className="text-sm font-extrabold text-ink">
          {t('admin.customers.detail.tabContacts')}
        </h3>
        {canCreate ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-xl bg-brand px-2.5 py-1.5 text-xs font-bold text-brand-fg"
            onClick={openCreate}
          >
            <PlusIcon className="size-3.5" aria-hidden />
            {t('admin.customers.contacts.addButton')}
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="px-4 pt-3 text-sm font-medium text-rose-500">{error}</p>
      ) : null}
      {loading ? (
        <p className="px-4 py-6 text-sm font-medium text-muted">{t('status.loading')}</p>
      ) : null}

      {!loading && rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm font-medium text-muted">
          {t('admin.customers.contacts.empty')}
        </p>
      ) : null}

      {!loading && rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-ink/10 bg-white/40 text-xs font-semibold text-muted dark:bg-white/5">
              <tr>
                <th className="px-4 py-3 font-semibold">
                  {t('admin.customers.contacts.col.name')}
                </th>
                <th className="hidden px-4 py-3 font-semibold sm:table-cell">
                  {t('admin.customers.contacts.col.title')}
                </th>
                <th className="hidden px-4 py-3 font-semibold md:table-cell">
                  {t('admin.customers.contacts.col.email')}
                </th>
                <th className="hidden px-4 py-3 font-semibold lg:table-cell">
                  {t('admin.customers.contacts.col.phone')}
                </th>
                <th className="px-4 py-3 font-semibold">
                  {t('admin.customers.contacts.col.mobile')}
                </th>
                <th className="px-4 py-3 font-semibold">
                  <span className="sr-only">{t('admin.customers.editButton')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-ink/10 last:border-0 hover:bg-brand/5"
                >
                  <td className="px-4 py-3 font-semibold text-ink">{dash(row.name)}</td>
                  <td className="hidden px-4 py-3 text-ink/80 sm:table-cell">
                    {dash(row.title)}
                  </td>
                  <td className="hidden px-4 py-3 text-ink/80 md:table-cell">
                    {row.email?.trim() ? (
                      <button
                        type="button"
                        className="font-medium text-brand hover:underline"
                        onClick={() => {
                          const email = row.email!.trim()
                          const name = row.name.trim()
                          openMailCompose({
                            to: name ? `${name} <${email}>` : email,
                          })
                        }}
                      >
                        {row.email.trim()}
                      </button>
                    ) : (
                      dash(null)
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-ink/80 lg:table-cell">
                    <TelLink value={row.phone} />
                  </td>
                  <td className="px-4 py-3 text-ink/80">
                    <TelLink value={row.mobile} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {canEdit ? (
                        <button
                          type="button"
                          className="rounded p-1 text-brand hover:bg-brand/10"
                          aria-label={t('admin.customers.editButton')}
                          onClick={() => openEdit(row)}
                        >
                          <PencilIcon className="size-3.5" aria-hidden />
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          className="rounded p-1 text-rose-500 hover:bg-rose-500/10"
                          aria-label={t('admin.customers.deleteButton')}
                          onClick={() => setDeleteTarget(row)}
                        >
                          <TrashIcon className="size-3.5" aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {open
        ? createPortal(
            <div className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-[2px]">
              <div className="w-full max-w-lg rounded-3xl border border-zinc-950/10 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-zinc-950">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="text-base font-extrabold text-ink">{title}</h4>
                  <button
                    type="button"
                    className="rounded-lg p-1 text-muted transition hover:bg-ink/5 hover:text-ink"
                    aria-label={t('admin.customers.contacts.cancel')}
                    onClick={closeModal}
                  >
                    <CloseIcon className="size-4" aria-hidden />
                  </button>
                </div>
                <form
                  className="mt-3 space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void save()
                  }}
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                      <span>
                        {t('admin.customers.contacts.form.name')}{' '}
                        <span className="text-rose-500" aria-hidden>
                          *
                        </span>
                      </span>
                      <input
                        className={fieldClass}
                        value={form.name}
                        required
                        placeholder={t(
                          'admin.customers.contacts.form.namePlaceholder',
                        )}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, name: e.target.value }))
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                      {t('admin.customers.contacts.form.title')}
                      <input
                        className={fieldClass}
                        value={form.title ?? ''}
                        placeholder={t(
                          'admin.customers.contacts.form.titlePlaceholder',
                        )}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, title: e.target.value }))
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-semibold text-muted sm:col-span-2">
                      {t('admin.customers.contacts.form.email')}
                      <input
                        className={fieldClass}
                        type="email"
                        value={form.email ?? ''}
                        placeholder="email@example.com"
                        onChange={(e) =>
                          setForm((f) => ({ ...f, email: e.target.value }))
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                      {t('admin.customers.contacts.form.phone')}
                      <PhoneInput
                        value={form.phone ?? ''}
                        countryCode={form.phoneCountry ?? ''}
                        onChange={(nextValue, nextIso) =>
                          setForm((f) => ({
                            ...f,
                            phone: nextValue,
                            phoneCountry: nextIso,
                          }))
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                      {t('admin.customers.contacts.form.mobile')}
                      <PhoneInput
                        value={form.mobile ?? ''}
                        countryCode={form.mobileCountry ?? ''}
                        onChange={(nextValue, nextIso) =>
                          setForm((f) => ({
                            ...f,
                            mobile: nextValue,
                            mobileCountry: nextIso,
                          }))
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-semibold text-muted sm:col-span-2">
                      {t('admin.customers.contacts.form.remarks')}
                      <textarea
                        className={areaClass}
                        value={form.remarks ?? ''}
                        placeholder={t(
                          'admin.customers.contacts.form.remarksPlaceholder',
                        )}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, remarks: e.target.value }))
                        }
                      />
                    </label>
                  </div>
                  <p className="text-[11px] font-medium text-muted">
                    {t(
                      'admin.customers.contacts.form.atLeastOneContactRequired',
                    )}
                  </p>
                  {formError ? (
                    <p className="text-sm font-medium text-rose-500">{formError}</p>
                  ) : null}
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      className="rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10"
                      onClick={closeModal}
                    >
                      {t('admin.customers.contacts.cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={saving || !saveEnabled}
                      className="rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg disabled:opacity-50"
                    >
                      {saving
                        ? t('admin.customers.contacts.saving')
                        : t('admin.customers.contacts.save')}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}

      {deleteTarget
        ? createPortal(
            <div className="fixed inset-0 z-[130] flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-[2px]">
              <div className="w-full max-w-sm rounded-3xl border border-zinc-950/10 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-zinc-950">
                <h4 className="text-base font-extrabold text-ink">
                  {t('admin.customers.deleteConfirm.title')}
                </h4>
                <p className="mt-2 text-sm font-medium text-muted">
                  {t('admin.customers.contacts.deleteConfirm')}
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-ink dark:bg-white/10"
                    disabled={deleting}
                    onClick={() => setDeleteTarget(null)}
                  >
                    {t('admin.customers.deleteConfirm.cancel')}
                  </button>
                  <button
                    type="button"
                    className="rounded-2xl bg-rose-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                    disabled={deleting}
                    onClick={() => void confirmDelete()}
                  >
                    {deleting
                      ? t('admin.customers.deleteConfirm.deleting')
                      : t('admin.customers.deleteConfirm.confirm')}
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
