/**
 * Customer channels CRUD list + modal.
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
import { useLinkOpen } from '@/hooks/link-open-context'
import { PencilIcon, PlusIcon, TrashIcon } from '@/icons/AllIcons'
import {
  createCustomerChannel,
  deleteCustomerChannel,
  listCustomerChannels,
  updateCustomerChannel,
} from '@/services/customer-channels-api'
import type {
  CustomerChannel,
  CustomerChannelInput,
  CustomerChannelPlatform,
} from '@/types/customer'
import { ChannelPlatformIcon, normalizeChannelExternalUrl } from '@/utils/channel-platform-icon'
import { getCustomerDetailTabCache } from '@/utils/customer-detail-cache'

interface ChannelsPanelProps {
  customerId: string
  groupId: string | null
  writes: AdminShellWrites | null
  onChannelsChange?: (channels: CustomerChannel[]) => void
}

const PLATFORM_OPTIONS: CustomerChannelPlatform[] = [
  'youtube',
  'facebook',
  'instagram',
  'discord',
  'tiktok',
  'linkedin',
  'twitter-x',
  'line',
  'reddit',
  'other',
]

/** Shared single-line field height — matches `CrmFilterSelect` md trigger. */
const fieldClass =
  'h-11 w-full rounded-2xl border border-ink/10 bg-white/60 px-3 text-sm font-medium leading-none text-ink outline-none transition focus:border-brand disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/40'

/** Multi-line notes field (no fixed height). */
const areaClass =
  'min-h-16 w-full resize-y rounded-2xl border border-ink/10 bg-white/60 px-3 py-2.5 text-sm font-medium text-ink outline-none transition focus:border-brand disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/40'

/**
 * Empty channel form.
 * @returns Blank channel input.
 */
function emptyChannel(): CustomerChannelInput {
  return {
    platformKey: 'youtube',
    platformCustomName: '',
    channelUrl: '',
    notes: '',
  }
}

/**
 * Channels tab with create/edit/delete.
 * @param props - Customer id, group, writes, optional change callback.
 * @returns Panel UI.
 */
