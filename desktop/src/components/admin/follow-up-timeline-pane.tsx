/**
 * Follow-up timeline pane: entity or company-merged list with CRUD actions.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import {
  FollowUpCalendarFields,
  type FollowUpCalendarSelection,
} from '@/components/admin/follow-up-calendar-fields'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import {
  ArrowLeftIcon,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  LucideCalendarCheckIcon,
  LucideListChecksIcon,
  MailIcon,
  MapPinIcon,
  MoreHorizontalIcon,
  PhoneIcon,
  PlusIcon,
  TrashIcon,
} from '@/icons/AllIcons'
import {
  cancelFollowUp,
  completeFollowUp,
  createFollowUp,
  deleteFollowUp,
  fetchFollowUpsForEntities,
  linkFollowUpCalendarEvent,
  listFollowUps,
  updateFollowUpTodoItems,
} from '@/services/follow-ups-api'
import {
  createGroupCalendarEvent,
  createPersonalCalendarEvent,
} from '@/services/calendar-api'
import type {
  CompleteFollowUpPayload,
  FollowUp,
  FollowUpEntityType,
  FollowUpTodoItem,
  FollowUpType,
} from '@/types/follow-up'
import type { FollowUpEntityRef } from '@/utils/follow-up-routes'
import { followUpsListPath } from '@/utils/follow-up-routes'
import { formatDisplayDateTime } from '@/utils/format-display-date'

const FOLLOW_UP_TYPES: FollowUpType[] = [
  'call',
  'email',
  'online_meeting',
  'site_visit',
  'follow_up_plan',
  'other',
]

interface FollowUpTimelinePaneProps {
  userId: string
  writes: AdminShellWrites | null
  title: string
  /** Single-entity mode filters. */
  entity?: FollowUpEntityRef | null
  /** Company-merged mode: load all listed entities. */
  entities?: FollowUpEntityRef[] | null
  /** Default association when adding a plan in merged mode. */
  createContext?: FollowUpEntityRef | null
  onNavigate: (path: string) => void
  /** Called after a successful create so company view can reload. */
  onCreated?: () => void
  /**
   * When true, omit the page back-button chrome so the timeline can sit
   * inside another Admin detail (web FollowUpTimeline on lead detail).
   */
  embedded?: boolean
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
 * Whether a planned follow-up is past its scheduled time.
 * @param fu - Follow-up row.
 * @returns True when overdue.
 */
function isOverdue(fu: FollowUp): boolean {
  return fu.status === 'planned' && new Date(fu.scheduledAt) < new Date()
}

/**
 * Resolves the primary entity type for a follow-up (merged badge).
 * @param fu - Follow-up row.
 * @returns Entity type or null.
 */
function getFollowUpEntityType(fu: FollowUp): FollowUpEntityType | null {
  if (fu.customerId) {
    return 'customer'
  }
  if (fu.leadId) {
    return 'lead'
  }
  if (fu.opportunityId) {
    return 'opportunity'
  }
  return null
}

/**
 * Renders a type icon for a follow-up channel.
 * @param type - Follow-up type.
 * @param className - Icon classes.
 * @returns Icon element.
 */
function TypeIcon({
  type,
  className,
}: {
  type: FollowUpType
  className?: string
}) {
  const cls = className ?? 'size-3.5'
  switch (type) {
    case 'call':
      return <PhoneIcon className={cls} aria-hidden />
    case 'email':
      return <MailIcon className={cls} aria-hidden />
    case 'site_visit':
      return <MapPinIcon className={cls} aria-hidden />
    case 'follow_up_plan':
      return <LucideListChecksIcon className={cls} aria-hidden />
    case 'online_meeting':
      return <LucideCalendarCheckIcon className={cls} aria-hidden />
    default:
      return <MoreHorizontalIcon className={cls} aria-hidden />
  }
}

/**
 * Timeline UI for one entity or a company-merged set of entities.
 * @param props - Scope, writes, navigation.
 * @returns Timeline pane.
 */
