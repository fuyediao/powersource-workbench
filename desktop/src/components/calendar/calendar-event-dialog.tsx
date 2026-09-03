/**
 * Create / edit calendar event dialog (title, times, recurrence, calendar, invitees).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarDateTimeField } from '@/components/calendar/calendar-date-time-field'
import { CalendarInviteePicker } from '@/components/calendar/calendar-invitee-picker'
import {
  CalendarAttendeeStatusList,
  CalendarRsvpBar,
} from '@/components/calendar/calendar-rsvp-controls'
import { CalendarSelectField } from '@/components/calendar/calendar-select-field'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import type { CalendarListRecord } from '@/services/calendar-calendars-api'
import type {
  CalendarAttendee,
  CalendarAttendeeStatus,
  CalendarEventWrite,
} from '@/services/calendar-api'
import type { ProfileSnippet } from '@/services/groups-api'
import { fetchProfileSnippets } from '@/services/groups-api'
import {
  buildRruleFromPreset,
  countFromRrule,
  presetFromRrule,
  type RecurrenceEditScope,
  type RecurrencePreset,
} from '@/utils/calendar/calendar-rrule'

export interface CalendarEventDialogProps {
  open: boolean
  mode: 'create' | 'edit'
  initial: CalendarEventWrite
  calendars: CalendarListRecord[]
  /** Group members available as invitees (empty for personal). */
  inviteCandidates: ProfileSnippet[]
  /** When true, invitee search also queries profiles (personal scope). */
  inviteRemoteSearch?: boolean
  /** Current user id (excluded from invitee results). */
  currentUserId: string
  /** True when editing an existing recurring series occurrence. */
  isRecurringSeries?: boolean
  /** Organizer can edit event fields / invitees. */
  canManageEvent?: boolean
  /** Invitee rows with RSVP status (edit mode). */
  attendees?: CalendarAttendee[]
  /** Caller's RSVP status when they are an invitee. */
  myRsvpStatus?: CalendarAttendeeStatus | null
  canDelete: boolean
  saving: boolean
  onClose: () => void
  /** Called after the leave animation finishes and the dialog unmounts. */
  onExited?: () => void
  onSave: (write: CalendarEventWrite, scope: RecurrenceEditScope | null) => void
  onDelete?: (scope: RecurrenceEditScope | null) => void
  /** Updates the caller's RSVP status. */
  onRsvp?: (status: CalendarAttendeeStatus) => void
}

/**
 * Formats an ISO instant for a datetime-local input in local time.
 * @param iso - Instant ISO string.
 * @returns `YYYY-MM-DDTHH:mm` local string.
 */
