/**
 * Shared create-follow-up modal (Admin Todo List + home Schedule Reminder).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  FollowUpCalendarFields,
  type FollowUpCalendarSelection,
} from '@/components/admin/follow-up-calendar-fields'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { CloseIcon, TrashIcon } from '@/icons/AllIcons'
import {
  createGroupCalendarEvent,
  createPersonalCalendarEvent,
} from '@/services/calendar-api'
import {
  createFollowUp,
  linkFollowUpCalendarEvent,
  listFollowUpAssocCompetitors,
  listFollowUpAssocCustomers,
  listFollowUpAssocKols,
  listFollowUpAssocLeads,
  listFollowUpAssocOpportunities,
} from '@/services/follow-ups-api'
import {
  fetchCurrentGroup,
  fetchUserRole,
  isSystemAdminRole,
} from '@/services/groups-api'
import type {
  FollowUpAssocCompetitor,
  FollowUpAssocCustomer,
  FollowUpAssocKol,
  FollowUpAssocLead,
  FollowUpAssocOpportunity,
  FollowUpTodoItem,
  FollowUpType,
} from '@/types/follow-up'

const FOLLOW_UP_TYPES: FollowUpType[] = [
  'call',
  'email',
  'online_meeting',
  'site_visit',
  'follow_up_plan',
  'other',
]

type AssocKind = 'customer' | 'lead' | 'opportunity' | 'kol' | 'competitor'

interface FollowUpCreateDialogProps {
  /** Whether the dialog should be open. */
  open: boolean
  /** Signed-in user id. */
  userId: string
  /**
   * Optional group id for association loaders.
   * When omitted, the dialog resolves the current group itself.
   */
  groupId?: string | null
  /**
   * Optional system-admin flag for association loaders.
   * When omitted, the dialog resolves the role itself.
   */
  isSystemAdmin?: boolean
  /** Closes the dialog. */
  onClose: () => void
  /** Called after a successful create (before close completes). */
  onCreated?: () => void | Promise<void>
}

/**
 * Creates a blank todo checklist row.
 * @returns New todo item.
 */
