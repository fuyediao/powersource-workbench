/**
 * Work-items panel for customer edit / detail (contacts live in ContactsPanel).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import {
  CrmFilterSelect,
  type CrmFilterOption,
} from '@/components/common/crm-filter-select'
import { PlusIcon, PencilIcon, TrashIcon } from '@/icons/AllIcons'
import {
  createCustomerWorkItem,
  deleteCustomerWorkItem,
  listCustomerWorkItems,
  updateCustomerWorkItem,
} from '@/services/customer-work-items-api'
import type { CustomerWorkItem, CustomerWorkItemInput } from '@/types/customer'
import {
  getCustomerDetailTabCache,
  setCustomerDetailTabCache,
} from '@/utils/customer-detail-cache'

interface CustomerSubtablesPanelProps {
  customerId: string
  groupId: string | null
  writes: AdminShellWrites | null
  /** Kept for call-site compatibility; only work items are rendered. */
  sections?: Array<'contacts' | 'workItems'>
}

const fieldClass =
  'h-11 w-full rounded-2xl border border-ink/10 bg-white/60 px-3 text-sm font-medium leading-none text-ink outline-none transition focus:border-brand disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/40'

const areaClass =
  'min-h-16 w-full resize-y rounded-2xl border border-ink/10 bg-white/60 px-3 py-2.5 text-sm font-medium text-ink outline-none transition focus:border-brand disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/40'

/**
 * Empty work item form.
 * @returns Blank work item input.
 */
function emptyWorkItem(): CustomerWorkItemInput {
  return {
    subject: '',
    dueDate: '',
    startAt: '',
    expectedEndAt: '',
    assigneeName: '',
    importance: 'medium',
    completed: false,
    remarks: '',
    suggestion: '',
  }
}

/**
 * Work items list + modal for an existing customer.
 * @param props - Customer id, group, write gates.
 * @returns Work-items UI.
 */