function isoToLocalInput(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Formats an ISO instant for a date input in local time.
 * @param iso - Instant ISO string.
 * @returns `YYYY-MM-DD` local string.
 */
function isoToLocalDateInput(iso: string): string {
  return isoToLocalInput(iso).slice(0, 10)
}

/**
 * Parses a local datetime-local value to an ISO instant.
 * @param value - Local datetime string.
 * @returns ISO instant.
 */
function localInputToIso(value: string): string {
  const date = new Date(value)
  return date.toISOString()
}

/**
 * Parses a local date input to an ISO midnight instant.
 * @param value - Local date string.
 * @returns ISO instant.
 */
function localDateInputToIso(value: string): string {
  return localInputToIso(`${value}T00:00`)
}

/**
 * Modal for creating or editing a calendar event.
 * @param props - Dialog state and handlers.
 * @returns Dialog portal content, or null when unmounted.
 */
export function CalendarEventDialog({
  open,
  mode,
  initial,
  calendars,
  inviteCandidates,
  inviteRemoteSearch = false,
  currentUserId,
  isRecurringSeries = false,
  canManageEvent = true,
  attendees = [],
  myRsvpStatus = null,
  canDelete,
  saving,
  onClose,
  onExited,
  onSave,
  onDelete,
  onRsvp,
}: CalendarEventDialogProps) {
  const { t } = useTranslation()
  const { mounted, leaving } = useDialogPresence(open)
  const hadMountedRef = useRef(false)
  const readOnly = mode === 'edit' && !canManageEvent
  const [title, setTitle] = useState(initial.title)
  const [description, setDescription] = useState(initial.description ?? '')
  const [allDay, setAllDay] = useState(initial.allDay)
  const [startLocal, setStartLocal] = useState(
    initial.allDay ? isoToLocalDateInput(initial.startAt) : isoToLocalInput(initial.startAt),
  )
  const [endLocal, setEndLocal] = useState(
    initial.allDay ? isoToLocalDateInput(initial.endAt) : isoToLocalInput(initial.endAt),
  )
  const [calendarId, setCalendarId] = useState(initial.calendarId ?? calendars[0]?.id ?? '')
  const [recurrence, setRecurrence] = useState<RecurrencePreset>(
    presetFromRrule(initial.rrule),
  )
  const [recurrenceCount, setRecurrenceCount] = useState(countFromRrule(initial.rrule))
  const [attendeeUserIds, setAttendeeUserIds] = useState<string[]>(
    initial.attendeeUserIds ?? [],
  )
  const [editScope, setEditScope] = useState<RecurrenceEditScope>('this')
  const [attendeeProfiles, setAttendeeProfiles] = useState<Map<string, ProfileSnippet>>(
    () => new Map(),
  )

  const profilesById = useMemo(() => {
    const map = new Map<string, ProfileSnippet>(attendeeProfiles)
    for (const profile of inviteCandidates) {
      map.set(profile.id, profile)
    }
    return map
  }, [attendeeProfiles, inviteCandidates])

  useEffect(() => {
    const missing = attendees
      .map((attendee) => attendee.userId)
      .filter((id) => id !== currentUserId && !inviteCandidates.some((p) => p.id === id))
    if (missing.length === 0) {
      return
    }
    let cancelled = false
    void fetchProfileSnippets(missing).then((map) => {
      if (cancelled || map.size === 0) {
        return
      }
      setAttendeeProfiles((prev) => {
        const next = new Map(prev)
        for (const [id, profile] of map) {
          next.set(id, profile)
        }
        return next
      })
    })
    return () => {
      cancelled = true
    }
  }, [attendees, currentUserId, inviteCandidates])

  useEffect(() => {
    if (mounted) {
      hadMountedRef.current = true
      return
    }
    if (hadMountedRef.current) {
      hadMountedRef.current = false
      onExited?.()
    }
  }, [mounted, onExited])

  useEffect(() => {
    if (!open) {
      return
    }
    setTitle(initial.title)
    setDescription(initial.description ?? '')
    setAllDay(initial.allDay)
    setStartLocal(
      initial.allDay ? isoToLocalDateInput(initial.startAt) : isoToLocalInput(initial.startAt),
    )
    setEndLocal(
      initial.allDay ? isoToLocalDateInput(initial.endAt) : isoToLocalInput(initial.endAt),
    )
    setCalendarId(initial.calendarId ?? calendars[0]?.id ?? '')
    setRecurrence(presetFromRrule(initial.rrule))
    setRecurrenceCount(countFromRrule(initial.rrule))
    setAttendeeUserIds(initial.attendeeUserIds ?? [])
    setEditScope('this')
  }, [open, initial, calendars])

  if (!mounted) {
    return null
  }

  /**
   * Submits the form after normalizing start/end and recurrence.
   * @returns Nothing.
   */
  function handleSubmit(): void {
    const startAt = allDay ? localDateInputToIso(startLocal) : localInputToIso(startLocal)
    let endAt = allDay ? localDateInputToIso(endLocal) : localInputToIso(endLocal)
    if (new Date(endAt).getTime() < new Date(startAt).getTime()) {
      endAt = startAt
    }
    onSave(
      {
        title: title.trim() || t('calendar.untitled'),
        description: description.trim() ? description.trim() : null,
        startAt,
        endAt,
        allDay,
        calendarId: calendarId || null,
        rrule: buildRruleFromPreset(recurrence, recurrenceCount),
        attendeeUserIds,
      },
      isRecurringSeries ? editScope : null,
    )
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t('actions.close')}
        className={`absolute inset-0 bg-zinc-950/40 ${
          leaving ? 'dialog-backdrop-out' : 'dialog-backdrop-in'
        }`}
        disabled={leaving}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="calendar-event-dialog-title"
        className={`relative max-h-[min(90dvh,40rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-zinc-950/10 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-zinc-950 ${
          leaving ? 'dialog-panel-out' : 'dialog-panel-in'
        }`}
      >
        <h2 id="calendar-event-dialog-title" className="text-lg font-extrabold text-ink">
          {mode === 'create'
            ? t('calendar.dialog.createTitle')
            : readOnly
              ? t('calendar.dialog.invitationTitle')
              : t('calendar.dialog.editTitle')}
        </h2>
        <div className="mt-4 flex flex-col gap-3">
          {myRsvpStatus && onRsvp ? (
            <CalendarRsvpBar
              status={myRsvpStatus}
              disabled={saving}
              onChange={onRsvp}
            />
          ) : null}
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            {t('calendar.dialog.title')}
            <input
              className="rounded-xl border border-ink/10 bg-canvas px-3 py-2 text-sm font-medium text-ink outline-none focus:border-brand disabled:opacity-60"
              value={title}
              disabled={saving || readOnly}
              autoFocus={!readOnly}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            {t('calendar.dialog.description')}
            <textarea
              className="min-h-20 resize-y rounded-xl border border-ink/10 bg-canvas px-3 py-2 text-sm font-medium text-ink outline-none focus:border-brand disabled:opacity-60"
              value={description}
              disabled={saving || readOnly}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          {calendars.length > 0 && !readOnly ? (
            <CalendarSelectField
              label={t('calendar.dialog.calendar')}
              calendars={calendars}
              value={calendarId}
              disabled={saving}
              onChange={setCalendarId}
            />
          ) : null}
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-ink">
            <input
              type="checkbox"
              checked={allDay}
              disabled={saving || readOnly}
              onChange={(event) => {
                const next = event.target.checked
                setAllDay(next)
                if (next) {
                  setStartLocal(startLocal.slice(0, 10))
                  setEndLocal(endLocal.slice(0, 10))
                } else {
                  setStartLocal(`${startLocal.slice(0, 10)}T09:00`)
                  setEndLocal(`${endLocal.slice(0, 10)}T10:00`)
                }
              }}
            />
            {t('calendar.dialog.allDay')}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <CalendarDateTimeField
              label={t('calendar.dialog.start')}
              value={startLocal}
              dateOnly={allDay}
              disabled={saving || readOnly}
              onChange={setStartLocal}
            />
            <CalendarDateTimeField
              label={t('calendar.dialog.end')}
              value={endLocal}
              dateOnly={allDay}
              disabled={saving || readOnly}
              onChange={setEndLocal}
            />
          </div>
          {!readOnly ? (
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              {t('calendar.dialog.repeat')}
              <select
                className="rounded-xl border border-ink/10 bg-canvas px-3 py-2 text-sm font-medium text-ink outline-none focus:border-brand disabled:opacity-60"
                value={recurrence}
                disabled={saving}
                onChange={(event) => setRecurrence(event.target.value as RecurrencePreset)}
              >
                <option value="none">{t('calendar.dialog.repeatNone')}</option>
                <option value="daily">{t('calendar.dialog.repeatDaily')}</option>
                <option value="weekly">{t('calendar.dialog.repeatWeekly')}</option>
                <option value="monthly">{t('calendar.dialog.repeatMonthly')}</option>
              </select>
            </label>
          ) : null}
          {!readOnly && recurrence !== 'none' ? (
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              {t('calendar.dialog.repeatCount')}
              <input
                type="number"
                min={1}
                max={366}
                className="rounded-xl border border-ink/10 bg-canvas px-3 py-2 text-sm font-medium text-ink outline-none focus:border-brand"
                value={recurrenceCount}
                disabled={saving}
                onChange={(event) => setRecurrenceCount(Number(event.target.value) || 12)}
              />
              <span className="font-medium text-[11px] text-muted">
                {isRecurringSeries
                  ? t(`calendar.dialog.scopeHint.${editScope}`)
                  : t('calendar.dialog.repeatEditHint')}
              </span>
            </label>
          ) : null}
          {!readOnly && isRecurringSeries ? (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-xs font-semibold text-muted">
                {t('calendar.dialog.editScope')}
              </legend>
              <div className="space-y-1 rounded-xl border border-ink/10 bg-canvas p-2">
                {(
                  [
                    ['this', 'calendar.dialog.scopeThis'],
                    ['following', 'calendar.dialog.scopeFollowing'],
                    ['all', 'calendar.dialog.scopeAll'],
                  ] as const
                ).map(([value, labelKey]) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-ink hover:bg-ink/5"
                  >
                    <input
                      type="radio"
                      name="calendar-edit-scope"
                      checked={editScope === value}
                      disabled={saving}
                      onChange={() => setEditScope(value)}
                    />
                    <span>{t(labelKey)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          {!readOnly &&
          (inviteRemoteSearch || inviteCandidates.length > 0 || attendeeUserIds.length > 0) ? (
            <CalendarInviteePicker
              candidates={inviteCandidates}
              selectedUserIds={attendeeUserIds}
              excludeUserId={currentUserId}
              remoteSearch={inviteRemoteSearch}
              disabled={saving}
              onChange={setAttendeeUserIds}
            />
          ) : null}
          {mode === 'edit' && attendees.length > 0 ? (
            <CalendarAttendeeStatusList
              attendees={attendees}
              profilesById={profilesById}
              currentUserId={currentUserId}
            />
          ) : null}
        </div>
        <div className="mt-5 flex items-center justify-between gap-2">
          {mode === 'edit' && canDelete && !readOnly ? (
            <button
              type="button"
              className="rounded-full px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-500/10"
              disabled={saving}
              onClick={() => onDelete?.(isRecurringSeries ? editScope : null)}
            >
              {t('calendar.dialog.delete')}
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full px-3 py-1.5 text-xs font-bold text-muted transition hover:bg-ink/5"
              disabled={saving}
              onClick={onClose}
            >
              {readOnly ? t('actions.close') : t('actions.cancel')}
            </button>
            {!readOnly ? (
              <button
                type="button"
                className="rounded-full bg-brand px-3 py-1.5 text-xs font-bold text-brand-fg transition hover:opacity-90 disabled:opacity-60"
                disabled={saving}
                onClick={handleSubmit}
              >
                {t('actions.done')}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
