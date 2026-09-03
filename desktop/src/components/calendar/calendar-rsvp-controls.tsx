/**
 * RSVP response buttons and attendee status list for calendar events.
 */

import { useTranslation } from 'react-i18next'
import type {
  CalendarAttendee,
  CalendarAttendeeStatus,
} from '@/services/calendar-api'
import type { ProfileSnippet } from '@/services/groups-api'

export interface CalendarRsvpBarProps {
  status: CalendarAttendeeStatus
  disabled?: boolean
  onChange: (status: CalendarAttendeeStatus) => void
}

export interface CalendarAttendeeStatusListProps {
  attendees: CalendarAttendee[]
  profilesById: Map<string, ProfileSnippet>
  currentUserId: string
}

/**
 * Label for a profile or fallback to user id.
 * @param profile - Optional profile.
 * @param userId - User uuid.
 * @returns Display string.
 */
function attendeeLabel(profile: ProfileSnippet | undefined, userId: string): string {
  if (!profile) {
    return userId
  }
  return profile.display_name || profile.full_name || profile.email || userId
}

/**
 * i18n key for an RSVP status.
 * @param status - Attendee status.
 * @returns Locale key under calendar.dialog.rsvp.
 */
function statusLabelKey(status: CalendarAttendeeStatus): string {
  switch (status) {
    case 'accepted':
      return 'calendar.dialog.rsvp.accepted'
    case 'declined':
      return 'calendar.dialog.rsvp.declined'
    case 'tentative':
      return 'calendar.dialog.rsvp.tentative'
    default:
      return 'calendar.dialog.rsvp.invited'
  }
}

/**
 * Compact RSVP Accept / Tentative / Decline controls.
 * @param props - Current status and change handler.
 * @returns Button group.
 */
export function CalendarRsvpBar({ status, disabled = false, onChange }: CalendarRsvpBarProps) {
  const { t } = useTranslation()
  const options: CalendarAttendeeStatus[] = ['accepted', 'tentative', 'declined']
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-xs font-semibold text-muted">{t('calendar.dialog.rsvp.label')}</legend>
      <p className="text-[11px] font-medium text-muted">
        {t('calendar.dialog.rsvp.current', { status: t(statusLabelKey(status)) })}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const selected = status === option
          return (
            <button
              key={option}
              type="button"
              disabled={disabled}
              className={[
                'rounded-full px-3 py-1.5 text-xs font-bold transition disabled:opacity-50',
                selected
                  ? option === 'declined'
                    ? 'bg-red-500/15 text-red-600'
                    : option === 'tentative'
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                      : 'bg-brand/15 text-brand'
                  : 'bg-ink/5 text-ink hover:bg-ink/8',
              ].join(' ')}
              onClick={() => onChange(option)}
            >
              {t(statusLabelKey(option))}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

/**
 * Read-only list of invitees with RSVP badges (organizer view).
 * @param props - Attendees and profile map.
 * @returns Status list, or null when empty.
 */
export function CalendarAttendeeStatusList({
  attendees,
  profilesById,
  currentUserId,
}: CalendarAttendeeStatusListProps) {
  const { t } = useTranslation()
  if (attendees.length === 0) {
    return null
  }
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold text-muted">{t('calendar.dialog.rsvp.responses')}</p>
      <ul className="max-h-32 space-y-1 overflow-y-auto rounded-xl border border-ink/10 bg-canvas p-2">
        {attendees.map((attendee) => {
          const profile = profilesById.get(attendee.userId)
          const isSelf = attendee.userId === currentUserId
          return (
            <li
              key={attendee.userId}
              className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs"
            >
              <span className="min-w-0 flex-1 truncate font-medium text-ink">
                {attendeeLabel(profile, attendee.userId)}
                {isSelf ? ` (${t('calendar.dialog.rsvp.you')})` : ''}
              </span>
              <span
                className={[
                  'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold',
                  attendee.status === 'accepted'
                    ? 'bg-brand/15 text-brand'
                    : attendee.status === 'declined'
                      ? 'bg-red-500/15 text-red-600'
                      : attendee.status === 'tentative'
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        : 'bg-ink/8 text-muted',
                ].join(' ')}
              >
                {t(statusLabelKey(attendee.status))}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
