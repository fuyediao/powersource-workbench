/**
 * Schedule-X calendar host (heavy deps). Loaded lazily from CalendarPage.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StatusLoading } from '@/components/common/status-loading'
import { effect } from '@preact/signals'
import 'temporal-polyfill/global'
import {
  createViewDay,
  createViewFourDays,
  createViewList,
  createViewMonthGrid,
  createViewWeek,
  createViewYear,
} from '@schedule-x/calendar'
import { createEventsServicePlugin } from '@schedule-x/events-service'
import { createDragAndDropPlugin } from '@schedule-x/drag-and-drop'
import { createResizePlugin } from '@schedule-x/resize'
import { ScheduleXCalendar, useCalendarApp } from '@schedule-x/react'
import type { CalendarAppSingleton } from '@schedule-x/shared'
import { CalendarEventDialog } from '@/components/calendar/calendar-event-dialog'
import type { CalendarCapabilities, CalendarScopeMode } from '@/hooks/use-calendar-scope'
import { toScheduleXCalendars, type CalendarListRecord } from '@/services/calendar-calendars-api'
import {
  applyRecurringCalendarDelete,
  applyRecurringCalendarEdit,
  createGroupCalendarEvent,
  createPersonalCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvent,
  masterIdFromScheduleId,
  recordToScheduleEvents,
  scheduleEventToWrite,
  temporalToIso,
  updateCalendarAttendeeRsvp,
  updateCalendarEvent,
  type CalendarAttendee,
  type CalendarAttendeeStatus,
  type CalendarEventRecord,
  type CalendarEventWrite,
} from '@/services/calendar-api'
import { fetchGroupMembers, type ProfileSnippet } from '@/services/groups-api'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import {
  loadCalendarDefaultView,
  saveCalendarDefaultView,
} from '@/utils/calendar/calendar-prefs'
import {
  loadCalendarGridSnapshot,
  type CalendarGridSnapshot,
} from '@/utils/calendar/calendar-grid-load'
import {
  clearCalendarHostMenu,
  patchCalendarMenuHandlers,
  setCalendarMenuView,
} from '@/utils/calendar/calendar-menu'
import {
  consumePendingCalendarEventDraft,
  subscribeCalendarEventDraftRequest,
  type CalendarEventDraftRequest,
} from '@/utils/calendar/calendar-event-request'
import {
  occurrenceStartFromScheduleId,
  type RecurrenceEditScope,
} from '@/utils/calendar/calendar-rrule'
import '@/styles/calendar-host.css'

export interface CalendarScheduleHostProps {
  userId: string
  mode: CalendarScopeMode
  selectedGroupId: string | null
  capabilities: CalendarCapabilities
  /** Bumps when parent wants a new-event dialog (toolbar button). */
  newEventRequestId: number
  /** Bumps when parent wants events reloaded (e.g. after ICS import). */
  reloadRequestId?: number
  /** Named calendars for the active scope (managed by page). */
  calendars: CalendarListRecord[]
  /** Visible calendar ids (empty = show all). */
  visibleCalendarIds: Set<string>
  /** Called after default calendar ensure / when host needs parent refresh. */
  onCalendarsChange: (calendars: CalendarListRecord[]) => void
}

interface DialogState {
  mode: 'create' | 'edit'
  eventId: string | null
  /** Clicked occurrence start for recurring edits (ISO). */
  occurrenceStartAt: string | null
  initial: CalendarEventWrite
  attendees: CalendarAttendee[]
  canManageEvent: boolean
  myRsvpStatus: CalendarAttendeeStatus | null
}

/**
 * Maps app i18n language to a Schedule-X locale id.
 * @param language - i18next language code.
 * @returns Schedule-X locale string.
 */
function scheduleLocale(language: string): string {
  const base = language.toLowerCase()
  if (base.startsWith('zh-tw') || base.startsWith('zh-hk')) {
    return 'zh-TW'
  }
  if (base.startsWith('zh')) {
    return 'zh-CN'
  }
  return 'en-US'
}

/**
 * Builds a default one-hour timed event starting now (or at a given Temporal).
 * @param start - Optional start Temporal.
 * @param allDay - Whether the draft is all-day.
 * @param calendarId - Default named calendar id.
 * @returns Write payload for the dialog.
 */