export function CustomerSubtablesPanel({
  customerId,
  groupId,
  writes,
  sections = ['workItems'],
}: CustomerSubtablesPanelProps) {
  const { t } = useTranslation()
  const canCreate = Boolean(writes?.canCreate)
  const canEdit = Boolean(writes?.canEdit)
  const canDelete = Boolean(writes?.canDelete)
  const showWorkItems = sections.includes('workItems')

  const [workItems, setWorkItems] = useState<CustomerWorkItem[]>(
    () => getCustomerDetailTabCache(customerId, 'workItems') ?? [],
  )
  const hadTabCache =
    showWorkItems && getCustomerDetailTabCache(customerId, 'workItems') !== undefined
  const [loading, setLoading] = useState(!hadTabCache)
  const [error, setError] = useState<string | null>(null)

  const [workOpen, setWorkOpen] = useState(false)
  const [workEditing, setWorkEditing] = useState<CustomerWorkItem | null>(null)
  const [workForm, setWorkForm] = useState<CustomerWorkItemInput>(emptyWorkItem)
  const [workSaving, setWorkSaving] = useState(false)

  const importanceOptions = useMemo<CrmFilterOption[]>(
    () => [
      {
        value: 'high',
        label: t('admin.customers.workItems.importance.high'),
      },
      {
        value: 'medium',
        label: t('admin.customers.workItems.importance.medium'),
      },
      {
        value: 'low',
        label: t('admin.customers.workItems.importance.low'),
      },
    ],
    [t],
  )

  const reload = useCallback(async (): Promise<void> => {
    if (!showWorkItems) {
      setLoading(false)
      return
    }
    const hadWork = getCustomerDetailTabCache(customerId, 'workItems') !== undefined
    if (!hadWork) {
      setLoading(true)
    }
    setError(null)
    try {
      const w = await listCustomerWorkItems(customerId)
      setWorkItems(w)
      setCustomerDetailTabCache(customerId, 'workItems', w)
    } catch (err) {
      console.error('[CustomerSubtablesPanel] load:', err)
      setError(t('admin.customers.errorLoad'))
    } finally {
      setLoading(false)
    }
  }, [customerId, showWorkItems, t])

  useEffect(() => {
    if (showWorkItems) {
      const hit = getCustomerDetailTabCache(customerId, 'workItems')
      if (hit) {
        setWorkItems(hit)
      }
    }
    void reload()
  }, [customerId, reload, showWorkItems])

  /**
   * Opens work item create dialog.
   * @returns Nothing.
   */
  function openCreateWork(): void {
    if (!canCreate) {
      return
    }
    setWorkEditing(null)
    setWorkForm(emptyWorkItem())
    setWorkOpen(true)
  }

  /**
   * Opens work item edit dialog.
   * @param row - Work item.
   * @returns Nothing.
   */
  function openEditWork(row: CustomerWorkItem): void {
    if (!canEdit) {
      return
    }
    setWorkEditing(row)
    setWorkForm({
      subject: row.subject,
      dueDate: row.dueDate ?? '',
      startAt: row.startAt ?? '',
      expectedEndAt: row.expectedEndAt ?? '',
      assigneeName: row.assigneeName ?? '',
      importance: row.importance ?? 'medium',
      completed: row.completed,
      remarks: row.remarks ?? '',
      suggestion: row.suggestion ?? '',
    })
    setWorkOpen(true)
  }

  /**
   * Saves work item create/edit.
   * @returns Nothing.
   */
  async function saveWork(): Promise<void> {
    if (!workForm.subject.trim() || workSaving) {
      return
    }
    setWorkSaving(true)
    try {
      if (workEditing) {
        await updateCustomerWorkItem(workEditing.id, workForm)
      } else {
        await createCustomerWorkItem(customerId, groupId, workForm)
      }
      setWorkOpen(false)
      await reload()
    } catch (err) {
      console.error('[CustomerSubtablesPanel] save work:', err)
      setError(t('admin.customers.errorUpdate'))
    } finally {
      setWorkSaving(false)
    }
  }

  /**
   * Deletes a work item after confirm.
   * @param row - Work item.
   * @returns Nothing.
   */
  async function removeWork(row: CustomerWorkItem): Promise<void> {
    if (!canDelete) {
      return
    }
    if (!window.confirm(t('admin.customers.workItems.deleteConfirm'))) {
      return
    }
    try {
      await deleteCustomerWorkItem(row.id)
      await reload()
    } catch (err) {
      console.error('[CustomerSubtablesPanel] delete work:', err)
      setError(t('admin.customers.errorDeleteFailed'))
    }
  }

  if (!showWorkItems) {
    return null
  }

  return (
    <div className="flex w-full flex-col gap-4">
      {error ? <p className="text-sm font-medium text-rose-500">{error}</p> : null}
      {loading ? (
        <p className="text-sm font-medium text-muted">{t('status.loading')}</p>
      ) : null}

      <section className="rounded-2xl border border-ink/10 bg-white/60 p-3 dark:bg-white/5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold text-ink">
            {t('admin.customers.section.workItems')}
          </h3>
          {canCreate ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-xl bg-brand px-2 py-1 text-xs font-bold text-brand-fg"
              onClick={openCreateWork}
            >
              <PlusIcon className="size-3.5" />
              {t('admin.customers.workItems.addButton')}
            </button>
          ) : null}
        </div>
        {workItems.length === 0 ? (
          <p className="text-xs font-medium text-muted">
            {t('admin.customers.workItems.empty')}
          </p>
        ) : (
          <ul className="space-y-2">
            {workItems.map((row) => (
              <li
                key={row.id}
                className="rounded-xl border border-ink/10 bg-canvas/60 px-2.5 py-2 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-ink">
                      {row.itemCode ? `${row.itemCode} · ` : ''}
                      {row.subject}
                    </p>
                    {row.assigneeName ? (
                      <p className="text-muted">{row.assigneeName}</p>
                    ) : null}
                    <p className="text-muted">
                      {row.completed
                        ? t('admin.customers.workItems.col.completed')
                        : (row.importance ?? '')}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {canEdit ? (
                      <button
                        type="button"
                        className="rounded p-1 text-brand hover:bg-brand/10"
                        aria-label={t('admin.customers.editButton')}
                        onClick={() => openEditWork(row)}
                      >
                        <PencilIcon className="size-3.5" />
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        className="rounded p-1 text-rose-500 hover:bg-rose-500/10"
                        aria-label={t('admin.customers.deleteButton')}
                        onClick={() => void removeWork(row)}
                      >
                        <TrashIcon className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {workOpen
        ? createPortal(
            <div className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/40 p-4">
              <div className="w-full max-w-md rounded-3xl border border-zinc-950/10 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-zinc-950">
                <h4 className="text-base font-extrabold text-ink">
                  {workEditing
                    ? t('admin.customers.workItems.editTitle')
                    : t('admin.customers.workItems.createTitle')}
                </h4>
                <div className="mt-3 space-y-2">
                  <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                    {t('admin.customers.workItems.form.subject')}
                    <input
                      className={fieldClass}
                      value={workForm.subject}
                      onChange={(e) =>
                        setWorkForm((f) => ({ ...f, subject: e.target.value }))
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                    {t('admin.customers.workItems.form.assignee')}
                    <input
                      className={fieldClass}
                      value={workForm.assigneeName ?? ''}
                      onChange={(e) =>
                        setWorkForm((f) => ({
                          ...f,
                          assigneeName: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-semibold text-muted">
                      {t('admin.customers.workItems.form.importance')}
                    </p>
                    <CrmFilterSelect
                      value={workForm.importance ?? 'medium'}
                      options={importanceOptions}
                      ariaLabel={t('admin.customers.workItems.form.importance')}
                      onChange={(next) =>
                        setWorkForm((f) => ({ ...f, importance: next }))
                      }
                    />
                  </div>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                    {t('admin.customers.workItems.form.dueDate')}
                    <input
                      className={fieldClass}
                      type="date"
                      value={workForm.dueDate ?? ''}
                      onChange={(e) =>
                        setWorkForm((f) => ({ ...f, dueDate: e.target.value }))
                      }
                    />
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-muted">
                    <input
                      type="checkbox"
                      checked={Boolean(workForm.completed)}
                      onChange={(e) =>
                        setWorkForm((f) => ({
                          ...f,
                          completed: e.target.checked,
                        }))
                      }
                    />
                    {t('admin.customers.workItems.form.completed')}
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                    {t('admin.customers.workItems.form.remarks')}
                    <textarea
                      className={areaClass}
                      value={workForm.remarks ?? ''}
                      onChange={(e) =>
                        setWorkForm((f) => ({ ...f, remarks: e.target.value }))
                      }
                    />
                  </label>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10"
                    onClick={() => setWorkOpen(false)}
                  >
                    {t('admin.customers.workItems.cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={workSaving || !workForm.subject.trim()}
                    className="rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg disabled:opacity-50"
                    onClick={() => void saveWork()}
                  >
                    {workSaving
                      ? t('admin.customers.workItems.saving')
                      : t('admin.customers.workItems.save')}
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