export function ChannelsPanel({
  customerId,
  groupId,
  writes,
  onChannelsChange,
}: ChannelsPanelProps) {
  const { t } = useTranslation()
  const { openUrl } = useLinkOpen()
  const canCreate = Boolean(writes?.canCreate)
  const canEdit = Boolean(writes?.canEdit)
  const canDelete = Boolean(writes?.canDelete)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<CustomerChannel | null>(null)
  const [form, setForm] = useState<CustomerChannelInput>(emptyChannel)
  const [saving, setSaving] = useState(false)

  const platformOptions = useMemo<CrmFilterOption[]>(
    () =>
      PLATFORM_OPTIONS.map((key) => ({
        value: key,
        label: t(`admin.customers.channels.platform.${key}`),
      })),
    [t],
  )

  const fetchChannels = useCallback(
    () => listCustomerChannels(customerId),
    [customerId],
  )

  const {
    data: rowsData,
    loading,
    error: loadError,
    reload,
  } = useCustomerTabCache(
    customerId,
    'channels',
    fetchChannels,
    t('admin.customers.errorLoad'),
  )
  const rows = rowsData ?? []
  const [formError, setFormError] = useState<string | null>(null)
  const error = formError ?? loadError

  /**
   * Platform display label.
   * @param key - Platform key.
   * @param customName - Custom name when platform is other.
   * @returns Label.
   */
  function platformLabel(key: string, customName: string | null): string {
    if (key === 'other') {
      return customName?.trim() || t('admin.customers.channels.platform.other')
    }
    return t(`admin.customers.channels.platform.${key}`, key)
  }

  /**
   * Opens create dialog.
   * @returns Nothing.
   */
  function openCreate(): void {
    if (!canCreate) {
      return
    }
    setEditing(null)
    setForm(emptyChannel())
    setOpen(true)
  }

  /**
   * Opens edit dialog.
   * @param row - Channel.
   * @returns Nothing.
   */
  function openEditRow(row: CustomerChannel): void {
    if (!canEdit) {
      return
    }
    setEditing(row)
    setForm({
      platformKey: row.platformKey,
      platformCustomName: row.platformCustomName ?? '',
      channelUrl: row.channelUrl,
      notes: row.notes ?? '',
    })
    setOpen(true)
  }

  /**
   * Saves create/edit.
   * @returns Nothing.
   */
  async function save(): Promise<void> {
    const url = form.channelUrl.trim()
    if (!url || saving) {
      if (!url) {
        setFormError(t('admin.customers.channels.validation.urlRequired'))
      }
      return
    }
    if (form.platformKey === 'other' && !form.platformCustomName?.trim()) {
      setFormError(t('admin.customers.channels.validation.customNameRequired'))
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      if (editing) {
        await updateCustomerChannel(editing.id, form)
      } else {
        await createCustomerChannel(customerId, groupId, form)
      }
      setOpen(false)
      await reload()
      onChannelsChange?.(getCustomerDetailTabCache(customerId, 'channels') ?? [])
    } catch (err) {
      console.error('[ChannelsPanel] save:', err)
      setFormError(t('admin.customers.errorUpdate'))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Deletes a channel after confirm.
   * @param row - Channel.
   * @returns Nothing.
   */
  async function remove(row: CustomerChannel): Promise<void> {
    if (!canDelete) {
      return
    }
    if (!window.confirm(t('admin.customers.channels.deleteConfirm'))) {
      return
    }
    try {
      await deleteCustomerChannel(row.id)
      await reload()
      onChannelsChange?.(getCustomerDetailTabCache(customerId, 'channels') ?? [])
    } catch (err) {
      console.error('[ChannelsPanel] delete:', err)
      setFormError(t('admin.customers.errorDeleteFailed'))
    }
  }

  return (
    <section className={detailSectionCardClass()}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold text-ink">
          {t('admin.customers.channels.sectionTitle')}
        </h3>
        {canCreate ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-xl bg-brand px-2 py-1 text-xs font-bold text-brand-fg"
            onClick={openCreate}
          >
            <PlusIcon className="size-3.5" />
            {t('admin.customers.channels.addButton')}
          </button>
        ) : null}
      </div>

      {error ? <p className="mb-2 text-sm font-medium text-rose-500">{error}</p> : null}
      {loading ? (
        <p className="text-sm font-medium text-muted">{t('status.loading')}</p>
      ) : null}

      {!loading && rows.length === 0 ? (
        <p className="text-xs font-medium text-muted">
          {t('admin.customers.channels.empty')}
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
                  <p className="flex items-center gap-1.5 font-bold text-ink">
                    <ChannelPlatformIcon
                      platformKey={row.platformKey}
                      className="size-3.5 shrink-0"
                      aria-hidden
                    />
                    <span className="truncate">
                      {platformLabel(row.platformKey, row.platformCustomName)}
                    </span>
                  </p>
                  <button
                    type="button"
                    className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-left text-brand hover:underline"
                    onClick={() => {
                      const url = normalizeChannelExternalUrl(row.channelUrl)
                      if (url) {
                        openUrl(url)
                      }
                    }}
                  >
                    <span className="truncate">{row.channelUrl}</span>
                  </button>
                  {row.notes ? (
                    <p className="mt-0.5 text-muted">{row.notes}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  {canEdit ? (
                    <button
                      type="button"
                      className="rounded p-1 text-brand hover:bg-brand/10"
                      aria-label={t('admin.customers.editButton')}
                      onClick={() => openEditRow(row)}
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
                ? t('admin.customers.channels.editTitle')
                : t('admin.customers.channels.createTitle')}
            </h4>
            <div className="mt-3 space-y-2">
              <div className="flex flex-col gap-1">
                <p className="text-xs font-semibold text-muted">
                  {t('admin.customers.channels.form.platform')}
                </p>
                <CrmFilterSelect
                  value={form.platformKey}
                  options={platformOptions}
                  ariaLabel={t('admin.customers.channels.form.platform')}
                  onChange={(next) =>
                    setForm((f) => ({
                      ...f,
                      platformKey: next as CustomerChannelPlatform,
                    }))
                  }
                />
              </div>
              {form.platformKey === 'other' ? (
                <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                  {t('admin.customers.channels.form.customName')}
                  <input
                    className={fieldClass}
                    value={form.platformCustomName ?? ''}
                    placeholder={t(
                      'admin.customers.channels.form.customNamePlaceholder',
                    )}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        platformCustomName: e.target.value,
                      }))
                    }
                  />
                </label>
              ) : null}
              <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                {t('admin.customers.channels.form.url')}
                <input
                  className={fieldClass}
                  value={form.channelUrl}
                  placeholder={t('admin.customers.channels.form.urlPlaceholder')}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, channelUrl: e.target.value }))
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                {t('admin.customers.channels.form.notes')}
                <textarea
                  className={areaClass}
                  value={form.notes ?? ''}
                  placeholder={t(
                    'admin.customers.channels.form.notesPlaceholder',
                  )}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
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
                {t('admin.customers.channels.cancel')}
              </button>
              <button
                type="button"
                disabled={saving || !form.channelUrl.trim()}
                className="rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg disabled:opacity-50"
                onClick={() => void save()}
              >
                {saving
                  ? t('admin.customers.channels.saving')
                  : t('admin.customers.channels.save')}
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