export function FollowUpTimelinePane({
  userId,
  writes,
  title,
  entity = null,
  entities = null,
  createContext = null,
  onNavigate,
  onCreated,
  embedded = false,
}: FollowUpTimelinePaneProps) {
  const { t } = useTranslation()
  const canCreate = Boolean(writes?.canCreate)
  const canEdit = Boolean(writes?.canEdit)
  const canDelete = Boolean(writes?.canDelete)
  const isMerged = Boolean(entities && entities.length > 0)

  const [rows, setRows] = useState<FollowUp[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const createPresence = useDialogPresence(createOpen)
  const [createType, setCreateType] = useState<FollowUpType>('call')
  const [customTypeLabel, setCustomTypeLabel] = useState('')
  const [scheduledAt, setScheduledAt] = useState(defaultScheduledLocal)
  const [todos, setTodos] = useState<FollowUpTodoItem[]>(() => [newTodoItem()])
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [calendarSelection, setCalendarSelection] =
    useState<FollowUpCalendarSelection>({
      mode: 'personal',
      groupId: null,
      calendarId: '',
    })

  /**
   * Stores the latest calendar scope + named calendar from the create form.
   * @param selection - Personal/group target.
   * @returns Nothing.
   */
  const onCalendarSelectionChange = useCallback(
    (selection: FollowUpCalendarSelection): void => {
      setCalendarSelection(selection)
    },
    [],
  )

  const [checkInTarget, setCheckInTarget] = useState<FollowUp | null>(null)
  const checkInPresence = useDialogPresence(Boolean(checkInTarget))
  const [checkInNotes, setCheckInNotes] = useState('')
  const [locating, setLocating] = useState(false)
  const [locationHint, setLocationHint] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<FollowUp | null>(null)
  const deletePresence = useDialogPresence(Boolean(deleteTarget))

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
      ),
    [rows],
  )

  const typeOptions = useMemo(
    () =>
      FOLLOW_UP_TYPES.map((type) => ({
        value: type,
        label: t(`admin.followUps.type.${type}`),
      })),
    [t],
  )

  /**
   * Loads timeline rows for the current scope.
   * @returns Nothing.
   */
  const reload = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      if (entities && entities.length > 0) {
        setRows(await fetchFollowUpsForEntities(userId, entities))
        return
      }
      if (!entity) {
        setRows([])
        return
      }
      const filters =
        entity.type === 'customer'
          ? { customerId: entity.id }
          : entity.type === 'lead'
            ? { leadId: entity.id }
            : { opportunityId: entity.id }
      const result = await listFollowUps(userId, {
        page: 1,
        pageSize: 500,
        filters,
      })
      setRows(result.rows)
    } catch (err) {
      console.error('[FollowUpTimelinePane] load:', err)
      setError(t('admin.followUps.errorLoad'))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [entities, entity, t, userId])

  useEffect(() => {
    void reload()
  }, [reload])

  /**
   * Opens the linked CRM entity when available (customer preferred).
   * @param fu - Follow-up row.
   * @returns Nothing.
   */
  function goToEntity(fu: FollowUp): void {
    if (fu.customerId) {
      onNavigate(`/admin/customers/${fu.customerId}`)
    }
    // Lead / opportunity modules are not ported yet — stay on timeline.
  }

  /**
   * Opens check-in / complete dialog for a planned follow-up.
   * @param fu - Target row.
   * @returns Nothing.
   */
  function openCheckIn(fu: FollowUp): void {
    setCheckInTarget(fu)
    setCheckInNotes(fu.content ?? '')
    setLocationHint(null)
  }

  /**
   * Completes a follow-up with optional geolocation.
   * @returns Nothing.
   */
  async function submitCheckIn(): Promise<void> {
    if (!checkInTarget || !canEdit || updating) {
      return
    }
    setUpdating(true)
    setLocating(true)
    setLocationHint(null)

    const payload: CompleteFollowUpPayload = {
      content: checkInNotes.trim() || null,
    }

    await new Promise<void>((resolve) => {
      if (!navigator.geolocation) {
        setLocationHint(t('admin.followUps.noLocation'))
        setLocating(false)
        resolve()
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          payload.checkInLat = pos.coords.latitude
          payload.checkInLng = pos.coords.longitude
          setLocating(false)
          resolve()
        },
        () => {
          setLocationHint(t('admin.followUps.noLocation'))
          setLocating(false)
          resolve()
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
      )
    })

    try {
      await completeFollowUp(userId, checkInTarget.id, payload, checkInTarget)
      setCheckInTarget(null)
      await reload()
    } catch (err) {
      console.error('[FollowUpTimelinePane] complete:', err)
      setError(t('admin.followUps.errorComplete'))
    } finally {
      setUpdating(false)
      setLocating(false)
    }
  }

  /**
   * Cancels a planned follow-up.
   * @param fu - Target row.
   * @returns Nothing.
   */
  async function handleCancel(fu: FollowUp): Promise<void> {
    if (!canEdit || updating) {
      return
    }
    setUpdating(true)
    try {
      await cancelFollowUp(userId, fu.id)
      await reload()
    } catch (err) {
      console.error('[FollowUpTimelinePane] cancel:', err)
      setError(t('admin.followUps.errorCancel'))
    } finally {
      setUpdating(false)
    }
  }

  /**
   * Deletes the confirmed follow-up.
   * @returns Nothing.
   */
  async function confirmDelete(): Promise<void> {
    if (!deleteTarget || !canDelete || updating) {
      return
    }
    setUpdating(true)
    try {
      await deleteFollowUp(userId, deleteTarget.id)
      setDeleteTarget(null)
      await reload()
    } catch (err) {
      console.error('[FollowUpTimelinePane] delete:', err)
      setError(t('admin.followUps.errorDelete'))
    } finally {
      setUpdating(false)
    }
  }

  /**
   * Toggles one todo checkbox on a follow-up.
   * @param fu - Parent follow-up.
   * @param itemId - Todo id.
   * @returns Nothing.
   */
  async function toggleTodoItem(fu: FollowUp, itemId: string): Promise<void> {
    if (!canEdit || updating) {
      return
    }
    const previous = fu.todoItems
    const next = previous.map((item) =>
      item.id === itemId ? { ...item, completed: !item.completed } : item,
    )
    setRows((list) =>
      list.map((row) =>
        row.id === fu.id ? { ...row, todoItems: next } : row,
      ),
    )
    setUpdating(true)
    try {
      await updateFollowUpTodoItems(userId, fu.id, next)
    } catch (err) {
      console.error('[FollowUpTimelinePane] todo:', err)
      setRows((list) =>
        list.map((row) =>
          row.id === fu.id ? { ...row, todoItems: previous } : row,
        ),
      )
      setError(t('admin.followUps.errorUpdateTodo'))
    } finally {
      setUpdating(false)
    }
  }

  /**
   * Opens create modal with association from scope / createContext.
   * @returns Nothing.
   */
  function openCreate(): void {
    if (!canCreate) {
      return
    }
    setCreateType('call')
    setCustomTypeLabel('')
    setScheduledAt(defaultScheduledLocal())
    setTodos([newTodoItem()])
    setFormError(null)
    setCreateOpen(true)
  }

  /**
   * Resolves association ids for a new plan.
   * @returns Association FKs.
   */
  function resolveCreateAssoc(): {
    customerId: string | null
    leadId: string | null
    opportunityId: string | null
    kolId: string | null
    competitorShopId: string | null
  } {
    const ctx = createContext ?? entity
    if (!ctx) {
      return {
        customerId: null,
        leadId: null,
        opportunityId: null,
        kolId: null,
        competitorShopId: null,
      }
    }
    return {
      customerId: ctx.type === 'customer' ? ctx.id : null,
      leadId: ctx.type === 'lead' ? ctx.id : null,
      opportunityId: ctx.type === 'opportunity' ? ctx.id : null,
      kolId: ctx.type === 'kol' ? ctx.id : null,
      competitorShopId: ctx.type === 'competitor' ? ctx.id : null,
    }
  }

  /**
   * Submits a new plan for the current entity scope.
   * @returns Nothing.
   */
  async function submitCreate(): Promise<void> {
    if (saving || !canCreate) {
      return
    }
    const assoc = resolveCreateAssoc()
    if (
      !assoc.customerId &&
      !assoc.leadId &&
      !assoc.opportunityId &&
      !assoc.kolId &&
      !assoc.competitorShopId
    ) {
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
    if (
      calendarSelection.mode === 'group' &&
      !calendarSelection.groupId
    ) {
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
        ...assoc,
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
        await linkFollowUpCalendarEvent(userId, created.id, calendarEvent.id)
      } catch (calendarErr) {
        console.error('[FollowUpTimelinePane] calendar event:', calendarErr)
      }

      setCreateOpen(false)
      await reload()
      onCreated?.()
    } catch (err) {
      console.error('[FollowUpTimelinePane] create:', err)
      setFormError(t('admin.followUps.errorCreate'))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Card border/background classes by status.
   * Near-opaque fills so text stays readable over Admin glass / wallpaper.
   * @param fu - Follow-up row.
   * @returns Class string.
   */
  function cardClass(fu: FollowUp): string {
    if (fu.status === 'completed') {
      return 'border-emerald-500/40 bg-white/90 shadow-sm dark:bg-zinc-900/90'
    }
    if (fu.status === 'cancelled') {
      return 'border-ink/15 bg-white/80 opacity-70 shadow-sm dark:bg-zinc-900/80'
    }
    if (isOverdue(fu)) {
      return 'border-amber-500/50 bg-white/90 shadow-sm dark:bg-zinc-900/90'
    }
    return 'border-brand/35 bg-white/90 shadow-sm dark:bg-zinc-900/90'
  }

  return (
    <div className={`flex min-h-0 flex-col overflow-hidden ${embedded ? '' : 'flex-1'}`}>
      <div
        className={`flex shrink-0 items-center gap-2 ${
          embedded
            ? 'mb-3'
            : 'sticky top-0 z-10 border-b border-ink/10 bg-white/80 px-4 py-3 backdrop-blur-md dark:bg-zinc-950/80'
        }`}
      >
        {embedded ? null : (
          <button
            type="button"
            className="rounded-xl p-2 text-brand hover:bg-brand/10"
            title={t('admin.orders.detail.backToList')}
            aria-label={t('admin.orders.detail.backToList')}
            onClick={() => onNavigate(followUpsListPath())}
          >
            <ArrowLeftIcon className="size-5" />
          </button>
        )}
        {embedded ? (
          <h2 className="min-w-0 flex-1 truncate text-sm font-extrabold text-ink">
            {title || t('admin.followUpTimeline.title')}
          </h2>
        ) : (
          <h1 className="min-w-0 flex-1 truncate text-xl font-extrabold text-brand">
            {title || t('admin.followUpTimeline.title')}
          </h1>
        )}
        {canCreate ? (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg"
            onClick={openCreate}
          >
            <PlusIcon className="size-4" />
            <span className="hidden sm:inline">
              {t('admin.followUpTimeline.addPlan')}
            </span>
          </button>
        ) : null}
      </div>

      <div className={embedded ? 'min-h-0' : 'min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6'}>
        {error ? (
          <p className="mb-3 text-sm font-medium text-rose-500">{error}</p>
        ) : null}
        {loading ? (
          <p className="text-sm font-medium text-muted">{t('status.loading')}</p>
        ) : null}
        {!loading && sorted.length === 0 ? (
          <p className="py-16 text-center text-sm font-medium text-muted">
            {t('admin.followUpTimeline.noFollowUps')}
          </p>
        ) : null}

        <ul className="relative space-y-4 pl-4 before:absolute before:top-2 before:bottom-2 before:left-[7px] before:w-px before:bg-ink/10">
          {sorted.map((fu) => (
            <li key={fu.id} className="relative">
              <span
                className={`absolute top-4 -left-4 size-3.5 rounded-full border-2 ${
                  fu.status === 'completed'
                    ? 'border-emerald-400 bg-emerald-400/30'
                    : fu.status === 'cancelled'
                      ? 'border-ink/30 bg-ink/10'
                      : isOverdue(fu)
                        ? 'border-amber-400 bg-amber-400/30'
                        : 'border-brand bg-brand/20'
                }`}
                aria-hidden
              />
              <div
                role={
                  fu.customerId || fu.leadId || fu.opportunityId
                    ? 'button'
                    : undefined
                }
                tabIndex={
                  fu.customerId || fu.leadId || fu.opportunityId ? 0 : undefined
                }
                className={`rounded-2xl border p-3 ${cardClass(fu)} ${
                  fu.customerId
                    ? 'cursor-pointer hover:ring-1 hover:ring-brand/30'
                    : ''
                }`}
                onClick={() => {
                  if (fu.customerId) {
                    goToEntity(fu)
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && fu.customerId) {
                    goToEntity(fu)
                  }
                }}
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <TypeIcon
                      type={fu.type}
                      className={`size-3.5 shrink-0 ${
                        fu.status === 'completed'
                          ? 'text-emerald-500'
                          : fu.status === 'cancelled'
                            ? 'text-muted'
                            : 'text-brand'
                      }`}
                    />
                    <span className="text-xs font-bold text-ink">
                      {fu.type === 'other'
                        ? fu.customTypeLabel || t('admin.followUps.type.other')
                        : t(`admin.followUps.type.${fu.type}`)}
                    </span>
                    {isOverdue(fu) ? (
                      <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-400/20 dark:text-amber-300">
                        {t('admin.followUpTimeline.overdue')}
                      </span>
                    ) : null}
                    {isMerged && getFollowUpEntityType(fu) ? (
                      <span className="rounded border border-ink/15 px-1.5 py-0.5 text-[10px] font-bold text-muted">
                        {t(
                          `admin.followUps.entityType.${getFollowUpEntityType(fu)}`,
                        )}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 text-[10px] text-muted">
                    {fu.status === 'completed' ? (
                      <CheckIcon className="size-3.5 text-emerald-500" />
                    ) : fu.status === 'planned' ? (
                      <ClockIcon className="size-3.5" />
                    ) : (
                      <CloseIcon className="size-3.5" />
                    )}
                    <span>{t(`admin.followUps.status.${fu.status}`)}</span>
                  </div>
                </div>

                <p className="mb-1.5 text-[11px] text-muted">
                  {fu.status === 'completed' && fu.completedAt
                    ? `${t('admin.followUpTimeline.completedAt')}: ${formatDisplayDateTime(fu.completedAt)}`
                    : `${t('admin.followUpTimeline.scheduledAt')}: ${formatDisplayDateTime(fu.scheduledAt)}`}
                </p>

                {fu.content ? (
                  <p className="mb-1.5 text-xs leading-relaxed text-ink/80">
                    {fu.content}
                  </p>
                ) : null}

                {fu.todoItems.length > 0 ? (
                  <div
                    className="mb-2 space-y-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {fu.todoItems.map((item) => (
                      <label
                        key={item.id}
                        className={`flex items-start gap-2 text-xs text-ink ${
                          canEdit ? 'cursor-pointer' : 'cursor-default'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={item.completed}
                          disabled={!canEdit || updating}
                          className="mt-0.5 size-3.5 accent-brand"
                          onChange={() => void toggleTodoItem(fu, item.id)}
                        />
                        <span
                          className={
                            item.completed ? 'text-muted line-through' : ''
                          }
                        >
                          {item.text}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : null}

                {fu.status === 'completed' && fu.checkInLat != null ? (
                  <div className="mb-1.5 flex items-center gap-1 text-[10px] text-emerald-600">
                    <MapPinIcon className="size-2.5" />
                    {fu.checkInLat.toFixed(5)}, {fu.checkInLng?.toFixed(5)}
                  </div>
                ) : null}

                {fu.status === 'planned' ? (
                  <div
                    className="mt-2 flex flex-wrap gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {canEdit ? (
                      <button
                        type="button"
                        disabled={updating}
                        className="inline-flex items-center gap-1 rounded-xl border border-brand/35 bg-brand/15 px-2 py-1 text-[11px] font-bold text-brand disabled:opacity-50"
                        onClick={() => openCheckIn(fu)}
                      >
                        <MapPinIcon className="size-3" />
                        {t('admin.followUps.checkInButton')}
                      </button>
                    ) : null}
                    {canEdit ? (
                      <button
                        type="button"
                        disabled={updating}
                        className="rounded-xl border border-ink/20 bg-white/95 px-2 py-1 text-[11px] font-bold text-muted hover:border-rose-400/40 hover:text-rose-500 disabled:opacity-50 dark:bg-zinc-900/95"
                        onClick={() => void handleCancel(fu)}
                      >
                        {t('actions.cancel')}
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        disabled={updating}
                        className="rounded-xl border border-ink/20 bg-white/95 px-2 py-1 text-[11px] font-bold text-muted hover:border-rose-400/40 hover:text-rose-500 disabled:opacity-50 dark:bg-zinc-900/95"
                        onClick={() => setDeleteTarget(fu)}
                      >
                        {t('admin.followUps.deleteButton')}
                      </button>
                    ) : null}
                  </div>
                ) : canDelete ? (
                  <div
                    className="mt-2 flex gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      disabled={updating}
                      className="rounded-xl border border-ink/20 bg-white/95 px-2 py-1 text-[11px] font-bold text-muted hover:border-rose-400/40 hover:text-rose-500 disabled:opacity-50 dark:bg-zinc-900/95"
                      onClick={() => setDeleteTarget(fu)}
                    >
                      {t('admin.followUps.deleteButton')}
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {createPresence.mounted
        ? createPortal(
            <div
              className={`fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px] ${
                createPresence.leaving
                  ? 'animate-dropdown-out'
                  : 'animate-dropdown-in'
              }`}
              onClick={() => {
                if (!saving) {
                  setCreateOpen(false)
                }
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                className="flex max-h-[min(90dvh,36rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-zinc-950/10 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-900"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-ink/10 px-5 py-4">
                  <h2 className="text-base font-extrabold text-brand">
                    {t('admin.followUpTimeline.addPlan')}
                  </h2>
                  <button
                    type="button"
                    className="rounded-xl p-2 text-muted hover:bg-zinc-950/5"
                    disabled={saving}
                    onClick={() => setCreateOpen(false)}
                  >
                    <CloseIcon className="size-4" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-4">
                  {formError ? (
                    <p className="text-sm font-medium text-rose-500">
                      {formError}
                    </p>
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
                        placeholder={t(
                          'admin.followUps.form.otherTypePlaceholder',
                        )}
                        required
                        className="w-full rounded-2xl border border-ink/10 bg-white/70 px-3 py-2 text-sm outline-none focus:border-brand/40 dark:bg-white/5"
                      />
                    </label>
                  ) : null}
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
                      className="w-full rounded-2xl border border-ink/10 bg-white/70 px-3 py-2 text-sm outline-none focus:border-brand/40 dark:bg-white/5"
                    />
                  </label>
                  <FollowUpCalendarFields
                    userId={userId}
                    disabled={saving}
                    onSelectionChange={onCalendarSelectionChange}
                  />
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold tracking-wide text-muted uppercase">
                        {t('admin.followUps.form.todoList')}{' '}
                        <span className="text-rose-500" aria-hidden>
                          *
                        </span>
                      </span>
                      <button
                        type="button"
                        className="text-xs font-bold text-brand"
                        onClick={() =>
                          setTodos((prev) => [...prev, newTodoItem()])
                        }
                      >
                        {t('admin.followUps.form.addTodo')}
                      </button>
                    </div>
                    {todos.map((item) => (
                      <div key={item.id} className="flex gap-2">
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
                          className="min-w-0 flex-1 rounded-2xl border border-ink/10 bg-white/70 px-3 py-2 text-sm outline-none focus:border-brand/40 dark:bg-white/5"
                        />
                        {todos.length > 1 ? (
                          <button
                            type="button"
                            className="rounded-xl p-2 text-rose-500 hover:bg-rose-500/10"
                            onClick={() =>
                              setTodos((prev) =>
                                prev.filter((row) => row.id !== item.id),
                              )
                            }
                          >
                            <TrashIcon className="size-4" />
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 justify-end gap-2 border-t border-ink/10 px-5 py-4">
                  <button
                    type="button"
                    disabled={saving}
                    className="rounded-2xl bg-zinc-950/5 px-4 py-2 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
                    onClick={() => setCreateOpen(false)}
                  >
                    {t('actions.cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    className="rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-brand-fg disabled:opacity-50"
                    onClick={() => void submitCreate()}
                  >
                    {saving
                      ? t('admin.followUps.updating')
                      : t('admin.followUpTimeline.addPlan')}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {checkInPresence.mounted && checkInTarget
        ? createPortal(
            <div
              className={`fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px] ${
                checkInPresence.leaving
                  ? 'animate-dropdown-out'
                  : 'animate-dropdown-in'
              }`}
              onClick={() => {
                if (!updating) {
                  setCheckInTarget(null)
                }
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                className="w-full max-w-md rounded-2xl border border-zinc-950/10 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-base font-extrabold text-brand">
                  {t('admin.followUps.checkInTitle')}
                </h2>
                <label className="mt-3 block space-y-1.5">
                  <span className="text-xs font-bold tracking-wide text-muted uppercase">
                    {t('admin.followUps.form.visitContent')}
                  </span>
                  <textarea
                    value={checkInNotes}
                    onChange={(e) => setCheckInNotes(e.target.value)}
                    rows={4}
                    placeholder={t(
                      'admin.followUps.form.visitContentPlaceholder',
                    )}
                    className="w-full rounded-2xl border border-ink/10 bg-white/70 px-3 py-2 text-sm outline-none focus:border-brand/40 dark:bg-white/5"
                  />
                </label>
                {locating ? (
                  <p className="mt-2 text-xs font-medium text-muted">
                    {t('admin.followUps.locating')}
                  </p>
                ) : null}
                {locationHint ? (
                  <p className="mt-2 text-xs font-medium text-muted">
                    {locationHint}
                  </p>
                ) : null}
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={updating}
                    className="rounded-2xl bg-zinc-950/5 px-4 py-2 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
                    onClick={() => setCheckInTarget(null)}
                  >
                    {t('actions.cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={updating}
                    className="rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-brand-fg disabled:opacity-50"
                    onClick={() => void submitCheckIn()}
                  >
                    {t('admin.followUps.complete')}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {deletePresence.mounted && deleteTarget
        ? createPortal(
            <div
              className={`fixed inset-0 z-[130] flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px] ${
                deletePresence.leaving
                  ? 'animate-dropdown-out'
                  : 'animate-dropdown-in'
              }`}
              onClick={() => {
                if (!updating) {
                  setDeleteTarget(null)
                }
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                className="w-full max-w-sm rounded-2xl border border-zinc-950/10 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-sm font-bold text-brand">
                  {t('admin.followUps.deleteConfirm.title')}
                </p>
                <p className="mt-1.5 text-sm text-muted">
                  {t('admin.followUps.deleteConfirm.message')}
                </p>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    disabled={updating}
                    className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                    onClick={() => void confirmDelete()}
                  >
                    {t('admin.followUps.deleteButton')}
                  </button>
                  <button
                    type="button"
                    disabled={updating}
                    className="rounded-2xl bg-zinc-950/5 px-4 py-2 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
                    onClick={() => setDeleteTarget(null)}
                  >
                    {t('actions.cancel')}
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