function buildDraftWrite(
  start?: Temporal.ZonedDateTime | Temporal.PlainDate,
  allDay = false,
  calendarId: string | null = null,
): CalendarEventWrite {
  const zone = Temporal.Now.timeZoneId()
  if (allDay) {
    const day =
      start instanceof Temporal.PlainDate
        ? start
        : start
          ? start.toPlainDate()
          : Temporal.Now.plainDateISO(zone)
    const iso = temporalToIso(day, true)
    return {
      title: '',
      description: null,
      startAt: iso,
      endAt: iso,
      allDay: true,
      calendarId,
      rrule: null,
      attendeeUserIds: [],
    }
  }
  const zoned =
    start instanceof Temporal.ZonedDateTime
      ? start
      : start instanceof Temporal.PlainDate
        ? start.toZonedDateTime({ timeZone: zone, plainTime: Temporal.PlainTime.from('09:00') })
        : Temporal.Now.zonedDateTimeISO(zone).round({
            smallestUnit: 'minute',
            roundingIncrement: 15,
            roundingMode: 'ceil',
          })
  const end = zoned.add({ hours: 1 })
  return {
    title: '',
    description: null,
    startAt: temporalToIso(zoned, false),
    endAt: temporalToIso(end, false),
    allDay: false,
    calendarId,
    rrule: null,
    attendeeUserIds: [],
  }
}

/**
 * Heavy Schedule-X grid + event dialog (Aura-style deferred chunk).
 * @param props - User, scope, and toolbar create signal.
 * @returns Calendar host UI.
 */