function newTodoItem(): FollowUpTodoItem {
  return {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `todo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    text: '',
    completed: false,
  }
}

/**
 * Local datetime-local value for "now".
 * @returns `YYYY-MM-DDTHH:mm` in local time.
 */
function defaultScheduledLocal(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Converts a datetime-local string to ISO.
 * @param local - Local datetime string.
 * @returns ISO timestamp.
 */
function localToIso(local: string): string {
  const d = new Date(local)
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString()
  }
  return d.toISOString()
}

/**
 * Builds an end ISO timestamp a number of minutes after the start.
 * @param startIso - Start ISO string.
 * @param minutes - Duration in minutes (default 30).
 * @returns End ISO string.
 */
function endIsoAfterMinutes(startIso: string, minutes = 30): string {
  const start = new Date(startIso).getTime()
  if (Number.isNaN(start)) {
    return new Date(Date.now() + minutes * 60_000).toISOString()
  }
  return new Date(start + minutes * 60_000).toISOString()
}

/**
 * Modal to create a follow-up (todo plan) with association + calendar event.
 * @param props - Open state, user, optional scope, and callbacks.
 * @returns Portal dialog when mounted.
 */
export function FollowUpCreateDialog({
  open,
  userId,
  groupId: groupIdProp,
  isSystemAdmin: isSystemAdminProp,
  onClose,
  onCreated,
}: FollowUpCreateDialogProps) {
  const { t } = useTranslation()
  const presence = useDialogPresence(open)

  const [createType, setCreateType] = useState<FollowUpType>('call')
  const [customTypeLabel, setCustomTypeLabel] = useState('')
  const [assocKind, setAssocKind] = useState<AssocKind>('customer')
  const [customerId, setCustomerId] = useState('')
  const [leadId, setLeadId] = useState('')
  const [opportunityId, setOpportunityId] = useState('')
  const [kolId, setKolId] = useState('')
  const [competitorShopId, setCompetitorShopId] = useState('')
  const [scheduledAt, setScheduledAt] = useState(defaultScheduledLocal)
  const [todos, setTodos] = useState<FollowUpTodoItem[]>(() => [newTodoItem()])
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [leads, setLeads] = useState<FollowUpAssocLead[]>([])
  const [opportunities, setOpportunities] = useState<FollowUpAssocOpportunity[]>(
    [],
  )
  const [customers, setCustomers] = useState<FollowUpAssocCustomer[]>([])
  const [kols, setKols] = useState<FollowUpAssocKol[]>([])
  const [competitors, setCompetitors] = useState<FollowUpAssocCompetitor[]>([])
  const [calendarSelection, setCalendarSelection] =
    useState<FollowUpCalendarSelection>({
      mode: 'personal',
      groupId: null,
      calendarId: '',
    })
  const [assocLoading, setAssocLoading] = useState(false)

  /**
   * Stores the latest calendar scope + named calendar from the form.
   * @param selection - Personal/group target.
   * @returns Nothing.
   */
  const onCalendarSelectionChange = useCallback(
    (selection: FollowUpCalendarSelection): void => {
      setCalendarSelection(selection)
    },
    [],
  )

  const typeOptions = useMemo(
    () =>
      FOLLOW_UP_TYPES.map((type) => ({
        value: type,
        label: t(`admin.followUps.type.${type}`),
      })),
    [t],
  )

  const customerOptions = useMemo(
    () => [
      { value: '', label: t('admin.followUps.form.selectAccount') },
      ...customers.map((c) => ({
        value: c.id,
        label: c.companyName || c.id,
        description: c.customerCode || undefined,
      })),
    ],
    [customers, t],
  )

  const leadOptions = useMemo(
    () => [
      { value: '', label: t('admin.followUps.form.selectLead') },
      ...leads.map((lead) => ({
        value: lead.id,
        label: lead.companyName || lead.id,
      })),
    ],
    [leads, t],
  )

  const opportunityOptions = useMemo(
    () => [
      { value: '', label: t('admin.followUps.form.selectOpportunity') },
      ...opportunities.map((opp) => ({
        value: opp.id,
        label: opp.name || opp.id,
      })),
    ],
    [opportunities, t],
  )

  const assocKindOptions = useMemo(
    () => [
      {
        value: 'customer',
        label: t('admin.followUps.form.assoc.customer'),
      },
      { value: 'lead', label: t('admin.followUps.form.assoc.lead') },
      {
        value: 'opportunity',
        label: t('admin.followUps.form.assoc.opportunity'),
      },
      { value: 'kol', label: t('admin.followUps.form.assoc.kol') },
      {
        value: 'competitor',
        label: t('admin.followUps.form.assoc.competitor'),
      },
    ],
    [t],
  )

  const kolOptions = useMemo(
    () => [
      { value: '', label: t('admin.followUps.form.selectKol') },
      ...kols.map((kol) => ({
        value: kol.id,
        label: kol.name || kol.id,
        description: kol.kolCode || undefined,
      })),
    ],
    [kols, t],
  )

  const competitorOptions = useMemo(
    () => [
      { value: '', label: t('admin.followUps.form.selectCompetitor') },
      ...competitors.map((shop) => ({
        value: shop.id,
        label: shop.storeName || shop.id,
      })),
    ],
    [competitors, t],
  )

  /**
   * Resets create form fields.
   * @returns Nothing.
   */
  function resetCreateForm(): void {
    setCreateType('call')
    setCustomTypeLabel('')
    setAssocKind('customer')
    setCustomerId('')
    setLeadId('')
    setOpportunityId('')
    setKolId('')
    setCompetitorShopId('')
    setScheduledAt(defaultScheduledLocal())
    setTodos([newTodoItem()])
    setFormError(null)
  }

  /**
   * Loads association options for the create form.
   * @param scope - Group / admin flags for scoped lists.
   * @returns Nothing.
   */
  const loadAssocOptions = useCallback(
    async (scope: {
      groupId: string | null
      isSystemAdmin: boolean
    }): Promise<void> => {
      setAssocLoading(true)
      try {
        const [
          leadRows,
          oppRows,
          customerRows,
          kolRows,
          competitorRows,
        ] = await Promise.all([
          listFollowUpAssocLeads(),
          listFollowUpAssocOpportunities(),
          listFollowUpAssocCustomers({
            isSystemAdmin: scope.isSystemAdmin,
            groupId: scope.groupId,
          }),
          listFollowUpAssocKols(),
          listFollowUpAssocCompetitors({
            isSystemAdmin: scope.isSystemAdmin,
            groupId: scope.groupId,
          }),
        ])
        setLeads(leadRows)
        setOpportunities(oppRows)
        setCustomers(customerRows)
        setKols(kolRows)
        setCompetitors(competitorRows)
      } catch (err) {
        console.error('[FollowUpCreateDialog] assoc load:', err)
        throw err
      } finally {
        setAssocLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (!open) {
      return
    }
    resetCreateForm()
    let cancelled = false

    /**
     * Resolves write scope then loads association pickers.
     * @returns Nothing.
     */
    async function boot(): Promise<void> {
      let groupId = groupIdProp ?? null
      let isSystemAdmin = Boolean(isSystemAdminProp)
      if (groupIdProp === undefined || isSystemAdminProp === undefined) {
        try {
          const [role, group] = await Promise.all([
            fetchUserRole(userId),
            fetchCurrentGroup(userId),
          ])
          if (cancelled) {
            return
          }
          if (isSystemAdminProp === undefined) {
            isSystemAdmin = isSystemAdminRole(role)
          }
          if (groupIdProp === undefined) {
            groupId = group?.id ?? null
          }
        } catch (err) {
          console.error('[FollowUpCreateDialog] scope:', err)
        }
      }
      if (cancelled) {
        return
      }
      try {
        await loadAssocOptions({ groupId, isSystemAdmin })
      } catch {
        if (!cancelled) {
          setFormError(t('admin.followUps.errorLoad'))
        }
      }
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [
    open,
    userId,
    groupIdProp,
    isSystemAdminProp,
    loadAssocOptions,
    t,
  ])

  /**
   * Clears association FKs when switching assoc kind.
   * @param kind - Next association kind.
   * @returns Nothing.
   */
  function onAssocKindChange(kind: AssocKind): void {
    setAssocKind(kind)
    setCustomerId('')
    setLeadId('')
    setOpportunityId('')
    setKolId('')
    setCompetitorShopId('')
  }

  /**
   * Submits the create form.
   * @returns Nothing.
   */
  async function submitCreate(): Promise<void> {
    if (saving) {
      return
    }
    const hasAssoc =
      (assocKind === 'customer' && customerId) ||
      (assocKind === 'lead' && leadId) ||
      (assocKind === 'opportunity' && opportunityId) ||
      (assocKind === 'kol' && kolId) ||
      (assocKind === 'competitor' && competitorShopId)
    if (!hasAssoc) {
      setFormError(t('admin.followUps.errorAssociationRequired'))
      return
    }
    if (createType === 'other' && !customTypeLabel.trim()) {
      setFormError(t('admin.followUps.errorOtherTypeRequired'))
      return
    }
    const cleanedTodos = todos
      .map((item) => ({ ...item, text: item.text.trim() }))
      .filter((item) => item.text.length > 0)
    if (cleanedTodos.length === 0) {
      setFormError(t('admin.followUps.errorTodoRequired'))
      return
    }
    if (calendarSelection.mode === 'group' && !calendarSelection.groupId) {
      setFormError(t('admin.followUps.errorGroupRequired'))
      return
    }
    if (!calendarSelection.calendarId) {
      setFormError(t('admin.followUps.errorCalendarRequired'))
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      const scheduledIso = localToIso(scheduledAt)
      const created = await createFollowUp(userId, {
        type: createType,
        scheduledAt: scheduledIso,
        customTypeLabel: createType === 'other' ? customTypeLabel.trim() : null,
        todoItems: cleanedTodos,
        customerId: assocKind === 'customer' ? customerId : null,
        leadId: assocKind === 'lead' ? leadId : null,
        opportunityId: assocKind === 'opportunity' ? opportunityId : null,
        kolId: assocKind === 'kol' ? kolId : null,
        competitorShopId:
          assocKind === 'competitor' ? competitorShopId : null,
      })

      const typeLabel =
        createType === 'other' && customTypeLabel.trim()
          ? customTypeLabel.trim()
          : t(`admin.followUps.type.${createType}`)
      const eventTitle =
        cleanedTodos[0]?.text.trim() ||
        t('admin.followUps.calendarEventTitle', { type: typeLabel })
      const eventWrite = {
        title: eventTitle,
        description: cleanedTodos.map((item) => `• ${item.text}`).join('\n'),
        startAt: scheduledIso,
        endAt: endIsoAfterMinutes(scheduledIso, 30),
        allDay: false,
        calendarId: calendarSelection.calendarId,
      }
      try {
        const calendarEvent =
          calendarSelection.mode === 'group' && calendarSelection.groupId
            ? await createGroupCalendarEvent(
                calendarSelection.groupId,
                userId,
                eventWrite,
              )
            : await createPersonalCalendarEvent(userId, eventWrite)
        await linkFollowUpCalendarEvent(
          userId,
          created.id,
          calendarEvent.id,
        )
      } catch (calendarErr) {
        console.error('[FollowUpCreateDialog] calendar event:', calendarErr)
      }

      await onCreated?.()
      onClose()
    } catch (err) {
      console.error('[FollowUpCreateDialog] create:', err)
      setFormError(t('admin.followUps.errorCreate'))
    } finally {
      setSaving(false)
    }
  }

  if (!presence.mounted) {
    return null
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px] ${
        presence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
      }`}
      onClick={() => {
        if (!saving) {
          onClose()
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="follow-up-create-title"
        className="flex max-h-[min(90dvh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-950/10 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-ink/10 px-5 py-4">
          <h2
            id="follow-up-create-title"
            className="text-base font-extrabold text-brand"
          >
            {t('admin.followUps.modal.createTitle')}
          </h2>
          <button
            type="button"
            className="rounded-xl p-2 text-muted hover:bg-zinc-950/5"
            aria-label={t('actions.close')}
            disabled={saving}
            onClick={onClose}
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
          {formError ? (
            <p className="text-sm font-medium text-rose-500">{formError}</p>
          ) : null}

          <div className="space-y-1.5">
            <span className="text-xs font-bold tracking-wide text-muted uppercase">
              {t('admin.followUps.form.type')}{' '}
              <span className="text-rose-500" aria-hidden>
                *
              </span>
            </span>
            <CrmFilterSelect
              value={createType}
              options={typeOptions}
              onChange={(next) => setCreateType(next as FollowUpType)}
              ariaLabel={t('admin.followUps.form.type')}
              className="w-full"
              menuPlacement="bottom"
            />
          </div>

          {createType === 'other' ? (
            <label className="block space-y-1.5">
              <span className="text-xs font-bold tracking-wide text-muted uppercase">
                {t('admin.followUps.form.otherTypePlaceholder')}{' '}
                <span className="text-rose-500" aria-hidden>
                  *
                </span>
              </span>
              <input
                type="text"
                value={customTypeLabel}
                onChange={(e) => setCustomTypeLabel(e.target.value)}
                placeholder={t('admin.followUps.form.otherTypePlaceholder')}
                required
                className="w-full rounded-2xl border border-ink/10 bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5"
              />
            </label>
          ) : null}

          <div className="space-y-1.5">
            <span className="text-xs font-bold tracking-wide text-muted uppercase">
              {t('admin.followUps.form.associateWith')}{' '}
              <span className="text-rose-500" aria-hidden>
                *
              </span>
            </span>
            <CrmFilterSelect
              value={assocKind}
              options={assocKindOptions}
              onChange={(next) => onAssocKindChange(next as AssocKind)}
              ariaLabel={t('admin.followUps.form.associateWith')}
              className="w-full"
              menuPlacement="bottom"
            />

            {assocKind === 'customer' ? (
              <CrmFilterSelect
                value={customerId}
                options={customerOptions}
                onChange={setCustomerId}
                searchable
                disabled={assocLoading}
                searchPlaceholder={t(
                  'admin.followUps.form.searchCustomerPlaceholder',
                )}
                closeAriaLabel={t('common.inlineSearchComboboxClose')}
                emptyLabel={t('admin.followUps.form.noCustomerMatch')}
                ariaLabel={t('admin.followUps.form.selectAccount')}
                className="w-full"
                filterOption={(option, query) => {
                  const q = query.toLowerCase()
                  return (
                    option.label.toLowerCase().includes(q) ||
                    (option.description?.toLowerCase().includes(q) ?? false)
                  )
                }}
              />
            ) : null}

            {assocKind === 'lead' ? (
              <CrmFilterSelect
                value={leadId}
                options={leadOptions}
                onChange={setLeadId}
                searchable
                disabled={assocLoading}
                searchPlaceholder={t('admin.followUps.form.selectLead')}
                closeAriaLabel={t('common.inlineSearchComboboxClose')}
                emptyLabel={t('admin.followUps.form.noCustomerMatch')}
                ariaLabel={t('admin.followUps.form.selectLead')}
                className="w-full"
              />
            ) : null}

            {assocKind === 'opportunity' ? (
              <CrmFilterSelect
                value={opportunityId}
                options={opportunityOptions}
                onChange={setOpportunityId}
                searchable
                disabled={assocLoading}
                searchPlaceholder={t('admin.followUps.form.selectOpportunity')}
                closeAriaLabel={t('common.inlineSearchComboboxClose')}
                emptyLabel={t('admin.followUps.form.noCustomerMatch')}
                ariaLabel={t('admin.followUps.form.selectOpportunity')}
                className="w-full"
              />
            ) : null}

            {assocKind === 'kol' ? (
              <CrmFilterSelect
                value={kolId}
                options={kolOptions}
                onChange={setKolId}
                searchable
                disabled={assocLoading}
                searchPlaceholder={t(
                  'admin.followUps.form.searchKolPlaceholder',
                )}
                closeAriaLabel={t('common.inlineSearchComboboxClose')}
                emptyLabel={t('admin.followUps.form.noKolMatch')}
                ariaLabel={t('admin.followUps.form.selectKol')}
                className="w-full"
                filterOption={(option, query) => {
                  const q = query.toLowerCase()
                  return (
                    option.label.toLowerCase().includes(q) ||
                    (option.description?.toLowerCase().includes(q) ?? false)
                  )
                }}
              />
            ) : null}

            {assocKind === 'competitor' ? (
              <CrmFilterSelect
                value={competitorShopId}
                options={competitorOptions}
                onChange={setCompetitorShopId}
                searchable
                disabled={assocLoading}
                searchPlaceholder={t(
                  'admin.followUps.form.searchCompetitorPlaceholder',
                )}
                closeAriaLabel={t('common.inlineSearchComboboxClose')}
                emptyLabel={t('admin.followUps.form.noCompetitorMatch')}
                ariaLabel={t('admin.followUps.form.selectCompetitor')}
                className="w-full"
              />
            ) : null}
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold tracking-wide text-muted uppercase">
              {t('admin.followUps.form.scheduledAt')}{' '}
              <span className="text-rose-500" aria-hidden>
                *
              </span>
            </span>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              required
              className="w-full rounded-2xl border border-ink/10 bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5"
            />
          </label>

          <FollowUpCalendarFields
            userId={userId}
            disabled={assocLoading || saving}
            onSelectionChange={onCalendarSelectionChange}
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold tracking-wide text-muted uppercase">
                {t('admin.followUps.form.todoList')}{' '}
                <span className="text-rose-500" aria-hidden>
                  *
                </span>
              </span>
              <button
                type="button"
                className="text-xs font-bold text-brand"
                onClick={() => setTodos((prev) => [...prev, newTodoItem()])}
              >
                {t('admin.followUps.form.addTodo')}
              </button>
            </div>
            <ul className="space-y-2">
              {todos.map((item, index) => (
                <li key={item.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={item.text}
                    onChange={(e) => {
                      const text = e.target.value
                      setTodos((prev) =>
                        prev.map((row) =>
                          row.id === item.id ? { ...row, text } : row,
                        ),
                      )
                    }}
                    placeholder={t('admin.followUps.form.todoPlaceholder')}
                    className="min-w-0 flex-1 rounded-2xl border border-ink/10 bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5"
                  />
                  {todos.length > 1 ? (
                    <button
                      type="button"
                      className="rounded-xl p-2 text-rose-500 hover:bg-rose-500/10"
                      title={t('admin.followUps.form.removeTodo')}
                      aria-label={t('admin.followUps.form.removeTodo')}
                      onClick={() =>
                        setTodos((prev) =>
                          prev.filter((row) => row.id !== item.id),
                        )
                      }
                    >
                      <TrashIcon className="size-4" />
                    </button>
                  ) : (
                    <span className="w-8" aria-hidden />
                  )}
                  <span className="sr-only">
                    {t('admin.followUps.form.addTodo')} {index + 1}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-ink/10 px-5 py-4">
          <button
            type="button"
            disabled={saving}
            className="rounded-2xl bg-zinc-950/5 px-4 py-2 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
            onClick={onClose}
          >
            {t('actions.cancel')}
          </button>
          <button
            type="button"
            disabled={saving || assocLoading}
            className="rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-brand-fg disabled:opacity-50"
            onClick={() => void submitCreate()}
          >
            {saving
              ? t('admin.followUps.updating')
              : t('admin.followUps.addFollowUp')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