export function CalendarScheduleHost({
  userId,
  mode,
  selectedGroupId,
  capabilities,
  newEventRequestId,
  reloadRequestId = 0,
  calendars,
  visibleCalendarIds,
  onCalendarsChange,
}: CalendarScheduleHostProps) {
  const { t, i18n } = useTranslation()
  const capsRef = useRef(capabilities)
  capsRef.current = capabilities
  const modeRef = useRef(mode)
  modeRef.current = mode
  const groupRef = useRef(selectedGroupId)
  groupRef.current = selectedGroupId
  const userIdRef = useRef(userId)
  userIdRef.current = userId
  const visibleRef = useRef(visibleCalendarIds)
  visibleRef.current = visibleCalendarIds
  const onCalendarsChangeRef = useRef(onCalendarsChange)
  onCalendarsChangeRef.current = onCalendarsChange

  const eventsService = useMemo(() => createEventsServicePlugin(), [])
  const dragPlugin = useMemo(() => createDragAndDropPlugin(15), [])
  const resizePlugin = useMemo(() => createResizePlugin(15), [])

  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark'),
  )
  const [fading, setFading] = useState(false)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inviteCandidates, setInviteCandidates] = useState<ProfileSnippet[]>([])
  const reloadTokenRef = useRef(0)
  const lastNewEventRequestRef = useRef(0)
  const lastReloadRequestRef = useRef(0)
  const recordsByIdRef = useRef(new Map<string, CalendarEventRecord>())
  const [defaultView] = useState(() => loadCalendarDefaultView())
  const calendarSingletonRef = useRef<CalendarAppSingleton | null>(null)
  const calendarReadyRef = useRef(false)
  const [calendarReady, setCalendarReady] = useState(false)
  const pendingSnapshotRef = useRef<CalendarGridSnapshot | null>(null)

  const defaultCalendarId = calendars.find((c) => c.isDefault)?.id ?? calendars[0]?.id ?? null

  /**
   * Pushes a grid snapshot into Schedule-X and parent calendar chrome.
   * @param snapshot - Named calendars plus event rows.
   * @returns Nothing.
   */
  const applyGridSnapshot = useCallback(
    (snapshot: CalendarGridSnapshot) => {
      if (!eventsService.eventsFacade) {
        pendingSnapshotRef.current = snapshot
        return
      }
      const disableInteraction = !capsRef.current.canEdit
      const uiCalendars = snapshot.calendars
      onCalendarsChangeRef.current(snapshot.calendars)
      const singleton = calendarSingletonRef.current
      if (singleton) {
        singleton.config.calendars.value = toScheduleXCalendars(uiCalendars)
      }
      const byId = new Map<string, CalendarEventRecord>()
      const visible = visibleRef.current
      const knownCalendarIds = new Set(uiCalendars.map((calendar) => calendar.id))
      const scheduleEvents = snapshot.records.flatMap((record) => {
        byId.set(record.id, record)
        const isInviteeOnly =
          modeRef.current === 'personal' &&
          record.ownerUserId !== userId &&
          record.attendees.some((attendee) => attendee.userId === userId)
        if (
          record.calendarId &&
          !knownCalendarIds.has(record.calendarId) &&
          !isInviteeOnly
        ) {
          return []
        }
        if (
          visible.size > 0 &&
          record.calendarId &&
          !visible.has(record.calendarId) &&
          !isInviteeOnly
        ) {
          return []
        }
        try {
          return recordToScheduleEvents(record, {
            disableInteraction,
            rangeStartIso: snapshot.rangeStart,
            rangeEndIso: snapshot.rangeEnd,
          })
        } catch (err) {
          console.error('Failed to map calendar event', record.id, err)
          return []
        }
      })
      recordsByIdRef.current = byId
      eventsService.set(scheduleEvents)
      setError(null)
    },
    [eventsService, userId],
  )

  /**
   * Reloads events for the active scope into the Schedule-X events service.
   * @param options - Pass `refresh: false` to reuse the CalendarPage prefetch cache.
   * @returns Nothing.
   */
  const reloadEvents = useCallback(
    async (options?: { refresh?: boolean }) => {
      const token = ++reloadTokenRef.current
      try {
        const scope =
          modeRef.current === 'personal'
            ? { ownerUserId: userId }
            : groupRef.current
              ? { groupId: groupRef.current }
              : null
        if (!scope) {
          if (eventsService.eventsFacade) {
            eventsService.set([])
          }
          return
        }
        const activeView =
          calendarSingletonRef.current?.calendarState.view.value ?? defaultView
        const snapshot = await loadCalendarGridSnapshot(
          scope,
          t('calendar.calendars.defaultName'),
          String(activeView),
          { refresh: options?.refresh ?? true },
        )
        if (token !== reloadTokenRef.current) {
          return
        }
        applyGridSnapshot(snapshot)
      } catch (err) {
        if (token !== reloadTokenRef.current) {
          return
        }
        console.error(err)
        const detail =
          err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
            ? err.message
            : err instanceof Error
              ? err.message
              : ''
        setError(detail ? `${t('calendar.loadError')} ${detail}` : t('calendar.loadError'))
      }
    },
    [applyGridSnapshot, defaultView, eventsService, t, userId],
  )

  const calendar = useCalendarApp(
    {
      views: [
        createViewDay(),
        createViewWeek(),
        createViewMonthGrid(),
        createViewYear(),
        createViewList(),
        createViewFourDays(),
      ],
      defaultView,
      locale: scheduleLocale(i18n.language),
      isDark,
      calendars: toScheduleXCalendars(calendars),
      callbacks: {
        beforeRender: ($app) => {
          calendarSingletonRef.current = $app
          calendarReadyRef.current = true
          setCalendarReady(true)
        },
        onBeforeEventUpdate: (oldEvent) => {
          const masterId = masterIdFromScheduleId(String(oldEvent.id))
          const record = recordsByIdRef.current.get(masterId)
          if (record?.rrule) {
            return false
          }
          return capsRef.current.canEdit
        },
        onEventUpdate: (event) => {
          if (!capsRef.current.canEdit) {
            return
          }
          const masterId = masterIdFromScheduleId(String(event.id))
          const existing = recordsByIdRef.current.get(masterId)
          const write = scheduleEventToWrite(event)
          write.rrule = existing?.rrule ?? null
          write.attendeeUserIds = existing?.attendeeUserIds ?? []
          void (async () => {
            try {
              await updateCalendarEvent(masterId, write)
              setError(null)
            } catch (err) {
              console.error(err)
              setError(t('calendar.saveError'))
              await reloadEvents()
            }
          })()
        },
        onClickDateTime: (dateTime) => {
          if (!capsRef.current.canCreate) {
            return
          }
          setDialog({
            mode: 'create',
            eventId: null,
            occurrenceStartAt: null,
            initial: buildDraftWrite(dateTime, false, defaultCalendarId),
            attendees: [],
            canManageEvent: true,
            myRsvpStatus: null,
          })
          setDialogOpen(true)
        },
        onClickDate: (date) => {
          if (!capsRef.current.canCreate) {
            return
          }
          setDialog({
            mode: 'create',
            eventId: null,
            occurrenceStartAt: null,
            initial: buildDraftWrite(date, true, defaultCalendarId),
            attendees: [],
            canManageEvent: true,
            myRsvpStatus: null,
          })
          setDialogOpen(true)
        },
        onEventClick: (event) => {
          const scheduleId = String(event.id)
          const masterId = masterIdFromScheduleId(scheduleId)
          void (async () => {
            try {
              const record = await getCalendarEvent(masterId)
              if (!record) {
                return
              }
              const me = userIdRef.current
              const canManageEvent =
                modeRef.current === 'personal'
                  ? record.ownerUserId === me
                  : capsRef.current.canEdit
              const myAttendee = record.attendees.find((attendee) => attendee.userId === me)
              const occurrenceStartAt =
                occurrenceStartFromScheduleId(scheduleId) ??
                (record.rrule ? record.startAt : null)
              let startAt = record.startAt
              let endAt = record.endAt
              if (occurrenceStartAt && record.rrule) {
                const durationMs = Math.max(
                  new Date(record.endAt).getTime() - new Date(record.startAt).getTime(),
                  0,
                )
                startAt = occurrenceStartAt
                endAt = new Date(
                  new Date(occurrenceStartAt).getTime() + durationMs,
                ).toISOString()
              }
              setDialog({
                mode: 'edit',
                eventId: masterId,
                occurrenceStartAt: record.rrule ? occurrenceStartAt : null,
                initial: {
                  title: record.title,
                  description: record.description,
                  startAt,
                  endAt,
                  allDay: record.allDay,
                  calendarId: record.calendarId,
                  rrule: record.rrule,
                  attendeeUserIds: record.attendeeUserIds,
                },
                attendees: record.attendees,
                canManageEvent,
                myRsvpStatus: myAttendee?.status ?? null,
              })
              setDialogOpen(true)
            } catch (err) {
              console.error(err)
              setError(t('calendar.loadError'))
            }
          })()
        },
      },
    },
    [eventsService, dragPlugin, resizePlugin],
  )

  useEffect(() => {
    /**
     * Syncs Schedule-X dark theme with the app `html.dark` class.
     * @returns Nothing.
     */
    function syncDark(): void {
      const next = document.documentElement.classList.contains('dark')
      setIsDark(next)
      calendar?.setTheme(next ? 'dark' : 'light')
    }
    syncDark()
    const observer = new MutationObserver(syncDark)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => observer.disconnect()
  }, [calendar])

  useEffect(() => {
    const singleton = calendarSingletonRef.current
    if (!calendar || !singleton) {
      return
    }
    let lastView = String(singleton.calendarState.view.value)
    return effect(() => {
      const nextView = String(singleton.calendarState.view.value)
      saveCalendarDefaultView(nextView)
      setCalendarMenuView({ selectedView: nextView })
      if (nextView !== lastView) {
        lastView = nextView
        if (nextView === 'year' || nextView === 'list') {
          void reloadEvents()
        }
      }
    })
  }, [calendar, reloadEvents])

  useEffect(() => {
    const app = calendarSingletonRef.current
    if (!calendar || !app) {
      return
    }
    /**
     * Moves the selected date by one view period.
     * @param host - Schedule-X singleton that owns the current view.
     * @param direction - Forward or backward.
     * @returns Nothing.
     */
    function goPeriod(
      host: CalendarAppSingleton,
      direction: 'forwards' | 'backwards',
    ): void {
      const currentView = host.config.views.value.find(
        (view) => view.name === host.calendarState.view.value,
      )
      if (!currentView) {
        return
      }
      host.datePickerState.selectedDate.value = currentView.backwardForwardFn(
        host.datePickerState.selectedDate.value,
        direction === 'forwards'
          ? currentView.backwardForwardUnits
          : -currentView.backwardForwardUnits,
      ) as Temporal.PlainDate
    }
    patchCalendarMenuHandlers({
      setView: (viewName) => {
        app.calendarState.setView(
          viewName,
          app.datePickerState.selectedDate.value,
        )
      },
      today: () => {
        app.datePickerState.selectedDate.value = Temporal.PlainDate.from(
          Temporal.Now.plainDateISO(app.config.timezone.value),
        )
      },
      previous: () => {
        goPeriod(app, 'backwards')
      },
      next: () => {
        goPeriod(app, 'forwards')
      },
    })
    setCalendarMenuView({
      selectedView: String(app.calendarState.view.value),
    })
    return () => {
      clearCalendarHostMenu()
    }
  }, [calendar])

  useEffect(() => {
    if (mode !== 'group' || !selectedGroupId) {
      setInviteCandidates([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const members = await fetchGroupMembers(selectedGroupId)
        if (cancelled) {
          return
        }
        const profiles = members
          .map((member) => member.user)
          .filter((profile): profile is ProfileSnippet => Boolean(profile))
          .filter((profile) => profile.id !== userId)
        const unique = new Map<string, ProfileSnippet>()
        for (const profile of profiles) {
          unique.set(profile.id, profile)
        }
        setInviteCandidates([...unique.values()])
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          setInviteCandidates([])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mode, selectedGroupId, userId])

  useEffect(() => {
    setFading(true)
    void reloadEvents({ refresh: false }).finally(() => {
      if (calendarReadyRef.current) {
        setFading(false)
      }
    })
  }, [reloadEvents, mode, selectedGroupId, capabilities.canEdit, visibleCalendarIds])

  useEffect(() => {
    if (!calendarReady) {
      return
    }
    if (pendingSnapshotRef.current) {
      applyGridSnapshot(pendingSnapshotRef.current)
      pendingSnapshotRef.current = null
      setFading(false)
    }
  }, [applyGridSnapshot, calendarReady])

  useEffect(() => {
    if (reloadRequestId === 0 || reloadRequestId === lastReloadRequestRef.current) {
      return
    }
    lastReloadRequestRef.current = reloadRequestId
    setFading(true)
    void reloadEvents({ refresh: true }).finally(() => setFading(false))
  }, [reloadRequestId, reloadEvents])

  /**
   * Reloads the grid when push sync (or another client) mutates calendar rows.
   */
  useEffect(() => {
    if (!calendarReady || !isSupabaseConfigured || !supabase) {
      return
    }
    const client = supabase
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleReload = (): void => {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
      debounceTimer = setTimeout(() => {
        void reloadEvents()
      }, 400)
    }

    const channelName =
      mode === 'personal'
        ? `calendar-events-owner:${userId}`
        : selectedGroupId
          ? `calendar-events-group:${selectedGroupId}`
          : null
    if (!channelName) {
      return
    }

    const filter =
      mode === 'personal'
        ? `owner_user_id=eq.${userId}`
        : `group_id=eq.${selectedGroupId}`

    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'calendar_events', filter },
        () => {
          scheduleReload()
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calendars',
          filter:
            mode === 'personal'
              ? `owner_user_id=eq.${userId}`
              : `group_id=eq.${selectedGroupId}`,
        },
        () => {
          scheduleReload()
        },
      )
      .subscribe()

    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
      void client.removeChannel(channel)
    }
  }, [calendarReady, mode, selectedGroupId, userId, reloadEvents])

  useEffect(() => {
    if (newEventRequestId === 0 || newEventRequestId === lastNewEventRequestRef.current) {
      return
    }
    lastNewEventRequestRef.current = newEventRequestId
    if (!capabilities.canCreate) {
      return
    }
    setDialog({
      mode: 'create',
      eventId: null,
      occurrenceStartAt: null,
      initial: buildDraftWrite(undefined, false, defaultCalendarId),
      attendees: [],
      canManageEvent: true,
      myRsvpStatus: null,
    })
    setDialogOpen(true)
  }, [newEventRequestId, capabilities.canCreate, defaultCalendarId])

  useEffect(() => {
    /**
     * Opens create dialog seeded from a cross-app draft (e.g. Mail → Calendar).
     * @param draft - Optional title / description.
     * @returns Nothing.
     */
    function openCreateFromDraft(draft: CalendarEventDraftRequest): void {
      if (!capsRef.current.canCreate) {
        return
      }
      const initial = buildDraftWrite(undefined, false, defaultCalendarId)
      if (draft.title) {
        initial.title = draft.title
      }
      if (draft.description) {
        initial.description = draft.description
      }
      setDialog({
        mode: 'create',
        eventId: null,
        occurrenceStartAt: null,
        initial,
        attendees: [],
        canManageEvent: true,
        myRsvpStatus: null,
      })
      setDialogOpen(true)
    }

    const pending = consumePendingCalendarEventDraft()
    if (pending) {
      openCreateFromDraft(pending)
    }
    return subscribeCalendarEventDraftRequest(openCreateFromDraft)
  }, [defaultCalendarId])

  /**
   * Creates an event in the active personal/group scope.
   * @param write - Event fields.
   * @returns Created record.
   */
  async function createInScope(write: CalendarEventWrite): Promise<CalendarEventRecord> {
    if (mode === 'personal') {
      return createPersonalCalendarEvent(userId, write)
    }
    if (selectedGroupId) {
      return createGroupCalendarEvent(selectedGroupId, userId, write)
    }
    throw new Error('No group selected')
  }

  /**
   * Persists dialog create/edit.
   * @param write - Form payload.
   * @param scope - Recurring edit scope when applicable.
   * @returns Nothing.
   */
  async function handleSave(
    write: CalendarEventWrite,
    scope: RecurrenceEditScope | null,
  ): Promise<void> {
    if (!dialog) {
      return
    }
    setSaving(true)
    try {
      if (dialog.mode === 'create') {
        await createInScope(write)
      } else if (dialog.eventId) {
        const master = await getCalendarEvent(dialog.eventId)
        if (!master) {
          throw new Error('Calendar event not found')
        }
        if (master.rrule && scope && dialog.occurrenceStartAt) {
          await applyRecurringCalendarEdit({
            master,
            scope,
            occurrenceStartIso: dialog.occurrenceStartAt,
            write,
            createEvent: createInScope,
          })
        } else {
          await updateCalendarEvent(dialog.eventId, write)
        }
      }
      setDialogOpen(false)
      await reloadEvents()
      setError(null)
    } catch (err) {
      console.error(err)
      setError(t('calendar.saveError'))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Deletes the event open in the dialog.
   * @param scope - Recurring delete scope when applicable.
   * @returns Nothing.
   */
  async function handleDelete(scope: RecurrenceEditScope | null): Promise<void> {
    if (!dialog?.eventId || !capabilities.canDelete) {
      return
    }
    const confirmKey =
      dialog.initial.rrule && scope
        ? `calendar.dialog.confirmDeleteScope.${scope}`
        : 'calendar.dialog.confirmDelete'
    if (!window.confirm(t(confirmKey))) {
      return
    }
    setSaving(true)
    try {
      const master = await getCalendarEvent(dialog.eventId)
      if (!master) {
        throw new Error('Calendar event not found')
      }
      if (master.rrule && scope && dialog.occurrenceStartAt) {
        await applyRecurringCalendarDelete({
          master,
          scope,
          occurrenceStartIso: dialog.occurrenceStartAt,
        })
      } else {
        await deleteCalendarEvent(dialog.eventId)
      }
      setDialogOpen(false)
      await reloadEvents()
      setError(null)
    } catch (err) {
      console.error(err)
      setError(t('calendar.saveError'))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Updates the caller's RSVP status for the open event.
   * @param status - New RSVP status.
   * @returns Nothing.
   */
  async function handleRsvp(status: CalendarAttendeeStatus): Promise<void> {
    if (!dialog?.eventId) {
      return
    }
    setSaving(true)
    try {
      const next = await updateCalendarAttendeeRsvp(dialog.eventId, userId, status)
      setDialog((prev) =>
        prev
          ? {
              ...prev,
              myRsvpStatus: next,
              attendees: prev.attendees.map((attendee) =>
                attendee.userId === userId ? { ...attendee, status: next } : attendee,
              ),
            }
          : prev,
      )
      setError(null)
      await reloadEvents()
    } catch (err) {
      console.error(err)
      setError(t('calendar.saveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {error ? (
        <p className="shrink-0 border-b border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <div className="relative min-h-0 flex-1 p-2 sm:p-3">
        {calendar ? (
          <div
            className="sx-react-calendar-wrapper h-full overflow-hidden rounded-2xl border border-ink/8 bg-white/70 shadow-sm dark:bg-zinc-950/50"
            data-calendar-fading={fading ? 'true' : 'false'}
          >
            <ScheduleXCalendar calendarApp={calendar} />
          </div>
        ) : (
          <StatusLoading />
        )}
      </div>
      {dialog ? (
        <CalendarEventDialog
          open={dialogOpen}
          mode={dialog.mode}
          initial={dialog.initial}
          calendars={calendars}
          inviteCandidates={inviteCandidates}
          inviteRemoteSearch={mode === 'personal'}
          currentUserId={userId}
          isRecurringSeries={Boolean(dialog.initial.rrule && dialog.occurrenceStartAt)}
          canManageEvent={dialog.canManageEvent}
          attendees={dialog.attendees}
          myRsvpStatus={dialog.myRsvpStatus}
          canDelete={dialog.mode === 'edit' && dialog.canManageEvent && capabilities.canDelete}
          saving={saving}
          onClose={() => setDialogOpen(false)}
          onExited={() => setDialog(null)}
          onSave={(write, scope) => {
            void handleSave(write, scope)
          }}
          onDelete={(scope) => {
            void handleDelete(scope)
          }}
          onRsvp={
            dialog.myRsvpStatus
              ? (status) => {
                  void handleRsvp(status)
                }
              : undefined
          }
        />
      ) : null}
    </>
  )
}
